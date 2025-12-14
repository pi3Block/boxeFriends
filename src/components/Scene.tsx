import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Box, Sphere, Plane } from '@react-three/drei'
import type { Mesh } from 'three'

/**
 * Composant de la scène 3D principale
 * Contient les objets 3D et leur logique d'animation
 */
function Scene() {
  const boxRef = useRef<Mesh>(null)
  const sphereRef = useRef<Mesh>(null)

  // Animation des objets à chaque frame
  useFrame((_, delta) => {
    if (boxRef.current) {
      boxRef.current.rotation.x += delta * 0.5
      boxRef.current.rotation.y += delta * 0.3
    }
    if (sphereRef.current) {
      sphereRef.current.rotation.x += delta * 0.2
      sphereRef.current.rotation.z += delta * 0.4
    }
  })

  return (
    <>
      {/* Sol de la scène */}
      <Plane
        args={[10, 10]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#f0f0f0" />
      </Plane>

      {/* Cube animé */}
      <Box
        ref={boxRef}
        args={[1, 1, 1]}
        position={[-2, 0, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="orange" />
      </Box>

      {/* Sphère animée */}
      <Sphere
        ref={sphereRef}
        args={[0.8, 32, 32]}
        position={[2, 0, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="hotpink" />
      </Sphere>
    </>
  )
}

export default Scene
