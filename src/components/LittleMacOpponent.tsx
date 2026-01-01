import { useRef, useEffect, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { useControls, folder } from 'leva'
import { useAmmoPhysics, SoftBodyState } from '../hooks/useAmmoPhysics'
import { ImpactManager } from '../stores'
import { useImpactListener } from '../hooks/useImpactListener'

/**
 * Configuration de la tête Little Mac
 */
const HEAD_CONFIG = {
  // Forme ellipsoïde (tête ovale)
  radiusX: 0.8,
  radiusY: 1.0,  // Plus haut que large
  radiusZ: 0.9,
  resolution: 18,

  // Physique
  mass: 8,
  pressure: 300,

  // Position
  positionY: 1.0,
}

/**
 * Little Mac Opponent - Tête ellipsoïde soft body avec texture
 */
export function LittleMacOpponent() {
  const meshRef = useRef<THREE.Mesh>(null)
  const softBodyStateRef = useRef<SoftBodyState | null>(null)
  const initAttemptedRef = useRef(false)

  const [isInitialized, setIsInitialized] = useState(false)

  // Charger la texture Little Mac
  const texture = useTexture('/docs/image-exemple/Little_Mac.webp')

  // Configurer la texture
  useMemo(() => {
    texture.flipY = false
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true
  }, [texture])

  // Hook Ammo.js
  const {
    isReady,
    createEllipsoid,
    syncEllipsoidToMesh,
    updatePhysics,
    applySoftBodyImpulse,
    removeSoftBody,
  } = useAmmoPhysics()


  // Contrôles Leva
  const controls = useControls('Little Mac Head', {
    physics: folder({
      pressure: { value: HEAD_CONFIG.pressure, min: 100, max: 500, step: 10 },
      mass: { value: HEAD_CONFIG.mass, min: 1, max: 20, step: 1 },
    }, { collapsed: true }),
    shape: folder({
      radiusX: { value: HEAD_CONFIG.radiusX, min: 0.3, max: 1.5, step: 0.1 },
      radiusY: { value: HEAD_CONFIG.radiusY, min: 0.3, max: 1.5, step: 0.1 },
      radiusZ: { value: HEAD_CONFIG.radiusZ, min: 0.3, max: 1.5, step: 0.1 },
      resolution: { value: HEAD_CONFIG.resolution, min: 8, max: 30, step: 1 },
    }, { collapsed: true }),
  })

  // Initialiser le soft body ellipsoïde
  useEffect(() => {
    if (!isReady || !meshRef.current || initAttemptedRef.current) return
    initAttemptedRef.current = true

    console.log('[LittleMac] Creating ellipsoid head...')

    // Créer l'ellipsoïde soft body
    const result = createEllipsoid({
      center: new THREE.Vector3(0, controls.positionY ?? HEAD_CONFIG.positionY, 0),
      radius: new THREE.Vector3(controls.radiusX, controls.radiusY, controls.radiusZ),
      resolution: controls.resolution,
      mass: controls.mass,
      pressure: controls.pressure,
    })

    if (!result) {
      console.error('[LittleMac] Failed to create ellipsoid')
      return
    }

    const { softBody, numNodes } = result

    // Synchroniser avec le mesh Three.js
    const state = syncEllipsoidToMesh(softBody, meshRef.current, numNodes)

    if (state) {
      softBodyStateRef.current = state
      setIsInitialized(true)
      console.log(`[LittleMac] Head ready! ${numNodes} nodes`)
    }

    return () => {
      if (softBodyStateRef.current) {
        removeSoftBody(softBodyStateRef.current)
        softBodyStateRef.current = null
      }
      initAttemptedRef.current = false
      setIsInitialized(false)
    }
  }, [isReady, createEllipsoid, syncEllipsoidToMesh, removeSoftBody, controls])

  // Ref pour les controls (pour accès dans le callback)
  const controlsRef = useRef(controls)
  controlsRef.current = controls

  // Traiter les impacts via callback (pas de re-render React)
  useImpactListener((impact) => {
    if (!softBodyStateRef.current) return

    const ctrl = controlsRef.current

    // Convertir le point d'impact en coordonnées world
    const hitPosition = new THREE.Vector3(
      impact.hitPoint[0] * ctrl.radiusX,
      impact.hitPoint[1] * ctrl.radiusY + HEAD_CONFIG.positionY,
      impact.hitPoint[2] * ctrl.radiusZ
    )

    // Force de l'impact
    const force = new THREE.Vector3(
      -impact.hitPoint[0] * 8,
      -impact.hitPoint[1] * 2,
      -impact.strength * 20
    )

    const radius = 0.4 + impact.strength * 0.4

    console.log(`[LittleMac] Impact! strength=${impact.strength.toFixed(2)}`)
    applySoftBodyImpulse(softBodyStateRef.current, hitPosition, force, radius)
  })

  // Boucle de mise à jour physique
  useFrame((_, delta) => {
    if (!isInitialized || !softBodyStateRef.current) return
    updatePhysics(delta)
  })

  // Placeholder pendant le chargement
  if (!isReady) {
    return (
      <mesh position={[0, HEAD_CONFIG.positionY, 0]}>
        <sphereGeometry args={[0.8, 16, 16]} />
        <meshStandardMaterial color="#888888" wireframe />
      </mesh>
    )
  }

  return (
    <group>
      {/* Tête ellipsoïde soft body */}
      <mesh ref={meshRef} frustumCulled={false}>
        <meshStandardMaterial
          map={texture}
          side={THREE.DoubleSide}
          roughness={0.7}
          metalness={0.0}
        />
      </mesh>

      {/* Debug: afficher le centre */}
      {!isInitialized && (
        <mesh position={[0, HEAD_CONFIG.positionY, 0]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshBasicMaterial color="red" />
        </mesh>
      )}
    </group>
  )
}

export default LittleMacOpponent
