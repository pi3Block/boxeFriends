import { forwardRef, useImperativeHandle, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sphere } from '@react-three/drei'
import type { Group, Mesh } from 'three'
import * as THREE from 'three'
import gsap from 'gsap'
import { useGameStore } from '../stores'

/**
 * Position de repos des gants (bas de l'écran, POV boxeur)
 */
const REST_POSITION = {
  left: { x: -0.8, y: -0.8, z: 2.5 },
  right: { x: 0.8, y: -0.8, z: 2.5 },
}

/**
 * Configuration de l'animation vers la souris
 */
const PUNCH_CONFIG = {
  speed: 0.15,        // Durée de l'aller (secondes)
  returnSpeed: 0.25,  // Durée du retour (secondes)
  targetZ: 0.5,       // Profondeur cible (vers la caméra de l'adversaire)
  easeIn: 'power3.out',
  easeOut: 'power2.inOut',
}

/**
 * Interface exposée par le composant Gloves
 */
export interface GlovesHandle {
  leftGlove: Group | null
  rightGlove: Group | null
  punchAt: (screenX: number, screenY: number) => void
}

/**
 * Composant d'un gant de boxe avec forme sphérique
 */
function BoxingGlove({ color = '#cc0000' }: { color?: string }) {
  return (
    <group>
      {/* Corps principal du gant (grande sphère) */}
      <Sphere args={[0.22, 16, 16]} position={[0, 0, 0]}>
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
      </Sphere>

      {/* Partie supérieure (knuckles) */}
      <Sphere args={[0.18, 16, 16]} position={[0, 0.12, -0.08]}>
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
      </Sphere>

      {/* Partie pouce */}
      <Sphere args={[0.1, 12, 12]} position={[0.15, -0.05, 0.05]}>
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
      </Sphere>

      {/* Poignet/manchette */}
      <Sphere args={[0.14, 12, 12]} position={[0, -0.18, 0.1]}>
        <meshStandardMaterial color="#222222" roughness={0.7} metalness={0.1} />
      </Sphere>
    </group>
  )
}

/**
 * Composant représentant les gants du joueur
 * Visibles en bas de l'écran en vue FPV
 * Les gants suivent les clics souris pour frapper
 */
export const Gloves = forwardRef<GlovesHandle>(function Gloves(_, ref) {
  const leftGloveRef = useRef<Group>(null)
  const rightGloveRef = useRef<Group>(null)
  const gameState = useGameStore((state) => state.gameState)
  const { camera, size } = useThree()

  // Alterner les mains
  const lastHand = useRef<'left' | 'right'>('right')
  const isAnimating = useRef(false)

  /**
   * Convertit les coordonnées écran en coordonnées 3D world
   */
  const screenToWorld = (screenX: number, screenY: number, targetZ: number): THREE.Vector3 => {
    // Normaliser les coordonnées écran (-1 à 1)
    const ndcX = (screenX / size.width) * 2 - 1
    const ndcY = -(screenY / size.height) * 2 + 1

    // Créer un vecteur dans l'espace NDC
    const vector = new THREE.Vector3(ndcX, ndcY, 0.5)

    // Convertir en coordonnées world
    vector.unproject(camera)

    // Direction depuis la caméra
    const dir = vector.sub(camera.position).normalize()

    // Distance pour atteindre le Z cible
    const distance = (targetZ - camera.position.z) / dir.z

    // Position finale
    return camera.position.clone().add(dir.multiplyScalar(distance))
  }

  /**
   * Anime un gant vers une position cible
   */
  const punchAt = (screenX: number, screenY: number) => {
    if (isAnimating.current || gameState !== 'FIGHTING') return

    // Alterner les mains
    const hand = lastHand.current === 'left' ? 'right' : 'left'
    lastHand.current = hand

    const glove = hand === 'left' ? leftGloveRef.current : rightGloveRef.current
    if (!glove) return

    isAnimating.current = true

    // Calculer la position cible en 3D
    const targetPos = screenToWorld(screenX, screenY, PUNCH_CONFIG.targetZ)
    const restPos = REST_POSITION[hand]

    // Timeline GSAP pour l'animation
    const tl = gsap.timeline({
      onComplete: () => {
        isAnimating.current = false
      },
    })

    // Phase 1: Coup vers la cible
    tl.to(glove.position, {
      x: targetPos.x,
      y: targetPos.y,
      z: PUNCH_CONFIG.targetZ,
      duration: PUNCH_CONFIG.speed,
      ease: PUNCH_CONFIG.easeIn,
    })

    // Rotation pendant le coup
    tl.to(
      glove.rotation,
      {
        x: -0.3,
        z: hand === 'left' ? 0.2 : -0.2,
        duration: PUNCH_CONFIG.speed,
        ease: PUNCH_CONFIG.easeIn,
      },
      '<'
    )

    // Phase 2: Retour à la position de repos
    tl.to(glove.position, {
      x: restPos.x,
      y: restPos.y,
      z: restPos.z,
      duration: PUNCH_CONFIG.returnSpeed,
      ease: PUNCH_CONFIG.easeOut,
    })

    // Rotation retour
    tl.to(
      glove.rotation,
      {
        x: 0.3,
        y: hand === 'left' ? 0.2 : -0.2,
        z: 0,
        duration: PUNCH_CONFIG.returnSpeed,
        ease: PUNCH_CONFIG.easeOut,
      },
      '<'
    )
  }

  // Exposer les refs et la fonction punchAt via useImperativeHandle
  useImperativeHandle(
    ref,
    () => ({
      get leftGlove() {
        return leftGloveRef.current
      },
      get rightGlove() {
        return rightGloveRef.current
      },
      punchAt,
    }),
    [gameState, camera, size]
  )

  // Animation idle légère des gants
  useFrame((state) => {
    if (gameState !== 'FIGHTING' || isAnimating.current) return

    const t = state.clock.elapsedTime

    // Mouvement idle subtil (respiration du boxeur)
    if (leftGloveRef.current) {
      leftGloveRef.current.position.y = REST_POSITION.left.y + Math.sin(t * 2) * 0.03
      leftGloveRef.current.position.x = REST_POSITION.left.x + Math.sin(t * 1.5) * 0.02
    }
    if (rightGloveRef.current) {
      rightGloveRef.current.position.y = REST_POSITION.right.y + Math.sin(t * 2 + 0.5) * 0.03
      rightGloveRef.current.position.x = REST_POSITION.right.x + Math.sin(t * 1.5 + 0.5) * 0.02
    }
  })

  // Masquer les gants si pas en combat
  if (gameState !== 'FIGHTING') {
    return null
  }

  return (
    <>
      {/* Gant gauche */}
      <group
        ref={leftGloveRef}
        position={[REST_POSITION.left.x, REST_POSITION.left.y, REST_POSITION.left.z]}
        rotation={[0.3, 0.2, 0]}
        scale={[1, 1, 1]}
      >
        <BoxingGlove color="#cc0000" />
      </group>

      {/* Gant droit */}
      <group
        ref={rightGloveRef}
        position={[REST_POSITION.right.x, REST_POSITION.right.y, REST_POSITION.right.z]}
        rotation={[0.3, -0.2, 0]}
        scale={[-1, 1, 1]} // Miroir pour le gant droit
      >
        <BoxingGlove color="#cc0000" />
      </group>
    </>
  )
})

export default Gloves
