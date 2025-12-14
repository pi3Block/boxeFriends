import { create } from 'zustand'

/**
 * Paramètres de l'effet wobble/jelly
 */
export interface JellyParams {
  wobbleSpeed: number      // Vitesse d'oscillation
  wobbleAmplitude: number  // Amplitude du wobble
  wobbleFrequency: number  // Fréquence spatiale
  jellyDamping: number     // Amortissement après impact
  massGradient: number     // Gradient de masse vertical
  jellySheen: number       // Brillance jelly
}

interface JellyStore extends JellyParams {
  setParams: (params: Partial<JellyParams>) => void
  reset: () => void
}

/**
 * Valeurs par défaut des paramètres jelly
 * Ajustées pour : wobble idle subtil, effet impact prononcé
 */
export const DEFAULT_JELLY_PARAMS: JellyParams = {
  wobbleSpeed: 1.5,       // Réduit pour wobble idle plus calme
  wobbleAmplitude: 0.015, // Réduit significativement (était 0.05)
  wobbleFrequency: 2.5,   // Légèrement réduit
  jellyDamping: 2.0,      // Réduit pour que l'effet impact dure plus longtemps
  massGradient: 0.3,      // Réduit pour moins de mouvement vertical
  jellySheen: 0.2,        // Légèrement réduit
}

export const useJellyStore = create<JellyStore>((set) => ({
  ...DEFAULT_JELLY_PARAMS,

  setParams: (params) => set(params),

  reset: () => set(DEFAULT_JELLY_PARAMS),
}))
