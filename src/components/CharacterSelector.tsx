import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
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
    id: 'jellyhead',
    name: 'Jelly Head',
    modelPath: '', // Procédural - pas de GLB
    scale: 1,
  },
  {
    id: 'fluffy',
    name: 'Fluffy',
    modelPath: '', // Procédural - soft body volumétrique
    scale: 1.2,
  },
  {
    id: 'facecap',
    name: 'Visage ARKit',
    modelPath: '/meshes/facecap.glb',
    scale: 2.5,
    headBone: 'head',
  },
]

// Preload GLTF models en background pour éviter le lag au premier chargement
AVAILABLE_MODELS.forEach((model) => {
  if (model.modelPath) {
    useGLTF.preload(model.modelPath)
  }
})

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

  if (type === 'jellyhead') {
    // Icône tête jelly avec effet wobble
    return (
      <svg className="h-10 w-10 text-pink-400" viewBox="0 0 24 24" fill="currentColor">
        <ellipse cx="12" cy="11" rx="9" ry="10" />
        {/* Yeux qui pop */}
        <circle cx="8" cy="9" r="2.5" fill="white" />
        <circle cx="16" cy="9" r="2.5" fill="white" />
        <circle cx="8" cy="9" r="1" fill="#1f2937" />
        <circle cx="16" cy="9" r="1" fill="#1f2937" />
        {/* Nez */}
        <ellipse cx="12" cy="13" rx="1.5" ry="2" fill="#e8a090" />
        {/* Bouche */}
        <path d="M8 17c2 1.5 6 1.5 8 0" stroke="#1f2937" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === 'fluffy') {
    // Icône fluffy soft body - ballon rebondissant
    return (
      <svg className="h-10 w-10 text-pink-300" viewBox="0 0 24 24" fill="currentColor">
        {/* Corps principal gonflé */}
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        {/* Reflet pour effet ballon */}
        <ellipse cx="8" cy="8" rx="3" ry="2" fill="white" opacity="0.4" />
        {/* Yeux */}
        <circle cx="9" cy="11" r="2" fill="white" />
        <circle cx="15" cy="11" r="2" fill="white" />
        <circle cx="9" cy="11" r="0.8" fill="#1f2937" />
        <circle cx="15" cy="11" r="0.8" fill="#1f2937" />
        {/* Bouche souriante */}
        <path d="M9 15c1.5 1.5 4.5 1.5 6 0" stroke="#1f2937" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === 'facecap') {
    // Icône visage avec expressions
    return (
      <svg className="h-10 w-10 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
        <ellipse cx="12" cy="12" rx="9" ry="11" />
        <circle cx="8" cy="10" r="1.5" fill="#1f2937" />
        <circle cx="16" cy="10" r="1.5" fill="#1f2937" />
        <path d="M8 15c2 2 6 2 8 0" stroke="#1f2937" strokeWidth="1.5" fill="none" strokeLinecap="round" />
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
