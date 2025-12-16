import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Opponent } from './Opponent'
import { ImpactEffects } from './ImpactEffects'
import { SpringGloves } from './SpringGloves'
import { useAnimationContext } from '../context'

/**
 * Composant de la scène 3D principale
 * Orchestre les composants 3D et enregistre les refs pour les animations
 */
function Scene() {
  const { camera } = useThree()
  const { registerCamera } = useAnimationContext()

  // Enregistrer la caméra pour les animations (camera shake, etc.)
  useEffect(() => {
    registerCamera(camera)
  }, [camera, registerCamera])

  return (
    <group>
      {/* Adversaire (tête) */}
      <Opponent />

      {/* Poings à ressorts Ammo.js */}
      <SpringGloves />

      {/* Effets d'impact (particules, lignes) */}
      <ImpactEffects />
    </group>
  )
}

export default Scene
