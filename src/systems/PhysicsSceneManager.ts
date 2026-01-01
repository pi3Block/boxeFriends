/**
 * PhysicsSceneManager - Gestionnaire centralisé de la physique Ammo.js
 *
 * Responsabilités:
 * - Initialisation du monde physique (btSoftRigidDynamicsWorld)
 * - Gestion des rigid bodies, soft bodies, et constraints par ID
 * - Cleanup automatique lors des changements de scène/mode
 * - Synchronisation meshes Three.js ↔ bodies Ammo.js
 *
 * Usage:
 *   await PhysicsSceneManager.initialize()
 *   PhysicsSceneManager.addRigidBody('left-glove', body, mesh)
 *   PhysicsSceneManager.removeRigidBody('left-glove')
 *   PhysicsSceneManager.clearCategory('gloves')
 */

import * as THREE from 'three'

// Types pour les entrées
export interface RigidBodyEntry {
  body: any  // btRigidBody
  mesh?: THREE.Mesh | THREE.Object3D
  category: string  // 'gloves', 'opponent', 'environment', etc.
}

export interface SoftBodyEntry {
  body: any  // btSoftBody
  mesh: THREE.Mesh
  indexAssociation: number[][]
  category: string
}

export interface ConstraintEntry {
  constraint: any  // btTypedConstraint
  category: string
}

// Configuration par défaut
const DEFAULT_CONFIG = {
  gravity: -9.8,
  margin: 0.05,
  maxSubSteps: 10,
}

class PhysicsSceneManagerClass {
  // Instance Ammo.js
  private Ammo: any = null

  // Monde physique
  private world: any = null  // btSoftRigidDynamicsWorld
  private softBodyHelpers: any = null
  private transformAux: any = null

  // État
  private isInitialized = false
  private isInitializing = false

  // Registres par ID
  private rigidBodies: Map<string, RigidBodyEntry> = new Map()
  private softBodies: Map<string, SoftBodyEntry> = new Map()
  private constraints: Map<string, ConstraintEntry> = new Map()

  // Callbacks
  private onReadyCallbacks: Array<() => void> = []

  /**
   * Initialiser Ammo.js et le monde physique
   * Si un monde existe déjà dans les globals, l'adopte au lieu d'en créer un nouveau
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return
    if (this.isInitializing) {
      // Attendre l'initialisation en cours
      return new Promise((resolve) => {
        this.onReadyCallbacks.push(resolve)
      })
    }

    this.isInitializing = true

    try {
      // Vérifier si un monde existe déjà (créé par AmmoVolumeDemo, etc.)
      const existingWorld = (window as any).__ammoPhysicsWorld
      const existingAmmo = (window as any).__ammoInstance

      if (existingWorld && existingAmmo) {
        // Adopter le monde existant
        this.Ammo = existingAmmo
        this.world = existingWorld
        this.transformAux = new this.Ammo.btTransform()
        this.softBodyHelpers = new this.Ammo.btSoftBodyHelpers()

        this.isInitialized = true
        this.isInitializing = false

        console.log('[PhysicsSceneManager] Adopted existing physics world')

        // Notifier les callbacks en attente
        this.onReadyCallbacks.forEach(cb => cb())
        this.onReadyCallbacks = []
        return
      }

      // Sinon, créer un nouveau monde
      // Charger Ammo.js si nécessaire
      if (!(window as any).Ammo) {
        await this.loadAmmoScript()
      }

      this.Ammo = await (window as any).Ammo()

      // Créer le monde physique soft-rigid
      const collisionConfiguration = new this.Ammo.btSoftBodyRigidBodyCollisionConfiguration()
      const dispatcher = new this.Ammo.btCollisionDispatcher(collisionConfiguration)
      const broadphase = new this.Ammo.btDbvtBroadphase()
      const solver = new this.Ammo.btSequentialImpulseConstraintSolver()
      const softBodySolver = new this.Ammo.btDefaultSoftBodySolver()

      this.world = new this.Ammo.btSoftRigidDynamicsWorld(
        dispatcher,
        broadphase,
        solver,
        collisionConfiguration,
        softBodySolver
      )

      // Gravité
      const gravity = new this.Ammo.btVector3(0, DEFAULT_CONFIG.gravity, 0)
      this.world.setGravity(gravity)
      this.world.getWorldInfo().set_m_gravity(gravity)
      this.Ammo.destroy(gravity)

      // Helpers
      this.transformAux = new this.Ammo.btTransform()
      this.softBodyHelpers = new this.Ammo.btSoftBodyHelpers()

      // Exposer globalement (compatibilité avec code existant)
      ;(window as any).__ammoPhysicsWorld = this.world
      ;(window as any).__ammoInstance = this.Ammo

      this.isInitialized = true
      this.isInitializing = false

      console.log('[PhysicsSceneManager] Created new physics world')

      // Notifier les callbacks en attente
      this.onReadyCallbacks.forEach(cb => cb())
      this.onReadyCallbacks = []

    } catch (error) {
      this.isInitializing = false
      throw error
    }
  }

  /**
   * Charger le script Ammo.js
   */
  private loadAmmoScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = '/libs/ammo.wasm.js'
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load ammo.js'))
      document.head.appendChild(script)
    })
  }

  /**
   * Vérifier si le manager est prêt
   */
  get isReady(): boolean {
    return this.isInitialized
  }

  /**
   * Obtenir l'instance Ammo
   */
  getAmmo(): any {
    return this.Ammo
  }

  /**
   * Obtenir le monde physique
   */
  getWorld(): any {
    return this.world
  }

  /**
   * Obtenir le transform auxiliaire (réutilisable)
   */
  getTransformAux(): any {
    return this.transformAux
  }

  /**
   * Obtenir les helpers soft body
   */
  getSoftBodyHelpers(): any {
    return this.softBodyHelpers
  }

  // =============================================
  // RIGID BODIES
  // =============================================

  /**
   * Ajouter un rigid body
   */
  addRigidBody(id: string, body: any, mesh?: THREE.Mesh | THREE.Object3D, category: string = 'default'): void {
    if (!this.isInitialized) {
      console.warn('[PhysicsSceneManager] Not initialized, cannot add rigid body')
      return
    }

    // Supprimer l'ancien si existe
    if (this.rigidBodies.has(id)) {
      this.removeRigidBody(id)
    }

    this.world.addRigidBody(body)
    this.rigidBodies.set(id, { body, mesh, category })

    // Stocker l'ID sur le body pour référence inverse
    body.__physicsId = id
  }

  /**
   * Supprimer un rigid body
   */
  removeRigidBody(id: string): boolean {
    const entry = this.rigidBodies.get(id)
    if (!entry) return false

    this.world.removeRigidBody(entry.body)
    this.rigidBodies.delete(id)
    return true
  }

  /**
   * Obtenir un rigid body par ID
   */
  getRigidBody(id: string): RigidBodyEntry | undefined {
    return this.rigidBodies.get(id)
  }

  /**
   * Vérifier si un rigid body existe
   */
  hasRigidBody(id: string): boolean {
    return this.rigidBodies.has(id)
  }

  // =============================================
  // SOFT BODIES
  // =============================================

  /**
   * Ajouter un soft body
   */
  addSoftBody(
    id: string,
    body: any,
    mesh: THREE.Mesh,
    indexAssociation: number[][],
    category: string = 'default'
  ): void {
    if (!this.isInitialized) {
      console.warn('[PhysicsSceneManager] Not initialized, cannot add soft body')
      return
    }

    // Supprimer l'ancien si existe
    if (this.softBodies.has(id)) {
      this.removeSoftBody(id)
    }

    this.world.addSoftBody(body, 1, -1)
    this.softBodies.set(id, { body, mesh, indexAssociation, category })

    // Exposer la liste pour compatibilité (PhysicsGloves, etc.)
    ;(window as any).__softBodiesList = Array.from(this.softBodies.values())

    body.__physicsId = id
  }

  /**
   * Supprimer un soft body
   */
  removeSoftBody(id: string): boolean {
    const entry = this.softBodies.get(id)
    if (!entry) return false

    this.world.removeSoftBody(entry.body)
    this.softBodies.delete(id)

    // Mettre à jour la liste globale
    ;(window as any).__softBodiesList = Array.from(this.softBodies.values())

    return true
  }

  /**
   * Obtenir un soft body par ID
   */
  getSoftBody(id: string): SoftBodyEntry | undefined {
    return this.softBodies.get(id)
  }

  // =============================================
  // CONSTRAINTS
  // =============================================

  /**
   * Ajouter une constraint
   */
  addConstraint(id: string, constraint: any, category: string = 'default'): void {
    if (!this.isInitialized) {
      console.warn('[PhysicsSceneManager] Not initialized, cannot add constraint')
      return
    }

    // Supprimer l'ancienne si existe
    if (this.constraints.has(id)) {
      this.removeConstraint(id)
    }

    this.world.addConstraint(constraint, true)
    this.constraints.set(id, { constraint, category })
  }

  /**
   * Supprimer une constraint
   */
  removeConstraint(id: string): boolean {
    const entry = this.constraints.get(id)
    if (!entry) return false

    this.world.removeConstraint(entry.constraint)
    this.constraints.delete(id)
    return true
  }

  // =============================================
  // GESTION PAR CATÉGORIE
  // =============================================

  /**
   * Supprimer tous les objets d'une catégorie
   */
  clearCategory(category: string): void {
    // Constraints d'abord (dépendent des bodies)
    for (const [id, entry] of this.constraints) {
      if (entry.category === category) {
        this.removeConstraint(id)
      }
    }

    // Puis rigid bodies
    for (const [id, entry] of this.rigidBodies) {
      if (entry.category === category) {
        this.removeRigidBody(id)
      }
    }

    // Puis soft bodies
    for (const [id, entry] of this.softBodies) {
      if (entry.category === category) {
        this.removeSoftBody(id)
      }
    }

    console.log(`[PhysicsSceneManager] Cleared category: ${category}`)
  }

  /**
   * Lister les IDs d'une catégorie
   */
  getIdsByCategory(category: string): string[] {
    const ids: string[] = []

    for (const [id, entry] of this.rigidBodies) {
      if (entry.category === category) ids.push(id)
    }
    for (const [id, entry] of this.softBodies) {
      if (entry.category === category) ids.push(id)
    }
    for (const [id, entry] of this.constraints) {
      if (entry.category === category) ids.push(id)
    }

    return ids
  }

  // =============================================
  // SIMULATION & SYNC
  // =============================================

  /**
   * Avancer la simulation physique
   */
  step(deltaTime: number): void {
    if (!this.isInitialized || !this.world) return

    this.world.stepSimulation(deltaTime, DEFAULT_CONFIG.maxSubSteps)
  }

  /**
   * Synchroniser tous les meshes avec leurs bodies
   */
  syncAllMeshes(): void {
    if (!this.isInitialized) return

    // Rigid bodies
    for (const entry of this.rigidBodies.values()) {
      if (entry.mesh && entry.body) {
        this.syncRigidBodyMesh(entry.body, entry.mesh)
      }
    }

    // Soft bodies
    for (const entry of this.softBodies.values()) {
      this.syncSoftBodyMesh(entry)
    }
  }

  /**
   * Synchroniser un rigid body avec son mesh
   */
  private syncRigidBodyMesh(body: any, mesh: THREE.Mesh | THREE.Object3D): void {
    const ms = body.getMotionState()
    if (!ms) return

    ms.getWorldTransform(this.transformAux)
    const p = this.transformAux.getOrigin()
    const q = this.transformAux.getRotation()

    mesh.position.set(p.x(), p.y(), p.z())
    mesh.quaternion.set(q.x(), q.y(), q.z(), q.w())
  }

  /**
   * Synchroniser un soft body avec son mesh
   */
  private syncSoftBodyMesh(entry: SoftBodyEntry): void {
    const { body, mesh, indexAssociation } = entry
    const geometry = mesh.geometry
    const positionAttr = geometry.attributes.position
    const normalAttr = geometry.attributes.normal

    if (!positionAttr || !normalAttr) return

    const positions = positionAttr.array as Float32Array
    const normals = normalAttr.array as Float32Array
    const nodes = body.get_m_nodes()
    const numVerts = indexAssociation.length

    for (let j = 0; j < numVerts; j++) {
      const node = nodes.at(j)
      const nodePos = node.get_m_x()
      const x = nodePos.x(), y = nodePos.y(), z = nodePos.z()
      const nodeNormal = node.get_m_n()
      const nx = nodeNormal.x(), ny = nodeNormal.y(), nz = nodeNormal.z()

      const association = indexAssociation[j]
      if (!association) continue

      for (const idx of association) {
        positions[idx] = x; normals[idx] = nx
        positions[idx + 1] = y; normals[idx + 1] = ny
        positions[idx + 2] = z; normals[idx + 2] = nz
      }
    }

    positionAttr.needsUpdate = true
    normalAttr.needsUpdate = true
  }

  // =============================================
  // CLEANUP
  // =============================================

  /**
   * Réinitialiser tout (supprimer tous les objets)
   */
  reset(): void {
    // Constraints d'abord
    for (const id of Array.from(this.constraints.keys())) {
      this.removeConstraint(id)
    }

    // Puis rigid bodies
    for (const id of Array.from(this.rigidBodies.keys())) {
      this.removeRigidBody(id)
    }

    // Puis soft bodies
    for (const id of Array.from(this.softBodies.keys())) {
      this.removeSoftBody(id)
    }

    console.log('[PhysicsSceneManager] Reset complete')
  }

  /**
   * Détruire complètement le manager
   */
  destroy(): void {
    this.reset()

    if (this.transformAux) {
      this.Ammo?.destroy(this.transformAux)
      this.transformAux = null
    }

    this.world = null
    this.Ammo = null
    this.softBodyHelpers = null
    this.isInitialized = false

    ;(window as any).__ammoPhysicsWorld = null
    ;(window as any).__ammoInstance = null
    ;(window as any).__softBodiesList = null

    console.log('[PhysicsSceneManager] Destroyed')
  }

  // =============================================
  // HELPERS POUR CRÉATION
  // =============================================

  /**
   * Créer un rigid body standard
   */
  createRigidBody(
    shape: any,
    mass: number,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion = new THREE.Quaternion()
  ): any {
    if (!this.isInitialized) return null

    const transform = new this.Ammo.btTransform()
    transform.setIdentity()
    transform.setOrigin(new this.Ammo.btVector3(position.x, position.y, position.z))
    transform.setRotation(new this.Ammo.btQuaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w))

    const motionState = new this.Ammo.btDefaultMotionState(transform)
    const localInertia = new this.Ammo.btVector3(0, 0, 0)

    if (mass > 0) {
      shape.calculateLocalInertia(mass, localInertia)
    }

    const rbInfo = new this.Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia)
    const body = new this.Ammo.btRigidBody(rbInfo)

    if (mass > 0) {
      body.setActivationState(4) // DISABLE_DEACTIVATION
    }

    return body
  }

  /**
   * Créer une sphère collision shape
   */
  createSphereShape(radius: number): any {
    if (!this.isInitialized) return null
    const shape = new this.Ammo.btSphereShape(radius)
    shape.setMargin(DEFAULT_CONFIG.margin)
    return shape
  }

  /**
   * Créer une box collision shape
   */
  createBoxShape(halfExtents: THREE.Vector3): any {
    if (!this.isInitialized) return null
    const shape = new this.Ammo.btBoxShape(
      new this.Ammo.btVector3(halfExtents.x, halfExtents.y, halfExtents.z)
    )
    shape.setMargin(DEFAULT_CONFIG.margin)
    return shape
  }

  // =============================================
  // DEBUG
  // =============================================

  /**
   * Obtenir des stats pour debug
   */
  getStats(): { rigidBodies: number; softBodies: number; constraints: number } {
    return {
      rigidBodies: this.rigidBodies.size,
      softBodies: this.softBodies.size,
      constraints: this.constraints.size,
    }
  }

  /**
   * Logger l'état actuel
   */
  logState(): void {
    console.log('[PhysicsSceneManager] State:')
    console.log('  Rigid Bodies:', Array.from(this.rigidBodies.keys()))
    console.log('  Soft Bodies:', Array.from(this.softBodies.keys()))
    console.log('  Constraints:', Array.from(this.constraints.keys()))
  }
}

// Singleton exporté
export const PhysicsSceneManager = new PhysicsSceneManagerClass()
