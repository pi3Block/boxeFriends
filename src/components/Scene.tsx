import { Opponent } from './Opponent'
import { Gloves } from './Gloves'

/**
 * Composant de la scène 3D principale
 * Contient les objets 3D du jeu
 */
function Scene() {
  return (
    <group>
      {/* Adversaire (tête) */}
      <Opponent />

      {/* Gants du joueur */}
      <Gloves />
    </group>
  )
}

export default Scene
