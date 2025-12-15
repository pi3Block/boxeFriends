import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Cranium } from './parts/Cranium'
import { Eye } from './parts/Eye'
import { Cheek } from './parts/Cheek'
import { Nose } from './parts/Nose'
import { Jaw } from './parts/Jaw'
import { Ear } from './parts/Ear'
import {
  useImpactStore,
  useJellyPhysicsStore,
  useCartoonEffectsStore,
} from '../../stores'
import { HitZone } from '../../physics'

interface JellyHeadOpponentProps {
  textureUrl?: string | null
}

/**
 * Détermine la zone d'impact à partir de la position 3D
 * Coordonnées en espace local de la tête (Y-up, Z-forward)
 */
function determineHitZone(hitPoint: [number, number, number]): HitZone {
  const [x, y, z] = hitPoint

  // Zones verticales
  if (y > 0.25) {
    // Haut de la tête
    if (Math.abs(x) < 0.12 && z > 0.2) return 'forehead'
    return 'cranium'
  }

  if (y > -0.1) {
    // Niveau yeux/joues
    if (z > 0.25) {
      // Face avant
      if (x < -0.08) return 'leftEye'
      if (x > 0.08) return 'rightEye'
      return 'nose'
    }
    if (Math.abs(x) > 0.3) {
      return x < 0 ? 'leftEar' : 'rightEar'
    }
    return x < 0 ? 'leftCheek' : 'rightCheek'
  }

  // En dessous = mâchoire
  return 'jaw'
}

/**
 * Composant principal JellyHead
 * Orchestre la tête procédurale avec physique jelly et effets cartoon
 */
export function JellyHeadOpponent({ textureUrl }: JellyHeadOpponentProps) {
  const groupRef = useRef<THREE.Group>(null)
  const lastImpactIdRef = useRef<number>(-1)

  // Stores
  const impacts = useImpactStore((s) => s.impacts)
  const { applyImpulse, step: physicsStep } = useJellyPhysicsStore()
  const {
    processHit,
    tick: effectsTick,
    eyePopIntensity,
    cheekWobbleIntensity,
    noseSquashIntensity,
    headSquashIntensity,
    headSquashAxis,
    jawDetached,
    jawDetachProgress,
  } = useCartoonEffectsStore()

  // Traiter les nouveaux impacts
  useEffect(() => {
    if (impacts.length === 0) return

    const latest = impacts[impacts.length - 1]
    if (!latest || latest.id === lastImpactIdRef.current) return

    lastImpactIdRef.current = latest.id

    // Déterminer la zone touchée
    const zone = determineHitZone(latest.hitPoint)

    // Appliquer l'impulsion physique - FORCE AMPLIFIÉE x3
    const hitPosition = new THREE.Vector3(...latest.hitPoint)
    const force = new THREE.Vector3(0, 0, -latest.strength * 25)
    applyImpulse(hitPosition, force, 0.8, zone, latest.strength)

    // Déclencher les effets cartoon
    processHit(zone, latest.strength)
  }, [impacts, applyImpulse, processHit])

  // Boucle d'animation principale
  useFrame((_, delta) => {
    // Avancer la physique XPBD
    physicsStep(delta)

    // Mettre à jour les effets cartoon
    effectsTick(delta)
  })

  // Calcul du squash & stretch global - MODÉRÉ pour éviter artefacts
  const squashScale: [number, number, number] = [
    1 + headSquashIntensity * 0.15 * (1 - Math.abs(headSquashAxis[0])),
    1 - headSquashIntensity * 0.12,
    1 + headSquashIntensity * 0.15 * (1 - Math.abs(headSquashAxis[2])),
  ]

  // Échelle de base pour que la tête soit visible (similaire à FaceOpponent)
  const baseScale = 2.5

  return (
    <group ref={groupRef} scale={[baseScale * squashScale[0], baseScale * squashScale[1], baseScale * squashScale[2]]}>
      {/* Crâne principal (ellipsoïde) */}
      <Cranium textureUrl={textureUrl} wobbleIntensity={cheekWobbleIntensity} />

      {/* Yeux - avec effet pop (priorité 5) */}
      <Eye
        side="left"
        position={[-0.12, 0.08, 0.32]}
        popIntensity={eyePopIntensity}
      />
      <Eye
        side="right"
        position={[0.12, 0.08, 0.32]}
        popIntensity={eyePopIntensity}
      />

      {/* Joues - avec wobble (priorité 4) */}
      <Cheek
        side="left"
        position={[-0.22, -0.02, 0.18]}
        wobbleIntensity={cheekWobbleIntensity}
      />
      <Cheek
        side="right"
        position={[0.22, -0.02, 0.18]}
        wobbleIntensity={cheekWobbleIntensity}
      />

      {/* Nez - avec squash accordion (priorité 3) */}
      <Nose position={[0, -0.02, 0.38]} squashIntensity={noseSquashIntensity} />

      {/* Mâchoire - détachable (priorité 2) */}
      <Jaw
        position={[0, -0.22, 0.08]}
        isDetached={jawDetached}
        detachProgress={jawDetachProgress}
      />

      {/* Oreilles */}
      <Ear side="left" position={[-0.38, 0.02, 0]} />
      <Ear side="right" position={[0.38, 0.02, 0]} />
    </group>
  )
}
