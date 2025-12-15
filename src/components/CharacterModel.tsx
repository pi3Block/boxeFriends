import { useRef, useEffect, useMemo, Suspense } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture, Sphere } from '@react-three/drei'
import type { Group, Mesh, SkinnedMesh, Texture } from 'three'
import * as THREE from 'three'
import { useGameStore, useImpactStore, useJellyStore, useTextureSettingsStore, type JellyParams, type TextureSettings } from '../stores'
import { useSelectedCharacter } from '../stores/useCharacterStore'
import { DeformableFaceMaterial } from '../shaders'
import { FaceOpponent } from './FaceOpponent'
import { JellyHeadOpponent } from './JellyHead'

// #region agent log
const LOG_ENDPOINT = 'http://127.0.0.1:7243/ingest/bb23579b-81a8-4ebb-a165-6e012391b778'
const log = (location: string, message: string, data: any, hypothesisId?: string) => {
  fetch(LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location,
      message,
      data,
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'run1',
      hypothesisId,
    }),
  }).catch(() => {})
}
// #endregion

interface CharacterModelProps {
  textureUrl?: string | null
}

/**
 * Composant qui charge et affiche le modèle de personnage sélectionné
 * Si aucun modèle GLB, affiche la sphère par défaut
 */
export function CharacterModel({ textureUrl }: CharacterModelProps) {
  // #region agent log
  log('CharacterModel.tsx:18', 'CharacterModel render', { hasTextureUrl: !!textureUrl }, 'H3')
  // #endregion

  const character = useSelectedCharacter()

  // #region agent log
  log('CharacterModel.tsx:24', 'Character selected', { hasCharacter: !!character, hasModelPath: !!character?.modelPath }, 'H3')
  // #endregion

  // JellyHead procédural
  if (character?.id === 'jellyhead') {
    // #region agent log
    log('CharacterModel.tsx:30', 'Returning JellyHeadOpponent', {}, 'H3')
    // #endregion
    return (
      <Suspense fallback={<SphereOpponent textureUrl={textureUrl} />}>
        <JellyHeadOpponent textureUrl={textureUrl} />
      </Suspense>
    )
  }

  // Si pas de modèle GLB sélectionné, utiliser la sphère
  if (!character || !character.modelPath) {
    // #region agent log
    log('CharacterModel.tsx:42', 'Returning SphereOpponent', {}, 'H3')
    // #endregion
    return <SphereOpponent textureUrl={textureUrl} />
  }

  // Utiliser FaceOpponent pour le modèle facecap (gestion spéciale des morph targets)
  if (character.id === 'facecap') {
    // #region agent log
    log('CharacterModel.tsx:37', 'Returning FaceOpponent', {}, 'H3')
    // #endregion
    return (
      <Suspense fallback={<SphereOpponent textureUrl={textureUrl} />}>
        <FaceOpponent textureUrl={textureUrl} />
      </Suspense>
    )
  }

  // #region agent log
  log('CharacterModel.tsx:45', 'Returning GLBOpponent in Suspense', { modelPath: character.modelPath }, 'H3')
  // #endregion

  return (
    <Suspense fallback={<SphereOpponent textureUrl={textureUrl} />}>
      <GLBOpponent
        modelPath={character.modelPath}
        textureUrl={textureUrl}
        scale={character.scale ?? 1}
        headBone={character.headBone}
      />
    </Suspense>
  )
}

/**
 * Interface pour le système Spring-Mass
 */
interface SpringState {
  position: THREE.Vector3
  velocity: THREE.Vector3
  restPosition: THREE.Vector3
  scale: THREE.Vector3        // Pour l'effet squash
  scaleVelocity: THREE.Vector3
  restScale: THREE.Vector3
}

/**
 * Constantes physiques du spring-mass
 */
const SPRING_CONFIG = {
  stiffness: 120,    // Raideur du ressort (réduit pour plus de rebond)
  damping: 6,        // Amortissement (réduit pour plus de rebond)
  mass: 1,           // Masse
  // Pour l'effet squash/stretch
  scaleStiffness: 200,
  scaleDamping: 10,
}

/**
 * Créer un état spring initial
 */
function createSpringState(y: number): SpringState {
  return {
    position: new THREE.Vector3(0, y, 0),
    velocity: new THREE.Vector3(),
    restPosition: new THREE.Vector3(0, y, 0),
    scale: new THREE.Vector3(1, 1, 1),
    scaleVelocity: new THREE.Vector3(),
    restScale: new THREE.Vector3(1, 1, 1),
  }
}

/**
 * Composant Bonhomme de Neige avec système Spring-Mass
 * Interaction directe : cliquer/toucher = déformation gélatine
 */
function SphereOpponent({ textureUrl }: { textureUrl?: string | null }) {
  const groupRef = useRef<Group>(null)
  const headRef = useRef<Mesh>(null)
  const bodyRef = useRef<Mesh>(null)
  const baseRef = useRef<Mesh>(null)

  const gameState = useGameStore((state) => state.gameState)
  const opponentHp = useGameStore((state) => state.opponentHp)
  const impacts = useImpactStore((state) => state.impacts)
  const addImpact = useImpactStore((state) => state.addImpact)
  const jellyParams = useJellyStore()
  const textureSettings = useTextureSettingsStore()

  // État spring-mass pour chaque partie
  // Proportions inversées : grosse tête, petit corps, minuscules jambes
  const springStates = useRef<{
    head: SpringState
    body: SpringState
    base: SpringState
  }>({
    head: createSpringState(1.55),  // Grosse tête en haut
    body: createSpringState(0.3),   // Corps moyen
    base: createSpringState(-0.6),  // Petite base (jambes)
  })

  // Dernier impact traité
  const lastImpactId = useRef<number>(-1)

  // État du pointeur (pour drag continu)
  const isPointerDown = useRef(false)
  const pointerTarget = useRef<'head' | 'body' | 'base' | null>(null)

  const hasTexture = !!textureUrl

  /**
   * Gère l'appui sur une partie du bonhomme
   * Crée une déformation "doigt dans gélatine"
   */
  const handlePointerDown = (
    event: { point: THREE.Vector3; stopPropagation?: () => void },
    part: 'head' | 'body' | 'base'
  ) => {
    event.stopPropagation?.()
    isPointerDown.current = true
    pointerTarget.current = part

    const states = springStates.current
    const state = states[part]
    const hitPoint = event.point

    // Direction de l'impact (du point de clic vers le centre)
    const center = state.restPosition.clone()
    const impactDir = center.sub(hitPoint).normalize()

    // Force d'impact exagérée pour effet gélatine
    const impactForce = 8

    // Appliquer l'impulsion (pousse vers l'intérieur puis rebondit)
    state.velocity.add(impactDir.clone().multiplyScalar(impactForce))

    // Effet squash : compresse dans la direction de l'impact, étire perpendiculairement
    const squashAmount = 0.4
    state.scaleVelocity.set(
      impactDir.x !== 0 ? -squashAmount * 5 : squashAmount * 2,
      impactDir.y !== 0 ? -squashAmount * 5 : squashAmount * 2,
      -squashAmount * 8 // Toujours compresser en Z (profondeur)
    )

    // Propager l'impact aux parties voisines (effet chaîne)
    if (part === 'head') {
      states.body.velocity.add(impactDir.clone().multiplyScalar(impactForce * 0.5))
      states.body.scaleVelocity.add(state.scaleVelocity.clone().multiplyScalar(0.3))
    } else if (part === 'body') {
      states.head.velocity.add(impactDir.clone().multiplyScalar(impactForce * 0.6))
      states.base.velocity.add(impactDir.clone().multiplyScalar(impactForce * 0.3))
    } else if (part === 'base') {
      states.body.velocity.add(impactDir.clone().multiplyScalar(impactForce * 0.4))
    }

    // Ajouter à l'impact store pour le shader de déformation
    addImpact([hitPoint.x, hitPoint.y, hitPoint.z], 0.8)
  }

  const handlePointerUp = () => {
    isPointerDown.current = false
    pointerTarget.current = null
  }

  // Simulation Spring-Mass
  useFrame((_, delta) => {
    if (!groupRef.current) return

    const dt = Math.min(delta, 0.05) // Cap delta pour stabilité
    const states = springStates.current

    // Détecter nouvel impact depuis le système de punch
    if (impacts.length > 0) {
      const latestImpact = impacts[impacts.length - 1]
      if (latestImpact && latestImpact.id !== lastImpactId.current) {
        lastImpactId.current = latestImpact.id

        // Appliquer impulsion sur chaque partie
        const impactDir = new THREE.Vector3(
          latestImpact.hitPoint[0],
          latestImpact.hitPoint[1],
          -1 // Poussée vers l'arrière
        ).normalize()

        const impactForce = latestImpact.strength * 12

        // Appliquer avec squash
        states.head.velocity.add(impactDir.clone().multiplyScalar(impactForce * 1.5))
        states.head.scaleVelocity.set(0.3, 0.3, -0.8)

        states.body.velocity.add(impactDir.clone().multiplyScalar(impactForce * 1.0))
        states.body.scaleVelocity.set(0.2, 0.2, -0.5)

        states.base.velocity.add(impactDir.clone().multiplyScalar(impactForce * 0.5))
        states.base.scaleVelocity.set(0.1, 0.1, -0.3)
      }
    }

    // Simuler chaque spring (position ET scale)
    const simulateSpring = (state: SpringState, stiffnessMult: number = 1) => {
      // === Position spring ===
      const displacement = state.position.clone().sub(state.restPosition)
      const springForce = displacement.multiplyScalar(-SPRING_CONFIG.stiffness * stiffnessMult)
      const dampingForce = state.velocity.clone().multiplyScalar(-SPRING_CONFIG.damping)

      // Accélération: a = F / m
      const acceleration = springForce.add(dampingForce).divideScalar(SPRING_CONFIG.mass)

      // Intégration (Euler semi-implicite)
      state.velocity.add(acceleration.multiplyScalar(dt))
      state.position.add(state.velocity.clone().multiplyScalar(dt))

      // === Scale spring (squash/stretch) ===
      const scaleDisplacement = state.scale.clone().sub(state.restScale)
      const scaleSpringForce = scaleDisplacement.multiplyScalar(-SPRING_CONFIG.scaleStiffness)
      const scaleDampingForce = state.scaleVelocity.clone().multiplyScalar(-SPRING_CONFIG.scaleDamping)
      const scaleAcceleration = scaleSpringForce.add(scaleDampingForce)

      state.scaleVelocity.add(scaleAcceleration.multiplyScalar(dt))
      state.scale.add(state.scaleVelocity.clone().multiplyScalar(dt))

      // Clamp scale pour éviter les valeurs négatives
      state.scale.x = Math.max(0.5, Math.min(1.5, state.scale.x))
      state.scale.y = Math.max(0.5, Math.min(1.5, state.scale.y))
      state.scale.z = Math.max(0.3, Math.min(1.5, state.scale.z))
    }

    // Simuler avec différentes raideurs (base plus rigide, tête plus molle)
    simulateSpring(states.head, 0.5)
    simulateSpring(states.body, 0.7)
    simulateSpring(states.base, 1.0)

    // Appliquer les positions ET scales aux meshes
    if (headRef.current) {
      headRef.current.position.copy(states.head.position)
      headRef.current.scale.copy(states.head.scale)
      // Rotation basée sur la vélocité latérale
      headRef.current.rotation.z = -states.head.velocity.x * 0.15
      headRef.current.rotation.x = states.head.velocity.y * 0.15
    }
    if (bodyRef.current) {
      bodyRef.current.position.copy(states.body.position)
      bodyRef.current.scale.copy(states.body.scale)
      bodyRef.current.rotation.z = -states.body.velocity.x * 0.08
      bodyRef.current.rotation.x = states.body.velocity.y * 0.08
    }
    if (baseRef.current) {
      baseRef.current.position.copy(states.base.position)
      baseRef.current.scale.copy(states.base.scale)
      baseRef.current.rotation.z = -states.base.velocity.x * 0.04
    }

    // Animation idle douce
    if (gameState === 'FIGHTING') {
      const t = Date.now() * 0.001
      groupRef.current.rotation.y = Math.sin(t) * 0.05
    }
  })

  const hpColor = useMemo(() => {
    const hpRatio = opponentHp / 100
    return `rgb(255, ${Math.floor(hpRatio * 255)}, ${Math.floor(hpRatio * 255)})`
  }, [opponentHp])

  // Couleurs du bonhomme de neige
  const snowColor = '#f0f8ff'
  const bodyColor = hasTexture ? hpColor : snowColor

  return (
    <group ref={groupRef} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
      {/* Tête (GROSSE sphère en haut) - reçoit la texture/photo - effet comique */}
      <Sphere
        ref={headRef}
        args={[0.85, 32, 32]}
        position={[0, 1.55, 0]}
        onPointerDown={(e) => handlePointerDown(e as unknown as THREE.Event & { point: THREE.Vector3 }, 'head')}
      >
        {hasTexture ? (
          <SnowmanHeadWithTexture textureUrl={textureUrl!} hpColor={hpColor} jellyParams={jellyParams} textureSettings={textureSettings} />
        ) : (
          <DeformableFaceMaterial
            color={snowColor}
            wobbleSpeed={jellyParams.wobbleSpeed}
            wobbleAmplitude={jellyParams.wobbleAmplitude}
            wobbleFrequency={jellyParams.wobbleFrequency}
            jellyDamping={jellyParams.jellyDamping}
            massGradient={jellyParams.massGradient}
            jellySheen={jellyParams.jellySheen}
          />
        )}
      </Sphere>

      {/* Corps (sphère moyenne - légèrement réduite) */}
      <Sphere
        ref={bodyRef}
        args={[0.55, 32, 32]}
        position={[0, 0.3, 0]}
        onPointerDown={(e) => handlePointerDown(e as unknown as THREE.Event & { point: THREE.Vector3 }, 'body')}
      >
        <DeformableFaceMaterial
          color={bodyColor}
          wobbleSpeed={jellyParams.wobbleSpeed * 0.8}
          wobbleAmplitude={jellyParams.wobbleAmplitude * 0.7}
          wobbleFrequency={jellyParams.wobbleFrequency}
          jellyDamping={jellyParams.jellyDamping}
          massGradient={jellyParams.massGradient}
          jellySheen={jellyParams.jellySheen * 0.5}
        />
      </Sphere>

      {/* Base (PETITE sphère en bas - jambes minuscules pour effet comique) */}
      <Sphere
        ref={baseRef}
        args={[0.35, 32, 32]}
        position={[0, -0.6, 0]}
        onPointerDown={(e) => handlePointerDown(e as unknown as THREE.Event & { point: THREE.Vector3 }, 'base')}
      >
        <DeformableFaceMaterial
          color={bodyColor}
          wobbleSpeed={jellyParams.wobbleSpeed * 0.5}
          wobbleAmplitude={jellyParams.wobbleAmplitude * 0.4}
          wobbleFrequency={jellyParams.wobbleFrequency}
          jellyDamping={jellyParams.jellyDamping}
          massGradient={jellyParams.massGradient}
          jellySheen={jellyParams.jellySheen * 0.3}
        />
      </Sphere>
    </group>
  )
}

/**
 * Tête du bonhomme de neige avec texture
 */
function SnowmanHeadWithTexture({
  textureUrl,
  hpColor,
  jellyParams,
  textureSettings,
}: {
  textureUrl: string
  hpColor: string
  jellyParams: JellyParams
  textureSettings: TextureSettings
}) {
  const texture = useTexture(textureUrl) as Texture

  return (
    <DeformableFaceMaterial
      map={texture}
      color={hpColor}
      wobbleSpeed={jellyParams.wobbleSpeed}
      wobbleAmplitude={jellyParams.wobbleAmplitude}
      wobbleFrequency={jellyParams.wobbleFrequency}
      jellyDamping={jellyParams.jellyDamping}
      massGradient={jellyParams.massGradient}
      jellySheen={jellyParams.jellySheen}
      textureZoom={textureSettings.zoom}
      textureOffsetX={textureSettings.offsetX}
      textureOffsetY={textureSettings.offsetY}
    />
  )
}

/**
 * Composant pour charger et afficher un modèle GLB
 */
interface GLBOpponentProps {
  modelPath: string
  textureUrl?: string | null
  scale?: number
  headBone?: string
}

function GLBOpponent({ modelPath, textureUrl, scale = 1, headBone }: GLBOpponentProps) {
  // #region agent log
  log('CharacterModel.tsx:109', 'GLBOpponent render start', { modelPath, hasTextureUrl: !!textureUrl }, 'H2')
  // #endregion

  const groupRef = useRef<Group>(null)
  
  // #region agent log
  log('CharacterModel.tsx:114', 'Before useGLTF', { modelPath }, 'H4')
  // #endregion
  const { scene } = useGLTF(modelPath)
  
  // #region agent log
  log('CharacterModel.tsx:118', 'After useGLTF', { hasScene: !!scene }, 'H4')
  // #endregion

  // #region agent log
  log('CharacterModel.tsx:121', 'Before useThree check', {}, 'H2')
  // #endregion
  let threeContext = null
  try {
    threeContext = useThree()
    // #region agent log
    log('CharacterModel.tsx:125', 'useThree success', { hasGl: !!threeContext.gl, hasScene: !!threeContext.scene }, 'H2')
    // #endregion
  } catch (error) {
    // #region agent log
    log('CharacterModel.tsx:128', 'useThree error', { error: String(error) }, 'H2')
    // #endregion
  }

  const gameState = useGameStore((state) => state.gameState)
  const opponentHp = useGameStore((state) => state.opponentHp)
  const impacts = useImpactStore((state) => state.impacts)

  // Cloner la scène pour éviter les conflits
  const clonedScene = useMemo(() => scene.clone(), [scene])

  // #region agent log
  log('CharacterModel.tsx:139', 'Before useTexture call', { textureUrl, willCallHook: !!textureUrl }, 'H1')
  // #endregion

  // Charger la texture si disponible
  // PROBLÈME: Appel conditionnel du hook - viole les règles des hooks React
  let texture: Texture | null = null
  if (textureUrl) {
    // #region agent log
    log('CharacterModel.tsx:145', 'Calling useTexture', { textureUrl }, 'H1')
    // #endregion
    try {
      texture = useTexture(textureUrl) as Texture
      // #region agent log
      log('CharacterModel.tsx:149', 'useTexture success', { hasTexture: !!texture }, 'H1')
      // #endregion
    } catch (error) {
      // #region agent log
      log('CharacterModel.tsx:152', 'useTexture error', { error: String(error) }, 'H1')
      // #endregion
      throw error
    }
  } else {
    // #region agent log
    log('CharacterModel.tsx:156', 'Skipping useTexture (no textureUrl)', {}, 'H1')
    // #endregion
  }

  // Appliquer la texture sur le mesh de la tête
  useEffect(() => {
    if (!texture) return

    clonedScene.traverse((child) => {
      if ((child as Mesh).isMesh || (child as SkinnedMesh).isSkinnedMesh) {
        const mesh = child as Mesh | SkinnedMesh

        // Si un bone de tête est spécifié, chercher le mesh correspondant
        if (headBone) {
          if (child.name.toLowerCase().includes(headBone.toLowerCase()) ||
              child.name.toLowerCase().includes('head') ||
              child.name.toLowerCase().includes('face')) {
            applyTextureToMesh(mesh, texture)
          }
        } else {
          // Sinon appliquer à tous les meshes
          applyTextureToMesh(mesh, texture)
        }
      }
    })
  }, [clonedScene, texture, headBone])

  // Couleur basée sur HP
  useEffect(() => {
    const hpRatio = opponentHp / 100

    clonedScene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh
        const material = mesh.material as THREE.MeshStandardMaterial
        if (material.color) {
          // Teinter vers le rouge quand HP baisse
          material.color.setRGB(1, hpRatio, hpRatio)
        }
      }
    })
  }, [clonedScene, opponentHp])

  // Animation idle et recul
  useFrame(() => {
    if (!groupRef.current) return

    if (gameState === 'FIGHTING') {
      groupRef.current.rotation.y = Math.sin(Date.now() * 0.001) * 0.1
    }

    if (impacts.length > 0) {
      const totalStrength = impacts.reduce((sum, i) => sum + i.strength, 0)
      groupRef.current.position.z = -totalStrength * 0.3
    } else {
      groupRef.current.position.z *= 0.9
    }
  })

  return (
    <group ref={groupRef} scale={[scale, scale, scale]}>
      <primitive object={clonedScene} />
    </group>
  )
}

/**
 * Applique une texture à un mesh
 */
function applyTextureToMesh(mesh: Mesh | SkinnedMesh, texture: Texture) {
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((mat) => {
      if ((mat as THREE.MeshStandardMaterial).map !== undefined) {
        (mat as THREE.MeshStandardMaterial).map = texture
        mat.needsUpdate = true
      }
    })
  } else {
    const mat = mesh.material as THREE.MeshStandardMaterial
    if (mat.map !== undefined) {
      mat.map = texture
      mat.needsUpdate = true
    }
  }
}

// Preload hook pour optimiser le chargement
export function preloadCharacterModel(path: string) {
  if (path) {
    useGLTF.preload(path)
  }
}

export default CharacterModel
