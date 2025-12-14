import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere } from '@react-three/drei'
import { useTexture } from '@react-three/drei'
import type { Mesh, Texture } from 'three'
import { useGameStore, useImpactStore } from '../stores'

/**
 * Composant représentant l'adversaire (tête à frapper)
 * Pour le MVP, c'est une sphère avec la texture uploadée
 */
export function Opponent() {
  const meshRef = useRef<Mesh>(null)
  const textureUrl = useGameStore((state) => state.opponentTexture)
  const gameState = useGameStore((state) => state.gameState)
  const opponentHp = useGameStore((state) => state.opponentHp)
  const impacts = useImpactStore((state) => state.impacts)
  const tick = useImpactStore((state) => state.tick)

  // Charger la texture si disponible
  // Note: useTexture ne peut pas être conditionnel, on gère ça différemment
  const hasTexture = !!textureUrl

  // Animation idle (léger mouvement)
  useFrame((_, delta) => {
    if (!meshRef.current) return

    // Mettre à jour les impacts (decay)
    tick(delta)

    // Animation idle seulement en combat
    if (gameState === 'FIGHTING') {
      // Léger balancement
      meshRef.current.rotation.y = Math.sin(Date.now() * 0.001) * 0.1
      meshRef.current.rotation.x = Math.sin(Date.now() * 0.0015) * 0.05
    }

    // Effet de recul basé sur les impacts actifs
    if (impacts.length > 0) {
      const totalStrength = impacts.reduce((sum, i) => sum + i.strength, 0)
      meshRef.current.position.z = -totalStrength * 0.3
    } else {
      // Retour progressif à la position initiale
      meshRef.current.position.z *= 0.9
    }
  })

  // Couleur basée sur les HP (rouge quand bas)
  const hpColor = useMemo(() => {
    const hpRatio = opponentHp / 100
    // Interpolation du blanc vers le rouge
    const r = 1
    const g = hpRatio
    const b = hpRatio
    return `rgb(${Math.floor(r * 255)}, ${Math.floor(g * 255)}, ${Math.floor(b * 255)})`
  }, [opponentHp])

  // Si pas de texture, afficher un placeholder
  if (!hasTexture) {
    return (
      <Sphere
        ref={meshRef}
        args={[1, 32, 32]}
        position={[0, 0, 0]}
      >
        <meshStandardMaterial
          color="#ffdbac" // Couleur peau
          roughness={0.8}
          metalness={0.1}
        />
      </Sphere>
    )
  }

  return (
    <OpponentWithTexture
      meshRef={meshRef}
      textureUrl={textureUrl}
      hpColor={hpColor}
    />
  )
}

/**
 * Sous-composant pour charger la texture
 * (useTexture doit être appelé inconditionnellement)
 */
function OpponentWithTexture({
  meshRef,
  textureUrl,
  hpColor,
}: {
  meshRef: React.RefObject<Mesh | null>
  textureUrl: string
  hpColor: string
}) {
  const texture = useTexture(textureUrl) as Texture

  return (
    <Sphere
      ref={meshRef}
      args={[1, 64, 64]} // Plus de segments pour la déformation
      position={[0, 0, 0]}
    >
      <meshStandardMaterial
        map={texture}
        color={hpColor}
        roughness={0.7}
        metalness={0.1}
      />
    </Sphere>
  )
}

export default Opponent
