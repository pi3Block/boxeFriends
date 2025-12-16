import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'

/**
 * Déclaration du type Ammo global
 */
declare global {
  interface Window {
    Ammo: any
  }
  function Ammo(): Promise<any>
}

/**
 * Configuration du monde physique ammo.js
 */
export interface AmmoPhysicsConfig {
  gravity: THREE.Vector3
}

const DEFAULT_CONFIG: AmmoPhysicsConfig = {
  gravity: new THREE.Vector3(0, -9.8, 0),
}

/**
 * État du soft body pour la synchronisation
 */
export interface SoftBodyState {
  mesh: THREE.Mesh
  softBody: any // Ammo.btSoftBody
  indexAssociation: number[][]
  gravityDisabled?: boolean // Si true, applique une force anti-gravité
  mass?: number // Masse totale du soft body
}

/**
 * État d'un rigid body
 */
export interface RigidBodyState {
  id: string
  rigidBody: any // Ammo.btRigidBody
  mesh?: THREE.Mesh | null
  collisionGroup?: number
  collisionMask?: number
}

/**
 * Options pour créer un rigid body
 */
export interface CreateRigidBodyOptions {
  id: string
  shape: 'sphere' | 'box'
  size: number | [number, number, number]
  position: THREE.Vector3
  mass: number
  friction?: number
  restitution?: number
  damping?: [number, number]
  collisionGroup?: number
  collisionMask?: number
  disableGravity?: boolean // Désactiver la gravité pour ce rigid body
}

// ============================================
// SINGLETON - Un seul monde physique partagé
// ============================================
let ammoInstance: any = null
let physicsWorldInstance: any = null
let softBodyHelpersInstance: any = null
let transformAuxInstance: any = null
let isAmmoReady = false
let ammoLoadPromise: Promise<void> | null = null
const softBodiesGlobal: SoftBodyState[] = []
const rigidBodiesGlobal: Map<string, RigidBodyState> = new Map()
const readyCallbacks: Array<() => void> = []

// Groupes de collision
export const COLLISION_GROUPS = {
  GLOVES: 1,       // 0b0001
  SOFT_BODY: 2,    // 0b0010
  STATIC: 4,       // 0b0100
  ALL: -1,         // Tous les groupes
} as const

/**
 * Charger Ammo.js une seule fois (singleton)
 */
async function loadAmmoSingleton(): Promise<void> {
  if (isAmmoReady) return
  if (ammoLoadPromise) return ammoLoadPromise

  ammoLoadPromise = (async () => {
    try {
      // Charger le script ammo.js s'il n'est pas déjà chargé
      if (!window.Ammo) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = '/libs/ammo.wasm.js'
          script.async = true
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Failed to load ammo.js'))
          document.head.appendChild(script)
        })
      }

      // Initialiser Ammo
      const Ammo = await window.Ammo()
      ammoInstance = Ammo

      // Configuration de la physique soft body
      const collisionConfiguration = new Ammo.btSoftBodyRigidBodyCollisionConfiguration()
      const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration)
      const broadphase = new Ammo.btDbvtBroadphase()
      const solver = new Ammo.btSequentialImpulseConstraintSolver()
      const softBodySolver = new Ammo.btDefaultSoftBodySolver()

      physicsWorldInstance = new Ammo.btSoftRigidDynamicsWorld(
        dispatcher,
        broadphase,
        solver,
        collisionConfiguration,
        softBodySolver
      )

      // Configurer la gravité pour les rigid bodies
      const gravity = new Ammo.btVector3(
        DEFAULT_CONFIG.gravity.x,
        DEFAULT_CONFIG.gravity.y,
        DEFAULT_CONFIG.gravity.z
      )
      physicsWorldInstance.setGravity(gravity)

      // Gravité pour les soft bodies - même valeur que les rigid bodies
      // Permet le comportement punching bag (pend et balance)
      const softBodyGravity = new Ammo.btVector3(
        DEFAULT_CONFIG.gravity.x,
        DEFAULT_CONFIG.gravity.y,
        DEFAULT_CONFIG.gravity.z
      )
      physicsWorldInstance.getWorldInfo().set_m_gravity(softBodyGravity)
      Ammo.destroy(softBodyGravity)

      softBodyHelpersInstance = new Ammo.btSoftBodyHelpers()
      transformAuxInstance = new Ammo.btTransform()

      isAmmoReady = true

      console.log('Ammo.js physics world initialized (singleton) - supports soft bodies + rigid bodies')

      // Notifier tous les hooks en attente
      readyCallbacks.forEach(cb => cb())
      readyCallbacks.length = 0
    } catch (err) {
      ammoLoadPromise = null
      throw err
    }
  })()

  return ammoLoadPromise
}

/**
 * Hook pour gérer la physique ammo.js avec soft bodies
 *
 * Basé sur l'exemple three.js physics_ammo_volume.html
 * Utilise un singleton pour éviter de créer plusieurs mondes physiques
 */
export function useAmmoPhysics(_config: Partial<AmmoPhysicsConfig> = {}) {
  const [isReady, setIsReady] = useState(isAmmoReady)
  const [error, setError] = useState<Error | null>(null)

  // Référence locale vers les objets singleton
  const ammoRef = useRef<any>(ammoInstance)
  const physicsWorldRef = useRef<any>(physicsWorldInstance)
  const softBodyHelpersRef = useRef<any>(softBodyHelpersInstance)
  const transformAuxRef = useRef<any>(transformAuxInstance)

  /**
   * Charger ammo.js (singleton)
   */
  useEffect(() => {
    if (isAmmoReady) {
      ammoRef.current = ammoInstance
      physicsWorldRef.current = physicsWorldInstance
      softBodyHelpersRef.current = softBodyHelpersInstance
      transformAuxRef.current = transformAuxInstance
      setIsReady(true)
      return
    }

    // S'abonner pour être notifié quand prêt
    const onReady = () => {
      ammoRef.current = ammoInstance
      physicsWorldRef.current = physicsWorldInstance
      softBodyHelpersRef.current = softBodyHelpersInstance
      transformAuxRef.current = transformAuxInstance
      setIsReady(true)
    }
    readyCallbacks.push(onReady)

    // Lancer le chargement si pas encore fait
    loadAmmoSingleton().catch(err => {
      setError(err as Error)
      console.error('Failed to initialize Ammo.js:', err)
    })

    return () => {
      // Retirer du callback
      const idx = readyCallbacks.indexOf(onReady)
      if (idx > -1) readyCallbacks.splice(idx, 1)
    }
  }, [])

  /**
   * Traiter une géométrie pour créer les données ammo
   */
  const processGeometry = useCallback((bufGeometry: THREE.BufferGeometry) => {
    const Ammo = ammoRef.current
    if (!Ammo) return null

    const positionAttr = bufGeometry.attributes.position
    if (!positionAttr) {
      console.error('Geometry has no position attribute')
      return null
    }

    const vertices = positionAttr.array as Float32Array
    const indices = bufGeometry.index?.array as Uint16Array | Uint32Array | undefined

    if (!indices) {
      console.error('Geometry must have indices for soft body')
      return null
    }

    // Fusionner les vertices dupliqués
    const vertexMap = new Map<string, number>()
    const uniqueVertices: number[] = []
    const indexMapping: number[] = []

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i] ?? 0
      const y = vertices[i + 1] ?? 0
      const z = vertices[i + 2] ?? 0
      const key = `${x.toFixed(6)}_${y.toFixed(6)}_${z.toFixed(6)}`

      if (!vertexMap.has(key)) {
        vertexMap.set(key, uniqueVertices.length / 3)
        uniqueVertices.push(x, y, z)
      }
      indexMapping.push(vertexMap.get(key) ?? 0)
    }

    // Créer les nouveaux indices
    const newIndices: number[] = []
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i]
      if (idx !== undefined) {
        const mappedIdx = indexMapping[idx]
        newIndices.push(mappedIdx ?? 0)
      }
    }

    // Créer l'association entre vertices ammo et vertices three.js
    const numUniqueVertices = uniqueVertices.length / 3
    const numOriginalVertices = vertices.length / 3
    const indexAssociation: number[][] = []

    for (let i = 0; i < numUniqueVertices; i++) {
      indexAssociation.push([])
    }

    for (let j = 0; j < numOriginalVertices; j++) {
      const ammoIdx = indexMapping[j]
      if (ammoIdx !== undefined && indexAssociation[ammoIdx]) {
        indexAssociation[ammoIdx].push(j * 3)
      }
    }

    return {
      ammoVertices: new Float32Array(uniqueVertices),
      ammoIndices: new Uint32Array(newIndices),
      indexAssociation,
    }
  }, [])

  /**
   * Options pour la création d'un soft body
   */
  interface CreateSoftVolumeOptions {
    mass?: number
    pressure?: number
    disableGravity?: boolean  // Désactiver la gravité pour ce soft body
  }

  /**
   * Créer un soft body volumétrique
   * Empêche les créations multiples pour le même mesh
   */
  const createSoftVolume = useCallback(
    (
      geometry: THREE.BufferGeometry,
      mesh: THREE.Mesh,
      massOrOptions: number | CreateSoftVolumeOptions = 15,
      pressure: number = 200
    ): SoftBodyState | null => {
      // Gérer les deux signatures (rétrocompatibilité)
      const options: CreateSoftVolumeOptions = typeof massOrOptions === 'number'
        ? { mass: massOrOptions, pressure }
        : massOrOptions

      const mass = options.mass ?? 15
      const finalPressure = options.pressure ?? pressure
      const disableGravity = options.disableGravity ?? false

      const Ammo = ammoRef.current
      const physicsWorld = physicsWorldRef.current
      const softBodyHelpers = softBodyHelpersRef.current

      if (!Ammo || !physicsWorld || !softBodyHelpers) {
        console.error('Ammo.js not initialized')
        return null
      }

      // Vérifier si un soft body existe déjà pour ce mesh
      const existingState = softBodiesGlobal.find(s => s.mesh === mesh)
      if (existingState) {
        console.log('Soft body already exists for this mesh, returning existing')
        return existingState
      }

      const processed = processGeometry(geometry)
      if (!processed) return null

      const { ammoVertices, ammoIndices, indexAssociation } = processed

      // Créer le soft body
      const softBody = softBodyHelpers.CreateFromTriMesh(
        physicsWorld.getWorldInfo(),
        ammoVertices,
        ammoIndices,
        ammoIndices.length / 3,
        true
      )

      // Configurer (comme dans l'exemple ammo.js)
      const sbConfig = softBody.get_m_cfg()
      sbConfig.set_viterations(50) // Plus d'itérations pour stabilité
      sbConfig.set_piterations(50)
      sbConfig.set_collisions(0x11)
      sbConfig.set_kDF(0.2) // Friction légèrement plus haute
      sbConfig.set_kDP(0.02) // Damping un peu plus haut pour réduire oscillations
      sbConfig.set_kPR(finalPressure) // Pression!

      // Raideur maximale pour éviter l'inversion des faces
      softBody.get_m_materials().at(0).set_m_kLST(1.0)
      softBody.get_m_materials().at(0).set_m_kAST(1.0)
      softBody.setTotalMass(mass, false)

      const margin = 0.05
      Ammo.castObject(softBody, Ammo.btCollisionObject)
        .getCollisionShape()
        .setMargin(margin)

      physicsWorld.addSoftBody(softBody, 1, -1)
      softBody.setActivationState(4)

      const state: SoftBodyState = {
        mesh,
        softBody,
        indexAssociation,
        gravityDisabled: disableGravity,
        mass,
      }

      // Note: disableGravity n'est plus nécessaire car la gravité soft body
      // est déjà à 0 au niveau du monde physique

      // Ajouter au tableau global
      softBodiesGlobal.push(state)

      console.log(
        `Soft body created: ${ammoVertices.length / 3} vertices, ${ammoIndices.length / 3} triangles, pressure=${finalPressure}`
      )

      return state
    },
    [processGeometry]
  )

  /**
   * Créer un rigid body dans le monde physique partagé
   */
  const createRigidBody = useCallback(
    (options: CreateRigidBodyOptions): RigidBodyState | null => {
      const Ammo = ammoRef.current
      const physicsWorld = physicsWorldRef.current

      if (!Ammo || !physicsWorld) {
        console.error('Ammo.js not initialized')
        return null
      }

      // Vérifier si le rigid body existe déjà
      if (rigidBodiesGlobal.has(options.id)) {
        console.log(`Rigid body ${options.id} already exists, returning existing`)
        return rigidBodiesGlobal.get(options.id)!
      }

      // Créer la forme de collision
      let shape: any
      if (options.shape === 'sphere') {
        const radius = typeof options.size === 'number' ? options.size : options.size[0]
        shape = new Ammo.btSphereShape(radius)
      } else {
        const [x, y, z] = typeof options.size === 'number'
          ? [options.size, options.size, options.size]
          : options.size
        shape = new Ammo.btBoxShape(new Ammo.btVector3(x / 2, y / 2, z / 2))
      }

      // Position initiale
      const transform = new Ammo.btTransform()
      transform.setIdentity()
      transform.setOrigin(new Ammo.btVector3(
        options.position.x,
        options.position.y,
        options.position.z
      ))

      // Calculer l'inertie si dynamique
      const inertia = new Ammo.btVector3(0, 0, 0)
      if (options.mass > 0) {
        shape.calculateLocalInertia(options.mass, inertia)
      }

      // Créer le motion state et le rigid body
      const motionState = new Ammo.btDefaultMotionState(transform)
      const rbInfo = new Ammo.btRigidBodyConstructionInfo(
        options.mass,
        motionState,
        shape,
        inertia
      )
      const rigidBody = new Ammo.btRigidBody(rbInfo)

      // Configurer les propriétés
      rigidBody.setFriction(options.friction ?? 0.5)
      rigidBody.setRestitution(options.restitution ?? 0.3)
      if (options.damping) {
        rigidBody.setDamping(options.damping[0], options.damping[1])
      }
      rigidBody.setActivationState(4) // Toujours actif

      // Désactiver la gravité si demandé
      if (options.disableGravity) {
        const zeroGravity = new Ammo.btVector3(0, 0, 0)
        rigidBody.setGravity(zeroGravity)
        Ammo.destroy(zeroGravity)
      }

      // Ajouter au monde avec groupes de collision
      const group = options.collisionGroup ?? COLLISION_GROUPS.GLOVES
      const mask = options.collisionMask ?? COLLISION_GROUPS.ALL
      physicsWorld.addRigidBody(rigidBody, group, mask)

      const state: RigidBodyState = {
        id: options.id,
        rigidBody,
        mesh: null,
        collisionGroup: group,
        collisionMask: mask,
      }

      rigidBodiesGlobal.set(options.id, state)
      console.log(`Rigid body created: ${options.id}`)

      return state
    },
    []
  )

  /**
   * Obtenir un rigid body par son ID
   */
  const getRigidBody = useCallback((id: string): RigidBodyState | null => {
    return rigidBodiesGlobal.get(id) ?? null
  }, [])

  /**
   * Supprimer un rigid body
   */
  const removeRigidBody = useCallback((id: string) => {
    const state = rigidBodiesGlobal.get(id)
    if (!state) return

    const physicsWorld = physicsWorldRef.current
    if (physicsWorld) {
      try {
        physicsWorld.removeRigidBody(state.rigidBody)
      } catch (e) {
        console.warn('Error removing rigid body:', e)
      }
    }

    rigidBodiesGlobal.delete(id)
  }, [])

  /**
   * Synchroniser un mesh avec un rigid body
   */
  const syncRigidBodyMesh = useCallback((id: string, mesh: THREE.Mesh) => {
    const state = rigidBodiesGlobal.get(id)
    if (!state) return

    const transform = transformAuxRef.current
    if (!transform) return

    state.rigidBody.getMotionState().getWorldTransform(transform)
    const origin = transform.getOrigin()

    mesh.position.set(origin.x(), origin.y(), origin.z())

    // Optionnel: rotation
    const rotation = transform.getRotation()
    mesh.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w())
  }, [])

  /**
   * Appliquer une force à un rigid body
   */
  const applyRigidBodyForce = useCallback((id: string, force: THREE.Vector3) => {
    const Ammo = ammoRef.current
    const state = rigidBodiesGlobal.get(id)
    if (!Ammo || !state) return

    const btForce = new Ammo.btVector3(force.x, force.y, force.z)
    state.rigidBody.applyCentralForce(btForce)
    Ammo.destroy(btForce)
  }, [])

  /**
   * Appliquer une impulsion à un rigid body
   */
  const applyRigidBodyImpulse = useCallback((id: string, impulse: THREE.Vector3) => {
    const Ammo = ammoRef.current
    const state = rigidBodiesGlobal.get(id)
    if (!Ammo || !state) return

    const btImpulse = new Ammo.btVector3(impulse.x, impulse.y, impulse.z)
    state.rigidBody.applyCentralImpulse(btImpulse)
    Ammo.destroy(btImpulse)
  }, [])

  /**
   * Obtenir la position d'un rigid body
   */
  const getRigidBodyPosition = useCallback((id: string): THREE.Vector3 | null => {
    const state = rigidBodiesGlobal.get(id)
    if (!state) return null

    const transform = transformAuxRef.current
    if (!transform) return null

    state.rigidBody.getMotionState().getWorldTransform(transform)
    const origin = transform.getOrigin()

    return new THREE.Vector3(origin.x(), origin.y(), origin.z())
  }, [])

  /**
   * Obtenir la vélocité d'un rigid body
   */
  const getRigidBodyVelocity = useCallback((id: string): THREE.Vector3 | null => {
    const state = rigidBodiesGlobal.get(id)
    if (!state) return null

    const velocity = state.rigidBody.getLinearVelocity()
    return new THREE.Vector3(velocity.x(), velocity.y(), velocity.z())
  }, [])

  /**
   * Définir la vélocité d'un rigid body
   */
  const setRigidBodyVelocity = useCallback((id: string, velocity: THREE.Vector3) => {
    const Ammo = ammoRef.current
    const state = rigidBodiesGlobal.get(id)
    if (!Ammo || !state) return

    const btVelocity = new Ammo.btVector3(velocity.x, velocity.y, velocity.z)
    state.rigidBody.setLinearVelocity(btVelocity)
    Ammo.destroy(btVelocity)
  }, [])

  /**
   * Créer une contrainte ressort entre deux rigid bodies
   */
  const createSpringConstraint = useCallback((
    bodyAId: string,
    bodyBId: string,
    options: {
      stiffness: [number, number, number]
      damping: [number, number, number]
      linearLowerLimit?: [number, number, number]
      linearUpperLimit?: [number, number, number]
    }
  ): any | null => {
    const Ammo = ammoRef.current
    const physicsWorld = physicsWorldRef.current
    const stateA = rigidBodiesGlobal.get(bodyAId)
    const stateB = rigidBodiesGlobal.get(bodyBId)

    if (!Ammo || !physicsWorld || !stateA || !stateB) {
      console.error('Cannot create spring constraint: missing bodies or Ammo not ready')
      return null
    }

    const frameInA = new Ammo.btTransform()
    frameInA.setIdentity()
    const frameInB = new Ammo.btTransform()
    frameInB.setIdentity()

    const spring = new Ammo.btGeneric6DofSpringConstraint(
      stateA.rigidBody,
      stateB.rigidBody,
      frameInA,
      frameInB,
      true
    )

    // Configurer les limites
    if (options.linearLowerLimit) {
      spring.setLinearLowerLimit(new Ammo.btVector3(...options.linearLowerLimit))
    }
    if (options.linearUpperLimit) {
      spring.setLinearUpperLimit(new Ammo.btVector3(...options.linearUpperLimit))
    }

    // Activer et configurer les ressorts
    for (let i = 0; i < 3; i++) {
      spring.enableSpring(i, true)
      spring.setStiffness(i, options.stiffness[i])
      spring.setDamping(i, options.damping[i])
    }

    spring.setEquilibriumPoint()
    physicsWorld.addConstraint(spring, true)

    console.log(`Spring constraint created: ${bodyAId} <-> ${bodyBId}`)
    return spring
  }, [])

  /**
   * Mettre à jour la physique et synchroniser les meshes
   */
  const updatePhysics = useCallback((deltaTime: number) => {
    const physicsWorld = physicsWorldRef.current
    if (!physicsWorld) return

    physicsWorld.stepSimulation(deltaTime, 10)

    for (const { mesh, softBody, indexAssociation } of softBodiesGlobal) {
      const geometry = mesh.geometry
      const positionAttr = geometry.attributes.position
      if (!positionAttr) continue

      const positions = positionAttr.array as Float32Array
      const normalAttr = geometry.attributes.normal
      const normals = normalAttr?.array as Float32Array | undefined

      const nodes = softBody.get_m_nodes()
      const numNodes = indexAssociation.length

      for (let j = 0; j < numNodes; j++) {
        const node = nodes.at(j)
        const nodePos = node.get_m_x()
        const x = nodePos.x()
        const y = nodePos.y()
        const z = nodePos.z()

        const nodeNormal = node.get_m_n()
        const nx = nodeNormal.x()
        const ny = nodeNormal.y()
        const nz = nodeNormal.z()

        const assocVertices = indexAssociation[j]
        if (!assocVertices) continue

        for (const indexVertex of assocVertices) {
          positions[indexVertex] = x
          positions[indexVertex + 1] = y
          positions[indexVertex + 2] = z

          if (normals) {
            normals[indexVertex] = nx
            normals[indexVertex + 1] = ny
            normals[indexVertex + 2] = nz
          }
        }
      }

      positionAttr.needsUpdate = true
      if (normalAttr) {
        normalAttr.needsUpdate = true
      }

      // Recalculer les normales pour un meilleur rendu
      geometry.computeVertexNormals()

      // Mettre à jour la bounding sphere pour le culling
      geometry.computeBoundingSphere()
    }
  }, [])

  /**
   * Ancrer les nœuds arrière du soft body (comme un fil qui le tient)
   * Les nœuds avec z négatif (arrière) sont fixés en place
   */
  const anchorBackNodes = useCallback(
    (softBodyState: SoftBodyState, zThreshold: number = -0.3) => {
      const { softBody, indexAssociation } = softBodyState
      const nodes = softBody.get_m_nodes()
      const numNodes = indexAssociation.length

      let anchoredCount = 0
      for (let i = 0; i < numNodes; i++) {
        const node = nodes.at(i)
        const pos = node.get_m_x()

        // Ancrer les nœuds à l'arrière (z négatif)
        if (pos.z() < zThreshold) {
          // Fixer le nœud en mettant sa masse inverse à 0
          node.set_m_im(0)
          anchoredCount++
        }
      }

      console.log(`Anchored ${anchoredCount}/${numNodes} back nodes (z < ${zThreshold})`)
    },
    []
  )

  /**
   * Appliquer une force de rappel vers le centre (0,0,0)
   * Empêche le soft body de dériver après les impacts
   */
  const applyCenteringForce = useCallback(
    (softBodyState: SoftBodyState, strength: number = 0.5) => {
      const Ammo = ammoRef.current
      if (!Ammo) return

      const { softBody, indexAssociation } = softBodyState
      const nodes = softBody.get_m_nodes()
      const numNodes = indexAssociation.length

      // Calculer le centre de masse actuel
      let cx = 0, cy = 0, cz = 0
      for (let i = 0; i < numNodes; i++) {
        const node = nodes.at(i)
        const pos = node.get_m_x()
        cx += pos.x()
        cy += pos.y()
        cz += pos.z()
      }
      cx /= numNodes
      cy /= numNodes
      cz /= numNodes

      // Appliquer une force vers le centre (0,0,0)
      // Force proportionnelle à la distance du centre
      const forceX = -cx * strength
      const forceY = -cy * strength
      const forceZ = -cz * strength

      for (let i = 0; i < numNodes; i++) {
        const node = nodes.at(i)
        const velocity = node.get_m_v()
        // Ajouter une petite vélocité vers le centre
        velocity.setX(velocity.x() + forceX * 0.1)
        velocity.setY(velocity.y() + forceY * 0.1)
        velocity.setZ(velocity.z() + forceZ * 0.1)
      }
    },
    []
  )

  /**
   * Appliquer une impulsion à un soft body
   */
  const applySoftBodyImpulse = useCallback(
    (
      softBodyState: SoftBodyState,
      position: THREE.Vector3,
      force: THREE.Vector3,
      radius: number = 1
    ) => {
      const Ammo = ammoRef.current
      if (!Ammo) return

      const { softBody, indexAssociation } = softBodyState
      const nodes = softBody.get_m_nodes()
      const numNodes = indexAssociation.length

      for (let i = 0; i < numNodes; i++) {
        const node = nodes.at(i)
        const nodePos = node.get_m_x()

        const dx = nodePos.x() - position.x
        const dy = nodePos.y() - position.y
        const dz = nodePos.z() - position.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

        if (dist < radius) {
          const falloff = 1 - dist / radius
          const impulse = new Ammo.btVector3(
            force.x * falloff,
            force.y * falloff,
            force.z * falloff
          )

          const velocity = node.get_m_v()
          velocity.setX(velocity.x() + impulse.x())
          velocity.setY(velocity.y() + impulse.y())
          velocity.setZ(velocity.z() + impulse.z())

          Ammo.destroy(impulse)
        }
      }
    },
    []
  )

  /**
   * Supprimer un soft body
   */
  const removeSoftBody = useCallback((softBodyState: SoftBodyState) => {
    const physicsWorld = physicsWorldRef.current
    if (!physicsWorld) return

    try {
      physicsWorld.removeSoftBody(softBodyState.softBody)
    } catch (e) {
      console.warn('Error removing soft body:', e)
    }

    // Retirer du tableau global
    const index = softBodiesGlobal.indexOf(softBodyState)
    if (index > -1) {
      softBodiesGlobal.splice(index, 1)
    }
  }, [])

  /**
   * Nettoyer tous les corps physiques
   */
  const cleanup = useCallback(() => {
    const physicsWorld = physicsWorldRef.current
    if (!physicsWorld) return

    // Nettoyer les soft bodies
    for (const state of softBodiesGlobal) {
      try {
        physicsWorld.removeSoftBody(state.softBody)
      } catch (e) {
        console.warn('Error removing soft body during cleanup:', e)
      }
    }
    softBodiesGlobal.length = 0

    // Nettoyer les rigid bodies
    for (const [id, state] of rigidBodiesGlobal) {
      try {
        physicsWorld.removeRigidBody(state.rigidBody)
      } catch (e) {
        console.warn(`Error removing rigid body ${id} during cleanup:`, e)
      }
    }
    rigidBodiesGlobal.clear()
  }, [])

  return {
    isReady,
    error,
    ammo: ammoRef.current, // Instance Ammo pour utilisation externe
    physicsWorld: physicsWorldRef.current, // Monde physique partagé

    // Soft bodies
    createSoftVolume,
    applySoftBodyImpulse,
    applyCenteringForce,
    anchorBackNodes,
    removeSoftBody,
    softBodies: softBodiesGlobal,

    // Rigid bodies
    createRigidBody,
    getRigidBody,
    removeRigidBody,
    syncRigidBodyMesh,
    applyRigidBodyForce,
    applyRigidBodyImpulse,
    getRigidBodyPosition,
    getRigidBodyVelocity,
    setRigidBodyVelocity,
    createSpringConstraint,
    rigidBodies: rigidBodiesGlobal,

    // Common
    updatePhysics,
    cleanup,
  }
}
