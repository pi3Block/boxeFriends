import { create } from 'zustand'
import * as THREE from 'three'
import { XPBDSolver } from '../physics/XPBDSolver'
import {
  Particle,
  Constraint,
  PressureConstraint,
  ImpactData,
  HitZone,
  createParticle,
  createDistanceConstraint,
} from '../physics/types'

/**
 * Configuration du soft body fluffy (inspiré ammo.js)
 * Paramètres calqués sur l'exemple physics_ammo_volume.html
 */
export interface FluffyConfig {
  // Pression interne (kPR dans ammo.js) - pousse vers l'extérieur
  // Valeurs typiques: 120-250
  pressure: number
  // Rigidité des arêtes (kLST dans ammo.js) - 0-1, 0.9 = très rigide
  edgeStiffness: number
  // Amortissement (kDP dans ammo.js) - TRÈS FAIBLE! 0.01 = presque pas de perte
  // Dans ammo.js c'est le coefficient de damping, ici c'est la rétention (1 - kDP)
  damping: number
  // Friction (kDF dans ammo.js) - 0-1
  friction: number
  // Nombre d'itérations du solveur (viterations/piterations dans ammo.js)
  // 40 dans l'exemple original!
  iterations: number
  // Masse totale du volume
  mass: number
  // Gravité active
  useGravity: boolean
}

export const DEFAULT_FLUFFY_CONFIG: FluffyConfig = {
  pressure: 200,        // kPR - pression interne élevée
  edgeStiffness: 0.9,   // kLST - rigidité des arêtes (0.9 dans ammo.js)
  damping: 0.99,        // 1 - kDP (kDP = 0.01 dans ammo.js)
  friction: 0.1,        // kDF
  iterations: 20,       // viterations/piterations (40 dans ammo.js, 20 pour perf mobile)
  mass: 15,             // volumeMass dans l'exemple
  useGravity: true,
}

/**
 * Store pour gérer le soft body fluffy
 */
interface FluffySoftBodyStore {
  solver: XPBDSolver
  config: FluffyConfig
  isInitialized: boolean
  particleIds: number[]
  restVolume: number
  geometry: THREE.BufferGeometry | null
  // Triangles pour le calcul de pression
  triangles: [number, number, number][]

  initFromGeometry: (geometry: THREE.BufferGeometry) => void
  applyImpact: (
    position: THREE.Vector3,
    force: THREE.Vector3,
    radius: number,
    intensity?: number
  ) => void
  step: (deltaTime: number) => void
  syncToGeometry: () => void
  setConfig: (config: Partial<FluffyConfig>) => void
  reset: () => void
  dispose: () => void
}

export const useFluffySoftBodyStore = create<FluffySoftBodyStore>((set, get) => ({
  solver: new XPBDSolver({
    substeps: 20,
    globalDamping: 0.99,  // Très peu de perte d'énergie!
    gravity: new THREE.Vector3(0, -9.8, 0),
  }),

  config: { ...DEFAULT_FLUFFY_CONFIG },
  isInitialized: false,
  particleIds: [],
  restVolume: 0,
  geometry: null,
  triangles: [],

  initFromGeometry: (geometry: THREE.BufferGeometry) => {
    const { solver, config } = get()

    solver.clear()

    const positions = geometry.attributes.position
    const indices = geometry.index

    if (!positions) {
      console.error('FluffySoftBody: Geometry has no position attribute')
      return
    }

    // 1. Créer les particules avec masse uniforme
    const particles: Particle[] = []
    const particleIds: number[] = []
    const massPerVertex = config.mass / positions.count

    for (let i = 0; i < positions.count; i++) {
      const pos = new THREE.Vector3(
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i)
      )

      // invMass = 1/masse (plus petit = plus lourd)
      const particle = createParticle(i, pos, 1 / massPerVertex)
      particles.push(particle)
      particleIds.push(i)
    }

    solver.addParticles(particles)

    // 2. Créer les contraintes de distance (arêtes)
    // Compliance très faible = très rigide (kLST = 0.9 dans ammo.js)
    const distanceConstraints: Constraint[] = []
    const compliance = (1 - config.edgeStiffness) * 0.0001

    if (indices) {
      const edgeSet = new Set<string>()

      for (let i = 0; i < indices.count; i += 3) {
        const i0 = indices.getX(i)
        const i1 = indices.getX(i + 1)
        const i2 = indices.getX(i + 2)

        const edges: [number, number][] = [
          [Math.min(i0, i1), Math.max(i0, i1)],
          [Math.min(i1, i2), Math.max(i1, i2)],
          [Math.min(i2, i0), Math.max(i2, i0)],
        ]

        for (const [a, b] of edges) {
          const key = `${a}-${b}`
          if (!edgeSet.has(key)) {
            edgeSet.add(key)
            const p1 = particles[a]
            const p2 = particles[b]
            if (p1 && p2) {
              distanceConstraints.push(
                createDistanceConstraint(p1, p2, compliance, config.friction)
              )
            }
          }
        }
      }
    }

    solver.addConstraints(distanceConstraints)

    // 3. Extraire les triangles
    const triangles: [number, number, number][] = []

    if (indices) {
      for (let i = 0; i < indices.count; i += 3) {
        triangles.push([
          indices.getX(i),
          indices.getX(i + 1),
          indices.getX(i + 2),
        ])
      }
    }

    // 4. Calculer le volume au repos
    let restVolume = 0
    const center = new THREE.Vector3()
    for (const p of particles) {
      center.add(p.position)
    }
    center.divideScalar(particles.length)

    for (const [i0, i1, i2] of triangles) {
      const p0 = particles[i0]
      const p1 = particles[i1]
      const p2 = particles[i2]
      if (p0 && p1 && p2) {
        const v0 = new THREE.Vector3().subVectors(p0.position, center)
        const v1 = new THREE.Vector3().subVectors(p1.position, center)
        const v2 = new THREE.Vector3().subVectors(p2.position, center)
        const cross = new THREE.Vector3().crossVectors(v1, v2)
        restVolume += v0.dot(cross) / 6
      }
    }

    // 5. Créer la contrainte de pression
    const pressureConstraint: PressureConstraint = {
      type: 'pressure',
      particleIds,
      restValue: Math.abs(restVolume),
      compliance: 0.00001, // Très rigide pour la pression
      damping: 0,
      pressure: config.pressure,
      triangles,
    }

    solver.addConstraint(pressureConstraint)

    // Configurer le solveur
    solver.setConfig({
      substeps: config.iterations,
      globalDamping: config.damping,
      gravity: config.useGravity
        ? new THREE.Vector3(0, -9.8, 0)
        : new THREE.Vector3(0, 0, 0),
    })

    set({
      isInitialized: true,
      particleIds,
      restVolume: Math.abs(restVolume),
      geometry,
      triangles,
    })

    console.log(
      `FluffySoftBody initialized: ${particles.length} vertices, ${distanceConstraints.length} edges, ${triangles.length} triangles, volume=${Math.abs(restVolume).toFixed(4)}, pressure=${config.pressure}`
    )
  },

  applyImpact: (position, force, radius, intensity = 1) => {
    const { solver, isInitialized } = get()
    if (!isInitialized) return

    const impact: ImpactData = {
      position: position.clone(),
      force: force.clone().multiplyScalar(3), // Amplifier la force
      radius,
      zone: 'cranium' as HitZone,
      intensity: Math.min(Math.max(intensity, 0), 1),
    }

    solver.applyImpact(impact)
  },

  step: (deltaTime) => {
    const { solver, isInitialized } = get()
    if (!isInitialized) return

    // Limiter dt pour stabilité, mais permettre plusieurs substeps
    const dt = Math.min(deltaTime, 0.033)
    solver.step(dt)
  },

  syncToGeometry: () => {
    const { solver, geometry, particleIds, isInitialized } = get()
    if (!isInitialized || !geometry) return

    const positions = geometry.attributes.position as THREE.BufferAttribute | undefined
    const normals = geometry.attributes.normal as THREE.BufferAttribute | undefined
    if (!positions) return

    // Synchroniser les positions
    for (let i = 0; i < particleIds.length; i++) {
      const particleId = particleIds[i]
      if (particleId === undefined) continue

      const particle = solver.getParticle(particleId)
      if (particle) {
        positions.setXYZ(i, particle.position.x, particle.position.y, particle.position.z)
      }
    }

    positions.needsUpdate = true

    // Recalculer les normales
    geometry.computeVertexNormals()
    if (normals) {
      normals.needsUpdate = true
    }
  },

  setConfig: (newConfig) => {
    const { config, solver } = get()
    const updatedConfig = { ...config, ...newConfig }

    solver.setConfig({
      substeps: updatedConfig.iterations,
      globalDamping: updatedConfig.damping,
      gravity: updatedConfig.useGravity
        ? new THREE.Vector3(0, -9.8, 0)
        : new THREE.Vector3(0, 0, 0),
    })

    set({ config: updatedConfig })
  },

  reset: () => {
    const { solver, isInitialized } = get()
    if (!isInitialized) return
    solver.reset()
  },

  dispose: () => {
    const { solver } = get()
    solver.clear()
    set({
      isInitialized: false,
      particleIds: [],
      restVolume: 0,
      geometry: null,
      triangles: [],
    })
  },
}))
