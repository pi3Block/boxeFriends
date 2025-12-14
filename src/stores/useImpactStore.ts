import { create } from 'zustand'

/**
 * Représente un impact sur le visage de l'adversaire
 */
export interface Impact {
  id: number
  hitPoint: [number, number, number] // Position 3D du point d'impact
  strength: number // Force de l'impact (0-1)
  createdAt: number // Timestamp de création
}

/**
 * Store pour gérer les impacts visuels (déformation du visage)
 * Utilise un ring buffer pour limiter le nombre d'impacts simultanés
 */
interface ImpactStore {
  impacts: Impact[]
  addImpact: (hitPoint: [number, number, number], strength: number) => void
  tick: (deltaTime: number) => void
  clearImpacts: () => void
}

// Nombre maximum d'impacts simultanés
const MAX_IMPACTS = 5

// Vitesse de décroissance de la force (unités/seconde)
const DECAY_RATE = 2.0

// Seuil minimum avant suppression
const MIN_STRENGTH = 0.01

// Compteur d'ID unique
let impactId = 0

export const useImpactStore = create<ImpactStore>((set) => ({
  impacts: [],

  /**
   * Ajoute un nouvel impact au ring buffer
   */
  addImpact: (hitPoint: [number, number, number], strength: number) => {
    const newImpact: Impact = {
      id: impactId++,
      hitPoint,
      strength: Math.min(Math.max(strength, 0), 1), // Clamp 0-1
      createdAt: performance.now(),
    }

    set((state) => ({
      // Ring buffer : garde les MAX_IMPACTS-1 plus récents + le nouveau
      impacts: [...state.impacts.slice(-(MAX_IMPACTS - 1)), newImpact],
    }))
  },

  /**
   * Met à jour les impacts (décroissance de la force)
   * Appelé chaque frame via useFrame
   */
  tick: (deltaTime: number) => {
    set((state) => ({
      impacts: state.impacts
        .map((impact) => ({
          ...impact,
          strength: impact.strength - DECAY_RATE * deltaTime,
        }))
        .filter((impact) => impact.strength > MIN_STRENGTH),
    }))
  },

  /**
   * Efface tous les impacts
   */
  clearImpacts: () => {
    set({ impacts: [] })
  },
}))
