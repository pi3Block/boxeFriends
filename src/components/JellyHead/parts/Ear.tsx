import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface EarProps {
  side: 'left' | 'right'
  position: [number, number, number]
}

/**
 * Composant Ear - Oreilles
 * Géométrie simple (torus aplati)
 * Animation wobble subtile
 */
export function Ear({ side, position }: EarProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  // Rotation Y pour orienter vers l'extérieur
  const rotationY = side === 'left' ? -Math.PI / 2 : Math.PI / 2

  // Géométrie oreille (torus aplati)
  const earGeometry = useMemo(() => {
    const geo = new THREE.TorusGeometry(0.05, 0.025, 6, 12)
    // Aplatir pour forme d'oreille
    geo.scale(1, 1.3, 0.5)
    return geo
  }, [])

  useFrame(() => {
    if (!meshRef.current) return

    const time = performance.now() * 0.001

    // Wobble idle très subtil
    const wobbleAmount = 0.01
    const phaseOffset = side === 'left' ? 0 : Math.PI

    meshRef.current.rotation.z =
      Math.sin(time * 1.5 + phaseOffset) * wobbleAmount
    meshRef.current.position.x =
      position[0] + Math.sin(time * 2 + phaseOffset) * 0.002
  })

  return (
    <mesh
      ref={meshRef}
      geometry={earGeometry}
      position={position}
      rotation={[0, rotationY, 0]}
    >
      <meshStandardMaterial
        color="#f5c4a8"
        roughness={0.55}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
