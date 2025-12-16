import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { useControls, folder } from 'leva'
import { useAmmoPhysics, SoftBodyState, COLLISION_GROUPS } from '../hooks/useAmmoPhysics'
import { useImpactStore, useGameStore } from '../stores'

/**
 * Configuration du sac de frappe
 */
const BAG_CONFIG = {
  // Géométrie (comme l'exemple three.js)
  radius: 1.0,
  widthSegments: 40,
  heightSegments: 25,

  // Physique soft body - pression TRÈS élevée pour garder la forme
  mass: 10,
  pressure: 350, // Très haute pour éviter les déformations excessives

  // Ancrage
  anchorHeight: 2.0,
  anchorYThreshold: 0.95,
}

/**
 * Sac de frappe - Soft body Ammo.js avec ancrage souple
 */
export function FluffyOpponent() {
  const meshRef = useRef<THREE.Mesh>(null)
  const softBodyStateRef = useRef<SoftBodyState | null>(null)
  const initAttemptedRef = useRef(false)
  const lastImpactIdRef = useRef<number>(-1)
  const anchorNodeRef = useRef<number>(0)
  const anchorRigidBodyRef = useRef<any>(null)

  const [isInitialized, setIsInitialized] = useState(false)
  const [ropeEndPos, setRopeEndPos] = useState<[number, number, number]>([0, BAG_CONFIG.anchorHeight, 0])

  // Hook ammo.js
  const {
    isReady,
    ammo,
    createSoftVolume,
    createRigidBody,
    updatePhysics,
    applySoftBodyImpulse,
    removeSoftBody,
    removeRigidBody,
  } = useAmmoPhysics()

  // Stores
  const impacts = useImpactStore((s) => s.impacts)
  const opponentHp = useGameStore((s) => s.opponentHp)

  // Contrôles Leva
  const controls = useControls('Punching Bag', {
    physics: folder({
      pressure: { value: BAG_CONFIG.pressure, min: 100, max: 400, step: 10 },
      mass: { value: BAG_CONFIG.mass, min: 5, max: 50, step: 5 },
    }, { collapsed: true }),
    appearance: folder({
      color: { value: '#cc3333' },
    }, { collapsed: true }),
  })

  // Géométrie
  const geometry = useMemo(() => {
    return new THREE.SphereGeometry(
      BAG_CONFIG.radius,
      BAG_CONFIG.widthSegments,
      BAG_CONFIG.heightSegments
    )
  }, [])

  /**
   * Trouver les nodes à ancrer (pôle nord de la sphère)
   */
  const findAnchorNodes = useCallback((geo: THREE.BufferGeometry): number[] => {
    const positions = geo.attributes.position.array
    const numVertices = positions.length / 3
    const anchorNodes: number[] = []

    for (let i = 0; i < numVertices; i++) {
      const y = positions[i * 3 + 1] ?? 0
      const normalizedY = y / BAG_CONFIG.radius
      if (normalizedY > BAG_CONFIG.anchorYThreshold) {
        anchorNodes.push(i)
      }
    }

    if (anchorNodes.length > 0) {
      anchorNodeRef.current = anchorNodes[0]!
    }

    return anchorNodes
  }, [])

  /**
   * Ancrer les nodes avec appendAnchor (ancrage souple)
   */
  const anchorToRigidBody = useCallback((
    softBodyState: SoftBodyState,
    anchorNodes: number[],
    rigidBody: any
  ) => {
    if (!ammo) return

    const { softBody } = softBodyState

    console.log(`[Bag] Soft-anchoring ${anchorNodes.length} nodes to rigid body`)

    // appendAnchor(nodeIndex, rigidBody, disableCollision, influence)
    // influence = 1.0 = fully attached
    for (const nodeIdx of anchorNodes) {
      softBody.appendAnchor(nodeIdx, rigidBody, true, 1.0)
    }
  }, [ammo])

  // Initialiser le soft body
  useEffect(() => {
    if (!isReady || !meshRef.current || initAttemptedRef.current) return
    initAttemptedRef.current = true

    console.log('[Bag] Creating punching bag with soft anchor...')

    // 1. Créer un rigid body statique au plafond (point d'ancrage)
    const anchorBody = createRigidBody({
      id: 'bag-anchor',
      shape: 'sphere',
      size: 0.1,
      position: new THREE.Vector3(0, BAG_CONFIG.anchorHeight, 0),
      mass: 0, // Statique
      collisionGroup: COLLISION_GROUPS.STATIC,
      collisionMask: 0, // Ne collisionne avec rien
    })

    if (!anchorBody) {
      console.error('[Bag] Failed to create anchor rigid body')
      return
    }

    anchorRigidBodyRef.current = anchorBody.rigidBody

    // 2. Cloner et préparer la géométrie
    const clonedGeometry = geometry.clone()
    if (!clonedGeometry.index) {
      console.error('[Bag] Geometry must have indices')
      return
    }

    // Trouver les anchor nodes AVANT translation
    const anchorNodes = findAnchorNodes(clonedGeometry)
    console.log('[Bag] Anchor nodes found:', anchorNodes.length)

    // Translater la géométrie pour que le haut soit au niveau de l'ancrage
    const hangPosition = BAG_CONFIG.anchorHeight - BAG_CONFIG.radius
    clonedGeometry.translate(0, hangPosition, 0)

    meshRef.current.geometry = clonedGeometry

    // 3. Créer le soft body
    const state = createSoftVolume(clonedGeometry, meshRef.current, {
      mass: controls.mass,
      pressure: controls.pressure,
      disableGravity: false,
    })

    if (state) {
      softBodyStateRef.current = state

      // 4. Ancrer les nodes du haut au rigid body (ancrage souple)
      anchorToRigidBody(state, anchorNodes, anchorBody.rigidBody)

      setIsInitialized(true)
      console.log('[Bag] Ready with soft anchor!')
    }

    return () => {
      if (softBodyStateRef.current) {
        removeSoftBody(softBodyStateRef.current)
        softBodyStateRef.current = null
      }
      removeRigidBody('bag-anchor')
      anchorRigidBodyRef.current = null
      initAttemptedRef.current = false
      setIsInitialized(false)
    }
  }, [isReady, geometry, createSoftVolume, createRigidBody, removeSoftBody, removeRigidBody, findAnchorNodes, anchorToRigidBody, controls.mass, controls.pressure])

  // Traiter les impacts
  useEffect(() => {
    if (impacts.length === 0 || !softBodyStateRef.current) return

    const latest = impacts[impacts.length - 1]
    if (!latest || latest.id === lastImpactIdRef.current) return

    lastImpactIdRef.current = latest.id

    const hitPosition = new THREE.Vector3(
      latest.hitPoint[0] * BAG_CONFIG.radius,
      latest.hitPoint[1] * BAG_CONFIG.radius + BAG_CONFIG.anchorHeight - BAG_CONFIG.radius,
      latest.hitPoint[2] * BAG_CONFIG.radius
    )

    // Force réduite pour éviter les déformations excessives
    const force = new THREE.Vector3(
      -latest.hitPoint[0] * 5,
      0,
      -latest.strength * 15
    )

    // Rayon d'impact plus petit pour une déformation plus localisée
    const radius = 0.3 + latest.strength * 0.3

    applySoftBodyImpulse(softBodyStateRef.current, hitPosition, force, radius)
  }, [impacts, applySoftBodyImpulse])

  // Boucle principale
  useFrame((_, delta) => {
    if (!isInitialized || !softBodyStateRef.current || !meshRef.current) return

    updatePhysics(delta)

    // Mettre à jour la position de la corde
    const positions = meshRef.current.geometry.attributes.position.array
    const anchorIdx = anchorNodeRef.current * 3
    const newX = positions[anchorIdx] ?? 0
    const newY = positions[anchorIdx + 1] ?? BAG_CONFIG.anchorHeight
    const newZ = positions[anchorIdx + 2] ?? 0
    setRopeEndPos([newX, newY, newZ])
  })

  // Couleur basée sur HP
  const bagColor = useMemo(() => {
    const hpRatio = opponentHp / 100
    const baseColor = new THREE.Color(controls.color)
    return baseColor.lerp(new THREE.Color('#ff0000'), 1 - hpRatio)
  }, [opponentHp, controls.color])

  // Points de la corde
  const ropePoints: [number, number, number][] = useMemo(() => [
    [0, BAG_CONFIG.anchorHeight + 0.3, 0],
    ropeEndPos,
  ], [ropeEndPos])

  if (!isReady) {
    return (
      <mesh>
        <sphereGeometry args={[BAG_CONFIG.radius, 16, 16]} />
        <meshStandardMaterial color="#888888" wireframe />
      </mesh>
    )
  }

  return (
    <group>
      {/* Corde */}
      <Line points={ropePoints} color="#8B4513" lineWidth={4} />

      {/* Point d'ancrage */}
      <mesh position={[0, BAG_CONFIG.anchorHeight + 0.3, 0]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial color="#333333" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Sac de frappe */}
      <mesh ref={meshRef} geometry={geometry} frustumCulled={false}>
        <meshStandardMaterial
          color={bagColor}
          side={THREE.DoubleSide}
          roughness={0.6}
          metalness={0.0}
          flatShading={true}
        />
      </mesh>
    </group>
  )
}

export default FluffyOpponent
