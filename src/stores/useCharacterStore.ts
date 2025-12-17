import { create } from 'zustand'

/**
 * Configuration d'un personnage/modèle disponible
 */
export interface CharacterConfig {
  id: string
  name: string
  modelPath: string // Chemin vers le GLB dans public/meshes/
  thumbnail?: string // Image de preview optionnelle
  scale?: number // Échelle du modèle (défaut: 1)
  headBone?: string // Nom du bone de la tête pour appliquer la texture
}

/**
 * Store pour la sélection de personnage
 */
interface CharacterStore {
  // Liste des personnages disponibles
  characters: CharacterConfig[]

  // Personnage sélectionné
  selectedCharacterId: string | null

  // Actions
  setCharacters: (characters: CharacterConfig[]) => void
  addCharacter: (character: CharacterConfig) => void
  selectCharacter: (id: string) => void
  getSelectedCharacter: () => CharacterConfig | null
}

/**
 * Personnages par défaut (sphère + modèles GLB)
 */
const DEFAULT_CHARACTERS: CharacterConfig[] = [
  {
    id: 'sphere',
    name: 'Sphère',
    modelPath: '', // Vide = utiliser la sphère par défaut
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
    name: 'Fluffy (Soft Body)',
    modelPath: '', // Procédural - soft body volumétrique
    scale: 1.2,
  },
  {
    id: 'littlemac',
    name: 'Little Mac (Ellipsoid)',
    modelPath: '', // Procédural - ellipsoïde soft body
    scale: 1.0,
    thumbnail: '/docs/image-exemple/Little_Mac.webp',
  },
  {
    id: 'facecap',
    name: 'Visage ARKit',
    modelPath: '/meshes/facecap.glb',
    scale: 2.5,
    headBone: 'head',
  },
  // Les modèles GLB seront ajoutés dynamiquement
]

export const useCharacterStore = create<CharacterStore>((set, get) => ({
  characters: DEFAULT_CHARACTERS,
  selectedCharacterId: 'fluffy',

  setCharacters: (characters) => {
    set({ characters })
  },

  addCharacter: (character) => {
    set((state) => ({
      characters: [...state.characters.filter(c => c.id !== character.id), character],
    }))
  },

  selectCharacter: (id) => {
    const character = get().characters.find(c => c.id === id)
    if (character) {
      set({ selectedCharacterId: id })
    }
  },

  getSelectedCharacter: () => {
    const state = get()
    return state.characters.find(c => c.id === state.selectedCharacterId) ?? null
  },
}))

/**
 * Hook pour obtenir le personnage sélectionné
 */
export function useSelectedCharacter(): CharacterConfig | null {
  return useCharacterStore((state) => {
    const id = state.selectedCharacterId
    return state.characters.find(c => c.id === id) ?? null
  })
}
