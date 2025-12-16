import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { useControls, folder } from 'leva'
import { useAmmoPhysics, SoftBodyState } from '../hooks/useAmmoPhysics'
import { useImpactStore, useGameStore } from '../stores'

/**
 * Configuration du sac de frappe
 */
const BAG_CONFIG = {
  // Géométrie
  radius: 1.0,
  widthSegments: 40,
  heightSegments: 25,

  // Physique soft body - pression élevée = ballon gonflé
  mass: 15,
  pressure: 150, // Pression haute pour garder forme sphérique

  // Ancrage
  anchorHeight: 1.8,
  anchorYThreshold: 0.9, // Seulement le pôle nord
}

/**
 * Sac de frappe simple - Soft body Ammo.js
 */
export function FluffyOpponent() {
  const meshRef = useRef<THREE.Mesh>(null)
  const softBodyStateRef = useRef<SoftBodyState | null>(null)
  const initAttemptedRef = useRef(false)
  const lastImpactIdRef = useRef<number>(-1)
  const anchorNodeRef = useRef<number>(0)

  const [isInitialized, setIsInitialized] = useState(false)
  const [ropeEndPos, setRopeEndPos] = useState<[number, number, number]>([0, BAG_CONFIG.anchorHeight - BAG_CONFIG.radius, 0])

  // Hook ammo.js
  const {
    isReady,
    ammo,
    createSoftVolume,
    updatePhysics,
    applySoftBodyImpulse,
    removeSoftBody,
  } = useAmmoPhysics()

  // Stores
  const impacts = useImpactStore((s) => s.impacts)
  const opponentHp = useGameStore((s) => s.opponentHp)

  // Contrôles Leva
  const controls = useControls('Punching Bag', {
    physics: folder({
      pressure: { value: BAG_CONFIG.pressure, min: 50, max: 300, step: 10 },
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
   * Trouver les nodes à ancrer (haut de la sphère)
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
   * Ancrer les nodes du haut
   */
  const anchorTopNodes = useCallback((
    softBodyState: SoftBodyState,
    anchorNodes: number[],
    anchorY: number
  ) => {
    if (!ammo) return

    const { softBody } = softBodyState
    const nodes = softBody.get_m_nodes()

    console.log(`[Bag] Anchoring ${anchorNodes.length} nodes at Y=${anchorY}`)

    for (const nodeIdx of anchorNodes) {
      const node = nodes.at(nodeIdx)
      node.set_m_im(0) // Masse inverse = 0 = fixé
      const pos = node.get_m_x()
      pos.setY(anchorY)
    }
  }, [ammo])

  // Initialiser le soft body
  useEffect(() => {
    if (!isReady || !meshRef.current || initAttemptedRef.current) return
    initAttemptedRef.current = true

    console.log('[Bag] Creating punching bag...')

    const clonedGeometry = geometry.clone()
    if (!clonedGeometry.index) {
      console.error('[Bag] Geometry must have indices')
      return
    }

    // Trouver les anchor nodes AVANT translation
    const anchorNodes = findAnchorNodes(clonedGeometry)
    console.log('[Bag] Anchor nodes:', anchorNodes.length)

    // Translater la géométrie
    const hangPosition = BAG_CONFIG.anchorHeight - BAG_CONFIG.radius
    clonedGeometry.translate(0, hangPosition, 0)

    meshRef.current.geometry = clonedGeometry

    // Créer le soft body
    const state = createSoftVolume(clonedGeometry, meshRef.current, {
      mass: controls.mass,
      pressure: controls.pressure,
      disableGravity: false,
    })

    if (state) {
      softBodyStateRef.current = state
      anchorTopNodes(state, anchorNodes, BAG_CONFIG.anchorHeight)
      setIsInitialized(true)
      console.log('[Bag] Ready!')
    }

    return () => {
      if (softBodyStateRef.current) {
        removeSoftBody(softBodyStateRef.current)
        softBodyStateRef.current = null
      }
      initAttemptedRef.current = false
      setIsInitialized(false)
    }
  }, [isReady, geometry, createSoftVolume, removeSoftBody, findAnchorNodes, anchorTopNodes, controls.mass, controls.pressure])

  // Traiter les impacts
  useEffect(() => {
    if (impacts.length === 0 || !softBodyStateRef.current) return

    const latest = impacts[impacts.length - 1]
    if (!latest || latest.id === lastImpactIdRef.current) return

    lastImpactIdRef.current = latest.id

    const hitPosition = new THREE.Vector3(
      latest.hitPoint[0] * BAG_CONFIG.radius,
      latest.hitPoint[1] * BAG_CONFIG.radius,
      latest.hitPoint[2] * BAG_CONFIG.radius
    )

    const force = new THREE.Vector3(
      -latest.hitPoint[0] * 8,
      Math.abs(latest.hitPoint[1]) * 4 + 3,
      -latest.strength * 25
    )

    const radius = 0.8 + latest.strength * 0.6

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
    const newY = positions[anchorIdx + 1] ?? BAG_CONFIG.anchorHeight - BAG_CONFIG.radius
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
    [0, BAG_CONFIG.anchorHeight + 0.5, 0],
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
      <mesh position={[0, BAG_CONFIG.anchorHeight + 0.5, 0]}>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshStandardMaterial color="#444444" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Sac de frappe */}
      <mesh ref={meshRef} geometry={geometry} frustumCulled={false}>
        <meshPhongMaterial
          color={bagColor}
          side={THREE.DoubleSide}
          shininess={30}
        />
      </mesh>
    </group>
  )
}

export default FluffyOpponent
