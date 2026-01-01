/**
 * @deprecated LEGACY - Ancienne implémentation des gants avec GSAP
 *
 * Ce fichier contient l'ancienne physique des gants basée sur GSAP et des
 * animations tweenées. Il a été remplacé par SpringGloves.tsx qui utilise
 * Ammo.js pour une physique plus réaliste avec ressorts (btGeneric6DofSpringConstraint).
 *
 * Conservé pour référence en cas de besoin de rollback ou pour récupérer
 * des patterns d'animation.
 *
 * Fonctionnalités legacy:
 * - Animation GSAP pour les coups (punch)
 * - Suivi tactile avec smoothing
 * - Effet de profondeur visuelle (scale basé sur Z)
 * - Alternance automatique des mains (tactile)
 * - Mode souris (deux gants suivent le curseur)
 * - Mode caméra (suivi des mains MediaPipe)
 *
 * @see SpringGloves.tsx pour l'implémentation actuelle
 * @see docs/ROADMAP.md Phase 1 pour le contexte de cette migration
 */
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
  // Méthodes tactile (alternance automatique)
  startFollowing: (screenX: number, screenY: number) => void
  updateFollowing: (screenX: number, screenY: number) => void
  punchAndRelease: (screenX: number, screenY: number) => void
  quickPunch: () => void
  returnToRest: () => void
  // Méthode souris: les deux gants suivent
  updateBothGloves: (screenX: number, screenY: number) => void
  triggerMousePunch: (hand: 'left' | 'right', screenX: number, screenY: number) => void
  // Méthodes pour contrôle indépendant (mode caméra)
  updateHandPosition: (hand: 'left' | 'right', screenX: number, screenY: number) => void
  cameraPunch: (hand: 'left' | 'right', screenX: number, screenY: number) => void
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

  // État visuel de profondeur (refs pour éviter les re-renders dans useFrame)
  const leftEmissiveRef = useRef(0)
  const rightEmissiveRef = useRef(0)
  const leftScaleRef = useRef(1)
  const rightScaleRef = useRef(1)

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

  // Timer pour le logging des positions
  const lastLogTime = useRef(0)

  // Flag pour le mode souris (désactive l'animation idle)
  const isMouseModeActive = useRef(false)
  const isPunchAnimating = useRef<{ left: boolean; right: boolean }>({ left: false, right: false })

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
   * Note: Ne vérifie plus isAnimating pour permettre le suivi pendant le punch
   */
  const startFollowing = (screenX: number, screenY: number) => {
    if (gameState !== 'FIGHTING') return

    // Choisir la main (alterner)
    const hand = lastHand.current === 'left' ? 'right' : 'left'
    lastHand.current = hand
    activeHand.current = hand
    isFollowing.current = true

    // Calculer la position cible initiale
    const worldPos = screenToWorld(screenX, screenY, FOLLOW_CONFIG.readyZ)
    targetFollowPos.current = clampToZone(worldPos, hand)

    // Déplacer immédiatement le gant vers la position cible
    const glove = hand === 'left' ? leftGloveRef.current : rightGloveRef.current
    if (glove) {
      glove.position.x = targetFollowPos.current.x
      glove.position.y = targetFollowPos.current.y
      glove.position.z = FOLLOW_CONFIG.readyZ
    }
  }

  /**
   * Animation de coup rapide (Z seulement) sans bloquer le suivi X/Y
   * Appelé immédiatement au clic pour l'effet visuel du punch
   */
  const quickPunch = () => {
    if (gameState !== 'FIGHTING' || !activeHand.current) return

    const hand = activeHand.current
    const glove = hand === 'left' ? leftGloveRef.current : rightGloveRef.current
    if (!glove) return

    // Animation très rapide: avancer en Z puis revenir
    const punchDuration = 0.1

    gsap.to(glove.position, {
      z: PUNCH_CONFIG.targetZ,
      duration: punchDuration,
      ease: 'power2.out',
      onComplete: () => {
        // Retour à la profondeur de suivi (pas de repos)
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
   * Retour à la position de repos sans déclencher de coup
   * Appelé quand on relâche après avoir suivi la souris
   */
  const returnToRest = () => {
    if (gameState !== 'FIGHTING') return

    const hand = activeHand.current || lastHand.current
    const glove = hand === 'left' ? leftGloveRef.current : rightGloveRef.current
    if (!glove) return

    // Arrêter le suivi
    isFollowing.current = false
    activeHand.current = null

    // Animation de retour fluide à la position de repos
    const restPos = REST_POSITION[hand]

    gsap.to(glove.position, {
      x: restPos.x,
      y: restPos.y,
      z: restPos.z,
      duration: PUNCH_CONFIG.returnSpeed,
      ease: PUNCH_CONFIG.easeOut,
    })

    gsap.to(glove.rotation, {
      x: 0.3,
      y: hand === 'left' ? 0.2 : -0.2,
      z: 0,
      duration: PUNCH_CONFIG.returnSpeed,
      ease: PUNCH_CONFIG.easeOut,
    })
  }

  /**
   * Les deux gants en position de garde FPV avec influence subtile de la souris
   * Les gants restent principalement à leur position de repos
   * Note: Lit gameState directement du store pour éviter les problèmes de closure
   */
  const updateBothGloves = (screenX: number, screenY: number) => {
    // Lire gameState frais du store (pas de la closure)
    const currentGameState = useGameStore.getState().gameState
    if (currentGameState !== 'FIGHTING') {
      return
    }

    // Activer le mode souris (désactive l'animation idle)
    isMouseModeActive.current = true

    // Normaliser la position souris (-1 à 1)
    const normalizedX = (screenX / window.innerWidth) * 2 - 1
    const normalizedY = -(screenY / window.innerHeight) * 2 + 1

    // Influence forte de la souris (1.0 = déplacement complet selon la position souris)
    const mouseInfluence = 1.0
    const offsetX = normalizedX * mouseInfluence
    const offsetY = normalizedY * mouseInfluence * 0.6 // Un peu moins d'influence en Y

    // Gant gauche: position de repos + influence souris (si pas en animation de punch)
    if (leftGloveRef.current && !isPunchAnimating.current.left) {
      const leftTarget = new THREE.Vector3(
        REST_POSITION.left.x + offsetX,
        REST_POSITION.left.y + offsetY,
        REST_POSITION.left.z
      )
      // Interpolation rapide pour réactivité (0.3 = 30% par frame)
      leftGloveRef.current.position.x += (leftTarget.x - leftGloveRef.current.position.x) * 0.3
      leftGloveRef.current.position.y += (leftTarget.y - leftGloveRef.current.position.y) * 0.3
      leftGloveRef.current.position.z += (leftTarget.z - leftGloveRef.current.position.z) * 0.3
    }

    // Gant droit: position de repos + influence souris (si pas en animation de punch)
    if (rightGloveRef.current && !isPunchAnimating.current.right) {
      const rightTarget = new THREE.Vector3(
        REST_POSITION.right.x + offsetX,
        REST_POSITION.right.y + offsetY,
        REST_POSITION.right.z
      )
      // Interpolation rapide pour réactivité
      rightGloveRef.current.position.x += (rightTarget.x - rightGloveRef.current.position.x) * 0.3
      rightGloveRef.current.position.y += (rightTarget.y - rightGloveRef.current.position.y) * 0.3
      rightGloveRef.current.position.z += (rightTarget.z - rightGloveRef.current.position.z) * 0.3
    }
  }

  /**
   * Animation de punch pour un gant spécifique (mode souris)
   * Le gant part de sa position de garde et revient après le punch
   * Note: Lit gameState directement du store pour éviter les problèmes de closure
   */
  const triggerMousePunch = (hand: 'left' | 'right', screenX: number, screenY: number) => {
    // Lire gameState frais du store (pas de la closure)
    const currentGameState = useGameStore.getState().gameState
    if (currentGameState !== 'FIGHTING') {
      return
    }

    const glove = hand === 'left' ? leftGloveRef.current : rightGloveRef.current
    if (!glove) {
      return
    }

    // Marquer le gant comme en animation (empêche updateBothGloves et idle de le bouger)
    isPunchAnimating.current[hand] = true

    // Position cible du punch (vers le point cliqué)
    const targetPos = screenToWorld(screenX, screenY, PUNCH_CONFIG.targetZ)

    // Animation rapide: punch vers la cible puis retour à la position actuelle
    const punchDuration = 0.1

    // Sauvegarder la position actuelle pour le retour
    const returnPos = {
      x: glove.position.x,
      y: glove.position.y,
      z: REST_POSITION[hand].z
    }

    // Animation vers la cible
    gsap.to(glove.position, {
      x: targetPos.x,
      y: targetPos.y,
      z: PUNCH_CONFIG.targetZ,
      duration: punchDuration,
      ease: 'power2.out',
      onComplete: () => {
        // Retour à la position de garde (où le gant suivait la souris)
        gsap.to(glove.position, {
          x: returnPos.x,
          y: returnPos.y,
          z: returnPos.z,
          duration: PUNCH_CONFIG.returnSpeed,
          ease: PUNCH_CONFIG.easeOut,
          onComplete: () => {
            // Animation terminée, permettre à nouveau le suivi souris
            isPunchAnimating.current[hand] = false
          },
        })
      },
    })

    // Rotation de punch
    gsap.to(glove.rotation, {
      x: -0.5,
      duration: punchDuration,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(glove.rotation, {
          x: 0.3,
          y: hand === 'left' ? 0.2 : -0.2,
          z: 0,
          duration: PUNCH_CONFIG.returnSpeed,
          ease: PUNCH_CONFIG.easeOut,
        })
      },
    })
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
  const cameraPunch = (hand: 'left' | 'right', screenX: number, screenY: number) => {
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
      // Méthodes tactile
      startFollowing,
      updateFollowing,
      punchAndRelease,
      quickPunch,
      returnToRest,
      // Méthodes souris (les deux gants suivent)
      updateBothGloves,
      triggerMousePunch,
      // Méthodes caméra (contrôle indépendant)
      updateHandPosition,
      cameraPunch,
    }),
    [gameState, camera, size]
  )

  // Animation frame : suivi fluide + idle + feedback de profondeur
  useFrame((state) => {
    const currentGameState = useGameStore.getState().gameState
    if (currentGameState !== 'FIGHTING') return

    const t = state.clock.elapsedTime
    const smoothFactor = 1 - FOLLOW_CONFIG.smoothing

    // Logging des positions toutes les 0.5 secondes
    if (t - lastLogTime.current >= 0.5) {
      lastLogTime.current = t
      const leftPos = leftGloveRef.current?.position
      const rightPos = rightGloveRef.current?.position
      console.log(`[Gloves] L: (${leftPos?.x.toFixed(2)}, ${leftPos?.y.toFixed(2)}, ${leftPos?.z.toFixed(2)}) | R: (${rightPos?.x.toFixed(2)}, ${rightPos?.y.toFixed(2)}, ${rightPos?.z.toFixed(2)})`)
    }

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
    // Ne s'applique PAS si le mode souris est actif (les gants suivent la souris)
    const leftIsIdle =
      !isMouseModeActive.current &&
      !isPunchAnimating.current.left &&
      !isAnimating.current &&
      activeHand.current !== 'left' &&
      !leftHandTracking.current.isActive &&
      !leftHandTracking.current.isAnimating

    const rightIsIdle =
      !isMouseModeActive.current &&
      !isPunchAnimating.current.right &&
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
    // Mise à jour directe via refs et mutation (pas de setState = pas de re-render)
    if (leftGloveRef.current) {
      const leftVisuals = calculateDepthVisuals(leftGloveRef.current.position.z)
      // Mise à jour lissée pour éviter les sauts
      leftEmissiveRef.current += (leftVisuals.emissive - leftEmissiveRef.current) * 0.3
      leftScaleRef.current += (leftVisuals.scale - leftScaleRef.current) * 0.3
      // Appliquer directement sur le groupe
      leftGloveRef.current.scale.setScalar(leftScaleRef.current)
      // Mettre à jour l'émissive sur tous les matériaux du groupe
      leftGloveRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
          if (material.emissiveIntensity !== undefined) {
            material.emissiveIntensity = leftEmissiveRef.current
          }
        }
      })
    }

    if (rightGloveRef.current) {
      const rightVisuals = calculateDepthVisuals(rightGloveRef.current.position.z)
      rightEmissiveRef.current += (rightVisuals.emissive - rightEmissiveRef.current) * 0.3
      rightScaleRef.current += (rightVisuals.scale - rightScaleRef.current) * 0.3
      // Appliquer directement sur le groupe (avec miroir sur X)
      rightGloveRef.current.scale.set(-rightScaleRef.current, rightScaleRef.current, rightScaleRef.current)
      // Mettre à jour l'émissive sur tous les matériaux du groupe
      rightGloveRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
          if (material.emissiveIntensity !== undefined) {
            material.emissiveIntensity = rightEmissiveRef.current
          }
        }
      })
    }
  })

  // Masquer les gants si pas en combat
  if (gameState !== 'FIGHTING') {
    return null
  }

  return (
    <>
      {/* Gant gauche - scale et emissive mis à jour dans useFrame */}
      <group
        ref={leftGloveRef}
        position={[REST_POSITION.left.x, REST_POSITION.left.y, REST_POSITION.left.z]}
        rotation={[0.3, 0.2, 0]}
      >
        <BoxingGlove color="#cc0000" emissiveIntensity={0} />
      </group>

      {/* Gant droit - scale (avec miroir) et emissive mis à jour dans useFrame */}
      <group
        ref={rightGloveRef}
        position={[REST_POSITION.right.x, REST_POSITION.right.y, REST_POSITION.right.z]}
        rotation={[0.3, -0.2, 0]}
        scale={[-1, 1, 1]}
      >
        <BoxingGlove color="#cc0000" emissiveIntensity={0} />
      </group>
    </>
  )
})

export default Gloves
