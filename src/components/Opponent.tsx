import { useGameStore } from '../stores'
import { CharacterModel } from './CharacterModel'

/**
 * Composant représentant l'adversaire
 * Délègue au CharacterModel qui gère sphère et modèles GLB
 */
export function Opponent() {
  const textureUrl = useGameStore((state) => state.opponentTexture)

  return <CharacterModel textureUrl={textureUrl} />
}

export default Opponent
