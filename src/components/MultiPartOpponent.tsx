import { useRef, useEffect, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useControls, folder } from 'leva'
import { useAmmoPhysics, SoftBodyState } from '../hooks/useAmmoPhysics'
import { useImpactListener } from '../hooks/useImpactListener'

/**
 * Configuration du personnage multi-parties
 */
const CHARACTER_CONFIG = {
  // Position globale
  baseY: 3.0,
  baseZ: 1.5,

  // Tête (ellipsoïde)
  head: {
    radiusX: 0.7,
    radiusY: 0.85,
    radiusZ: 0.65,
    offsetY: 2.0,  // Hauteur au-dessus de la base
    mass: 8,
    pressure: 300,
    resolution: 16,
  },

  // Cou (rope)
  neck: {
    length: 0.5,
    segments: 6,
    mass: 0.3,
  },

  // Torse (capsule/cylindre soft body)
  torso: {
    radiusX: 0.6,
    radiusY: 1.0,
    radiusZ: 0.4,
    offsetY: 0.5,
    mass: 15,
    pressure: 250,
    resolution: 14,
  },

  // Joints (rigid bodies invisibles)
  joints: {
    neckTop: { size: 0.1 },    // Connecte cou ↔ tête
    neckBottom: { size: 0.1 }, // Connecte cou ↔ torse
  },
}

/**
 * Interface pour l'état du personnage
 */
interface CharacterParts {
  head: SoftBodyState | null
  torso: SoftBodyState | null
  neckRope: { softBody: any; numSegments: number } | null
}

/**
 * MultiPartOpponent - Personnage avec plusieurs soft bodies connectés
 * Architecture:
 *   [HEAD ellipsoid] ←anchor→ [NECK_TOP rigid] ←rope→ [NECK_BOTTOM rigid] ←anchor→ [TORSO]
 */
export function MultiPartOpponent() {
  // Refs pour les meshes Three.js
  const headMeshRef = useRef<THREE.Mesh>(null)
  const torsoMeshRef = useRef<THREE.Mesh>(null)
  const neckLineRef = useRef<THREE.Line>(null)

  // State pour les parties du personnage
  const partsRef = useRef<CharacterParts>({
    head: null,
    torso: null,
    neckRope: null,
  })

  const [isInitialized, setIsInitialized] = useState(false)
  const initAttemptedRef = useRef(false)

  // Hook Ammo.js
  const {
    isReady,
    ammo,
    createEllipsoid,
    syncEllipsoidToMesh,
    createRope,
    createRigidBody,
    anchorSoftBodyToRigid,
    findExtremeNodes,
    updatePhysics,
    applySoftBodyImpulse,
    removeSoftBody,
    removeRigidBody,
  } = useAmmoPhysics()


  // Contrôles Leva
  const controls = useControls('Multi-Part Character', {
    head: folder({
      headPressure: { value: CHARACTER_CONFIG.head.pressure, min: 100, max: 500, step: 10 },
      headMass: { value: CHARACTER_CONFIG.head.mass, min: 1, max: 20, step: 1 },
    }, { collapsed: true }),
    torso: folder({
      torsoPressure: { value: CHARACTER_CONFIG.torso.pressure, min: 100, max: 400, step: 10 },
      torsoMass: { value: CHARACTER_CONFIG.torso.mass, min: 5, max: 30, step: 1 },
    }, { collapsed: true }),
    colors: folder({
      headColor: { value: '#44bb44' },  // Vert Little Mac
      torsoColor: { value: '#222222' }, // Noir (débardeur)
      neckColor: { value: '#ddaa88' },  // Couleur peau
    }, { collapsed: true }),
  })

  // Géométries
  const headGeometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(1, CHARACTER_CONFIG.head.resolution, CHARACTER_CONFIG.head.resolution)
    const positions = geo.attributes.position!.array as Float32Array
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] *= CHARACTER_CONFIG.head.radiusX
      positions[i + 1] *= CHARACTER_CONFIG.head.radiusY
      positions[i + 2] *= CHARACTER_CONFIG.head.radiusZ
    }
    geo.attributes.position!.needsUpdate = true
    geo.computeVertexNormals()
    return geo
  }, [])

  const torsoGeometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(1, CHARACTER_CONFIG.torso.resolution, CHARACTER_CONFIG.torso.resolution)
    const positions = geo.attributes.position!.array as Float32Array
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] *= CHARACTER_CONFIG.torso.radiusX
      positions[i + 1] *= CHARACTER_CONFIG.torso.radiusY
      positions[i + 2] *= CHARACTER_CONFIG.torso.radiusZ
    }
    geo.attributes.position!.needsUpdate = true
    geo.computeVertexNormals()
    return geo
  }, [])

  // Initialisation du personnage multi-parties
  useEffect(() => {
    if (!isReady || !ammo || initAttemptedRef.current) return
    if (!headMeshRef.current || !torsoMeshRef.current) return
    initAttemptedRef.current = true

    console.log('[MultiPart] Creating multi-part character...')

    const baseY = CHARACTER_CONFIG.baseY
    const baseZ = CHARACTER_CONFIG.baseZ

    // === 1. CRÉER LE TORSE (soft body ellipsoïde) ===
    const torsoCenter = new THREE.Vector3(0, baseY + CHARACTER_CONFIG.torso.offsetY, baseZ)
    const torsoResult = createEllipsoid({
      center: torsoCenter,
      radius: new THREE.Vector3(
        CHARACTER_CONFIG.torso.radiusX,
        CHARACTER_CONFIG.torso.radiusY,
        CHARACTER_CONFIG.torso.radiusZ
      ),
      resolution: CHARACTER_CONFIG.torso.resolution,
      mass: controls.torsoMass,
      pressure: controls.torsoPressure,
    })

    if (!torsoResult) {
      console.error('[MultiPart] Failed to create torso')
      return
    }

    const torsoState = syncEllipsoidToMesh(
      torsoResult.softBody,
      torsoMeshRef.current,
      torsoResult.numNodes
    )
    partsRef.current.torso = torsoState

    // Trouver le node du haut du torse
    const torsoExtremes = findExtremeNodes(torsoResult.softBody)
    console.log('[MultiPart] Torso created, top node:', torsoExtremes.topNode)

    // === 2. CRÉER LA TÊTE (soft body ellipsoïde) ===
    const headY = baseY + CHARACTER_CONFIG.torso.offsetY +
                  CHARACTER_CONFIG.torso.radiusY +
                  CHARACTER_CONFIG.neck.length +
                  CHARACTER_CONFIG.head.radiusY
    const headCenter = new THREE.Vector3(0, headY, baseZ)

    const headResult = createEllipsoid({
      center: headCenter,
      radius: new THREE.Vector3(
        CHARACTER_CONFIG.head.radiusX,
        CHARACTER_CONFIG.head.radiusY,
        CHARACTER_CONFIG.head.radiusZ
      ),
      resolution: CHARACTER_CONFIG.head.resolution,
      mass: controls.headMass,
      pressure: controls.headPressure,
    })

    if (!headResult) {
      console.error('[MultiPart] Failed to create head')
      return
    }

    const headState = syncEllipsoidToMesh(
      headResult.softBody,
      headMeshRef.current,
      headResult.numNodes
    )
    partsRef.current.head = headState

    // Trouver le node du bas de la tête
    const headExtremes = findExtremeNodes(headResult.softBody)
    console.log('[MultiPart] Head created, bottom node:', headExtremes.bottomNode)

    // === 3. CRÉER LES JOINTS RIGIDES (invisibles) ===
    // Joint du haut du cou (connecté à la tête)
    const neckTopY = headY - CHARACTER_CONFIG.head.radiusY - 0.05
    const neckTopJoint = createRigidBody({
      id: 'multipart-neck-top',
      shape: 'sphere',
      size: CHARACTER_CONFIG.joints.neckTop.size,
      position: new THREE.Vector3(0, neckTopY, baseZ),
      mass: 0.1, // Très léger
      disableGravity: true,
    })

    // Joint du bas du cou (connecté au torse)
    const neckBottomY = baseY + CHARACTER_CONFIG.torso.offsetY + CHARACTER_CONFIG.torso.radiusY + 0.05
    const neckBottomJoint = createRigidBody({
      id: 'multipart-neck-bottom',
      shape: 'sphere',
      size: CHARACTER_CONFIG.joints.neckBottom.size,
      position: new THREE.Vector3(0, neckBottomY, baseZ),
      mass: 0.1,
      disableGravity: true,
    })

    if (!neckTopJoint || !neckBottomJoint) {
      console.error('[MultiPart] Failed to create neck joints')
      return
    }

    // === 4. CRÉER LA CORDE DU COU ===
    const ropeResult = createRope({
      start: new THREE.Vector3(0, neckTopY, baseZ),
      end: new THREE.Vector3(0, neckBottomY, baseZ),
      numSegments: CHARACTER_CONFIG.neck.segments,
      mass: CHARACTER_CONFIG.neck.mass,
      fixStart: false, // Sera ancré au joint
      fixEnd: false,
    })

    if (!ropeResult) {
      console.error('[MultiPart] Failed to create neck rope')
      return
    }

    partsRef.current.neckRope = ropeResult
    console.log('[MultiPart] Neck rope created')

    // === 5. CONNECTER TOUT ENSEMBLE ===
    // Tête ←→ Joint haut du cou
    anchorSoftBodyToRigid(headResult.softBody, headExtremes.bottomNode, neckTopJoint.rigidBody, true, 1.0)

    // Rope ←→ Joint haut (premier node de la corde)
    anchorSoftBodyToRigid(ropeResult.softBody, 0, neckTopJoint.rigidBody, true, 1.0)

    // Rope ←→ Joint bas (dernier node de la corde)
    anchorSoftBodyToRigid(ropeResult.softBody, CHARACTER_CONFIG.neck.segments, neckBottomJoint.rigidBody, true, 1.0)

    // Torse ←→ Joint bas du cou
    anchorSoftBodyToRigid(torsoResult.softBody, torsoExtremes.topNode, neckBottomJoint.rigidBody, true, 1.0)

    console.log('[MultiPart] All parts connected!')
    setIsInitialized(true)

    return () => {
      // Cleanup
      if (partsRef.current.head) removeSoftBody(partsRef.current.head)
      if (partsRef.current.torso) removeSoftBody(partsRef.current.torso)
      removeRigidBody('multipart-neck-top')
      removeRigidBody('multipart-neck-bottom')
      partsRef.current = { head: null, torso: null, neckRope: null }
      initAttemptedRef.current = false
      setIsInitialized(false)
    }
  }, [isReady, ammo, createEllipsoid, syncEllipsoidToMesh, createRope, createRigidBody,
      anchorSoftBodyToRigid, findExtremeNodes, removeSoftBody, removeRigidBody,
      controls.headMass, controls.headPressure, controls.torsoMass, controls.torsoPressure])

  // Traiter les impacts via callback (pas de re-render React)
  useImpactListener((impact) => {
    if (!partsRef.current.head) return

    // Appliquer l'impact sur la tête ou le torse selon la position Y
    const hitY = impact.hitPoint[1]
    const targetPart = hitY > 0.3 ? partsRef.current.head : partsRef.current.torso

    if (targetPart) {
      const hitPosition = new THREE.Vector3(
        impact.hitPoint[0] * 0.8,
        CHARACTER_CONFIG.baseY + CHARACTER_CONFIG.head.offsetY + impact.hitPoint[1] * 0.8,
        CHARACTER_CONFIG.baseZ + impact.hitPoint[2] * 0.6
      )

      const force = new THREE.Vector3(
        -impact.hitPoint[0] * 10,
        -impact.hitPoint[1] * 3,
        -impact.strength * 25
      )

      applySoftBodyImpulse(targetPart, hitPosition, force, 0.5)
      console.log(`[MultiPart] Impact on ${hitY > 0.3 ? 'head' : 'torso'}!`)
    }
  })

  // Mise à jour de la corde (synchroniser la Line avec les nodes)
  useFrame((_, delta) => {
    if (!isInitialized) return

    updatePhysics(delta)

    // Mettre à jour la visualisation de la corde
    if (partsRef.current.neckRope && neckLineRef.current) {
      const { softBody, numSegments } = partsRef.current.neckRope
      const nodes = softBody.get_m_nodes()
      const positions = neckLineRef.current.geometry.attributes.position!.array as Float32Array

      for (let i = 0; i <= numSegments; i++) {
        const nodePos = nodes.at(i).get_m_x()
        positions[i * 3] = nodePos.x()
        positions[i * 3 + 1] = nodePos.y()
        positions[i * 3 + 2] = nodePos.z()
      }

      neckLineRef.current.geometry.attributes.position!.needsUpdate = true
    }
  })

  // Points initiaux pour la ligne du cou
  const neckLinePoints = useMemo(() => {
    const points: number[] = []
    for (let i = 0; i <= CHARACTER_CONFIG.neck.segments; i++) {
      points.push(0, 0, 0)
    }
    return new Float32Array(points)
  }, [])

  // Placeholder pendant le chargement
  if (!isReady) {
    return (
      <group position={[0, CHARACTER_CONFIG.baseY, CHARACTER_CONFIG.baseZ]}>
        <mesh position={[0, 2, 0]}>
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshBasicMaterial color="#888" wireframe />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.4, 0.5, 1.5, 8]} />
          <meshBasicMaterial color="#888" wireframe />
        </mesh>
      </group>
    )
  }

  return (
    <group>
      {/* Tête */}
      <mesh ref={headMeshRef} frustumCulled={false}>
        <primitive object={headGeometry} attach="geometry" />
        <meshStandardMaterial
          color={controls.headColor}
          roughness={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Torse */}
      <mesh ref={torsoMeshRef} frustumCulled={false}>
        <primitive object={torsoGeometry} attach="geometry" />
        <meshStandardMaterial
          color={controls.torsoColor}
          roughness={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Cou (ligne) */}
      <line ref={neckLineRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={CHARACTER_CONFIG.neck.segments + 1}
            array={neckLinePoints}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={controls.neckColor} linewidth={3} />
      </line>

      {/* Debug: afficher les joints si non initialisé */}
      {!isInitialized && (
        <>
          <mesh position={[0, CHARACTER_CONFIG.baseY + 3, CHARACTER_CONFIG.baseZ]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshBasicMaterial color="red" />
          </mesh>
          <mesh position={[0, CHARACTER_CONFIG.baseY + 1.5, CHARACTER_CONFIG.baseZ]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshBasicMaterial color="blue" />
          </mesh>
        </>
      )}
    </group>
  )
}

export default MultiPartOpponent
