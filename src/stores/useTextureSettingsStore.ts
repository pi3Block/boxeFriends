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
 * Valeurs par défaut pour l'image par défaut de l'opposant (JellyHead)
 */
export const DEFAULT_TEXTURE_SETTINGS: TextureSettings = {
  zoom: 1.2,      // Zoom pour JellyHead
  offsetX: 0.05,  // Décalage horizontal pour JellyHead
  offsetY: 0.00,  // Décalage vertical pour JellyHead
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
