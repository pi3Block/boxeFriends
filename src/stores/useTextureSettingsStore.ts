import { create } from 'zustand'

/**
 * Paramètres de transformation de texture
 */
export interface TextureSettings {
  zoom: number       // Niveau de zoom (1 = normal, >1 = zoom in)
  offsetX: number    // Décalage horizontal (-1 à 1)
  offsetY: number    // Décalage vertical (-1 à 1)
}

interface TextureSettingsStore extends TextureSettings {
  editMode: boolean
  setEditMode: (mode: boolean) => void
  setZoom: (zoom: number) => void
  setOffsetX: (x: number) => void
  setOffsetY: (y: number) => void
  setSettings: (settings: Partial<TextureSettings>) => void
  reset: () => void
}

/**
 * Valeurs par défaut pour l'image par défaut de l'opposant
 */
export const DEFAULT_TEXTURE_SETTINGS: TextureSettings = {
  zoom: 1.1,      // Zoom pour l'image par défaut
  offsetX: 0.30,  // Décalage horizontal pour l'image par défaut
  offsetY: 0.05,  // Décalage vertical pour l'image par défaut
}

export const useTextureSettingsStore = create<TextureSettingsStore>((set) => ({
  ...DEFAULT_TEXTURE_SETTINGS,
  editMode: false,

  setEditMode: (mode) => set({ editMode: mode }),

  setZoom: (zoom) => set({ zoom }),

  setOffsetX: (offsetX) => set({ offsetX }),

  setOffsetY: (offsetY) => set({ offsetY }),

  setSettings: (settings) => set(settings),

  reset: () => set(DEFAULT_TEXTURE_SETTINGS),
}))
