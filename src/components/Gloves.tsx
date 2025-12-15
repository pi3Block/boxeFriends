import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
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
 * Configuration du feedback visuel de profondeur
 */
const DEPTH_VISUAL_CONFIG = {
  // Position Z de référence pour le calcul d'échelle
  referenceZ: REST_POSITION.left.z,  // 2.5
  // Position Z minimum (lors du punch)
  minZ: PUNCH_CONFIG.targetZ,         // 0.5
  // Facteur d'échelle max quand proche (1.0 = pas de changement)
  maxScaleBoost: 1.35,
  // Intensité d'émission quand proche (0 = pas d'émission)
  maxEmissiveIntensity: 0.4,
}

/**
 * Interface exposée par le composant Gloves
 */
export interface GlovesHandle {
  leftGlove: Group | null
  rightGlove: Group | null
  // Anciennes méthodes (rétrocompatibilité tactile - alternance automatique)
  startFollowing: (screenX: number, screenY: number) => void
  updateFollowing: (screenX: number, screenY: number) => void
  punchAndRelease: (screenX: number, screenY: number) => void
  // Nouvelles méthodes pour contrôle indépendant (mode caméra)
  updateHandPosition: (hand: 'left' | 'right', screenX: number, screenY: number) => void
  triggerPunch: (hand: 'left' | 'right', screenX: number, screenY: number) => void
}

/**
 * Composant d'un gant de boxe avec forme sphérique
 * Supporte l'émission dynamique pour le feedback de profondeur
 */
function BoxingGlove({
  color = '#cc0000',
  emissiveIntensity = 0,
}: {
  color?: string
  emissiveIntensity?: number
}) {
  // Calcul de la couleur émissive (plus vif quand intense)
  const emissiveColor = emissiveIntensity > 0 ? '#ff3300' : '#000000'

  return (
    <group>
      {/* Corps principal du gant (grande sphère) */}
      <Sphere args={[0.22, 16, 16]} position={[0, 0, 0]}>
        <meshStandardMaterial
          color={color}
          roughness={0.5}
          metalness={0.2}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
        />
      </Sphere>

      {/* Partie supérieure (knuckles) - plus émissive */}
      <Sphere args={[0.18, 16, 16]} position={[0, 0.12, -0.08]}>
        <meshStandardMaterial
          color={color}
          roughness={0.5}
          metalness={0.2}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity * 1.5}
        />
      </Sphere>

      {/* Partie pouce */}
      <Sphere args={[0.1, 12, 12]} position={[0.15, -0.05, 0.05]}>
        <meshStandardMaterial
          color={color}
          roughness={0.5}
          metalness={0.2}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity * 0.8}
        />
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

  // État visuel de profondeur (pour le feedback)
  const [leftEmissive, setLeftEmissive] = useState(0)
  const [rightEmissive, setRightEmissive] = useState(0)
  const [leftScale, setLeftScale] = useState(1)
  const [rightScale, setRightScale] = useState(1)

  // État de suivi (mode tactile - alternance)
  const activeHand = useRef<'left' | 'right' | null>(null)
  const lastHand = useRef<'left' | 'right'>('right')
  const isAnimating = useRef(false)
  const isFollowing = useRef(false)
  const targetFollowPos = useRef<THREE.Vector3>(new THREE.Vector3())

  // État de suivi (mode caméra - indépendant)
  const leftHandTracking = useRef<{
    isActive: boolean
    isAnimating: boolean
    targetPos: THREE.Vector3
  }>({ isActive: false, isAnimating: false, targetPos: new THREE.Vector3() })
  const rightHandTracking = useRef<{
    isActive: boolean
    isAnimating: boolean
    targetPos: THREE.Vector3
  }>({ isActive: false, isAnimating: false, targetPos: new THREE.Vector3() })

  /**
   * Calcule les paramètres visuels basés sur la profondeur Z
   * Retourne : { scale, emissive } où emissive est l'intensité d'émission
   */
  const calculateDepthVisuals = (z: number): { scale: number; emissive: number } => {
    const { referenceZ, minZ, maxScaleBoost, maxEmissiveIntensity } = DEPTH_VISUAL_CONFIG

    // Normaliser Z entre 0 (loin) et 1 (proche)
    const normalizedDepth = Math.max(0, Math.min(1, (referenceZ - z) / (referenceZ - minZ)))

    // Calculer l'échelle (1 → maxScaleBoost quand proche)
    const scale = 1 + (maxScaleBoost - 1) * normalizedDepth

    // Calculer l'émission (0 → maxEmissiveIntensity quand proche)
    // Utiliser une courbe quadratique pour un effet plus marqué près de l'impact
    const emissive = maxEmissiveIntensity * normalizedDepth * normalizedDepth

    return { scale, emissive }
  }

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

  /**
   * Met à jour la position d'une main spécifique (mode caméra)
   * Permet le contrôle indépendant des deux gants
   */
  const updateHandPosition = (hand: 'left' | 'right', screenX: number, screenY: number) => {
    if (gameState !== 'FIGHTING') return

    const tracking = hand === 'left' ? leftHandTracking.current : rightHandTracking.current
    if (tracking.isAnimating) return

    tracking.isActive = true

    // Calculer la position cible
    const worldPos = screenToWorld(screenX, screenY, FOLLOW_CONFIG.readyZ)
    tracking.targetPos = clampToZone(worldPos, hand)
  }

  /**
   * Déclenche un coup pour une main spécifique (mode caméra)
   * Animation ultra-rapide pour ne pas désynchroniser le suivi
   */
  const triggerPunch = (hand: 'left' | 'right', screenX: number, screenY: number) => {
    if (gameState !== 'FIGHTING') return

    const tracking = hand === 'left' ? leftHandTracking.current : rightHandTracking.current
    if (tracking.isAnimating) return

    const glove = hand === 'left' ? leftGloveRef.current : rightGloveRef.current
    if (!glove) return

    // Animation très courte - juste un "punch" visuel rapide
    // Le suivi X/Y continue pendant l'animation (pas de blocage)
    const punchDuration = 0.08 // 80ms - très rapide

    // Animation rapide : avancer en Z puis revenir
    gsap.to(glove.position, {
      z: PUNCH_CONFIG.targetZ,
      duration: punchDuration,
      ease: 'power2.out',
      onComplete: () => {
        // Retour rapide à la profondeur de suivi
        gsap.to(glove.position, {
          z: FOLLOW_CONFIG.readyZ,
          duration: punchDuration * 1.5,
          ease: 'power2.inOut',
        })
      },
    })

    // Rotation de punch rapide
    gsap.to(glove.rotation, {
      x: -0.5,
      duration: punchDuration,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(glove.rotation, {
          x: -0.2,
          duration: punchDuration * 1.5,
          ease: 'power2.inOut',
        })
      },
    })
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
      // Méthodes tactile (rétrocompatibilité)
      startFollowing,
      updateFollowing,
      punchAndRelease,
      // Méthodes caméra (contrôle indépendant)
      updateHandPosition,
      triggerPunch,
    }),
    [gameState, camera, size]
  )

  // Animation frame : suivi fluide + idle + feedback de profondeur
  useFrame((state) => {
    if (gameState !== 'FIGHTING') return

    const t = state.clock.elapsedTime
    const smoothFactor = 1 - FOLLOW_CONFIG.smoothing

    // === Mode tactile : suivi du gant actif ===
    if (isFollowing.current && activeHand.current && !isAnimating.current) {
      const glove = activeHand.current === 'left' ? leftGloveRef.current : rightGloveRef.current
      if (glove) {
        glove.position.x += (targetFollowPos.current.x - glove.position.x) * smoothFactor
        glove.position.y += (targetFollowPos.current.y - glove.position.y) * smoothFactor
        glove.position.z += (targetFollowPos.current.z - glove.position.z) * smoothFactor
        glove.rotation.x = -0.2
      }
    }

    // === Mode caméra : suivi indépendant des deux mains ===
    // Gant gauche (mode caméra)
    if (leftHandTracking.current.isActive && !leftHandTracking.current.isAnimating && leftGloveRef.current) {
      const target = leftHandTracking.current.targetPos
      leftGloveRef.current.position.x += (target.x - leftGloveRef.current.position.x) * smoothFactor
      leftGloveRef.current.position.y += (target.y - leftGloveRef.current.position.y) * smoothFactor
      leftGloveRef.current.position.z += (target.z - leftGloveRef.current.position.z) * smoothFactor
      leftGloveRef.current.rotation.x = -0.2
    }

    // Gant droit (mode caméra)
    if (rightHandTracking.current.isActive && !rightHandTracking.current.isAnimating && rightGloveRef.current) {
      const target = rightHandTracking.current.targetPos
      rightGloveRef.current.position.x += (target.x - rightGloveRef.current.position.x) * smoothFactor
      rightGloveRef.current.position.y += (target.y - rightGloveRef.current.position.y) * smoothFactor
      rightGloveRef.current.position.z += (target.z - rightGloveRef.current.position.z) * smoothFactor
      rightGloveRef.current.rotation.x = -0.2
    }

    // === Animation idle pour les gants non actifs ===
    const leftIsIdle =
      !isAnimating.current &&
      activeHand.current !== 'left' &&
      !leftHandTracking.current.isActive &&
      !leftHandTracking.current.isAnimating

    const rightIsIdle =
      !isAnimating.current &&
      activeHand.current !== 'right' &&
      !rightHandTracking.current.isActive &&
      !rightHandTracking.current.isAnimating

    if (leftIsIdle && leftGloveRef.current) {
      leftGloveRef.current.position.y = REST_POSITION.left.y + Math.sin(t * 2) * 0.03
      leftGloveRef.current.position.x = REST_POSITION.left.x + Math.sin(t * 1.5) * 0.02
      if (!isFollowing.current) {
        leftGloveRef.current.position.z = REST_POSITION.left.z
      }
    }

    if (rightIsIdle && rightGloveRef.current) {
      rightGloveRef.current.position.y = REST_POSITION.right.y + Math.sin(t * 2 + 0.5) * 0.03
      rightGloveRef.current.position.x = REST_POSITION.right.x + Math.sin(t * 1.5 + 0.5) * 0.02
      if (!isFollowing.current) {
        rightGloveRef.current.position.z = REST_POSITION.right.z
      }
    }

    // === Feedback visuel de profondeur ===
    // Calculer l'échelle et l'émission basées sur la position Z
    if (leftGloveRef.current) {
      const leftVisuals = calculateDepthVisuals(leftGloveRef.current.position.z)
      // Mise à jour lissée pour éviter les sauts
      setLeftEmissive((prev) => prev + (leftVisuals.emissive - prev) * 0.3)
      setLeftScale((prev) => prev + (leftVisuals.scale - prev) * 0.3)
    }

    if (rightGloveRef.current) {
      const rightVisuals = calculateDepthVisuals(rightGloveRef.current.position.z)
      setRightEmissive((prev) => prev + (rightVisuals.emissive - prev) * 0.3)
      setRightScale((prev) => prev + (rightVisuals.scale - prev) * 0.3)
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
        scale={[leftScale, leftScale, leftScale]}
      >
        <BoxingGlove color="#cc0000" emissiveIntensity={leftEmissive} />
      </group>

      {/* Gant droit */}
      <group
        ref={rightGloveRef}
        position={[REST_POSITION.right.x, REST_POSITION.right.y, REST_POSITION.right.z]}
        rotation={[0.3, -0.2, 0]}
        scale={[-rightScale, rightScale, rightScale]} // Miroir pour le gant droit
      >
        <BoxingGlove color="#cc0000" emissiveIntensity={rightEmissive} />
      </group>
    </>
  )
})

export default Gloves
