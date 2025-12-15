import { create } from 'zustand'
import * as THREE from 'three'
import {
  XPBDSolver,
  Particle,
  Constraint,
  ImpactData,
  HitZone,
  createParticle,
  createDistanceConstraint,
  XPBDConfig,
} from '../physics'

/**
 * État d'une partie du corps pour la physique
 */
interface BodyPartState {
  id: string
  particleIds: number[]
  isActive: boolean
}

/**
 * Store Zustand pour la physique jelly de la tête procédurale
 * Gère le solveur XPBD et les parties du corps
 */
interface JellyPhysicsStore {
  // Solveur XPBD
  solver: XPBDSolver

  // Parties du corps enregistrées
  bodyParts: Map<string, BodyPartState>

  // Compteur global d'IDs de particules
  nextParticleId: number

  // État de simulation
  isSimulating: boolean

  // Actions
  initBodyPart: (
    partId: string,
    vertices: Float32Array,
    options?: {
      compliance?: number
      createConstraints?: boolean
      fixedIndices?: number[]
    }
  ) => number[]

  removeBodyPart: (partId: string) => void

  applyImpulse: (
    position: THREE.Vector3,
    force: THREE.Vector3,
    radius: number,
    zone?: HitZone,
    intensity?: number
  ) => void

  step: (deltaTime: number) => void

  getDisplacements: (partId: string) => Float32Array | null

  setSimulating: (value: boolean) => void

  setConfig: (config: Partial<XPBDConfig>) => void

  reset: () => void
}

export const useJellyPhysicsStore = create<JellyPhysicsStore>((set, get) => ({
  solver: new XPBDSolver({
    substeps: 5,
    globalDamping: 0.95,
  }),

  bodyParts: new Map(),
  nextParticleId: 0,
  isSimulating: true,

  /**
   * Initialiser une partie du corps avec ses vertices
   * Retourne les IDs des particules créées
   */
  initBodyPart: (partId, vertices, options = {}) => {
    const { solver, nextParticleId, bodyParts } = get()
    const {
      compliance = 0.001,
      createConstraints = true,
      fixedIndices = [],
    } = options

    const particleIds: number[] = []
    const particles: Particle[] = []
    let currentId = nextParticleId

    // Créer une particule par vertex (stride = 3)
    for (let i = 0; i < vertices.length; i += 3) {
      const position = new THREE.Vector3(
        vertices[i],
        vertices[i + 1],
        vertices[i + 2]
      )

      // Masse inverse : 0 si fixe, 1 sinon
      const vertexIndex = i / 3
      const invMass = fixedIndices.includes(vertexIndex) ? 0 : 1

      const particle = createParticle(currentId, position, invMass)
      particles.push(particle)
      particleIds.push(currentId)
      currentId++
    }

    // Ajouter au solveur
    solver.addParticles(particles)

    // Créer contraintes de distance entre vertices adjacents
    if (createConstraints && particles.length > 1) {
      const constraints: Constraint[] = []

      // Pour une sphère/ellipsoïde, connecter les vertices proches
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p1 = particles[i]
          const p2 = particles[j]
          if (p1 && p2) {
            const dist = p1.restPosition.distanceTo(p2.restPosition)

            // Connecter si distance < seuil (ajuster selon géométrie)
            if (dist < 0.3) {
              constraints.push(createDistanceConstraint(p1, p2, compliance))
            }
          }
        }
      }

      solver.addConstraints(constraints)
    }

    // Enregistrer la partie
    const newBodyParts = new Map(bodyParts)
    newBodyParts.set(partId, {
      id: partId,
      particleIds,
      isActive: true,
    })

    set({
      bodyParts: newBodyParts,
      nextParticleId: currentId,
    })

    return particleIds
  },

  /**
   * Supprimer une partie du corps
   */
  removeBodyPart: (partId) => {
    const { bodyParts } = get()
    const newBodyParts = new Map(bodyParts)
    newBodyParts.delete(partId)
    set({ bodyParts: newBodyParts })
    // Note: On ne supprime pas les particules du solveur pour simplifier
    // (elles seront ignorées si la partie n'est plus référencée)
  },

  /**
   * Appliquer un impact au système
   */
  applyImpulse: (position, force, radius, zone = 'cranium', intensity = 1) => {
    const { solver } = get()

    const impact: ImpactData = {
      position: position.clone(),
      force: force.clone(),
      radius,
      zone,
      intensity: Math.min(Math.max(intensity, 0), 1),
    }

    solver.applyImpact(impact)
  },

  /**
   * Avancer la simulation d'un pas de temps
   */
  step: (deltaTime) => {
    const { solver, isSimulating } = get()
    if (!isSimulating) return

    // Limiter dt pour stabilité (max ~33ms = 30fps)
    const dt = Math.min(deltaTime, 0.033)
    solver.step(dt)
  },

  /**
   * Obtenir les déplacements pour une partie du corps
   * Retourne un Float32Array des déplacements (x,y,z) par vertex
   */
  getDisplacements: (partId) => {
    const { solver, bodyParts } = get()
    const part = bodyParts.get(partId)

    if (!part) return null

    const displacements = new Float32Array(part.particleIds.length * 3)

    part.particleIds.forEach((id, index) => {
      const particle = solver.getParticle(id)
      if (particle) {
        const i = index * 3
        displacements[i] = particle.position.x - particle.restPosition.x
        displacements[i + 1] = particle.position.y - particle.restPosition.y
        displacements[i + 2] = particle.position.z - particle.restPosition.z
      }
    })

    return displacements
  },

  /**
   * Activer/désactiver la simulation
   */
  setSimulating: (value) => {
    set({ isSimulating: value })
  },

  /**
   * Modifier la configuration du solveur
   */
  setConfig: (config) => {
    const { solver } = get()
    solver.setConfig(config)
  },

  /**
   * Réinitialiser le système
   */
  reset: () => {
    const { solver } = get()
    solver.reset()
  },
}))
