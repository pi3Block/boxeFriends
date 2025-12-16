import type * as THREE from 'three'

/**
 * Interface commune pour tous les types d'adversaires
 *
 * Permet un traitement polymorphique des différents opponents:
 * - FluffyOpponent (soft body Ammo.js)
 * - FaceOpponent (GLTF avec morph targets)
 * - SphereOpponent (sphère basique avec shader)
 *
 * Usage:
 * ```typescript
 * const opponent: IOpponent = opponentRef.current
 * opponent.applyImpact(hitPoint, 0.8)
 * ```
 */
export interface IOpponent {
  /**
   * Applique un impact sur l'adversaire
   * @param point - Point d'impact en coordonnées monde
   * @param strength - Force de l'impact (0.0 - 1.0)
   */
  applyImpact(point: THREE.Vector3, strength: number): void

  /**
   * Retourne le collider principal pour la détection de collision
   * Peut être un Mesh, Group, ou Object3D selon l'implémentation
   */
  getCollider(): THREE.Object3D | null

  /**
   * Retourne les points de vie actuels (0-100)
   * Note: Lit depuis le store, pas un état local
   */
  getHealth(): number

  /**
   * Retourne le type d'adversaire pour le debug/logging
   */
  readonly type: OpponentType
}

/**
 * Types d'adversaires supportés
 */
export type OpponentType = 'fluffy' | 'face' | 'sphere' | 'jelly'

/**
 * Configuration d'impact pour les effets visuels
 */
export interface ImpactConfig {
  /** Point d'impact en coordonnées monde */
  point: THREE.Vector3
  /** Direction de l'impact normalisée */
  direction: THREE.Vector3
  /** Force de l'impact (0.0 - 1.0) */
  strength: number
  /** Type de coup (jab, hook, uppercut) */
  punchType?: 'jab' | 'hook' | 'uppercut'
  /** Si c'est un coup critique */
  isCritical?: boolean
}

/**
 * Hook result pour utiliser un opponent de manière typée
 */
export interface UseOpponentResult {
  /** Référence à l'opponent (null si pas encore monté) */
  opponent: IOpponent | null
  /** Si l'opponent est prêt à recevoir des impacts */
  isReady: boolean
}
