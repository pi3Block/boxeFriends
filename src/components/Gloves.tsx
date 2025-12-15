import { forwardRef, useImperativeHandle, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sphere } from '@react-three/drei'
import type { Group } from 'three'
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
 * Zone de suivi des gants pendant le drag (limites pour rester visible)
 */
const FOLLOW_ZONE = {
  left: { minX: -1.5, maxX: 0.2, minY: -1.2, maxY: 0.5, z: 2.0 },
  right: { minX: -0.2, maxX: 1.5, minY: -1.2, maxY: 0.5, z: 2.0 },
}

/**
 * Configuration de l'animation de coup (au relâchement)
 */
const PUNCH_CONFIG = {
  speed: 0.12,        // Durée de l'aller (secondes) - rapide mais visible
  returnSpeed: 0.25,  // Durée du retour (secondes) - plus lent pour le style
  targetZ: 0.5,       // Profondeur cible (vers l'adversaire)
  easeIn: 'power4.out',   // Accélération rapide puis décélération
  easeOut: 'power2.inOut', // Retour fluide
}

/**
 * Configuration du suivi pendant le drag
 */
const FOLLOW_CONFIG = {
  smoothing: 0.15,    // Facteur de lissage (0 = instantané, 1 = très lent)
  readyZ: 1.8,        // Z quand prêt à frapper (plus proche de l'écran)
}

/**
 * Interface exposée par le composant Gloves
 */
export interface GlovesHandle {
  leftGlove: Group | null
  rightGlove: Group | null
  startFollowing: (screenX: number, screenY: number) => void
  updateFollowing: (screenX: number, screenY: number) => void
  punchAndRelease: (screenX: number, screenY: number) => void
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
 * - Pendant le clic/pression : les gants suivent le pointeur
 * - Au relâchement : animation de coup rapide
 */
export const Gloves = forwardRef<GlovesHandle>(function Gloves(_, ref) {
  const leftGloveRef = useRef<Group>(null)
  const rightGloveRef = useRef<Group>(null)
  const gameState = useGameStore((state) => state.gameState)
  const { camera, size } = useThree()

  // État de suivi
  const activeHand = useRef<'left' | 'right' | null>(null)
  const lastHand = useRef<'left' | 'right'>('right')
  const isAnimating = useRef(false)
  const isFollowing = useRef(false)
  const targetFollowPos = useRef<THREE.Vector3>(new THREE.Vector3())

  /**
   * Convertit les coordonnées écran en coordonnées 3D world
   */
  const screenToWorld = (screenX: number, screenY: number, targetZ: number): THREE.Vector3 => {
    const ndcX = (screenX / size.width) * 2 - 1
    const ndcY = -(screenY / size.height) * 2 + 1
    const vector = new THREE.Vector3(ndcX, ndcY, 0.5)
    vector.unproject(camera)
    const dir = vector.sub(camera.position).normalize()
    const distance = (targetZ - camera.position.z) / dir.z
    return camera.position.clone().add(dir.multiplyScalar(distance))
  }

  /**
   * Limite une position dans la zone autorisée pour un gant
   */
  const clampToZone = (pos: THREE.Vector3, hand: 'left' | 'right'): THREE.Vector3 => {
    const zone = FOLLOW_ZONE[hand]
    return new THREE.Vector3(
      Math.max(zone.minX, Math.min(zone.maxX, pos.x)),
      Math.max(zone.minY, Math.min(zone.maxY, pos.y)),
      zone.z
    )
  }

  /**
   * Démarre le suivi du pointeur (appelé au pointerdown)
   */
  const startFollowing = (screenX: number, screenY: number) => {
    if (isAnimating.current || gameState !== 'FIGHTING') return

    // Choisir la main (alterner)
    const hand = lastHand.current === 'left' ? 'right' : 'left'
    activeHand.current = hand
    isFollowing.current = true

    // Calculer la position cible initiale
    const worldPos = screenToWorld(screenX, screenY, FOLLOW_CONFIG.readyZ)
    targetFollowPos.current = clampToZone(worldPos, hand)
  }

  /**
   * Met à jour la position cible pendant le drag
   */
  const updateFollowing = (screenX: number, screenY: number) => {
    if (!isFollowing.current || !activeHand.current || gameState !== 'FIGHTING') return

    const worldPos = screenToWorld(screenX, screenY, FOLLOW_CONFIG.readyZ)
    targetFollowPos.current = clampToZone(worldPos, activeHand.current)
  }

  /**
   * Déclenche le coup au relâchement et retourne à la position de repos
   */
  const punchAndRelease = (screenX: number, screenY: number) => {
    if (gameState !== 'FIGHTING') return

    const hand = activeHand.current || (lastHand.current === 'left' ? 'right' : 'left')
    lastHand.current = hand

    const glove = hand === 'left' ? leftGloveRef.current : rightGloveRef.current
    if (!glove) return

    // Arrêter le suivi
    isFollowing.current = false
    activeHand.current = null
    isAnimating.current = true

    // Position cible du coup
    const targetPos = screenToWorld(screenX, screenY, PUNCH_CONFIG.targetZ)
    const restPos = REST_POSITION[hand]

    // Animation GSAP : coup rapide puis retour
    const tl = gsap.timeline({
      onComplete: () => {
        isAnimating.current = false
      },
    })

    // Phase 1: Coup vers la cible (RAPIDE)
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
        x: -0.5,
        z: hand === 'left' ? 0.3 : -0.3,
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

  // Exposer les fonctions via useImperativeHandle
  useImperativeHandle(
    ref,
    () => ({
      get leftGlove() {
        return leftGloveRef.current
      },
      get rightGlove() {
        return rightGloveRef.current
      },
      startFollowing,
      updateFollowing,
      punchAndRelease,
    }),
    [gameState, camera, size]
  )

  // Animation frame : suivi fluide + idle
  useFrame((state) => {
    if (gameState !== 'FIGHTING') return

    const t = state.clock.elapsedTime

    // Si en mode suivi, déplacer le gant actif vers la cible
    if (isFollowing.current && activeHand.current && !isAnimating.current) {
      const glove = activeHand.current === 'left' ? leftGloveRef.current : rightGloveRef.current
      if (glove) {
        // Interpolation fluide vers la position cible
        glove.position.x += (targetFollowPos.current.x - glove.position.x) * (1 - FOLLOW_CONFIG.smoothing)
        glove.position.y += (targetFollowPos.current.y - glove.position.y) * (1 - FOLLOW_CONFIG.smoothing)
        glove.position.z += (targetFollowPos.current.z - glove.position.z) * (1 - FOLLOW_CONFIG.smoothing)

        // Légère rotation pour indiquer "prêt à frapper"
        glove.rotation.x = -0.2
      }
    }

    // Animation idle pour les gants non actifs
    if (!isAnimating.current) {
      if (leftGloveRef.current && activeHand.current !== 'left') {
        leftGloveRef.current.position.y = REST_POSITION.left.y + Math.sin(t * 2) * 0.03
        leftGloveRef.current.position.x = REST_POSITION.left.x + Math.sin(t * 1.5) * 0.02
        if (!isFollowing.current) {
          leftGloveRef.current.position.z = REST_POSITION.left.z
        }
      }
      if (rightGloveRef.current && activeHand.current !== 'right') {
        rightGloveRef.current.position.y = REST_POSITION.right.y + Math.sin(t * 2 + 0.5) * 0.03
        rightGloveRef.current.position.x = REST_POSITION.right.x + Math.sin(t * 1.5 + 0.5) * 0.02
        if (!isFollowing.current) {
          rightGloveRef.current.position.z = REST_POSITION.right.z
        }
      }
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
