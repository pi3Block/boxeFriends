import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useCharacterStore } from '../stores/useCharacterStore'
import { useGameStore, ImpactManager, PHYSICS_PRESETS, OpponentManager } from '../stores'
import type { PhysicsConfig } from '../stores'
import { ImpactEffects } from './ImpactEffects'
import { MultiPartOpponent } from './MultiPartOpponent'
import { BrickWallOpponent } from './BrickWallOpponent'
import { ArmPhysicsGloves } from './ArmPhysicsGloves'

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
 * Position Z cible de l'adversaire (centré, proche du joueur)
 */
const TARGET_Z = 1.5

/**
 * Configuration des trajectoires de coups
 * Chaque coup a des positions clés en coordonnées relatives
 * Les trajectoires ciblent maintenant z=TARGET_Z (adversaire centré)
 */
/**
 * Points clés des trajectoires (objets constants, pas d'allocation)
 * Selon R3F best practices: ne jamais créer d'objets dans les fonctions appelées chaque frame
 */
const TRAJECTORY_POINTS = {
  rest: { x: 0.8, y: 3.0, z: 4.0 },
  jab: {
    windup: { x: 0.7, y: 3.2, z: 4.2 },
    strike: { x: 0.2, y: 3.2, z: TARGET_Z }
  },
  hook: {
    start: { x: 0.8, y: 3.5, z: 4.0 },
    windup: { x: 1.4, y: 3.8, z: 3.8 },
    strike: { x: -0.2, y: 3.5, z: TARGET_Z }
  },
  uppercut: {
    windup: { x: 0.5, y: 1.8, z: 4.2 },
    strike: { x: 0.2, y: 4.0, z: TARGET_Z }
  }
}

/**
 * Fonctions d'easing pures (pas d'allocation)
 */
const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t)
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOutQuad = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

/**
 * Interpolation linéaire entre deux valeurs
 */
const lerpValue = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Configuration des trajectoires de coups
 * OPTIMISÉ: écrit dans outVec au lieu de créer un nouveau Vector3
 */
const PUNCH_CONFIGS = {
  jab: {
    duration: 0.25,
    // Trajectoire optimisée - écrit dans outVec, pas de new Vector3()
    trajectory: (t: number, side: 'left' | 'right', outVec: THREE.Vector3) => {
      const s = side === 'left' ? -1 : 1
      const rest = TRAJECTORY_POINTS.rest
      const windup = TRAJECTORY_POINTS.jab.windup
      const strike = TRAJECTORY_POINTS.jab.strike

      if (t < 0.2) {
        const p = easeOutQuad(t / 0.2)
        outVec.set(
          s * lerpValue(rest.x, windup.x, p),
          lerpValue(rest.y, windup.y, p),
          lerpValue(rest.z, windup.z, p)
        )
      } else if (t < 0.6) {
        const p = easeOutCubic((t - 0.2) / 0.4)
        const bounce = Math.sin(p * Math.PI) * 0.15
        outVec.set(
          s * lerpValue(windup.x, strike.x, p),
          lerpValue(windup.y, strike.y, p) + bounce,
          lerpValue(windup.z, strike.z, p)
        )
      } else {
        const p = easeInOutQuad((t - 0.6) / 0.4)
        outVec.set(
          s * lerpValue(strike.x, rest.x, p),
          lerpValue(strike.y, rest.y, p),
          lerpValue(strike.z, rest.z, p)
        )
      }
    }
  },
  hook: {
    duration: 0.35,
    trajectory: (t: number, side: 'left' | 'right', outVec: THREE.Vector3) => {
      const s = side === 'left' ? -1 : 1
      const start = TRAJECTORY_POINTS.hook.start
      const windup = TRAJECTORY_POINTS.hook.windup
      const strike = TRAJECTORY_POINTS.hook.strike
      const rest = TRAJECTORY_POINTS.rest

      if (t < 0.25) {
        const p = easeOutQuad(t / 0.25)
        outVec.set(
          s * lerpValue(start.x, windup.x, p),
          lerpValue(start.y, windup.y, p),
          lerpValue(start.z, windup.z, p)
        )
      } else if (t < 0.65) {
        const p = easeOutCubic((t - 0.25) / 0.4)
        const arc = Math.sin(p * Math.PI) * 0.4
        outVec.set(
          s * lerpValue(windup.x, strike.x, p),
          lerpValue(windup.y, strike.y, p) + arc * 0.3,
          lerpValue(windup.z, strike.z, p) - arc
        )
      } else {
        const p = easeInOutQuad((t - 0.65) / 0.35)
        outVec.set(
          s * lerpValue(strike.x, rest.x, p),
          lerpValue(strike.y, rest.y, p),
          lerpValue(strike.z, rest.z, p)
        )
      }
    }
  },
  uppercut: {
    duration: 0.4,
    trajectory: (t: number, side: 'left' | 'right', outVec: THREE.Vector3) => {
      const s = side === 'left' ? -1 : 1
      const rest = TRAJECTORY_POINTS.rest
      const windup = TRAJECTORY_POINTS.uppercut.windup
      const strike = TRAJECTORY_POINTS.uppercut.strike

      if (t < 0.3) {
        const p = (t / 0.3) * (t / 0.3)  // easeIn
        outVec.set(
          s * lerpValue(rest.x, windup.x, p),
          lerpValue(rest.y, windup.y, p),
          lerpValue(rest.z, windup.z, p)
        )
      } else if (t < 0.65) {
        const p = easeOutCubic((t - 0.3) / 0.35)
        outVec.set(
          s * lerpValue(windup.x, strike.x, p),
          lerpValue(windup.y, strike.y, p),
          lerpValue(windup.z, strike.z, p)
        )
      } else {
        const p = easeInOutQuad((t - 0.65) / 0.35)
        outVec.set(
          s * lerpValue(strike.x, rest.x, p),
          lerpValue(strike.y, rest.y, p),
          lerpValue(strike.z, rest.z, p)
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

  // Créer le vecteur gravité et le détruire après usage (évite fuite mémoire)
  const gravityVec = new Ammo.btVector3(0, GRAVITY, 0)
  physicsWorld.setGravity(gravityVec)
  physicsWorld.getWorldInfo().set_m_gravity(gravityVec)
  Ammo.destroy(gravityVec)

  transformAux = new Ammo.btTransform()
  softBodyHelpers = new Ammo.btSoftBodyHelpers()

  isAmmoReady = true

  // IMPORTANT: Exposer le monde physique globalement pour les composants externes (BrickWallOpponent)
  // Cela permet aux briques d'être dans le MÊME monde physique que les balles
  ;(window as any).__ammoPhysicsWorld = physicsWorld
  ;(window as any).__ammoInstance = Ammo

  console.log('[BoxingGym] Ammo.js initialized - physics world exposed globally')

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

  // Créer les vecteurs temporaires
  const originVec = new Ammo.btVector3(pos.x, pos.y, pos.z)
  const rotQuat = new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w)
  const localInertia = new Ammo.btVector3(0, 0, 0)

  const transform = new Ammo.btTransform()
  transform.setIdentity()
  transform.setOrigin(originVec)
  transform.setRotation(rotQuat)
  const motionState = new Ammo.btDefaultMotionState(transform)

  shape.calculateLocalInertia(mass, localInertia)

  const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia)
  const body = new Ammo.btRigidBody(rbInfo)

  // Détruire les vecteurs temporaires (évite fuite mémoire WASM)
  Ammo.destroy(originVec)
  Ammo.destroy(rotQuat)
  Ammo.destroy(localInertia)

  if (mesh) mesh.userData.physicsBody = body
  if (mass > 0 && mesh) {
    rigidBodiesList.push({ mesh, body })
    body.setActivationState(4)
  }

  physicsWorld.addRigidBody(body)
  return body
}

function createSoftVolume(
  Ammo: any,
  mesh: THREE.Mesh,
  geometry: THREE.BufferGeometry,
  mass: number,
  physicsConfig: PhysicsConfig
): { softBody: any; topNodeIndex: number } {
  const { ammoVertices, ammoIndices, indexAssociation } = processGeometry(geometry)

  const softBody = softBodyHelpers.CreateFromTriMesh(
    physicsWorld.getWorldInfo(),
    ammoVertices,
    ammoIndices,
    ammoIndices.length / 3,
    true
  )

  const sbConfig = softBody.get_m_cfg()
  // Appliquer la configuration physique depuis le preset
  sbConfig.set_viterations(physicsConfig.viterations)
  sbConfig.set_piterations(physicsConfig.piterations)
  // Collisions: 0x11 = SDF_RS (Soft-Rigid) + VF_SS (Vertex-Face Soft-Soft)
  sbConfig.set_collisions(0x0011)
  // Coefficients depuis le preset
  sbConfig.set_kDF(physicsConfig.kDF)  // Friction dynamique
  sbConfig.set_kDP(physicsConfig.kDP)  // Amortissement
  sbConfig.set_kPR(physicsConfig.kPR)  // Pression
  // Marge de collision pour soft bodies
  sbConfig.set_kCHR(1.0) // Rigid contact hardness
  sbConfig.set_kKHR(1.0) // Kinetic contact hardness
  sbConfig.set_kSHR(1.0) // Soft contact hardness

  // Stiffness depuis le preset
  softBody.get_m_materials().at(0).set_m_kLST(physicsConfig.kLST)
  softBody.get_m_materials().at(0).set_m_kAST(physicsConfig.kAST)
  softBody.setTotalMass(mass, false)

  // Marge plus grande pour éviter les traversées
  Ammo.castObject(softBody, Ammo.btCollisionObject).getCollisionShape().setMargin(0.15)
  physicsWorld.addSoftBody(softBody, 1, -1)

  mesh.userData.physicsBody = softBody
  softBody.setActivationState(4)
  softBodiesList.push({ mesh, body: softBody, indexAssociation })

  // Réinitialiser toutes les vélocités à zéro pour éviter mouvement initial
  const allNodes = softBody.get_m_nodes()
  const totalNodes = allNodes.size()
  for (let i = 0; i < totalNodes; i++) {
    const node = allNodes.at(i)
    const vel = node.get_m_v()
    vel.setX(0)
    vel.setY(0)
    vel.setZ(0)
  }

  // Trouver le node le plus haut
  const nodes = softBody.get_m_nodes()
  const numNodes = nodes.size()
  let topNodeIndex = 0
  let maxY = -Infinity

  for (let i = 0; i < numNodes; i++) {
    const y = nodes.at(i).get_m_x().y()
    if (y > maxY) { maxY = y; topNodeIndex = i }
  }

  console.log(`[BoxingGym] Punching bag: ${ammoVertices.length / 3} verts, kPR=${physicsConfig.kPR}, kDP=${physicsConfig.kDP}`)
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
  // Fixer uniquement le node du sommet (ancrage minimal)
  volumeSoftBody.get_m_nodes().at(volumeTopNode).set_m_im(0)
}

function updatePhysics(deltaTime: number): void {
  if (!physicsWorld) return

  physicsWorld.stepSimulation(deltaTime, 10)  // Augmenté pour éviter tunneling avec gants rapides

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

  // Personnage sélectionné (non utilisé pour soft bodies maintenant)
  const selectedCharacterId = useCharacterStore((state) => state.selectedCharacterId)
  // DÉSACTIVÉ: Le système Fluffy créait 2 soft bodies = OOM
  // const showFluffyBags = selectedCharacterId === 'fluffy'
  const showFluffyBags = false  // Toujours false pour éviter OOM

  // Outil sélectionné
  const selectedTool = useGameStore((state) => state.selectedTool)

  // Mode physique des gants (kinematic = ancien système, physics = spring constraints)
  const glovePhysicsMode = useGameStore((state) => state.glovePhysicsMode)

  // Punch en attente (déclenché par UI)
  const queuedPunch = useGameStore((state) => state.queuedPunch)
  const consumeQueuedPunch = useGameStore((state) => state.consumeQueuedPunch)

  // Type d'adversaire sélectionné (utilisé à la place de Fluffy)
  const selectedOpponent = useGameStore((state) => state.selectedOpponent)

  // Preset physique sélectionné
  const selectedPhysicsPreset = useGameStore((state) => state.selectedPhysicsPreset)
  const physicsConfig = PHYSICS_PRESETS[selectedPhysicsPreset]

  // Texture de l'adversaire (depuis le store ou default)
  const opponentTextureUrl = useGameStore((state) => state.opponentTexture)
  // Note: recordHit est appelé via getState() dans le processQueue pour éviter re-renders

  // Charger la texture de l'adversaire
  const opponentTexture = useMemo(() => {
    if (!opponentTextureUrl) return null
    const loader = new THREE.TextureLoader()
    const texture = loader.load(opponentTextureUrl)
    // Configuration pour sphère/ballon - répéter 2x horizontalement (devant + derrière)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(2, 1)
    // Décaler la texture pour centrer le visage devant
    texture.offset.x = 0.25
    texture.colorSpace = THREE.SRGBColorSpace
    // Activer alpha premultiplié pour transparence correcte
    texture.premultiplyAlpha = true
    return texture
  }, [opponentTextureUrl])

  // Références meshes
  const groundRef = useRef<THREE.Mesh>(null)
  const ceilingRef = useRef<THREE.Mesh>(null)
  const opponentRef = useRef<THREE.Mesh>(null)
  // Legacy refs (gardés pour compatibilité mais plus utilisés)
  const punchingBagRef = useRef<THREE.Mesh>(null)
  const boxBagRef = useRef<THREE.Mesh>(null)

  // Gants de boxe
  const leftGloveRef = useRef<THREE.Mesh>(null)
  const rightGloveRef = useRef<THREE.Mesh>(null)
  const leftGloveBodyRef = useRef<any>(null)
  const rightGloveBodyRef = useRef<any>(null)
  const glovesInitializedRef = useRef(false)

  // Couleurs des gants (pré-allouées pour éviter GC)
  const GLOVE_COLORS = useMemo(() => ({
    rest: new THREE.Color(0xcc0000),
    jab: new THREE.Color(0xff4400),
    hook: new THREE.Color(0xffaa00),
    uppercut: new THREE.Color(0xff00aa),
    emissiveActive: new THREE.Color(0x331100),
    emissiveRest: new THREE.Color(0x000000)
  }), [])

  // Système d'animation des coups - REFS pour éviter re-renders React
  // Pattern R3F: mutations directes dans useFrame, pas de setState
  const leftPunchAnimRef = useRef<PunchAnimation | null>(null)
  const rightPunchAnimRef = useRef<PunchAnimation | null>(null)
  const currentPunchTypeRef = useRef<PunchType>('jab')

  // Positions de repos des gants (légèrement plus hautes pour correspondre aux trajectoires)
  const LEFT_REST_POS = useMemo(() => new THREE.Vector3(-0.8, 3.0, 4), [])
  const RIGHT_REST_POS = useMemo(() => new THREE.Vector3(0.8, 3.0, 4), [])

  // Objets réutilisables pour éviter GC (optimisation critique)
  const reusableVec3 = useMemo(() => new THREE.Vector3(), [])
  const reusableVec3_2 = useMemo(() => new THREE.Vector3(), [])
  const leftTargetPos = useMemo(() => new THREE.Vector3(), [])
  const rightTargetPos = useMemo(() => new THREE.Vector3(), [])
  const lastLeftPos = useRef(new THREE.Vector3(-0.8, 3.0, 4))
  const lastRightPos = useRef(new THREE.Vector3(0.8, 3.0, 4))

  // Système d'effets d'impact - OPTIMISÉ: pas d'appels set() dans useFrame
  // Utiliser getState() pour éviter les subscriptions React
  const leftImpactTriggeredRef = useRef(false)
  const rightImpactTriggeredRef = useRef(false)

  // Positions Z précédentes pour détection de traversée (anti-tunneling)
  const prevLeftZ = useRef(4.0)
  const prevRightZ = useRef(4.0)

  // Queue d'impacts à traiter hors du render loop (évite re-renders dans useFrame)
  const pendingImpactsRef = useRef<Array<{ pos: [number, number, number], strength: number }>>([])
  const pendingHitsRef = useRef(0)

  // Position cible de l'adversaire pour détection d'impact
  const OPPONENT_CENTER = new THREE.Vector3(0, 3.5, TARGET_Z)
  const IMPACT_THRESHOLD = 2.0  // Distance pour déclencher l'impact (augmenté pour sécurité)
  const IMPACT_Z_THRESHOLD = TARGET_Z + 1.2  // Zone Z élargie pour meilleure détection

  /**
   * Traiter les impacts en attente - appelé à la fin de useFrame
   * Pattern standard: tout traiter dans le même frame loop
   * Utilise getState() pour éviter subscriptions React inutiles
   */
  const processImpactQueue = useCallback(() => {
    // Traiter les impacts visuels en attente
    // Utilise ImpactManager (pas de re-render React)
    if (pendingImpactsRef.current.length > 0) {
      const impacts = pendingImpactsRef.current
      pendingImpactsRef.current = []
      for (const { pos, strength } of impacts) {
        ImpactManager.addImpact(pos, strength)
      }
    }

    // Traiter les hits en attente (score)
    if (pendingHitsRef.current > 0) {
      const hits = pendingHitsRef.current
      pendingHitsRef.current = 0
      const recordHit = useGameStore.getState().recordHit
      for (let i = 0; i < hits; i++) {
        recordHit()
      }
    }
  }, [])

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

  // Init OpponentManager avec la scène
  useEffect(() => {
    if (!scene) return
    OpponentManager.initialize(scene)
    console.log('[BoxingGym] OpponentManager initialized')
  }, [scene])

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

  // Ref pour le type d'adversaire et preset actuellement créés
  const currentOpponentTypeRef = useRef<string | null>(null)
  const currentPhysicsPresetRef = useRef<string | null>(null)

  // Créer l'adversaire soft body centré (basé sur selectedOpponent et physicsPreset)
  // Utilise OpponentManager pour le cleanup propre des ressources
  useEffect(() => {
    if (!isReady || !ammoRef.current) return
    if (!ceilingRef.current || !opponentRef.current) return

    // Si ni le type ni le preset n'ont changé, ne rien faire
    const sameOpponent = currentOpponentTypeRef.current === selectedOpponent
    const samePhysics = currentPhysicsPresetRef.current === selectedPhysicsPreset
    if (sameOpponent && samePhysics) return

    const Ammo = ammoRef.current
    const ceilingBody = ceilingRef.current.userData.physicsBody

    // Position centrée, plus proche du joueur
    const OPPONENT_Z = 1.5  // Position Z proche de la caméra
    const OPPONENT_Y = 3.5  // Hauteur du sac

    console.log(`[BoxingGym] Switching opponent: ${currentOpponentTypeRef.current} -> ${selectedOpponent}`)

    // === CLEANUP COMPLET via OpponentManager ===
    // 1. Supprimer l'ancien soft body si existant
    if (opponentRef.current.userData.physicsBody) {
      const oldBody = opponentRef.current.userData.physicsBody
      physicsWorld.removeSoftBody(oldBody)
      // Supprimer aussi des listes
      const idx = softBodiesList.findIndex(s => s.body === oldBody)
      if (idx !== -1) softBodiesList.splice(idx, 1)
      opponentRef.current.userData.physicsBody = null
    }

    // 2. Disposer l'ancienne géométrie (évite les fuites GPU)
    if (opponentRef.current.geometry) {
      opponentRef.current.geometry.dispose()
    }

    // 3. Nettoyer les cordes via OpponentManager pattern
    for (const { line, body } of ropeSoftBodies) {
      scene.remove(line)
      line.geometry.dispose()
      if (Array.isArray(line.material)) {
        line.material.forEach(m => m.dispose())
      } else {
        (line.material as THREE.Material).dispose()
      }
      physicsWorld.removeSoftBody(body)
    }
    ropeSoftBodies.length = 0

    // Pour 'multipart' et 'brickwall', on utilise des composants séparés
    if (selectedOpponent === 'multipart' || selectedOpponent === 'brickwall') {
      currentOpponentTypeRef.current = selectedOpponent
      console.log(`[BoxingGym] ${selectedOpponent} selected - using separate component`)
      return
    }

    let geometry: THREE.BufferGeometry
    let mass: number
    let ropeStartY: number

    if (selectedOpponent === 'sphere') {
      // Sac sphérique centré - résolution réduite pour performance (20×12 vs 40×25)
      const radius = 1.2
      geometry = new THREE.SphereGeometry(radius, 20, 12)
      geometry.translate(0, OPPONENT_Y, OPPONENT_Z)
      mass = 25
      ropeStartY = OPPONENT_Y + radius + 0.2
    } else if (selectedOpponent === 'box') {
      // Sac rectangulaire centré - résolution réduite (3×10×3 vs 4×16×4)
      geometry = new THREE.BoxGeometry(1, 4, 1, 3, 10, 3)
      geometry.translate(0, OPPONENT_Y, OPPONENT_Z)
      mass = 30
      ropeStartY = OPPONENT_Y + 2.0  // Moitié de la hauteur + marge
    } else if (selectedOpponent === 'fluffy') {
      // Fluffy - sphère plus grande et plus molle
      const radius = 1.5
      geometry = new THREE.SphereGeometry(radius, 24, 16)
      geometry.translate(0, OPPONENT_Y, OPPONENT_Z)
      mass = 20
      ropeStartY = OPPONENT_Y + radius + 0.2
    } else if (selectedOpponent === 'littlemac') {
      // Little Mac - ellipsoïde (tête ovale)
      const radiusX = 0.9
      const radiusY = 1.1  // Plus haut que large (tête)
      const radiusZ = 0.85
      geometry = new THREE.SphereGeometry(1, 24, 18)
      // Déformer en ellipsoïde
      const positions = geometry.attributes.position!.array as Float32Array
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] *= radiusX      // X
        positions[i + 1] *= radiusY  // Y
        positions[i + 2] *= radiusZ  // Z
      }
      geometry.attributes.position!.needsUpdate = true
      geometry.computeVertexNormals()
      geometry.translate(0, OPPONENT_Y, OPPONENT_Z)
      mass = 12
      ropeStartY = OPPONENT_Y + radiusY + 0.2
    } else {
      // Défaut: sphère
      const radius = 1.2
      geometry = new THREE.SphereGeometry(radius, 20, 12)
      geometry.translate(0, OPPONENT_Y, OPPONENT_Z)
      mass = 25
      ropeStartY = OPPONENT_Y + radius + 0.2
    }

    // Assigner la nouvelle géométrie
    opponentRef.current.geometry = geometry

    // Tracker la géométrie pour cleanup futur via OpponentManager
    OpponentManager.trackGeometry(geometry)

    // Créer le soft body avec la config physique du preset sélectionné
    const { softBody, topNodeIndex } = createSoftVolume(Ammo, opponentRef.current, geometry, mass, physicsConfig)

    // Créer la corde
    const rope = createRope(
      Ammo,
      scene,
      new THREE.Vector3(0, ROOM.height, OPPONENT_Z),
      new THREE.Vector3(0, ropeStartY, OPPONENT_Z),
      12,
      0.5
    )
    attachRopeToVolume(Ammo, rope.body, 12, ceilingBody, softBody, topNodeIndex)

    // Tracker la corde via OpponentManager
    OpponentManager.trackMesh(rope.line)

    currentOpponentTypeRef.current = selectedOpponent
    currentPhysicsPresetRef.current = selectedPhysicsPreset
    console.log(`[BoxingGym] Opponent created: ${selectedOpponent}, physics: ${selectedPhysicsPreset}`)
  }, [isReady, selectedOpponent, selectedPhysicsPreset, physicsConfig, scene])

  // Legacy: Créer les sacs de frappe Fluffy (gardé pour compatibilité avec CharacterSelector)
  useEffect(() => {
    if (!isReady || !ammoRef.current || !showFluffyBags) return
    if (!punchingBagRef.current || !boxBagRef.current || !ceilingRef.current) return
    if (fluffyInitializedRef.current) return

    fluffyInitializedRef.current = true
    const Ammo = ammoRef.current

    // Récupérer le body du plafond pour ancrage
    const ceilingBody = ceilingRef.current.userData.physicsBody

    // Sac de frappe sphérique - utilise la config physique du preset
    const bagRadius = 1.2
    const bagGeo = new THREE.SphereGeometry(bagRadius, 20, 12)  // Résolution réduite
    bagGeo.translate(-2.5, 4, 0)
    punchingBagRef.current.geometry = bagGeo
    const { softBody: bagSoftBody, topNodeIndex: bagTopNode } = createSoftVolume(Ammo, punchingBagRef.current, bagGeo, 25, physicsConfig)

    // Corde sphère
    const sphereRope = createRope(Ammo, scene, new THREE.Vector3(-2.5, ROOM.height, 0), new THREE.Vector3(-2.5, 5.2, 0), 12, 0.5)
    attachRopeToVolume(Ammo, sphereRope.body, 12, ceilingBody, bagSoftBody, bagTopNode)

    // Sac de frappe rectangulaire - utilise la config physique du preset
    const boxGeo = new THREE.BoxGeometry(1, 4, 1, 3, 10, 3)  // Résolution réduite
    boxGeo.translate(2.5, 4, 0)
    boxBagRef.current.geometry = boxGeo
    const { softBody: boxSoftBody, topNodeIndex: boxTopNode } = createSoftVolume(Ammo, boxBagRef.current, boxGeo, 30, physicsConfig)

    // Corde boîte
    const boxRope = createRope(Ammo, scene, new THREE.Vector3(2.5, ROOM.height, 0), new THREE.Vector3(2.5, 6, 0), 10, 0.5)
    attachRopeToVolume(Ammo, boxRope.body, 10, ceilingBody, boxSoftBody, boxTopNode)

    console.log('[BoxingGym] Fluffy soft bodies initialized')
  }, [isReady, showFluffyBags, scene])

  // Créer les gants de boxe comme KINEMATIC BODIES (pattern standard Ammo.js)
  // Ref: https://pybullet.org/Bullet/phpBB3/viewtopic.php?t=3997
  // Kinematic bodies: mass=0, CF_KINEMATIC_OBJECT flag, moved via motionState
  // SEULEMENT en mode kinematic - en mode physics, ArmPhysicsGloves gère tout
  useEffect(() => {
    if (!isReady || !ammoRef.current || selectedTool !== 'gloves') return
    if (glovePhysicsMode !== 'kinematic') return  // Skip si mode physics
    if (!leftGloveRef.current || !rightGloveRef.current) return
    if (glovesInitializedRef.current) return

    glovesInitializedRef.current = true
    const Ammo = ammoRef.current

    const gloveRadius = 0.4  // Rayon augmenté pour meilleure collision avec soft body
    // KINEMATIC: mass = 0, Bullet calcule la vélocité automatiquement
    const gloveMass = 0

    // Gant gauche - KINEMATIC BODY
    const leftShape = new Ammo.btSphereShape(gloveRadius)
    leftShape.setMargin(0.08)  // Marge augmentée pour soft body collision
    const leftBody = createRigidBody(
      Ammo,
      leftGloveRef.current,
      leftShape,
      gloveMass,
      new THREE.Vector3(-0.8, 3.0, 4),
      new THREE.Quaternion()
    )
    // CF_KINEMATIC_OBJECT = 2: permet mouvement via motionState, Bullet calcule vélocité
    leftBody.setCollisionFlags(leftBody.getCollisionFlags() | 2)
    // Activation state 4 = DISABLE_DEACTIVATION (kinematic bodies doivent rester actifs)
    leftBody.setActivationState(4)
    leftBody.setFriction(1.0)  // Friction élevée pour pousser le soft body
    leftBody.setRestitution(0.1)
    leftGloveBodyRef.current = leftBody

    // Gant droit - KINEMATIC BODY
    const rightShape = new Ammo.btSphereShape(gloveRadius)
    rightShape.setMargin(0.08)
    const rightBody = createRigidBody(
      Ammo,
      rightGloveRef.current,
      rightShape,
      gloveMass,
      new THREE.Vector3(0.8, 3.0, 4),
      new THREE.Quaternion()
    )
    rightBody.setCollisionFlags(rightBody.getCollisionFlags() | 2)
    rightBody.setActivationState(4)
    rightBody.setFriction(1.0)
    rightBody.setRestitution(0.1)
    rightGloveBodyRef.current = rightBody

    console.log('[BoxingGym] Boxing gloves initialized as KINEMATIC bodies')
  }, [isReady, selectedTool, glovePhysicsMode])

  // Réinitialiser les gants kinématiques quand on change de mode (tool ou physics mode)
  useEffect(() => {
    const shouldCleanup = (selectedTool !== 'gloves' || glovePhysicsMode !== 'kinematic') && glovesInitializedRef.current
    if (shouldCleanup) {
      // Supprimer les physics bodies quand on quitte le mode gants
      const Ammo = ammoRef.current
      if (Ammo && physicsWorld) {
        if (leftGloveBodyRef.current) {
          physicsWorld.removeRigidBody(leftGloveBodyRef.current)
          // Retirer de la liste
          const leftIdx = rigidBodiesList.findIndex(r => r.body === leftGloveBodyRef.current)
          if (leftIdx !== -1) rigidBodiesList.splice(leftIdx, 1)
          leftGloveBodyRef.current = null
        }
        if (rightGloveBodyRef.current) {
          physicsWorld.removeRigidBody(rightGloveBodyRef.current)
          const rightIdx = rigidBodiesList.findIndex(r => r.body === rightGloveBodyRef.current)
          if (rightIdx !== -1) rigidBodiesList.splice(rightIdx, 1)
          rightGloveBodyRef.current = null
        }
      }
      glovesInitializedRef.current = false
      console.log('[BoxingGym] Boxing gloves cleaned up (mode changed)')
    }
  }, [selectedTool, glovePhysicsMode])

  /**
   * Détermine le côté (gauche/droite) basé sur la position X de l'écran
   */
  const getSideFromScreenX = useCallback((normalizedX: number): 'left' | 'right' => {
    return normalizedX < 0 ? 'left' : 'right'
  }, [])

  /**
   * Démarre une animation de coup
   * OPTIMISÉ: mutation directe des refs, pas de setState
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
      if (!leftPunchAnimRef.current) {
        leftPunchAnimRef.current = newAnim
        console.log(`[Punch] Left ${punchType} started`)
      }
    } else {
      if (!rightPunchAnimRef.current) {
        rightPunchAnimRef.current = newAnim
        console.log(`[Punch] Right ${punchType} started`)
      }
    }
  }, []) // Pas de dépendances - mutation directe

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
      } else if (selectedTool === 'gloves' && glovePhysicsMode === 'kinematic') {
        // Mode gants KINEMATIC - déterminer le type de coup selon la zone
        // En mode physics, ArmPhysicsGloves gère ses propres clics
        const punchType = getPunchTypeFromScreenZone(normalizedY)
        const side = getSideFromScreenX(normalizedX)

        currentPunchTypeRef.current = punchType  // Mutation directe, pas de setState
        startPunch(side, punchType)
      }
    }

    // Pas besoin de handlePointerUp - les animations se terminent automatiquement

    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [selectedTool, glovePhysicsMode, getSideFromScreenX, startPunch])

  // Consommer les coups en attente (déclenchés par UI) - KINEMATIC seulement
  // En mode physics, ArmPhysicsGloves consomme les punches
  useEffect(() => {
    if (queuedPunch && selectedTool === 'gloves' && glovePhysicsMode === 'kinematic') {
      const punch = consumeQueuedPunch()
      if (punch) {
        console.log(`[Punch] UI triggered ${punch.hand} ${punch.type}`)
        startPunch(punch.hand, punch.type)
      }
    }
  }, [queuedPunch, selectedTool, glovePhysicsMode, consumeQueuedPunch, startPunch])

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

  /**
   * Mise à jour d'une animation de coup
   * Écrit la position dans outVec, retourne true si animation active
   * OPTIMISÉ: mutation directe de la ref, pas de setState
   */
  const updatePunchAnimation = useCallback((
    animRef: React.MutableRefObject<PunchAnimation | null>,
    outVec: THREE.Vector3
  ): boolean => {
    const anim = animRef.current
    if (!anim) return false

    const config = PUNCH_CONFIGS[anim.type]
    const currentTime = performance.now() / 1000
    const elapsed = currentTime - anim.startTime
    const progress = Math.min(elapsed / config.duration, 1)

    // Animation terminée - mutation directe de la ref
    if (progress >= 1) {
      animRef.current = null
      return false
    }

    // Calculer la position via la trajectoire (écrit dans outVec)
    config.trajectory(progress, anim.side, outVec)
    return true
  }, [])

  // Transform réutilisable pour Ammo (créé une seule fois)
  const gloveTransformRef = useRef<any>(null)

  // btVector3 réutilisable pour les positions
  const btOriginRef = useRef<any>(null)

  // Initialiser les objets Ammo réutilisables
  useEffect(() => {
    if (ammoRef.current && !gloveTransformRef.current) {
      const Ammo = ammoRef.current
      gloveTransformRef.current = new Ammo.btTransform()
      btOriginRef.current = new Ammo.btVector3(0, 0, 0)
    }
  }, [isReady])

  /**
   * Positionner un gant KINEMATIC avec Ammo.js
   * Pattern standard: seulement getMotionState().setWorldTransform()
   * Bullet calcule automatiquement la vélocité du delta de position
   * Ref: Bullet Physics Manual - "Kinematic rigidbodies"
   */
  const setGlovePosition = useCallback((
    body: any,
    targetPos: THREE.Vector3,
    _lastPos: React.MutableRefObject<THREE.Vector3>,  // Non utilisé pour kinematic
    _deltaTime: number,  // Non utilisé pour kinematic
    mesh?: THREE.Mesh | null  // Mesh à synchroniser (kinematic bodies ne sont pas dans rigidBodiesList)
  ) => {
    if (!body || !ammoRef.current || !gloveTransformRef.current || !btOriginRef.current) return

    // Pour KINEMATIC bodies: utiliser SEULEMENT motionState.setWorldTransform()
    // Bullet calcule automatiquement la vélocité basée sur le changement de position
    const transform = gloveTransformRef.current
    transform.setIdentity()
    btOriginRef.current.setValue(targetPos.x, targetPos.y, targetPos.z)
    transform.setOrigin(btOriginRef.current)

    // KINEMATIC: seulement motionState - pas setWorldTransform direct
    body.getMotionState().setWorldTransform(transform)

    // Synchroniser le mesh manuellement (kinematic bodies avec mass=0 ne sont pas dans rigidBodiesList)
    if (mesh) {
      mesh.position.set(targetPos.x, targetPos.y, targetPos.z)
    }
  }, [])

  /**
   * Retour progressif vers la position de repos - MODE KINÉMATIQUE
   */
  const returnToRestPosition = useCallback((
    body: any,
    restPos: THREE.Vector3,
    lastPos: React.MutableRefObject<THREE.Vector3>,
    deltaTime: number = 1/60,
    mesh?: THREE.Mesh | null
  ) => {
    // Réutiliser setGlovePosition avec la position de repos comme cible
    setGlovePosition(body, restPos, lastPos, deltaTime, mesh)
  }, [setGlovePosition])

  /**
   * Appliquer une impulsion au soft body selon le preset physique
   */
  const applySoftBodyImpact = useCallback((
    impactPos: THREE.Vector3,
    impactDir: THREE.Vector3,
    strength: number
  ) => {
    if (!ammoRef.current || softBodiesList.length === 0) return

    // Trouver le soft body de l'adversaire
    const opponentSoftBody = softBodiesList[0]?.body
    if (!opponentSoftBody) return

    const nodes = opponentSoftBody.get_m_nodes()
    const numNodes = nodes.size()

    // Utiliser les paramètres d'impact du preset physique
    const impulseStrength = strength * physicsConfig.impulseMultiplier
    const impulseRadius = physicsConfig.impulseRadius

    for (let i = 0; i < numNodes; i++) {
      const node = nodes.at(i)
      const nodePos = node.get_m_x()

      const dx = nodePos.x() - impactPos.x
      const dy = nodePos.y() - impactPos.y
      const dz = nodePos.z() - impactPos.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

      if (dist < impulseRadius) {
        const falloff = Math.pow(1 - dist / impulseRadius, 2)
        const velocity = node.get_m_v()
        velocity.setX(velocity.x() + impactDir.x * impulseStrength * falloff)
        velocity.setY(velocity.y() + impactDir.y * impulseStrength * falloff)
        velocity.setZ(velocity.z() + impactDir.z * impulseStrength * falloff)
      }
    }
  }, [physicsConfig])

  /**
   * Obtenir la position actuelle d'un gant (écrit dans outVec pour éviter allocation)
   */
  const getGlovePosition = useCallback((body: any, outVec: THREE.Vector3): void => {
    if (!body || !ammoRef.current || !gloveTransformRef.current) {
      outVec.set(0, 0, 0)
      return
    }
    const transform = gloveTransformRef.current
    body.getMotionState().getWorldTransform(transform)
    const origin = transform.getOrigin()
    outVec.set(origin.x(), origin.y(), origin.z())
  }, [])

  /**
   * Met à jour la couleur du matériau d'un gant selon l'animation
   * Mutation directe du material, pas de re-render React
   */
  const updateGloveMaterial = useCallback((
    mesh: THREE.Mesh | null,
    anim: PunchAnimation | null
  ) => {
    if (!mesh) return
    const material = mesh.material as THREE.MeshStandardMaterial
    if (!material) return

    if (anim) {
      // Animation active - couleur selon type de coup
      const color = anim.type === 'jab' ? GLOVE_COLORS.jab
        : anim.type === 'hook' ? GLOVE_COLORS.hook
        : GLOVE_COLORS.uppercut
      material.color.copy(color)
      material.emissive.copy(GLOVE_COLORS.emissiveActive)
      material.emissiveIntensity = 0.5
    } else {
      // Au repos
      material.color.copy(GLOVE_COLORS.rest)
      material.emissive.copy(GLOVE_COLORS.emissiveRest)
      material.emissiveIntensity = 0
    }
  }, [GLOVE_COLORS])

  // Mise à jour des gants de boxe avec animations - OPTIMISÉ sans re-renders
  // Lecture directe des refs, pas de dépendances React sur les animations
  // Mise à jour des gants KINEMATIC seulement
  // En mode physics, ArmPhysicsGloves gère tout via son propre useFrame
  const updateGloves = useCallback((deltaTime: number) => {
    if (!ammoRef.current || selectedTool !== 'gloves' || glovePhysicsMode !== 'kinematic') return

    const leftBody = leftGloveBodyRef.current
    const rightBody = rightGloveBodyRef.current
    if (!leftBody || !rightBody) return

    // Mettre à jour animation gant gauche (écrit directement dans leftTargetPos)
    const leftAnimActive = updatePunchAnimation(leftPunchAnimRef, leftTargetPos)

    // Mettre à jour couleur gant gauche (mutation directe)
    updateGloveMaterial(leftGloveRef.current, leftPunchAnimRef.current)

    if (leftAnimActive) {
      setGlovePosition(leftBody, leftTargetPos, lastLeftPos, deltaTime, leftGloveRef.current)

      // Détecter impact gant gauche - double vérification:
      // 1. Distance au centre de l'adversaire
      // 2. OU traversée de la zone Z (anti-tunneling)
      const distToOpponent = leftTargetPos.distanceTo(OPPONENT_CENTER)
      const inImpactZone = distToOpponent < IMPACT_THRESHOLD || leftTargetPos.z < IMPACT_Z_THRESHOLD

      if (inImpactZone && !leftImpactTriggeredRef.current) {
        leftImpactTriggeredRef.current = true

        // Calculer direction d'impact (vers l'adversaire)
        reusableVec3_2.subVectors(OPPONENT_CENTER, leftTargetPos).normalize()

        // Queue effets visuels + score (traités hors useFrame pour éviter re-renders)
        pendingImpactsRef.current.push({
          pos: [leftTargetPos.x, leftTargetPos.y, leftTargetPos.z],
          strength: 0.8 + Math.random() * 0.2
        })
        pendingHitsRef.current++

        // Appliquer impulsion au soft body
        applySoftBodyImpact(leftTargetPos, reusableVec3_2, 1.2)
      }
    } else {
      // Retour vers position de repos
      returnToRestPosition(leftBody, LEFT_REST_POS, lastLeftPos, deltaTime, leftGloveRef.current)
      leftImpactTriggeredRef.current = false
    }

    // Mettre à jour animation gant droit (écrit directement dans rightTargetPos)
    const rightAnimActive = updatePunchAnimation(rightPunchAnimRef, rightTargetPos)

    // Mettre à jour couleur gant droit (mutation directe)
    updateGloveMaterial(rightGloveRef.current, rightPunchAnimRef.current)

    if (rightAnimActive) {
      setGlovePosition(rightBody, rightTargetPos, lastRightPos, deltaTime, rightGloveRef.current)

      // Détecter impact gant droit - double vérification:
      // 1. Distance au centre de l'adversaire
      // 2. OU traversée de la zone Z (anti-tunneling)
      const distToOpponent = rightTargetPos.distanceTo(OPPONENT_CENTER)
      const inImpactZone = distToOpponent < IMPACT_THRESHOLD || rightTargetPos.z < IMPACT_Z_THRESHOLD

      if (inImpactZone && !rightImpactTriggeredRef.current) {
        rightImpactTriggeredRef.current = true

        // Calculer direction d'impact (vers l'adversaire)
        reusableVec3_2.subVectors(OPPONENT_CENTER, rightTargetPos).normalize()

        // Queue effets visuels + score (traités hors useFrame pour éviter re-renders)
        pendingImpactsRef.current.push({
          pos: [rightTargetPos.x, rightTargetPos.y, rightTargetPos.z],
          strength: 0.8 + Math.random() * 0.2
        })
        pendingHitsRef.current++

        // Appliquer impulsion au soft body
        applySoftBodyImpact(rightTargetPos, reusableVec3_2, 1.2)
      }
    } else {
      // Retour vers position de repos
      returnToRestPosition(rightBody, RIGHT_REST_POS, lastRightPos, deltaTime, rightGloveRef.current)
      rightImpactTriggeredRef.current = false
    }
  }, [
    selectedTool,
    glovePhysicsMode,
    // PAS de leftPunchAnim/rightPunchAnim - lecture directe des refs
    updatePunchAnimation,
    updateGloveMaterial,
    setGlovePosition,
    returnToRestPosition,
    LEFT_REST_POS,
    RIGHT_REST_POS,
    leftTargetPos,
    rightTargetPos,
    reusableVec3_2,
    applySoftBodyImpact,
    OPPONENT_CENTER,
    IMPACT_THRESHOLD
  ])

  // Performance monitoring
  const perfRef = useRef({ frameCount: 0, lastLog: 0, slowFrames: 0 })

  useFrame((_, delta) => {
    if (!isReady) return

    const perf = perfRef.current
    const frameStart = performance.now()

    // 1. Simulation physique
    const t1 = performance.now()
    updatePhysics(delta)
    const physicsTime = performance.now() - t1

    // 2. Traitement des clics (lancer de balles)
    const t2 = performance.now()
    processClick()
    const clickTime = performance.now() - t2

    // 3. Animation et collision des gants
    const t3 = performance.now()
    updateGloves(delta)
    const glovesTime = performance.now() - t3

    // 4. Traitement des impacts en attente (scores, effets visuels)
    const t4 = performance.now()
    processImpactQueue()
    const impactTime = performance.now() - t4

    const totalTime = performance.now() - frameStart

    // Log si frame lent (> 16ms = < 60fps)
    perf.frameCount++
    if (totalTime > 16) {
      perf.slowFrames++
      console.warn(
        `[Slow Frame] total:${totalTime.toFixed(1)}ms | ` +
        `physics:${physicsTime.toFixed(1)}ms | ` +
        `gloves:${glovesTime.toFixed(1)}ms | ` +
        `impacts:${impactTime.toFixed(1)}ms | ` +
        `delta:${(delta * 1000).toFixed(0)}ms`
      )
    }

    // Log résumé toutes les 5 secondes
    const now = performance.now()
    if (now - perf.lastLog > 5000) {
      console.log(
        `[Perf] ${perf.frameCount} frames, ${perf.slowFrames} slow (${((perf.slowFrames / perf.frameCount) * 100).toFixed(1)}%)`
      )
      perf.frameCount = 0
      perf.slowFrames = 0
      perf.lastLog = now
    }
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

      {/* === ADVERSAIRE CENTRÉ (Soft Body) === */}
      {selectedOpponent !== 'multipart' && selectedOpponent !== 'brickwall' && (
        <mesh ref={opponentRef} frustumCulled={false} castShadow receiveShadow>
          {/* Geometry sera remplacée dynamiquement selon le type */}
          <sphereGeometry args={[1.2, 40, 25]} />
          <meshStandardMaterial
            key={opponentTexture ? 'textured' : 'solid'}
            map={opponentTexture}
            color={opponentTexture ? 0xffffff : (
              selectedOpponent === 'sphere' ? 0xcc2222
              : selectedOpponent === 'box' ? 0x22cc22
              : selectedOpponent === 'fluffy' ? 0xff69b4
              : selectedOpponent === 'littlemac' ? 0x44bb44
              : 0xcc2222
            )}
            roughness={selectedOpponent === 'littlemac' ? 0.6 : 0.4}
            transparent={!!opponentTexture}
            alphaTest={0.01}
          />
        </mesh>
      )}

      {/* === ADVERSAIRE MULTI-PARTIES === */}
      {selectedOpponent === 'multipart' && <MultiPartOpponent />}

      {/* === ADVERSAIRE MUR DE BRIQUES === */}
      {selectedOpponent === 'brickwall' && <BrickWallOpponent />}

      {/* === ADVERSAIRES LEGACY (Fluffy) === */}
      {/* FLUFFY - Sacs de frappe soft body (gardé pour compatibilité CharacterSelector) */}
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
      {/* Mode 'physics': Bras articulés avec muscles-ressorts */}
      {selectedTool === 'gloves' && glovePhysicsMode === 'physics' && (
        <ArmPhysicsGloves />
      )}

      {/* Mode 'kinematic': Gants animés manuellement (ancien système) */}
      {selectedTool === 'gloves' && glovePhysicsMode === 'kinematic' && (
        <>
          {/* Gant gauche - rayon 0.4 pour correspondre au physics body KINEMATIC */}
          <mesh ref={leftGloveRef} position={[-0.8, 3.0, 4]} castShadow>
            <sphereGeometry args={[0.4, 16, 16]} />
            <meshStandardMaterial
              color={0xcc0000}
              roughness={0.4}
              metalness={0.1}
              emissive={0x000000}
              emissiveIntensity={0}
            />
          </mesh>
          {/* Gant droit - rayon 0.4 pour correspondre au physics body KINEMATIC */}
          <mesh ref={rightGloveRef} position={[0.8, 3.0, 4]} castShadow>
            <sphereGeometry args={[0.4, 16, 16]} />
            <meshStandardMaterial
              color={0xcc0000}
              roughness={0.4}
              metalness={0.1}
              emissive={0x000000}
              emissiveIntensity={0}
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

      {/* === EFFETS D'IMPACT === */}
      <ImpactEffects />
    </group>
  )
}

export default AmmoVolumeDemo
