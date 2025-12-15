import { useRef, useEffect, useMemo, useState } from 'react'
import { useFrame, useThree, useLoader } from '@react-three/fiber'
import type { Group, Mesh, SkinnedMesh } from 'three'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'
import { useImpactStore, useFacialStore, ARKIT_BLEND_SHAPES, type BlendShapeName, useTextureSettingsStore } from '../stores'
import { useGameStore } from '../stores'
import { HairSystem } from './HairSystem'

/**
 * Configuration du composant FaceOpponent
 */
const FACE_CONFIG = {
  modelPath: '/meshes/facecap.glb',
  position: [0, -0.3, 0] as [number, number, number],
  scale: 1.4,
  morphLerpSpeed: 0.15,
}

/**
 * Props du composant FaceOpponent
 */
interface FaceOpponentProps {
  textureUrl?: string | null
}

// Singleton KTX2Loader
let ktx2Loader: KTX2Loader | null = null

/**
 * Vertex shader CSM - projection frontale
 */
const csmVertexShader = /* glsl */ `
  uniform vec3 uBoundsMin;
  uniform vec3 uBoundsMax;
  uniform float uTextureZoom;
  uniform float uTextureOffsetX;
  uniform float uTextureOffsetY;

  varying vec2 vProjectedUv;
  varying float vFrontFacing;

  // Calibration facecap.glb
  const float MODEL_EYE_Y = 0.65;
  const float MODEL_EYE_SPREAD = 0.35;
  const float TEX_EYE_Y = 0.62;
  const float TEX_EYE_SPREAD = 0.40;

  void main() {
    // Projection UV basée sur position dans le bounding box
    vec3 normalizedPos = (position - uBoundsMin) / (uBoundsMax - uBoundsMin);

    float scaleX = TEX_EYE_SPREAD / MODEL_EYE_SPREAD;
    float uvX = (normalizedPos.x - 0.5) * scaleX + 0.5;
    float uvY = (normalizedPos.y - MODEL_EYE_Y) * scaleX + TEX_EYE_Y;

    vec2 projectedUv = vec2(uvX, uvY);
    projectedUv = (projectedUv - 0.5) / uTextureZoom + 0.5;
    projectedUv.x += uTextureOffsetX;
    projectedUv.y += uTextureOffsetY;

    vProjectedUv = projectedUv;
    vFrontFacing = smoothstep(-0.1, 0.5, normal.z);
  }
`

/**
 * Fragment shader CSM - csm_FragColor pour contrôle total
 */
const csmFragmentShader = /* glsl */ `
  uniform sampler2D uTextureMap;
  uniform bool uHasTexture;
  uniform vec3 uTintColor;

  varying vec2 vProjectedUv;
  varying float vFrontFacing;

  // Couleur peau (valeurs sRGB directes)
  const vec3 SKIN_COLOR = vec3(0.98, 0.85, 0.72);

  void main() {
    vec3 color = SKIN_COLOR;

    if (uHasTexture) {
      vec2 uv = clamp(vProjectedUv, 0.0, 1.0);
      vec4 texColor = texture2D(uTextureMap, uv);

      // Masque bords UV
      float edgeMask = 1.0;
      float fade = 0.06;
      edgeMask *= smoothstep(0.0, fade, vProjectedUv.x);
      edgeMask *= smoothstep(0.0, fade, vProjectedUv.y);
      edgeMask *= smoothstep(0.0, fade, 1.0 - vProjectedUv.x);
      edgeMask *= smoothstep(0.0, fade, 1.0 - vProjectedUv.y);

      // Masque final
      float mask = edgeMask * vFrontFacing;

      // Texture pure sur la face avant, peau sur les bords
      color = mix(SKIN_COLOR, texColor.rgb, mask);
    }

    // csm_FragColor bypass complètement le matériau de base
    csm_FragColor = vec4(color * uTintColor, 1.0);
  }
`

export function FaceOpponent({ textureUrl }: FaceOpponentProps) {
  const groupRef = useRef<Group>(null)
  const meshRef = useRef<Mesh | SkinnedMesh | null>(null)
  const materialRef = useRef<CustomShaderMaterial | null>(null)
  const { gl } = useThree()

  // State pour les bounds calculés
  const [bounds, setBounds] = useState<{ min: THREE.Vector3; max: THREE.Vector3 } | null>(null)

  // Charger le modèle GLB
  const gltf = useLoader(GLTFLoader, FACE_CONFIG.modelPath, (loader) => {
    if (!ktx2Loader) {
      ktx2Loader = new KTX2Loader()
      ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/gh/pmndrs/drei-assets/basis/')
    }
    ktx2Loader.detectSupport(gl)
    loader.setKTX2Loader(ktx2Loader)
    loader.setMeshoptDecoder(MeshoptDecoder)
  })
  const scene = gltf.scene

  // Stores
  const impacts = useImpactStore((state) => state.impacts)
  const gameState = useGameStore((state) => state.gameState)
  const opponentHp = useGameStore((state) => state.opponentHp)

  // Facial store
  const targetInfluences = useFacialStore((state) => state.targetInfluences)
  const transitionSpeed = useFacialStore((state) => state.transitionSpeed)
  const triggerHitReaction = useFacialStore((state) => state.triggerHitReaction)

  // Texture settings
  const textureSettings = useTextureSettingsStore()

  // State pour la texture chargée
  const [faceTexture, setFaceTexture] = useState<THREE.Texture | null>(null)

  // Charger la texture avec TextureLoader (pas de hook conditionnel)
  useEffect(() => {
    if (!textureUrl) {
      setFaceTexture(null)
      return
    }

    const loader = new THREE.TextureLoader()
    loader.load(
      textureUrl,
      (texture) => {
        // flipY false pour les blob URLs (image déjà dans le bon sens)
        texture.flipY = false
        // NoColorSpace: valeurs utilisées telles quelles sans conversion
        // Puisqu'on utilise csm_FragColor, tout reste en sRGB
        texture.colorSpace = THREE.NoColorSpace
        texture.needsUpdate = true
        setFaceTexture(texture)
        console.log('[FaceOpponent] Texture loaded successfully')
      },
      undefined,
      (error) => {
        console.error('[FaceOpponent] Error loading texture:', error)
        setFaceTexture(null)
      }
    )

    return () => {
      // Cleanup: dispose de la texture si elle change
      setFaceTexture((prev) => {
        if (prev) prev.dispose()
        return null
      })
    }
  }, [textureUrl])

  // Refs
  const morphDictRef = useRef<Record<string, number> | null>(null)
  const lastImpactId = useRef<number>(-1)

  // Refs pour la vélocité de la tête (pour les cheveux)
  const prevHeadPos = useRef(new THREE.Vector3())
  const headVelocity = useRef(new THREE.Vector3())

  // Cloner la scène
  const clonedScene = useMemo(() => scene.clone(), [scene])

  // Uniforms pour le shader
  // Note: les bounds par défaut seront mis à jour après calcul du bounding box
  const uniforms = useMemo(() => ({
    uBoundsMin: { value: new THREE.Vector3(-0.1, -0.15, -0.1) },
    uBoundsMax: { value: new THREE.Vector3(0.1, 0.12, 0.1) },
    // Zoom et offset directement depuis les settings (la calibration est dans le shader)
    uTextureZoom: { value: textureSettings.zoom },
    uTextureOffsetX: { value: textureSettings.offsetX },
    uTextureOffsetY: { value: textureSettings.offsetY },
    uTextureMap: { value: null as THREE.Texture | null },
    uHasTexture: { value: false },
    uTintColor: { value: new THREE.Vector3(1, 1, 1) },
    uTime: { value: 0 },
  }), [])

  // Trouver le mesh principal et calculer les bounds
  useEffect(() => {
    let mainMesh: Mesh | SkinnedMesh | null = null
    let maxVertices = 0

    clonedScene.traverse((child) => {
      if ((child as Mesh).isMesh || (child as SkinnedMesh).isSkinnedMesh) {
        const mesh = child as Mesh | SkinnedMesh

        // Le mesh avec morph targets est le visage principal
        if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
          meshRef.current = mesh
          morphDictRef.current = mesh.morphTargetDictionary

          // Calculer les bounds de la géométrie
          mesh.geometry.computeBoundingBox()
          const bbox = mesh.geometry.boundingBox
          if (bbox) {
            setBounds({ min: bbox.min.clone(), max: bbox.max.clone() })

            if (import.meta.env.DEV) {
              console.log('[FaceOpponent] Bounds:', bbox.min, bbox.max)
              console.log('[FaceOpponent] Morph targets:', Object.keys(mesh.morphTargetDictionary).length)
            }
          }

          // Créer CSM avec MeshBasicMaterial (pas d'éclairage)
          const projMaterial = new CustomShaderMaterial({
            baseMaterial: THREE.MeshBasicMaterial,
            vertexShader: csmVertexShader,
            fragmentShader: csmFragmentShader,
            uniforms: uniforms as Record<string, THREE.IUniform>,
            // MeshBasicMaterial supporte les morph targets nativement
          })

          mesh.material = projMaterial
          materialRef.current = projMaterial
        }

        // Tracker le mesh avec le plus de vertices (probablement le visage)
        if (mesh.geometry && mesh.geometry.attributes.position) {
          const vertCount = mesh.geometry.attributes.position.count
          if (vertCount > maxVertices) {
            maxVertices = vertCount
            mainMesh = mesh
          }
        }
      }
    })

    if (import.meta.env.DEV && mainMesh) {
      console.log('[FaceOpponent] Main mesh vertices:', maxVertices)
    }
  }, [clonedScene, uniforms])

  // Mettre à jour les uniforms quand les settings changent
  useEffect(() => {
    uniforms.uTextureZoom.value = textureSettings.zoom
    uniforms.uTextureOffsetX.value = textureSettings.offsetX
    uniforms.uTextureOffsetY.value = textureSettings.offsetY
  }, [textureSettings, uniforms])

  // Mettre à jour la texture dans les uniforms
  useEffect(() => {
    uniforms.uTextureMap.value = faceTexture
    uniforms.uHasTexture.value = !!faceTexture
    console.log('[FaceOpponent] Texture uniform updated:', !!faceTexture)
  }, [faceTexture, uniforms])

  // Mettre à jour les bounds
  useEffect(() => {
    if (bounds) {
      uniforms.uBoundsMin.value.copy(bounds.min)
      uniforms.uBoundsMax.value.copy(bounds.max)
    }
  }, [bounds, uniforms])

  // Mettre à jour la couleur HP
  useEffect(() => {
    const hpRatio = opponentHp / 100
    uniforms.uTintColor.value.set(1, 0.8 + hpRatio * 0.2, 0.8 + hpRatio * 0.2)
  }, [opponentHp, uniforms])

  // Animation frame
  useFrame((_, delta) => {
    if (!groupRef.current) return
    if (!meshRef.current || !morphDictRef.current) return

    uniforms.uTime.value = performance.now()

    const dict = morphDictRef.current
    const influences = meshRef.current.morphTargetInfluences
    if (!influences) return

    // Interpoler morph targets
    const lerpFactor = Math.min(1, transitionSpeed + delta * FACE_CONFIG.morphLerpSpeed * 10)

    for (const shapeName of ARKIT_BLEND_SHAPES) {
      const index = dict[shapeName]
      if (index !== undefined && index < influences.length) {
        const currentValue = influences[index] ?? 0
        const targetValue = targetInfluences[shapeName as BlendShapeName] ?? 0
        influences[index] = THREE.MathUtils.lerp(currentValue, targetValue, lerpFactor)
      }
    }

    // Animation idle
    if (gameState === 'FIGHTING') {
      const t = Date.now() * 0.001
      groupRef.current.rotation.y = Math.sin(t * 0.5) * 0.08

      const jawIndex = dict['jawOpen']
      if (jawIndex !== undefined && jawIndex < influences.length) {
        const breathValue = Math.sin(t * 2) * 0.02 + 0.02
        const targetJaw = targetInfluences['jawOpen'] ?? 0
        influences[jawIndex] = Math.max(breathValue, targetJaw)
      }
    }

    // Détecter impacts et déclencher réaction faciale
    if (impacts.length > 0) {
      const latestImpact = impacts[impacts.length - 1]
      if (latestImpact && latestImpact.id !== lastImpactId.current) {
        lastImpactId.current = latestImpact.id

        const [x, y] = latestImpact.hitPoint
        let hitZone: 'jaw' | 'leftCheek' | 'rightCheek' | 'nose' | 'forehead' | 'uppercut' | undefined

        if (y < -0.3) hitZone = 'jaw'
        else if (y > 0.4) hitZone = 'forehead'
        else if (x < -0.3) hitZone = 'leftCheek'
        else if (x > 0.3) hitZone = 'rightCheek'
        else if (Math.abs(x) < 0.2 && Math.abs(y) < 0.2) hitZone = 'nose'

        if (latestImpact.strength > 0.7 && y < 0) hitZone = 'uppercut'

        triggerHitReaction(latestImpact.strength, hitZone)

        if (groupRef.current) {
          groupRef.current.position.z = -latestImpact.strength * 0.3
          groupRef.current.rotation.x = latestImpact.strength * 0.1
        }
      }
    }

    // Retour progressif
    if (groupRef.current) {
      groupRef.current.position.z *= 0.95
      groupRef.current.rotation.x *= 0.95

      // Calculer la vélocité de la tête pour les cheveux
      headVelocity.current.subVectors(groupRef.current.position, prevHeadPos.current)
      headVelocity.current.multiplyScalar(60) // Normaliser par fps approximatif
      prevHeadPos.current.copy(groupRef.current.position)
    }
  })

  return (
    <group
      ref={groupRef}
      position={FACE_CONFIG.position}
      scale={[FACE_CONFIG.scale, FACE_CONFIG.scale, FACE_CONFIG.scale]}
    >
      <primitive object={clonedScene} />
      {/* Cheveux procéduraux - ajoutés de manière impérative */}
      <HairSystem parentObject={clonedScene} />
    </group>
  )
}

export default FaceOpponent
