import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useControls, folder } from 'leva'
import { useAmmoPhysics, SoftBodyState, COLLISION_GROUPS } from '../hooks/useAmmoPhysics'
import { useGameStore } from '../stores'
import { useImpactListener } from '../hooks/useImpactListener'

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
  const anchorNodeRef = useRef<number>(0)
  const anchorRigidBodyRef = useRef<any>(null)

  const [isInitialized, setIsInitialized] = useState(false)
  // Position de la corde - useRef pour éviter re-render chaque frame
  const ropeEndPosRef = useRef<[number, number, number]>([0, BAG_CONFIG.anchorHeight, 0])
  const lineRef = useRef<THREE.Line>(null)

  // Géométrie de la corde (pré-allouée)
  const ropeGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array([
      0, BAG_CONFIG.anchorHeight + 0.3, 0,  // Point d'ancrage
      0, BAG_CONFIG.anchorHeight, 0,         // Point sur le soft body
    ])
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [])

  // Material de la corde
  const ropeMaterial = useMemo(() => {
    return new THREE.LineBasicMaterial({ color: 0x8B4513, linewidth: 2 })
  }, [])

  // Objet ligne pré-alloué
  const ropeLine = useMemo(() => {
    return new THREE.Line(ropeGeometry, ropeMaterial)
  }, [ropeGeometry, ropeMaterial])

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

  // Traiter les impacts via callback (pas de re-render React)
  useImpactListener((impact) => {
    if (!softBodyStateRef.current) return

    const hitPosition = new THREE.Vector3(
      impact.hitPoint[0] * BAG_CONFIG.radius,
      impact.hitPoint[1] * BAG_CONFIG.radius + BAG_CONFIG.anchorHeight - BAG_CONFIG.radius,
      impact.hitPoint[2] * BAG_CONFIG.radius
    )

    // Force réduite pour éviter les déformations excessives
    const force = new THREE.Vector3(
      -impact.hitPoint[0] * 5,
      0,
      -impact.strength * 15
    )

    // Rayon d'impact plus petit pour une déformation plus localisée
    const radius = 0.3 + impact.strength * 0.3

    applySoftBodyImpulse(softBodyStateRef.current, hitPosition, force, radius)
  })

  // Boucle principale - mutation directe, pas de setState
  useFrame((_, delta) => {
    if (!isInitialized || !softBodyStateRef.current || !meshRef.current) return

    updatePhysics(delta)

    // Mettre à jour la position de la corde via ref (pas de re-render)
    const positions = meshRef.current.geometry.attributes.position.array
    const anchorIdx = anchorNodeRef.current * 3
    const newX = positions[anchorIdx] ?? 0
    const newY = positions[anchorIdx + 1] ?? BAG_CONFIG.anchorHeight
    const newZ = positions[anchorIdx + 2] ?? 0
    ropeEndPosRef.current = [newX, newY, newZ]

    // Mettre à jour la géométrie de la corde directement (pas de re-render)
    const ropePositions = ropeGeometry.attributes.position as THREE.BufferAttribute
    // Point 2: position du soft body (index 1 = offset 3)
    ropePositions.setXYZ(1, newX, newY, newZ)
    ropePositions.needsUpdate = true
  })

  // Couleur basée sur HP
  const bagColor = useMemo(() => {
    const hpRatio = opponentHp / 100
    const baseColor = new THREE.Color(controls.color)
    return baseColor.lerp(new THREE.Color('#ff0000'), 1 - hpRatio)
  }, [opponentHp, controls.color])


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
      {/* Corde - géométrie mise à jour directement dans useFrame (pas de re-render) */}
      <primitive object={ropeLine} />

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
