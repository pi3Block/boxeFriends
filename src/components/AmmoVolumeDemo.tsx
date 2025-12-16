import { useRef, useEffect, useState, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useCharacterStore } from '../stores/useCharacterStore'
import { useGameStore } from '../stores'

/**
 * Salle de boxe avec soft body suspendu
 * Basé sur https://threejs.org/examples/physics_ammo_volume.html
 */

// =============================================
// TYPES DE COUPS ET ANIMATIONS
// =============================================

/**
 * Types de coups de boxe
 */
type PunchType = 'jab' | 'hook' | 'uppercut'

/**
 * État d'une animation de coup
 */
interface PunchAnimation {
  type: PunchType
  side: 'left' | 'right'
  progress: number      // 0-1, progression de l'animation
  phase: 'windup' | 'strike' | 'return'  // Phase de l'animation
  startTime: number     // Timestamp de début
}

/**
 * Configuration des trajectoires de coups
 * Chaque coup a des positions clés en coordonnées relatives
 */
const PUNCH_CONFIGS = {
  jab: {
    duration: 0.25,       // Durée totale en secondes
    windupDuration: 0.05, // Temps de préparation
    strikeDuration: 0.1,  // Temps de frappe
    returnDuration: 0.1,  // Temps de retour
    // Trajectoire: recul léger puis direct vers l'avant
    trajectory: (t: number, side: 'left' | 'right') => {
      const sideMultiplier = side === 'left' ? -1 : 1
      if (t < 0.2) {
        // Windup - léger recul
        const windupT = t / 0.2
        return new THREE.Vector3(
          sideMultiplier * 0.8 + windupT * 0.1 * sideMultiplier,
          2.5,
          4 + windupT * 0.3
        )
      } else if (t < 0.6) {
        // Strike - vers l'avant
        const strikeT = (t - 0.2) / 0.4
        const easeOut = 1 - Math.pow(1 - strikeT, 3)
        return new THREE.Vector3(
          sideMultiplier * 0.6,
          2.5 + Math.sin(strikeT * Math.PI) * 0.1,
          4.3 - easeOut * 4.3
        )
      } else {
        // Return - retour position initiale
        const returnT = (t - 0.6) / 0.4
        const easeIn = returnT * returnT
        return new THREE.Vector3(
          sideMultiplier * (0.6 + easeIn * 0.2),
          2.5,
          0 + easeIn * 4
        )
      }
    }
  },
  hook: {
    duration: 0.35,
    windupDuration: 0.1,
    strikeDuration: 0.15,
    returnDuration: 0.1,
    // Trajectoire: mouvement latéral courbe
    trajectory: (t: number, side: 'left' | 'right') => {
      const sideMultiplier = side === 'left' ? -1 : 1
      if (t < 0.25) {
        // Windup - recul et préparation latérale
        const windupT = t / 0.25
        return new THREE.Vector3(
          sideMultiplier * (0.8 + windupT * 0.8),
          2.8 + windupT * 0.3,
          4 + windupT * 0.2
        )
      } else if (t < 0.65) {
        // Strike - arc latéral vers le centre
        const strikeT = (t - 0.25) / 0.4
        const easeOut = 1 - Math.pow(1 - strikeT, 2)
        const arcAngle = (1 - easeOut) * Math.PI * 0.4
        return new THREE.Vector3(
          sideMultiplier * (1.6 - easeOut * 1.8) * Math.cos(arcAngle),
          3.1 - easeOut * 0.6,
          4.2 - easeOut * 3.7 + Math.sin(arcAngle) * 0.5
        )
      } else {
        // Return
        const returnT = (t - 0.65) / 0.35
        const easeIn = returnT * returnT
        return new THREE.Vector3(
          sideMultiplier * (-0.2 + easeIn * 1.0),
          2.5,
          0.5 + easeIn * 3.5
        )
      }
    }
  },
  uppercut: {
    duration: 0.4,
    windupDuration: 0.12,
    strikeDuration: 0.15,
    returnDuration: 0.13,
    // Trajectoire: descente puis remontée puissante
    trajectory: (t: number, side: 'left' | 'right') => {
      const sideMultiplier = side === 'left' ? -1 : 1
      if (t < 0.3) {
        // Windup - descente et préparation
        const windupT = t / 0.3
        const easeIn = windupT * windupT
        return new THREE.Vector3(
          sideMultiplier * (0.8 - windupT * 0.3),
          2.5 - easeIn * 1.0,
          4 + windupT * 0.3
        )
      } else if (t < 0.65) {
        // Strike - remontée explosive
        const strikeT = (t - 0.3) / 0.35
        const easeOut = 1 - Math.pow(1 - strikeT, 3)
        return new THREE.Vector3(
          sideMultiplier * 0.5,
          1.5 + easeOut * 2.5,
          4.3 - easeOut * 3.8
        )
      } else {
        // Return
        const returnT = (t - 0.65) / 0.35
        const easeIn = returnT * returnT
        return new THREE.Vector3(
          sideMultiplier * (0.5 + easeIn * 0.3),
          4.0 - easeIn * 1.5,
          0.5 + easeIn * 3.5
        )
      }
    }
  }
}

/**
 * Détermine le type de coup basé sur la zone de l'écran
 */
function getPunchTypeFromScreenZone(normalizedY: number): PunchType {
  // normalizedY: -1 (bas) à 1 (haut)
  if (normalizedY > 0.33) {
    return 'hook'      // Zone haute → Crochet
  } else if (normalizedY < -0.33) {
    return 'uppercut'  // Zone basse → Uppercut
  } else {
    return 'jab'       // Zone centrale → Jab
  }
}

// Variables globales singleton
let ammoInstance: any = null
let physicsWorld: any = null
let softBodyHelpers: any = null
let transformAux: any = null
let isAmmoReady = false

const GRAVITY = -9.8
const MARGIN = 0.05

// Dimensions de la salle
const ROOM = {
  width: 16,
  depth: 12,
  height: 8,
  wallThickness: 0.3,
}

// Listes des corps physiques
const rigidBodiesList: { mesh: THREE.Mesh; body: any }[] = []
const softBodiesList: { mesh: THREE.Mesh; body: any; indexAssociation: number[][] }[] = []
const ropeSoftBodies: { line: THREE.Line; body: any; numSegments: number }[] = []

/**
 * Charger Ammo.js
 */
async function loadAmmo(): Promise<any> {
  if (isAmmoReady) return ammoInstance

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

  const Ammo = await (window as any).Ammo()
  ammoInstance = Ammo

  const collisionConfiguration = new Ammo.btSoftBodyRigidBodyCollisionConfiguration()
  const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration)
  const broadphase = new Ammo.btDbvtBroadphase()
  const solver = new Ammo.btSequentialImpulseConstraintSolver()
  const softBodySolver = new Ammo.btDefaultSoftBodySolver()

  physicsWorld = new Ammo.btSoftRigidDynamicsWorld(
    dispatcher,
    broadphase,
    solver,
    collisionConfiguration,
    softBodySolver
  )

  physicsWorld.setGravity(new Ammo.btVector3(0, GRAVITY, 0))
  physicsWorld.getWorldInfo().set_m_gravity(new Ammo.btVector3(0, GRAVITY, 0))

  transformAux = new Ammo.btTransform()
  softBodyHelpers = new Ammo.btSoftBodyHelpers()

  isAmmoReady = true
  console.log('[BoxingGym] Ammo.js initialized')

  return Ammo
}

function isEqual(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): boolean {
  const delta = 0.000001
  return Math.abs(x2 - x1) < delta && Math.abs(y2 - y1) < delta && Math.abs(z2 - z1) < delta
}

function mapIndices(
  bufGeometry: THREE.BufferGeometry,
  indexedBufferGeom: THREE.BufferGeometry
): { ammoVertices: Float32Array; ammoIndices: Uint16Array | Uint32Array; indexAssociation: number[][] } {
  const vertices = bufGeometry.attributes.position!.array as Float32Array
  const idxVertices = indexedBufferGeom.attributes.position!.array as Float32Array
  const indices = indexedBufferGeom.index!.array as Uint16Array | Uint32Array

  const numIdxVertices = idxVertices.length / 3
  const numVertices = vertices.length / 3
  const indexAssociation: number[][] = []

  for (let i = 0; i < numIdxVertices; i++) {
    const association: number[] = []
    indexAssociation.push(association)
    const i3 = i * 3

    for (let j = 0; j < numVertices; j++) {
      const j3 = j * 3
      if (isEqual(idxVertices[i3]!, idxVertices[i3 + 1]!, idxVertices[i3 + 2]!, vertices[j3]!, vertices[j3 + 1]!, vertices[j3 + 2]!)) {
        association.push(j3)
      }
    }
  }

  return { ammoVertices: idxVertices, ammoIndices: indices, indexAssociation }
}

function processGeometry(bufGeometry: THREE.BufferGeometry) {
  const posOnlyBufGeometry = new THREE.BufferGeometry()
  posOnlyBufGeometry.setAttribute('position', bufGeometry.getAttribute('position')!)
  posOnlyBufGeometry.setIndex(bufGeometry.getIndex())
  const indexedBufferGeom = mergeVertices(posOnlyBufGeometry)
  return mapIndices(bufGeometry, indexedBufferGeom)
}

function mergeVertices(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const positionAttribute = geometry.attributes.position!
  const positions = positionAttribute.array as Float32Array
  const vertexCount = positions.length / 3

  const hashToIndex = new Map<string, number>()
  const newPositions: number[] = []
  const newIndices: number[] = []
  const oldToNewIndex: number[] = []

  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3]!
    const y = positions[i * 3 + 1]!
    const z = positions[i * 3 + 2]!
    const hash = `${x.toFixed(6)}_${y.toFixed(6)}_${z.toFixed(6)}`

    if (hashToIndex.has(hash)) {
      oldToNewIndex[i] = hashToIndex.get(hash)!
    } else {
      const newIndex = newPositions.length / 3
      hashToIndex.set(hash, newIndex)
      oldToNewIndex[i] = newIndex
      newPositions.push(x, y, z)
    }
  }

  const originalIndices = geometry.index?.array
  if (originalIndices) {
    for (let i = 0; i < originalIndices.length; i++) {
      newIndices.push(oldToNewIndex[originalIndices[i]!]!)
    }
  }

  const result = new THREE.BufferGeometry()
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3))
  result.setIndex(newIndices)
  return result
}

function createRigidBody(Ammo: any, mesh: THREE.Mesh | null, shape: any, mass: number, pos: THREE.Vector3, quat: THREE.Quaternion): any {
  if (mesh) {
    mesh.position.copy(pos)
    mesh.quaternion.copy(quat)
  }

  const transform = new Ammo.btTransform()
  transform.setIdentity()
  transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z))
  transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w))
  const motionState = new Ammo.btDefaultMotionState(transform)

  const localInertia = new Ammo.btVector3(0, 0, 0)
  shape.calculateLocalInertia(mass, localInertia)

  const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia)
  const body = new Ammo.btRigidBody(rbInfo)

  if (mesh) mesh.userData.physicsBody = body
  if (mass > 0 && mesh) {
    rigidBodiesList.push({ mesh, body })
    body.setActivationState(4)
  }

  physicsWorld.addRigidBody(body)
  return body
}

function createSoftVolume(Ammo: any, mesh: THREE.Mesh, geometry: THREE.BufferGeometry, mass: number, pressure: number): { softBody: any; topNodeIndex: number } {
  const { ammoVertices, ammoIndices, indexAssociation } = processGeometry(geometry)

  const softBody = softBodyHelpers.CreateFromTriMesh(
    physicsWorld.getWorldInfo(),
    ammoVertices,
    ammoIndices,
    ammoIndices.length / 3,
    true
  )

  const sbConfig = softBody.get_m_cfg()
  // Augmenter les itérations pour de meilleures collisions
  sbConfig.set_viterations(80)
  sbConfig.set_piterations(80)
  // Collisions: 0x11 = SDF_RS (Soft-Rigid) + VF_SS (Vertex-Face Soft-Soft)
  // Utiliser 0x0011 pour collision rigid-soft + cluster collision
  sbConfig.set_collisions(0x0011)
  // Friction dynamique plus élevée
  sbConfig.set_kDF(0.5)
  // Amortissement
  sbConfig.set_kDP(0.005)
  // Pression
  sbConfig.set_kPR(pressure)
  // Marge de collision plus grande pour soft bodies
  sbConfig.set_kCHR(1.0) // Rigid contact hardness
  sbConfig.set_kKHR(1.0) // Kinetic contact hardness
  sbConfig.set_kSHR(1.0) // Soft contact hardness

  softBody.get_m_materials().at(0).set_m_kLST(0.95)
  softBody.get_m_materials().at(0).set_m_kAST(0.95)
  softBody.setTotalMass(mass, false)
  // Marge plus grande pour éviter les traversées
  Ammo.castObject(softBody, Ammo.btCollisionObject).getCollisionShape().setMargin(0.15)
  physicsWorld.addSoftBody(softBody, 1, -1)

  mesh.userData.physicsBody = softBody
  softBody.setActivationState(4)
  softBodiesList.push({ mesh, body: softBody, indexAssociation })

  // Trouver le node le plus haut
  const nodes = softBody.get_m_nodes()
  const numNodes = nodes.size()
  let topNodeIndex = 0
  let maxY = -Infinity

  for (let i = 0; i < numNodes; i++) {
    const y = nodes.at(i).get_m_x().y()
    if (y > maxY) { maxY = y; topNodeIndex = i }
  }

  console.log(`[BoxingGym] Punching bag: ${ammoVertices.length / 3} verts, pressure=${pressure}`)
  return { softBody, topNodeIndex }
}

function createRope(Ammo: any, scene: THREE.Scene, startPos: THREE.Vector3, endPos: THREE.Vector3, numSegments: number, mass: number): { line: THREE.Line; body: any } {
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments
    points.push(new THREE.Vector3(
      startPos.x + (endPos.x - startPos.x) * t,
      startPos.y + (endPos.y - startPos.y) * t,
      startPos.z + (endPos.z - startPos.z) * t
    ))
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color: 0x222222, linewidth: 3 })
  const line = new THREE.Line(geometry, material)
  scene.add(line)

  const ropeStart = new Ammo.btVector3(startPos.x, startPos.y, startPos.z)
  const ropeEnd = new Ammo.btVector3(endPos.x, endPos.y, endPos.z)

  const ropeSoftBody = softBodyHelpers.CreateRope(
    physicsWorld.getWorldInfo(),
    ropeStart,
    ropeEnd,
    numSegments - 1,
    0
  )

  const sbConfig = ropeSoftBody.get_m_cfg()
  sbConfig.set_viterations(10)
  sbConfig.set_piterations(10)

  ropeSoftBody.setTotalMass(mass, false)
  physicsWorld.addSoftBody(ropeSoftBody, 1, -1)
  ropeSoftBody.setActivationState(4)

  Ammo.destroy(ropeStart)
  Ammo.destroy(ropeEnd)

  ropeSoftBodies.push({ line, body: ropeSoftBody, numSegments })
  return { line, body: ropeSoftBody }
}

function attachRopeToVolume(Ammo: any, ropeSoftBody: any, ropeNumSegments: number, ceilingBody: any, volumeSoftBody: any, volumeTopNode: number) {
  ropeSoftBody.appendAnchor(0, ceilingBody, true, 1.0)
  const ropeNodes = ropeSoftBody.get_m_nodes()
  ropeNodes.at(ropeNumSegments).set_m_im(0)
  volumeSoftBody.get_m_nodes().at(volumeTopNode).set_m_im(0)
}

function updatePhysics(deltaTime: number): void {
  if (!physicsWorld) return

  physicsWorld.stepSimulation(deltaTime, 10)

  // Soft bodies volumes
  for (const { mesh, body, indexAssociation } of softBodiesList) {
    const geometry = mesh.geometry
    const positionAttr = geometry.attributes.position
    const normalAttr = geometry.attributes.normal

    // Vérifier que les attributs existent
    if (!positionAttr || !normalAttr) continue

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

  // Ropes
  for (const { line, body, numSegments } of ropeSoftBodies) {
    const positions = line.geometry.attributes.position!.array as Float32Array
    const nodes = body.get_m_nodes()

    for (let i = 0; i <= numSegments; i++) {
      const nodePos = nodes.at(i).get_m_x()
      positions[i * 3] = nodePos.x()
      positions[i * 3 + 1] = nodePos.y()
      positions[i * 3 + 2] = nodePos.z()
    }

    line.geometry.attributes.position!.needsUpdate = true
  }

  // Rigid bodies
  for (const { mesh, body } of rigidBodiesList) {
    const ms = body.getMotionState()
    if (ms) {
      ms.getWorldTransform(transformAux)
      const p = transformAux.getOrigin()
      const q = transformAux.getRotation()
      mesh.position.set(p.x(), p.y(), p.z())
      mesh.quaternion.set(q.x(), q.y(), q.z(), q.w())
    }
  }
}

/**
 * Composant Salle de Boxe
 */
export function AmmoVolumeDemo() {
  const { camera, scene } = useThree()
  const [isReady, setIsReady] = useState(false)
  const ammoRef = useRef<any>(null)
  const initDoneRef = useRef(false)
  const clickRequestRef = useRef(false)
  const mouseCoordsRef = useRef(new THREE.Vector2())
  const raycasterRef = useRef(new THREE.Raycaster())

  // Personnage sélectionné
  const selectedCharacterId = useCharacterStore((state) => state.selectedCharacterId)
  const showFluffyBags = selectedCharacterId === 'fluffy'

  // Outil sélectionné
  const selectedTool = useGameStore((state) => state.selectedTool)

  // Références meshes
  const groundRef = useRef<THREE.Mesh>(null)
  const ceilingRef = useRef<THREE.Mesh>(null)
  const punchingBagRef = useRef<THREE.Mesh>(null)
  const boxBagRef = useRef<THREE.Mesh>(null)

  // Gants de boxe
  const leftGloveRef = useRef<THREE.Mesh>(null)
  const rightGloveRef = useRef<THREE.Mesh>(null)
  const leftGloveBodyRef = useRef<any>(null)
  const rightGloveBodyRef = useRef<any>(null)
  const glovesInitializedRef = useRef(false)

  // Système d'animation des coups
  const [leftPunchAnim, setLeftPunchAnim] = useState<PunchAnimation | null>(null)
  const [rightPunchAnim, setRightPunchAnim] = useState<PunchAnimation | null>(null)
  const [currentPunchType, setCurrentPunchType] = useState<PunchType>('jab')

  // Positions de repos des gants
  const LEFT_REST_POS = new THREE.Vector3(-0.8, 2.5, 4)
  const RIGHT_REST_POS = new THREE.Vector3(0.8, 2.5, 4)

  // Init Ammo
  useEffect(() => {
    loadAmmo().then((Ammo) => {
      ammoRef.current = Ammo
      setIsReady(true)
    })

    return () => {
      rigidBodiesList.length = 0
      softBodiesList.length = 0
      ropeSoftBodies.length = 0
    }
  }, [])

  // Référence pour savoir si les soft bodies Fluffy sont créés
  const fluffyInitializedRef = useRef(false)

  // Créer la physique de base (sol, plafond, murs)
  useEffect(() => {
    if (!isReady || !ammoRef.current || initDoneRef.current) return
    if (!groundRef.current || !ceilingRef.current) return

    initDoneRef.current = true
    const Ammo = ammoRef.current

    // Sol
    const groundShape = new Ammo.btBoxShape(new Ammo.btVector3(ROOM.width / 2, 0.5, ROOM.depth / 2))
    groundShape.setMargin(MARGIN)
    createRigidBody(Ammo, groundRef.current, groundShape, 0, new THREE.Vector3(0, -0.5, 0), new THREE.Quaternion())

    // Plafond (pour ancrage)
    const ceilingShape = new Ammo.btBoxShape(new Ammo.btVector3(ROOM.width / 2, 0.25, ROOM.depth / 2))
    ceilingShape.setMargin(MARGIN)
    createRigidBody(Ammo, ceilingRef.current, ceilingShape, 0, new THREE.Vector3(0, ROOM.height, 0), new THREE.Quaternion())

    console.log('[BoxingGym] Base scene initialized (floor, ceiling)')
  }, [isReady])

  // Créer les sacs de frappe Fluffy (soft bodies) seulement si sélectionné
  useEffect(() => {
    if (!isReady || !ammoRef.current || !showFluffyBags) return
    if (!punchingBagRef.current || !boxBagRef.current || !ceilingRef.current) return
    if (fluffyInitializedRef.current) return

    fluffyInitializedRef.current = true
    const Ammo = ammoRef.current

    // Récupérer le body du plafond pour ancrage
    const ceilingBody = ceilingRef.current.userData.physicsBody

    // Sac de frappe sphérique - pression très élevée pour effet ballon gonflé
    const bagRadius = 1.2
    const bagGeo = new THREE.SphereGeometry(bagRadius, 40, 25)
    bagGeo.translate(-2.5, 4, 0)
    punchingBagRef.current.geometry = bagGeo
    // Pression 800 = très gonflé, comme un ballon de plage
    const { softBody: bagSoftBody, topNodeIndex: bagTopNode } = createSoftVolume(Ammo, punchingBagRef.current, bagGeo, 25, 800)

    // Corde sphère
    const sphereRope = createRope(Ammo, scene, new THREE.Vector3(-2.5, ROOM.height, 0), new THREE.Vector3(-2.5, 5.2, 0), 12, 0.5)
    attachRopeToVolume(Ammo, sphereRope.body, 12, ceilingBody, bagSoftBody, bagTopNode)

    // Sac de frappe rectangulaire - pression élevée aussi
    const boxGeo = new THREE.BoxGeometry(1, 4, 1, 4, 16, 4)
    boxGeo.translate(2.5, 4, 0)
    boxBagRef.current.geometry = boxGeo
    // Pression 500 = gonflé mais garde sa forme rectangulaire
    const { softBody: boxSoftBody, topNodeIndex: boxTopNode } = createSoftVolume(Ammo, boxBagRef.current, boxGeo, 30, 500)

    // Corde boîte
    const boxRope = createRope(Ammo, scene, new THREE.Vector3(2.5, ROOM.height, 0), new THREE.Vector3(2.5, 6, 0), 10, 0.5)
    attachRopeToVolume(Ammo, boxRope.body, 10, ceilingBody, boxSoftBody, boxTopNode)

    console.log('[BoxingGym] Fluffy soft bodies initialized')
  }, [isReady, showFluffyBags, scene])

  // Créer les gants de boxe (quand outil 'gloves' sélectionné)
  useEffect(() => {
    if (!isReady || !ammoRef.current || selectedTool !== 'gloves') return
    if (!leftGloveRef.current || !rightGloveRef.current) return
    if (glovesInitializedRef.current) return

    glovesInitializedRef.current = true
    const Ammo = ammoRef.current

    const gloveRadius = 0.25
    const gloveMass = 3

    // Gant gauche
    const leftShape = new Ammo.btSphereShape(gloveRadius)
    leftShape.setMargin(0.05)
    const leftBody = createRigidBody(
      Ammo,
      leftGloveRef.current,
      leftShape,
      gloveMass,
      new THREE.Vector3(-0.8, 2.5, 4),
      new THREE.Quaternion()
    )
    leftBody.setFriction(0.8)
    leftBody.setRestitution(0.3)
    // Désactiver gravité pour les gants
    leftBody.setGravity(new Ammo.btVector3(0, 0, 0))
    // Activer CCD
    leftBody.setCcdMotionThreshold(gloveRadius * 0.5)
    leftBody.setCcdSweptSphereRadius(gloveRadius * 0.8)
    leftGloveBodyRef.current = leftBody

    // Gant droit
    const rightShape = new Ammo.btSphereShape(gloveRadius)
    rightShape.setMargin(0.05)
    const rightBody = createRigidBody(
      Ammo,
      rightGloveRef.current,
      rightShape,
      gloveMass,
      new THREE.Vector3(0.8, 2.5, 4),
      new THREE.Quaternion()
    )
    rightBody.setFriction(0.8)
    rightBody.setRestitution(0.3)
    rightBody.setGravity(new Ammo.btVector3(0, 0, 0))
    rightBody.setCcdMotionThreshold(gloveRadius * 0.5)
    rightBody.setCcdSweptSphereRadius(gloveRadius * 0.8)
    rightGloveBodyRef.current = rightBody

    console.log('[BoxingGym] Boxing gloves initialized')
  }, [isReady, selectedTool])

  /**
   * Détermine le côté (gauche/droite) basé sur la position X de l'écran
   */
  const getSideFromScreenX = useCallback((normalizedX: number): 'left' | 'right' => {
    return normalizedX < 0 ? 'left' : 'right'
  }, [])

  /**
   * Démarre une animation de coup
   */
  const startPunch = useCallback((side: 'left' | 'right', punchType: PunchType) => {
    const newAnim: PunchAnimation = {
      type: punchType,
      side,
      progress: 0,
      phase: 'windup',
      startTime: performance.now() / 1000
    }

    if (side === 'left') {
      if (!leftPunchAnim) {
        setLeftPunchAnim(newAnim)
        console.log(`[Punch] Left ${punchType} started`)
      }
    } else {
      if (!rightPunchAnim) {
        setRightPunchAnim(newAnim)
        console.log(`[Punch] Right ${punchType} started`)
      }
    }
  }, [leftPunchAnim, rightPunchAnim])

  // Clics et mouvement souris
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      // Ne pas tirer si on clique sur un élément UI
      const target = event.target as HTMLElement
      if (target.tagName !== 'CANVAS') return

      // Coordonnées normalisées (-1 à 1)
      const normalizedX = (event.clientX / window.innerWidth) * 2 - 1
      const normalizedY = -(event.clientY / window.innerHeight) * 2 + 1

      if (selectedTool === 'ball') {
        // Mode balle - lancer une balle
        if (!clickRequestRef.current) {
          mouseCoordsRef.current.set(normalizedX, normalizedY)
          clickRequestRef.current = true
        }
      } else if (selectedTool === 'gloves') {
        // Mode gants - déterminer le type de coup selon la zone
        const punchType = getPunchTypeFromScreenZone(normalizedY)
        const side = getSideFromScreenX(normalizedX)

        setCurrentPunchType(punchType)
        startPunch(side, punchType)
      }
    }

    // Pas besoin de handlePointerUp - les animations se terminent automatiquement

    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [selectedTool, getSideFromScreenX, startPunch])

  const processClick = useCallback(() => {
    // Ne traiter que si mode balle sélectionné
    if (!clickRequestRef.current || !ammoRef.current || selectedTool !== 'ball') {
      clickRequestRef.current = false
      return
    }
    const Ammo = ammoRef.current

    raycasterRef.current.setFromCamera(mouseCoordsRef.current, camera)

    // Balle plus grosse pour meilleure collision avec soft bodies
    const ballRadius = 0.4
    const ballGeometry = new THREE.SphereGeometry(ballRadius, 16, 16)
    const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.3 })
    const ball = new THREE.Mesh(ballGeometry, ballMaterial)
    ball.castShadow = true
    scene.add(ball)

    const ballShape = new Ammo.btSphereShape(ballRadius)
    ballShape.setMargin(0.05)

    const pos = raycasterRef.current.ray.direction.clone().add(raycasterRef.current.ray.origin)
    // Masse augmentée pour plus d'impact
    const ballBody = createRigidBody(Ammo, ball, ballShape, 5, pos, new THREE.Quaternion())
    ballBody.setFriction(0.8)
    ballBody.setRestitution(0.3) // Rebond

    // Activer CCD (Continuous Collision Detection) pour éviter les traversées
    ballBody.setCcdMotionThreshold(ballRadius * 0.5)
    ballBody.setCcdSweptSphereRadius(ballRadius * 0.8)

    // Vitesse légèrement réduite pour collisions plus stables
    const velocity = raycasterRef.current.ray.direction.clone().multiplyScalar(14)
    ballBody.setLinearVelocity(new Ammo.btVector3(velocity.x, velocity.y, velocity.z))

    clickRequestRef.current = false
  }, [camera, scene, selectedTool])

  // Mise à jour des gants de boxe
  const updateGloves = useCallback(() => {
    if (!ammoRef.current || selectedTool !== 'gloves') return
    const Ammo = ammoRef.current

    const leftBody = leftGloveBodyRef.current
    const rightBody = rightGloveBodyRef.current
    if (!leftBody || !rightBody) return

    const target = mouseTargetRef.current
    const punchForce = 50
    const returnForce = 15
    const damping = 0.85

    // Position de repos des gants
    const leftRestPos = new THREE.Vector3(-0.8, 2.5, 4)
    const rightRestPos = new THREE.Vector3(0.8, 2.5, 4)

    // Récupérer positions actuelles
    const leftTransform = new Ammo.btTransform()
    leftBody.getMotionState().getWorldTransform(leftTransform)
    const leftPos = leftTransform.getOrigin()
    const leftCurrentPos = new THREE.Vector3(leftPos.x(), leftPos.y(), leftPos.z())

    const rightTransform = new Ammo.btTransform()
    rightBody.getMotionState().getWorldTransform(rightTransform)
    const rightPos = rightTransform.getOrigin()
    const rightCurrentPos = new THREE.Vector3(rightPos.x(), rightPos.y(), rightPos.z())

    // Appliquer forces
    if (isLeftPunching) {
      // Punch vers la cible (vers l'avant z-)
      const punchTarget = new THREE.Vector3(target.x - 0.5, target.y, 0)
      const dir = punchTarget.clone().sub(leftCurrentPos).normalize()
      const force = new Ammo.btVector3(dir.x * punchForce, dir.y * punchForce, dir.z * punchForce * 2)
      leftBody.applyCentralForce(force)
      Ammo.destroy(force)
    } else {
      // Retour vers position de repos
      const dir = leftRestPos.clone().sub(leftCurrentPos)
      const force = new Ammo.btVector3(dir.x * returnForce, dir.y * returnForce, dir.z * returnForce)
      leftBody.applyCentralForce(force)
      Ammo.destroy(force)
      // Amortissement
      const vel = leftBody.getLinearVelocity()
      leftBody.setLinearVelocity(new Ammo.btVector3(vel.x() * damping, vel.y() * damping, vel.z() * damping))
    }

    if (isRightPunching) {
      const punchTarget = new THREE.Vector3(target.x + 0.5, target.y, 0)
      const dir = punchTarget.clone().sub(rightCurrentPos).normalize()
      const force = new Ammo.btVector3(dir.x * punchForce, dir.y * punchForce, dir.z * punchForce * 2)
      rightBody.applyCentralForce(force)
      Ammo.destroy(force)
    } else {
      const dir = rightRestPos.clone().sub(rightCurrentPos)
      const force = new Ammo.btVector3(dir.x * returnForce, dir.y * returnForce, dir.z * returnForce)
      rightBody.applyCentralForce(force)
      Ammo.destroy(force)
      const vel = rightBody.getLinearVelocity()
      rightBody.setLinearVelocity(new Ammo.btVector3(vel.x() * damping, vel.y() * damping, vel.z() * damping))
    }

    Ammo.destroy(leftTransform)
    Ammo.destroy(rightTransform)
  }, [selectedTool, isLeftPunching, isRightPunching])

  useFrame((_, delta) => {
    if (!isReady) return
    updatePhysics(delta)
    processClick()
    updateGloves()
  })

  if (!isReady) {
    return (
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="gray" wireframe />
      </mesh>
    )
  }

  // Couleurs salle de boxe
  const wallColor = 0x2a1a0a // Brun foncé
  const floorColor = 0x1a1a1a // Gris très foncé (tapis)
  const ceilingColor = 0x0a0a0a // Noir
  const accentColor = 0x8b0000 // Rouge foncé

  return (
    <group>
      {/* === SOL === */}
      <mesh ref={groundRef} position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[ROOM.width, 0.2, ROOM.depth]} />
        <meshStandardMaterial color={floorColor} roughness={0.9} />
      </mesh>

      {/* Marquage au sol (ring) */}
      <mesh position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3, 3.2, 64]} />
        <meshStandardMaterial color={accentColor} />
      </mesh>

      {/* === PLAFOND === */}
      <mesh ref={ceilingRef} position={[0, ROOM.height, 0]}>
        <boxGeometry args={[ROOM.width, 0.5, ROOM.depth]} />
        <meshStandardMaterial color={ceilingColor} roughness={1} />
      </mesh>

      {/* Point d'ancrage visible */}
      <mesh position={[0, ROOM.height - 0.3, 0]}>
        <cylinderGeometry args={[0.1, 0.15, 0.2, 16]} />
        <meshStandardMaterial color={0x333333} metalness={0.8} roughness={0.2} />
      </mesh>

      {/* === MURS === */}
      {/* Mur arrière */}
      <mesh position={[0, ROOM.height / 2, -ROOM.depth / 2]} receiveShadow>
        <boxGeometry args={[ROOM.width, ROOM.height, ROOM.wallThickness]} />
        <meshStandardMaterial color={wallColor} roughness={0.8} />
      </mesh>

      {/* Bande rouge sur mur arrière */}
      <mesh position={[0, ROOM.height - 1, -ROOM.depth / 2 + 0.16]}>
        <boxGeometry args={[ROOM.width, 0.5, 0.02]} />
        <meshStandardMaterial color={accentColor} />
      </mesh>

      {/* Mur gauche */}
      <mesh position={[-ROOM.width / 2, ROOM.height / 2, 0]} receiveShadow>
        <boxGeometry args={[ROOM.wallThickness, ROOM.height, ROOM.depth]} />
        <meshStandardMaterial color={wallColor} roughness={0.8} />
      </mesh>

      {/* Bande rouge mur gauche */}
      <mesh position={[-ROOM.width / 2 + 0.16, ROOM.height - 1, 0]}>
        <boxGeometry args={[0.02, 0.5, ROOM.depth]} />
        <meshStandardMaterial color={accentColor} />
      </mesh>

      {/* Mur droit */}
      <mesh position={[ROOM.width / 2, ROOM.height / 2, 0]} receiveShadow>
        <boxGeometry args={[ROOM.wallThickness, ROOM.height, ROOM.depth]} />
        <meshStandardMaterial color={wallColor} roughness={0.8} />
      </mesh>

      {/* Bande rouge mur droit */}
      <mesh position={[ROOM.width / 2 - 0.16, ROOM.height - 1, 0]}>
        <boxGeometry args={[0.02, 0.5, ROOM.depth]} />
        <meshStandardMaterial color={accentColor} />
      </mesh>

      {/* === ADVERSAIRES === */}

      {/* FLUFFY - Sacs de frappe soft body */}
      {showFluffyBags && (
        <>
          {/* Sphère (gauche) */}
          <mesh ref={punchingBagRef} frustumCulled={false} castShadow receiveShadow>
            <sphereGeometry args={[1.2, 40, 25]} />
            <meshStandardMaterial color={0xcc2222} roughness={0.4} />
          </mesh>

          {/* Boîte rectangulaire (droite) */}
          <mesh ref={boxBagRef} frustumCulled={false} castShadow receiveShadow>
            <boxGeometry args={[1, 4, 1, 4, 16, 4]} />
            <meshStandardMaterial color={0x22cc22} roughness={0.4} />
          </mesh>
        </>
      )}

      {/* SPHERE - Bonhomme de neige */}
      {selectedCharacterId === 'sphere' && (
        <group position={[0, 0, 0]}>
          {/* Corps (grande sphère) */}
          <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
            <sphereGeometry args={[1.2, 32, 32]} />
            <meshStandardMaterial color={0xffffff} roughness={0.8} />
          </mesh>
          {/* Torse (moyenne sphère) */}
          <mesh position={[0, 2.8, 0]} castShadow receiveShadow>
            <sphereGeometry args={[0.9, 32, 32]} />
            <meshStandardMaterial color={0xffffff} roughness={0.8} />
          </mesh>
          {/* Tête (petite sphère) */}
          <mesh position={[0, 4.0, 0]} castShadow receiveShadow>
            <sphereGeometry args={[0.6, 32, 32]} />
            <meshStandardMaterial color={0xffffff} roughness={0.8} />
          </mesh>
          {/* Yeux */}
          <mesh position={[-0.2, 4.1, 0.5]} castShadow>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshStandardMaterial color={0x111111} />
          </mesh>
          <mesh position={[0.2, 4.1, 0.5]} castShadow>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshStandardMaterial color={0x111111} />
          </mesh>
          {/* Nez carotte */}
          <mesh position={[0, 3.95, 0.6]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <coneGeometry args={[0.08, 0.4, 8]} />
            <meshStandardMaterial color={0xff6600} />
          </mesh>
          {/* Boutons */}
          <mesh position={[0, 3.0, 0.85]} castShadow>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color={0x111111} />
          </mesh>
          <mesh position={[0, 2.6, 0.88]} castShadow>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color={0x111111} />
          </mesh>
          {/* Chapeau */}
          <mesh position={[0, 4.6, 0]} castShadow>
            <cylinderGeometry args={[0.4, 0.5, 0.1, 16]} />
            <meshStandardMaterial color={0x222222} />
          </mesh>
          <mesh position={[0, 4.9, 0]} castShadow>
            <cylinderGeometry args={[0.35, 0.35, 0.5, 16]} />
            <meshStandardMaterial color={0x222222} />
          </mesh>
        </group>
      )}

      {/* JELLYHEAD - Tête gélatineuse */}
      {selectedCharacterId === 'jellyhead' && (
        <group position={[0, 3, 0]}>
          {/* Tête principale */}
          <mesh castShadow receiveShadow>
            <sphereGeometry args={[1.5, 32, 32]} />
            <meshStandardMaterial color={0xff69b4} roughness={0.3} metalness={0.1} transparent opacity={0.9} />
          </mesh>
          {/* Yeux */}
          <mesh position={[-0.5, 0.3, 1.2]} castShadow>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial color={0xffffff} />
          </mesh>
          <mesh position={[0.5, 0.3, 1.2]} castShadow>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial color={0xffffff} />
          </mesh>
          {/* Pupilles */}
          <mesh position={[-0.5, 0.3, 1.45]} castShadow>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshStandardMaterial color={0x111111} />
          </mesh>
          <mesh position={[0.5, 0.3, 1.45]} castShadow>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshStandardMaterial color={0x111111} />
          </mesh>
          {/* Nez */}
          <mesh position={[0, -0.1, 1.4]} castShadow>
            <sphereGeometry args={[0.15, 12, 12]} />
            <meshStandardMaterial color={0xffaaaa} />
          </mesh>
          {/* Bouche souriante (torus) */}
          <mesh position={[0, -0.5, 1.3]} rotation={[0.3, 0, 0]} castShadow>
            <torusGeometry args={[0.3, 0.05, 8, 16, Math.PI]} />
            <meshStandardMaterial color={0x333333} />
          </mesh>
        </group>
      )}

      {/* FACECAP / HUMANOID - Placeholder simple */}
      {(selectedCharacterId === 'facecap' || selectedCharacterId === 'humanoid') && (
        <group position={[0, 2.5, 0]}>
          {/* Corps */}
          <mesh position={[0, 0, 0]} castShadow receiveShadow>
            <capsuleGeometry args={[0.8, 2, 8, 16]} />
            <meshStandardMaterial color={0x888888} roughness={0.5} />
          </mesh>
          {/* Tête */}
          <mesh position={[0, 2.0, 0]} castShadow receiveShadow>
            <sphereGeometry args={[0.6, 24, 24]} />
            <meshStandardMaterial color={0xddccbb} roughness={0.7} />
          </mesh>
          {/* Yeux */}
          <mesh position={[-0.2, 2.1, 0.5]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color={0x333333} />
          </mesh>
          <mesh position={[0.2, 2.1, 0.5]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color={0x333333} />
          </mesh>
          {/* Label */}
          <mesh position={[0, 3.2, 0]}>
            <boxGeometry args={[1.5, 0.3, 0.05]} />
            <meshStandardMaterial color={0x333333} />
          </mesh>
        </group>
      )}

      {/* === GANTS DE BOXE === */}
      {selectedTool === 'gloves' && (
        <>
          {/* Gant gauche */}
          <mesh ref={leftGloveRef} position={[-0.8, 2.5, 4]} castShadow>
            <sphereGeometry args={[0.25, 16, 16]} />
            <meshStandardMaterial
              color={isLeftPunching ? 0xff4400 : 0xcc0000}
              roughness={0.4}
              metalness={0.1}
            />
          </mesh>
          {/* Gant droit */}
          <mesh ref={rightGloveRef} position={[0.8, 2.5, 4]} castShadow>
            <sphereGeometry args={[0.25, 16, 16]} />
            <meshStandardMaterial
              color={isRightPunching ? 0xff4400 : 0xcc0000}
              roughness={0.4}
              metalness={0.1}
            />
          </mesh>
        </>
      )}

      {/* === DÉCOR === */}
      {/* Poteaux d'angle */}
      {[[-ROOM.width / 2 + 0.3, -ROOM.depth / 2 + 0.3], [ROOM.width / 2 - 0.3, -ROOM.depth / 2 + 0.3]].map(([x, z], i) => (
        <mesh key={i} position={[x, ROOM.height / 2, z]}>
          <cylinderGeometry args={[0.08, 0.08, ROOM.height, 16]} />
          <meshStandardMaterial color={0x444444} metalness={0.7} roughness={0.3} />
        </mesh>
      ))}

      {/* Sac de sable décoratif (fond gauche) */}
      <mesh position={[-5, 1.5, -4]} castShadow>
        <cylinderGeometry args={[0.5, 0.6, 3, 16]} />
        <meshStandardMaterial color={0x8b4513} roughness={0.7} />
      </mesh>
      <mesh position={[-5, 3.2, -4]}>
        <cylinderGeometry args={[0.05, 0.05, 1, 8]} />
        <meshStandardMaterial color={0x222222} />
      </mesh>

      {/* Sac de sable décoratif (fond droit) */}
      <mesh position={[5, 1.5, -4]} castShadow>
        <cylinderGeometry args={[0.5, 0.6, 3, 16]} />
        <meshStandardMaterial color={0x8b4513} roughness={0.7} />
      </mesh>
      <mesh position={[5, 3.2, -4]}>
        <cylinderGeometry args={[0.05, 0.05, 1, 8]} />
        <meshStandardMaterial color={0x222222} />
      </mesh>
    </group>
  )
}

export default AmmoVolumeDemo
