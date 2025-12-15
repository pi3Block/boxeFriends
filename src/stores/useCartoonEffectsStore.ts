import { create } from 'zustand'
import { HitZone } from '../physics'

/**
 * Types d'effets cartoon disponibles
 * Classés par priorité d'implémentation
 */
export type CartoonEffectType =
  | 'eyePop' // Priorité 5 - Yeux qui sortent des orbites
  | 'cheekWobble' // Priorité 4 - Joues qui ondulent
  | 'noseSquash' // Priorité 3 - Nez écrasé accordion
  | 'jawDetach' // Priorité 2 - Mâchoire décrochée
  | 'headSquash' // Priorité 2 - Squash & stretch global
  | 'starsSpin' // Priorité 1 - Étoiles KO

/**
 * Instance d'effet actif
 */
export interface ActiveEffect {
  id: number
  type: CartoonEffectType
  intensity: number // 0-1
  startTime: number // ms
  duration: number // ms
  decay: number // Vitesse de décroissance
}

/**
 * Seuils de déclenchement par zone/intensité
 */
export interface EffectThresholds {
  eyePopMin: number // Seuil pour déclencher eye pop
  cheekWobbleMin: number
  noseSquashMin: number
  jawDetachMin: number
  headSquashMin: number
}

const DEFAULT_THRESHOLDS: EffectThresholds = {
  eyePopMin: 0.25, // Seuil bas - yeux pop facilement
  cheekWobbleMin: 0.1, // Très bas - wobble à chaque coup
  noseSquashMin: 0.2, // Seuil bas - nez s'écrase facilement
  jawDetachMin: 0.7, // Fort mais atteignable
  headSquashMin: 0.15, // Très bas - squash à chaque coup
}

/**
 * Durées par défaut des effets (ms) - AMPLIFIÉES x2
 */
const EFFECT_DURATIONS: Record<CartoonEffectType, number> = {
  eyePop: 1600,
  cheekWobble: 1200,
  noseSquash: 1000,
  jawDetach: 3500,
  headSquash: 800,
  starsSpin: 4000,
}

/**
 * Store Zustand pour les effets cartoon
 * Gère le déclenchement et l'animation des effets exagérés
 */
interface CartoonEffectsStore {
  // Effets actifs
  activeEffects: ActiveEffect[]

  // Valeurs d'intensité courantes (0-1)
  eyePopIntensity: number
  cheekWobbleIntensity: number
  noseSquashIntensity: number
  headSquashIntensity: number
  headSquashAxis: [number, number, number] // Direction du squash

  // État mâchoire
  jawDetached: boolean
  jawDetachProgress: number // 0-1 animation

  // Tracking des dégâts cumulés
  cumulativeDamage: number
  consecutiveHits: number
  lastHitTime: number

  // Configuration
  thresholds: EffectThresholds

  // Compteur ID
  nextEffectId: number

  // Actions
  triggerEffect: (
    type: CartoonEffectType,
    intensity: number,
    duration?: number
  ) => void

  processHit: (zone: HitZone, intensity: number) => void

  tick: (deltaTime: number) => void

  setThresholds: (thresholds: Partial<EffectThresholds>) => void

  reset: () => void
}

export const useCartoonEffectsStore = create<CartoonEffectsStore>(
  (set, get) => ({
    activeEffects: [],

    eyePopIntensity: 0,
    cheekWobbleIntensity: 0,
    noseSquashIntensity: 0,
    headSquashIntensity: 0,
    headSquashAxis: [0, 1, 0],

    jawDetached: false,
    jawDetachProgress: 0,

    cumulativeDamage: 0,
    consecutiveHits: 0,
    lastHitTime: 0,

    thresholds: DEFAULT_THRESHOLDS,
    nextEffectId: 0,

    /**
     * Déclencher un effet cartoon
     */
    triggerEffect: (type, intensity, duration) => {
      const { activeEffects, nextEffectId } = get()
      const effectDuration = duration ?? EFFECT_DURATIONS[type]

      // Vérifier si effet déjà actif (on augmente l'intensité)
      const existingIndex = activeEffects.findIndex((e) => e.type === type)

      if (existingIndex >= 0) {
        // Augmenter l'intensité de l'effet existant
        const existing = activeEffects[existingIndex]
        if (existing) {
          const updated = [...activeEffects]
          updated[existingIndex] = {
            ...existing,
            intensity: Math.min(existing.intensity + intensity * 0.5, 1),
            startTime: performance.now(),
          }
          set({ activeEffects: updated })
        }
      } else {
        // Nouvel effet - DECAY RÉDUIT pour effets plus longs
        const newEffect: ActiveEffect = {
          id: nextEffectId,
          type,
          intensity: Math.min(intensity * 1.5, 1), // Boost intensité initiale
          startTime: performance.now(),
          duration: effectDuration,
          decay: 0.8, // Décroissance LENTE par seconde
        }

        set({
          activeEffects: [...activeEffects, newEffect],
          nextEffectId: nextEffectId + 1,
        })
      }
    },

    /**
     * Traiter un impact et déclencher les effets appropriés
     * Logique basée sur zone et intensité
     */
    processHit: (zone, intensity) => {
      const { thresholds, consecutiveHits, lastHitTime, triggerEffect } = get()
      const now = performance.now()

      // Tracker les hits consécutifs (< 500ms entre hits)
      const isConsecutive = now - lastHitTime < 500
      const newConsecutiveHits = isConsecutive ? consecutiveHits + 1 : 1

      // Bonus d'intensité pour combo
      const comboBonus = Math.min(newConsecutiveHits * 0.1, 0.3)
      const effectiveIntensity = Math.min(intensity + comboBonus, 1)

      set({
        consecutiveHits: newConsecutiveHits,
        lastHitTime: now,
        cumulativeDamage: get().cumulativeDamage + intensity,
      })

      // === PRIORITÉ 5 : Eye Pop ===
      if (
        (zone === 'leftEye' || zone === 'rightEye' || zone === 'forehead') &&
        effectiveIntensity >= thresholds.eyePopMin
      ) {
        triggerEffect('eyePop', effectiveIntensity)
      }

      // === PRIORITÉ 4 : Cheek Wobble (presque toujours) ===
      if (effectiveIntensity >= thresholds.cheekWobbleMin) {
        // Plus fort sur les joues directement touchées
        const cheekBonus =
          zone === 'leftCheek' || zone === 'rightCheek' ? 0.3 : 0
        triggerEffect('cheekWobble', effectiveIntensity + cheekBonus)
      }

      // === PRIORITÉ 3 : Nose Squash ===
      if (zone === 'nose' && effectiveIntensity >= thresholds.noseSquashMin) {
        triggerEffect('noseSquash', effectiveIntensity)
      }

      // === PRIORITÉ 2 : Head Squash (squash & stretch global) ===
      if (effectiveIntensity >= thresholds.headSquashMin) {
        // Déterminer l'axe de squash selon la zone
        let squashAxis: [number, number, number] = [0, 1, 0]
        if (zone === 'jaw') squashAxis = [0, 1, 0] // Vertical
        else if (zone === 'leftCheek') squashAxis = [1, 0, 0] // Horizontal
        else if (zone === 'rightCheek') squashAxis = [-1, 0, 0]
        else if (zone === 'nose') squashAxis = [0, 0, 1] // Profondeur

        set({ headSquashAxis: squashAxis })
        triggerEffect('headSquash', effectiveIntensity)
      }

      // === PRIORITÉ 2 : Jaw Detach (très rare) ===
      if (zone === 'jaw' && effectiveIntensity >= thresholds.jawDetachMin) {
        set({ jawDetached: true, jawDetachProgress: 0 })
        triggerEffect('jawDetach', effectiveIntensity)
      }

      // === PRIORITÉ 1 : Stars (KO / dégâts cumulés) ===
      if (get().cumulativeDamage > 3) {
        triggerEffect('starsSpin', 1)
      }
    },

    /**
     * Mettre à jour les effets (appelé chaque frame)
     */
    tick: (deltaTime) => {
      const { activeEffects, jawDetached, jawDetachProgress } = get()
      const now = performance.now()

      // Decay des effets actifs
      const updatedEffects = activeEffects
        .map((effect) => {
          const newIntensity = effect.intensity - effect.decay * deltaTime

          return {
            ...effect,
            intensity: Math.max(newIntensity, 0),
          }
        })
        .filter((effect) => {
          const effectAge = now - effect.startTime
          return effect.intensity > 0.01 && effectAge < effect.duration
        })

      // Calculer les intensités courantes
      const eyePop =
        updatedEffects.find((e) => e.type === 'eyePop')?.intensity ?? 0
      const cheekWobble =
        updatedEffects.find((e) => e.type === 'cheekWobble')?.intensity ?? 0
      const noseSquash =
        updatedEffects.find((e) => e.type === 'noseSquash')?.intensity ?? 0
      const headSquash =
        updatedEffects.find((e) => e.type === 'headSquash')?.intensity ?? 0

      // Animation jaw detach
      let newJawDetached = jawDetached
      let newJawProgress = jawDetachProgress
      if (jawDetached) {
        newJawProgress = Math.min(jawDetachProgress + deltaTime * 2, 1)
        // Réattacher après l'animation complète (2 sec)
        if (newJawProgress >= 1) {
          newJawDetached = false
          newJawProgress = 0
        }
      }

      // Decay des dégâts cumulés
      const newCumulativeDamage = Math.max(
        get().cumulativeDamage - deltaTime * 0.5,
        0
      )

      set({
        activeEffects: updatedEffects,
        eyePopIntensity: eyePop,
        cheekWobbleIntensity: cheekWobble,
        noseSquashIntensity: noseSquash,
        headSquashIntensity: headSquash,
        jawDetached: newJawDetached,
        jawDetachProgress: newJawProgress,
        cumulativeDamage: newCumulativeDamage,
      })
    },

    /**
     * Modifier les seuils
     */
    setThresholds: (thresholds) => {
      set((state) => ({
        thresholds: { ...state.thresholds, ...thresholds },
      }))
    },

    /**
     * Réinitialiser
     */
    reset: () => {
      set({
        activeEffects: [],
        eyePopIntensity: 0,
        cheekWobbleIntensity: 0,
        noseSquashIntensity: 0,
        headSquashIntensity: 0,
        jawDetached: false,
        jawDetachProgress: 0,
        cumulativeDamage: 0,
        consecutiveHits: 0,
        lastHitTime: 0,
      })
    },
  })
)
