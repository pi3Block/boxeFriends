import { useEffect } from 'react'
import { useCharacterStore, type CharacterConfig } from '../stores/useCharacterStore'

/**
 * Liste des modèles GLB disponibles
 * Ajouter ici les nouveaux modèles quand ils sont ajoutés dans public/meshes/
 */
const AVAILABLE_MODELS: CharacterConfig[] = [
  {
    id: 'sphere',
    name: 'Sphère',
    modelPath: '',
    scale: 1,
  },
  {
    id: 'humanoid',
    name: 'Humanoïde',
    modelPath: '/meshes/Humanoid.glb',
    scale: 1.5,
    headBone: 'head',
  },
  // Ajouter d'autres modèles ici :
  // {
  //   id: 'autre-modele',
  //   name: 'Autre Modèle',
  //   modelPath: '/meshes/AutreModele.glb',
  //   scale: 1,
  //   headBone: 'Head',
  // },
]

/**
 * Composant de sélection de personnage dans le lobby
 */
export function CharacterSelector() {
  const characters = useCharacterStore((state) => state.characters)
  const selectedId = useCharacterStore((state) => state.selectedCharacterId)
  const selectCharacter = useCharacterStore((state) => state.selectCharacter)
  const setCharacters = useCharacterStore((state) => state.setCharacters)

  // Initialiser les personnages disponibles
  useEffect(() => {
    setCharacters(AVAILABLE_MODELS)
  }, [setCharacters])

  return (
    <div className="flex flex-col items-center gap-3">
      <h2 className="text-lg font-bold text-white">Choisir l'adversaire</h2>

      <div className="flex flex-wrap justify-center gap-3">
        {characters.map((character) => (
          <CharacterCard
            key={character.id}
            character={character}
            isSelected={character.id === selectedId}
            onSelect={() => selectCharacter(character.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface CharacterCardProps {
  character: CharacterConfig
  isSelected: boolean
  onSelect: () => void
}

function CharacterCard({ character, isSelected, onSelect }: CharacterCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`
        flex flex-col items-center gap-2 rounded-lg p-3 transition-all
        ${isSelected
          ? 'bg-blue-600 ring-2 ring-white'
          : 'bg-gray-700 hover:bg-gray-600'
        }
      `}
    >
      {/* Thumbnail ou placeholder */}
      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-800">
        {character.thumbnail ? (
          <img
            src={character.thumbnail}
            alt={character.name}
            className="h-full w-full rounded-lg object-cover"
          />
        ) : (
          <CharacterIcon type={character.id} />
        )}
      </div>

      {/* Nom */}
      <span className="text-sm font-medium text-white">{character.name}</span>
    </button>
  )
}

/**
 * Icône placeholder pour les personnages sans thumbnail
 */
function CharacterIcon({ type }: { type: string }) {
  if (type === 'sphere') {
    return (
      <svg className="h-10 w-10 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="10" />
      </svg>
    )
  }

  // Icône humanoïde par défaut
  return (
    <svg className="h-10 w-10 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="6" r="4" />
      <path d="M12 12c-4 0-8 2-8 6v2h16v-2c0-4-4-6-8-6z" />
    </svg>
  )
}

export default CharacterSelector
