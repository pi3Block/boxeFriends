import * as THREE from 'three'
import {
  Particle,
  Constraint,
  DistanceConstraint,
  PressureConstraint,
  XPBDConfig,
  DEFAULT_XPBD_CONFIG,
  ImpactData,
} from './types'

/**
 * Solveur XPBD (Extended Position Based Dynamics)
 * Optimisé pour mobile avec effets cartoon exagérés
 *
 * Algorithme principal :
 * 1. Appliquer forces externes (gravité, impacts)
 * 2. Prédire positions (Euler explicite)
 * 3. Résoudre contraintes (Gauss-Seidel)
 * 4. Mettre à jour vélocités
 * 5. Appliquer damping
 */
export class XPBDSolver {
  private particles: Map<number, Particle> = new Map()
  private constraints: Constraint[] = []
  private config: XPBDConfig
  private pendingImpacts: ImpactData[] = []

  // Vecteurs temporaires réutilisés (évite allocations)
  private _tempVec1 = new THREE.Vector3()

  constructor(config: Partial<XPBDConfig> = {}) {
    this.config = { ...DEFAULT_XPBD_CONFIG, ...config }
  }

  /**
   * Ajouter une particule au système
   */
  addParticle(particle: Particle): void {
    this.particles.set(particle.id, particle)
  }

  /**
   * Ajouter plusieurs particules
   */
  addParticles(particles: Particle[]): void {
    particles.forEach((p) => this.addParticle(p))
  }

  /**
   * Récupérer une particule par ID
   */
  getParticle(id: number): Particle | undefined {
    return this.particles.get(id)
  }

  /**
   * Ajouter une contrainte
   */
  addConstraint(constraint: Constraint): void {
    this.constraints.push(constraint)
  }

  /**
   * Ajouter plusieurs contraintes
   */
  addConstraints(constraints: Constraint[]): void {
    this.constraints.push(...constraints)
  }

  /**
   * Appliquer un impact (sera traité au prochain step)
   */
  applyImpact(impact: ImpactData): void {
    this.pendingImpacts.push(impact)
  }

  /**
   * Étape principale de simulation
   * @param dt Delta time en secondes
   */
  step(dt: number): void {
    const subDt = dt / this.config.substeps

    for (let sub = 0; sub < this.config.substeps; sub++) {
      // 1. Appliquer forces externes
      this.applyExternalForces(subDt)

      // 2. Prédire positions
      this.predictPositions(subDt)

      // 3. Résoudre contraintes
      this.solveConstraints(subDt)

      // 4. Mettre à jour vélocités
      this.updateVelocities(subDt)

      // 5. Appliquer damping
      this.applyDamping()
    }

    // Vider les impacts traités
    this.pendingImpacts = []
  }

  /**
   * Appliquer gravité et impacts aux vélocités
   */
  private applyExternalForces(dt: number): void {
    this.particles.forEach((particle) => {
      if (particle.invMass === 0) return // Particule fixe

      // Gravité
      particle.velocity.addScaledVector(this.config.gravity, dt)

      // Impacts
      for (const impact of this.pendingImpacts) {
        const dist = particle.position.distanceTo(impact.position)
        if (dist < impact.radius) {
          // Falloff exponentiel pour effet cartoon
          const falloff = Math.pow(1 - dist / impact.radius, 2)
          const impulse = this._tempVec1
            .copy(impact.force)
            .multiplyScalar(falloff * impact.intensity)

          particle.velocity.add(impulse)
        }
      }
    })
  }

  /**
   * Prédire nouvelles positions (Euler explicite)
   */
  private predictPositions(dt: number): void {
    this.particles.forEach((particle) => {
      if (particle.invMass === 0) return

      // Sauvegarder position actuelle
      particle.prevPosition.copy(particle.position)

      // Prédire nouvelle position
      particle.position.addScaledVector(particle.velocity, dt)
    })
  }

  /**
   * Résoudre toutes les contraintes (Gauss-Seidel)
   */
  private solveConstraints(dt: number): void {
    for (const constraint of this.constraints) {
      switch (constraint.type) {
        case 'distance':
          this.solveDistanceConstraint(constraint as DistanceConstraint, dt)
          break
        case 'pressure':
          this.solvePressureConstraint(constraint as PressureConstraint, dt)
          break
        case 'volume':
          // TODO: Implémenter si nécessaire
          break
      }
    }
  }

  /**
   * Résoudre contrainte de distance entre 2 particules
   *
   * Formule XPBD : dx = -C(x) / (Σw + α/dt²)
   * où α = compliance (souplesse)
   */
  private solveDistanceConstraint(
    constraint: DistanceConstraint,
    dt: number
  ): void {
    const [id1, id2] = constraint.particleIds
    const p1 = this.particles.get(id1)
    const p2 = this.particles.get(id2)

    if (!p1 || !p2) return

    // Direction entre les deux particules
    const diff = this._tempVec1.subVectors(p2.position, p1.position)
    const currentLength = diff.length()

    if (currentLength < 0.0001) return // Éviter division par zéro

    // Erreur de contrainte
    const error = currentLength - constraint.restValue

    // Normaliser direction
    diff.divideScalar(currentLength)

    // Facteur de compliance XPBD
    const alpha = constraint.compliance / (dt * dt)
    const totalInvMass = p1.invMass + p2.invMass

    if (totalInvMass + alpha < 0.0001) return

    // Multiplicateur de Lagrange
    const lambda = -error / (totalInvMass + alpha)

    // Corrections de position
    if (p1.invMass > 0) {
      p1.position.addScaledVector(diff, -lambda * p1.invMass)
    }
    if (p2.invMass > 0) {
      p2.position.addScaledVector(diff, lambda * p2.invMass)
    }
  }

  /**
   * Résoudre contrainte de pression (soft body gonflable style ammo.js)
   *
   * Algorithme inspiré de ammo.js kPR (pressure):
   * 1. Calculer le volume actuel via tétraèdres signés
   * 2. Calculer la différence avec le volume au repos
   * 3. Pousser chaque vertex selon sa normale pondérée par la pression
   */
  private solvePressureConstraint(
    constraint: PressureConstraint,
    dt: number
  ): void {
    const { particleIds, triangles, pressure, restValue: restVolume, compliance } = constraint

    // Récupérer toutes les particules
    const particles: Particle[] = []
    for (const id of particleIds) {
      const p = this.particles.get(id)
      if (p) particles.push(p)
    }

    if (particles.length < 4 || triangles.length === 0) return

    // 1. Calculer le centre de masse
    const center = new THREE.Vector3()
    for (const p of particles) {
      center.add(p.position)
    }
    center.divideScalar(particles.length)

    // 2. Calculer le volume actuel (somme des tétraèdres signés)
    let currentVolume = 0
    const normals = new Map<number, THREE.Vector3>()

    // Initialiser les normales à zéro
    for (const p of particles) {
      normals.set(p.id, new THREE.Vector3())
    }

    for (const [i0, i1, i2] of triangles) {
      const p0 = particles[i0]
      const p1 = particles[i1]
      const p2 = particles[i2]

      if (!p0 || !p1 || !p2) continue

      // Vecteurs des arêtes
      const v0 = this._tempVec1.subVectors(p0.position, center)
      const v1 = new THREE.Vector3().subVectors(p1.position, center)
      const v2 = new THREE.Vector3().subVectors(p2.position, center)

      // Volume du tétraèdre = (1/6) * |v0 · (v1 × v2)|
      const cross = new THREE.Vector3().crossVectors(v1, v2)
      const tetVolume = v0.dot(cross) / 6

      currentVolume += tetVolume

      // Calculer la normale du triangle (aire-pondérée)
      const edge1 = new THREE.Vector3().subVectors(p1.position, p0.position)
      const edge2 = new THREE.Vector3().subVectors(p2.position, p0.position)
      const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2)

      // Accumuler les normales pour chaque vertex du triangle
      normals.get(p0.id)?.add(faceNormal)
      normals.get(p1.id)?.add(faceNormal)
      normals.get(p2.id)?.add(faceNormal)
    }

    // 3. Calculer la correction de pression
    const volumeError = currentVolume - restVolume
    const alpha = compliance / (dt * dt)

    // Facteur de correction basé sur la pression et l'erreur de volume
    // Pression positive = gonfle, négative = dégonfle
    const pressureFactor = pressure * 0.001 // Normaliser la pression
    const correction = (-volumeError / (restVolume + 0.001)) * pressureFactor

    // 4. Appliquer la correction à chaque particule selon sa normale
    for (const p of particles) {
      if (p.invMass === 0) continue

      const normal = normals.get(p.id)
      if (!normal) continue

      // Normaliser et appliquer
      const len = normal.length()
      if (len > 0.0001) {
        normal.divideScalar(len)

        // Correction XPBD avec compliance
        const lambda = correction / (p.invMass + alpha)
        p.position.addScaledVector(normal, lambda * p.invMass)
      }
    }
  }

  /**
   * Mettre à jour vélocités à partir des changements de position
   */
  private updateVelocities(dt: number): void {
    const invDt = 1 / dt

    this.particles.forEach((particle) => {
      if (particle.invMass === 0) return

      // Vélocité = (position - prevPosition) / dt
      particle.velocity
        .subVectors(particle.position, particle.prevPosition)
        .multiplyScalar(invDt)
    })
  }

  /**
   * Appliquer damping global (résistance de l'air)
   */
  private applyDamping(): void {
    this.particles.forEach((particle) => {
      if (particle.invMass === 0) return
      particle.velocity.multiplyScalar(this.config.globalDamping)
    })
  }

  /**
   * Collision avec le sol
   */
  enforceFloorCollision(): void {
    this.particles.forEach((particle) => {
      if (particle.position.y < this.config.floorY) {
        particle.position.y = this.config.floorY
        // Rebond avec friction
        particle.velocity.y *= -0.5
        particle.velocity.x *= 0.8
        particle.velocity.z *= 0.8
      }
    })
  }

  /**
   * Réinitialiser toutes les particules à leur position de repos
   */
  reset(): void {
    this.particles.forEach((particle) => {
      particle.position.copy(particle.restPosition)
      particle.prevPosition.copy(particle.restPosition)
      particle.velocity.set(0, 0, 0)
    })
    this.pendingImpacts = []
  }

  /**
   * Obtenir les positions comme Float32Array (pour GPU)
   */
  getPositionsArray(): Float32Array {
    const positions = new Float32Array(this.particles.size * 3)
    let i = 0
    this.particles.forEach((particle) => {
      positions[i++] = particle.position.x
      positions[i++] = particle.position.y
      positions[i++] = particle.position.z
    })
    return positions
  }

  /**
   * Obtenir les déplacements par rapport aux positions de repos
   */
  getDisplacementsArray(): Float32Array {
    const displacements = new Float32Array(this.particles.size * 3)
    let i = 0
    this.particles.forEach((particle) => {
      displacements[i++] = particle.position.x - particle.restPosition.x
      displacements[i++] = particle.position.y - particle.restPosition.y
      displacements[i++] = particle.position.z - particle.restPosition.z
    })
    return displacements
  }

  /**
   * Nombre de particules
   */
  get particleCount(): number {
    return this.particles.size
  }

  /**
   * Nombre de contraintes
   */
  get constraintCount(): number {
    return this.constraints.length
  }

  /**
   * Vider le système
   */
  clear(): void {
    this.particles.clear()
    this.constraints = []
    this.pendingImpacts = []
  }

  /**
   * Mettre à jour la configuration
   */
  setConfig(config: Partial<XPBDConfig>): void {
    this.config = { ...this.config, ...config }
  }
}
