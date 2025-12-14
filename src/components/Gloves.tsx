import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Box } from '@react-three/drei'
import type { Mesh } from 'three'
import { useGameStore } from '../stores'

/**
 * Position de repos des gants (bas de l'écran, POV boxeur)
 */
const REST_POSITION = {
  left: [-0.8, -0.6, 2] as const,
  right: [0.8, -0.6, 2] as const,
}

/**
 * Composant représentant les gants du joueur
 * Visibles en bas de l'écran en vue FPV
 */
export function Gloves() {
  const leftGloveRef = useRef<Mesh>(null)
  const rightGloveRef = useRef<Mesh>(null)
  const gameState = useGameStore((state) => state.gameState)

  // Animation idle des gants (léger mouvement de garde)
  useFrame(() => {
    if (gameState !== 'FIGHTING') return

    const time = Date.now() * 0.002

    if (leftGloveRef.current) {
      // Mouvement de garde gauche
      leftGloveRef.current.position.y =
        REST_POSITION.left[1] + Math.sin(time) * 0.05
      leftGloveRef.current.position.x =
        REST_POSITION.left[0] + Math.sin(time * 0.7) * 0.02
    }

    if (rightGloveRef.current) {
      // Mouvement de garde droit (décalé)
      rightGloveRef.current.position.y =
        REST_POSITION.right[1] + Math.sin(time + Math.PI) * 0.05
      rightGloveRef.current.position.x =
        REST_POSITION.right[0] + Math.sin(time * 0.7 + Math.PI) * 0.02
    }
  })

  // Masquer les gants si pas en combat
  if (gameState !== 'FIGHTING') {
    return null
  }

  return (
    <>
      {/* Gant gauche */}
      <Box
        ref={leftGloveRef}
        args={[0.3, 0.4, 0.3]}
        position={[...REST_POSITION.left]}
        rotation={[0.3, 0.2, 0]}
      >
        <meshStandardMaterial color="#cc0000" roughness={0.6} metalness={0.3} />
      </Box>

      {/* Gant droit */}
      <Box
        ref={rightGloveRef}
        args={[0.3, 0.4, 0.3]}
        position={[...REST_POSITION.right]}
        rotation={[0.3, -0.2, 0]}
      >
        <meshStandardMaterial color="#cc0000" roughness={0.6} metalness={0.3} />
      </Box>
    </>
  )
}

/**
 * Exporte les refs des gants pour les animations GSAP
 */
export interface GloveRefs {
  left: React.RefObject<Mesh | null>
  right: React.RefObject<Mesh | null>
}

export default Gloves
