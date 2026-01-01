import { useCallback } from 'react'
import { useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useGameStore, ImpactManager } from '../stores'
import type { PunchData } from './useGestureInput'
import type { PunchType } from '../stores'

/**
 * Multiplicateurs de dégâts par type de coup
 */
const DAMAGE_MULTIPLIERS: Record<PunchType, number> = {
  jab: 0.5,
  hook: 0.8,
  uppercut: 1.0,
}

/**
 * Dégâts de base
 */
const BASE_DAMAGE = 15

/**
 * Seuil pour un coup critique
 */
const CRITICAL_THRESHOLD = 0.85

/**
 * Hook pour gérer la détection des hits et connecter
 * le système d'input aux stores (dégâts + déformation)
 */
export function useHitDetection() {
  const { camera, size } = useThree()
  // ImpactManager.addImpact utilisé directement (pas de subscription React)
  const takeDamage = useGameStore((state) => state.takeDamage)
  const gameState = useGameStore((state) => state.gameState)

  /**
   * Convertit une position écran en position 3D sur la sphère de l'adversaire
   */
  const screenToHitPoint = useCallback(
    (screenX: number, screenY: number): [number, number, number] => {
      // Normaliser les coordonnées écran (-1 à 1)
      const ndcX = (screenX / size.width) * 2 - 1
      const ndcY = -(screenY / size.height) * 2 + 1

      // Créer un rayon depuis la caméra
      const direction = new Vector3(ndcX, ndcY, 0.5)
        .unproject(camera)
        .sub(camera.position)
        .normalize()

      // Point d'impact approximatif sur une sphère à z=0 de rayon 1
      // On simplifie en projetant sur un plan z=0 pour le MVP
      const t = -camera.position.z / direction.z
      const hitPoint = new Vector3()
        .copy(camera.position)
        .add(direction.multiplyScalar(t))

      // Clamp pour rester sur la "face" de l'adversaire
      const clampedX = Math.max(-0.8, Math.min(0.8, hitPoint.x))
      const clampedY = Math.max(-0.8, Math.min(0.8, hitPoint.y))

      return [clampedX, clampedY, 0.5] // Z légèrement devant
    },
    [camera, size]
  )

  /**
   * Enregistre un hit et applique les effets
   */
  const registerHit = useCallback(
    (punchData: PunchData) => {
      // Ne pas traiter si pas en combat
      if (gameState !== 'FIGHTING') return

      const { type, velocity, screenPosition } = punchData

      // Calculer la force de l'impact
      const typeMultiplier = DAMAGE_MULTIPLIERS[type]
      const impactStrength = velocity * typeMultiplier

      // Déterminer si c'est un coup critique
      const isCritical = impactStrength > CRITICAL_THRESHOLD

      // Convertir la position écran en point d'impact 3D
      const hitPoint = screenToHitPoint(screenPosition[0], screenPosition[1])

      // Ajouter l'impact visuel (déformation) - pas de re-render React
      ImpactManager.addImpact(hitPoint, impactStrength)

      // Appliquer les dégâts
      const damage = BASE_DAMAGE * typeMultiplier * velocity
      takeDamage(damage, isCritical)

      // Debug en dev
      if (import.meta.env.DEV) {
        console.log(
          `[HIT] ${type.toUpperCase()} | Velocity: ${velocity.toFixed(2)} | Damage: ${damage.toFixed(1)} | Critical: ${isCritical}`
        )
      }
    },
    [gameState, screenToHitPoint, takeDamage]
  )

  /**
   * Enregistre un hit direct avec un point 3D connu
   * (utilisé par le système de physique Rapier)
   */
  const registerHitAtPoint = useCallback(
    (
      hitPoint: [number, number, number],
      velocity: number,
      type: PunchType = 'jab'
    ) => {
      if (gameState !== 'FIGHTING') return

      const typeMultiplier = DAMAGE_MULTIPLIERS[type]
      const impactStrength = velocity * typeMultiplier
      const isCritical = impactStrength > CRITICAL_THRESHOLD

      ImpactManager.addImpact(hitPoint, impactStrength)

      const damage = BASE_DAMAGE * typeMultiplier * velocity
      takeDamage(damage, isCritical)
    },
    [gameState, takeDamage]
  )

  return {
    registerHit,
    registerHitAtPoint,
    screenToHitPoint,
  }
}
