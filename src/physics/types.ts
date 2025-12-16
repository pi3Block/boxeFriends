import * as THREE from 'three'

/**
 * Particule pour la simulation XPBD
 * Représente un vertex de la géométrie avec ses propriétés physiques
 */
export interface Particle {
  id: number
  position: THREE.Vector3      // Position actuelle
  prevPosition: THREE.Vector3  // Position précédente (pour calcul vélocité)
  velocity: THREE.Vector3      // Vélocité explicite (pour forces externes)
  invMass: number              // Masse inverse (0 = fixe/immobile)
  restPosition: THREE.Vector3  // Position de repos (bind pose)
}

/**
 * Types de contraintes supportées
 */
export type ConstraintType = 'distance' | 'volume' | 'bending' | 'attachment' | 'pressure'

/**
 * Contrainte XPBD générique
 */
export interface Constraint {
  type: ConstraintType
  particleIds: number[]        // IDs des particules impliquées
  restValue: number            // Valeur au repos (longueur, volume, angle)
  compliance: number           // Souplesse (0 = rigide, plus haut = plus souple)
  damping: number              // Amortissement vélocité
}

/**
 * Contrainte de distance (ressort entre 2 particules)
 */
export interface DistanceConstraint extends Constraint {
  type: 'distance'
  particleIds: [number, number]
  restValue: number            // Longueur au repos
}

/**
 * Contrainte de volume (préservation du volume)
 */
export interface VolumeConstraint extends Constraint {
  type: 'volume'
  particleIds: number[]        // Tous les particles du volume
  restValue: number            // Volume au repos
}

/**
 * Contrainte de pression (soft body gonflable style ammo.js)
 * Pousse les vertices vers l'extérieur selon les normales
 */
export interface PressureConstraint extends Constraint {
  type: 'pressure'
  particleIds: number[]        // Tous les particles de la surface
  restValue: number            // Volume au repos
  pressure: number             // Pression interne (kPR dans ammo.js, ex: 120-250)
  triangles: [number, number, number][]  // Indices des triangles pour calcul normales
}

/**
 * Configuration du solveur XPBD
 */
export interface XPBDConfig {
  substeps: number             // Sous-étapes par frame (4-6 pour mobile)
  gravity: THREE.Vector3       // Gravité
  globalDamping: number        // Amortissement global (air resistance)
  floorY: number              // Plan de collision sol
}

/**
 * Valeurs par défaut optimisées mobile
 */
export const DEFAULT_XPBD_CONFIG: XPBDConfig = {
  substeps: 5,
  gravity: new THREE.Vector3(0, -9.8, 0),
  globalDamping: 0.98,
  floorY: -2,
}

/**
 * État d'une partie du corps (cranium, joue, etc.)
 */
export interface BodyPartPhysics {
  id: string
  particles: Particle[]
  constraints: Constraint[]
  isActive: boolean
}

/**
 * Zone d'impact sur le visage
 */
export type HitZone =
  | 'cranium'
  | 'forehead'
  | 'leftEye'
  | 'rightEye'
  | 'nose'
  | 'leftCheek'
  | 'rightCheek'
  | 'jaw'
  | 'leftEar'
  | 'rightEar'

/**
 * Données d'un impact
 */
export interface ImpactData {
  position: THREE.Vector3
  force: THREE.Vector3
  radius: number
  zone: HitZone
  intensity: number           // 0-1
}

/**
 * Créer une particule avec valeurs par défaut
 */
export function createParticle(
  id: number,
  position: THREE.Vector3,
  invMass: number = 1
): Particle {
  return {
    id,
    position: position.clone(),
    prevPosition: position.clone(),
    velocity: new THREE.Vector3(),
    invMass,
    restPosition: position.clone(),
  }
}

/**
 * Créer une contrainte de distance entre 2 particules
 */
export function createDistanceConstraint(
  p1: Particle,
  p2: Particle,
  compliance: number = 0,
  damping: number = 0.1
): DistanceConstraint {
  const restLength = p1.restPosition.distanceTo(p2.restPosition)
  return {
    type: 'distance',
    particleIds: [p1.id, p2.id],
    restValue: restLength,
    compliance,
    damping,
  }
}
