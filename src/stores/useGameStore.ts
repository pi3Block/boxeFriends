import { create } from 'zustand'

/**
 * États possibles du jeu
 */
export type GameState = 'LOBBY' | 'FIGHTING' | 'KO'

/**
 * Type de coup
 */
export type PunchType = 'jab' | 'hook' | 'uppercut'

/**
 * Texture par défaut de l'adversaire
 */
export const DEFAULT_OPPONENT_TEXTURE = '/textures/default.png'

/**
 * Interface du store principal du jeu
 */
interface GameStore {
  // État du jeu
  gameState: GameState

  // Stats Joueur
  playerHp: number // 0-100
  comboMeter: number // 0-100
  comboCount: number

  // Stats Adversaire
  opponentHp: number // 0-100
  opponentTexture: string // URL de la texture (défaut ou blob uploadé)
  isCustomTexture: boolean // true si l'utilisateur a uploadé une photo

  // Timestamp du dernier coup (pour reset combo)
  lastHitTime: number

  // Actions
  setTexture: (url: string) => void
  clearTexture: () => void
  takeDamage: (amount: number, isCritical: boolean) => void
  playerTakeDamage: (amount: number) => void
  incrementCombo: () => void
  resetCombo: () => void
  startFight: () => void
  resetGame: () => void
}

// Délai avant reset du combo (ms)
const COMBO_RESET_DELAY = 2000

// Multiplicateur de dégâts critique
const CRITICAL_MULTIPLIER = 2.0

// Bonus de dégâts par combo
const COMBO_DAMAGE_BONUS = 0.1

export const useGameStore = create<GameStore>((set, get) => ({
  // État initial
  gameState: 'LOBBY',
  playerHp: 100,
  comboMeter: 0,
  comboCount: 0,
  opponentHp: 100,
  opponentTexture: DEFAULT_OPPONENT_TEXTURE,
  isCustomTexture: false,
  lastHitTime: 0,

  // Définir la texture de l'adversaire (upload utilisateur)
  setTexture: (url: string) => {
    const state = get()
    // Révoquer l'ancienne URL blob si c'était une texture custom
    if (state.isCustomTexture && state.opponentTexture !== DEFAULT_OPPONENT_TEXTURE) {
      URL.revokeObjectURL(state.opponentTexture)
    }
    set({ opponentTexture: url, isCustomTexture: true })
  },

  // Restaurer la texture par défaut
  clearTexture: () => {
    const state = get()
    // Révoquer l'URL blob si c'était une texture custom
    if (state.isCustomTexture && state.opponentTexture !== DEFAULT_OPPONENT_TEXTURE) {
      URL.revokeObjectURL(state.opponentTexture)
    }
    set({ opponentTexture: DEFAULT_OPPONENT_TEXTURE, isCustomTexture: false })
  },

  // Infliger des dégâts à l'adversaire
  takeDamage: (amount: number, isCritical: boolean) => {
    const state = get()
    if (state.gameState !== 'FIGHTING') return

    const now = Date.now()

    // Reset combo si trop de temps écoulé
    if (now - state.lastHitTime > COMBO_RESET_DELAY) {
      set({ comboCount: 0, comboMeter: 0 })
    }

    // Calculer les dégâts avec bonus
    const comboBonus = 1 + state.comboCount * COMBO_DAMAGE_BONUS
    const critBonus = isCritical ? CRITICAL_MULTIPLIER : 1
    const finalDamage = amount * comboBonus * critBonus

    // Appliquer les dégâts
    const newHp = Math.max(0, state.opponentHp - finalDamage)

    // Mettre à jour le combo
    const newComboCount = state.comboCount + 1
    const newComboMeter = Math.min(100, state.comboMeter + 10)

    set({
      opponentHp: newHp,
      comboCount: newComboCount,
      comboMeter: newComboMeter,
      lastHitTime: now,
      gameState: newHp <= 0 ? 'KO' : state.gameState,
    })
  },

  // Infliger des dégâts au joueur (contre-attaque)
  playerTakeDamage: (amount: number) => {
    const state = get()
    if (state.gameState !== 'FIGHTING') return

    const newHp = Math.max(0, state.playerHp - amount)

    set({
      playerHp: newHp,
      comboCount: 0,
      comboMeter: 0,
      gameState: newHp <= 0 ? 'KO' : state.gameState,
    })
  },

  // Incrémenter le combo
  incrementCombo: () => {
    set((state) => ({
      comboCount: state.comboCount + 1,
      comboMeter: Math.min(100, state.comboMeter + 10),
      lastHitTime: Date.now(),
    }))
  },

  // Reset le combo
  resetCombo: () => {
    set({ comboCount: 0, comboMeter: 0 })
  },

  // Démarrer le combat
  startFight: () => {
    const state = get()
    // On peut toujours démarrer car on a toujours une texture (défaut ou custom)
    if (state.gameState === 'LOBBY') {
      set({ gameState: 'FIGHTING' })
    }
  },

  // Reset complet du jeu
  resetGame: () => {
    const state = get()
    // Révoquer l'URL blob si c'était une texture custom
    if (state.isCustomTexture && state.opponentTexture !== DEFAULT_OPPONENT_TEXTURE) {
      URL.revokeObjectURL(state.opponentTexture)
    }

    set({
      gameState: 'LOBBY',
      playerHp: 100,
      comboMeter: 0,
      comboCount: 0,
      opponentHp: 100,
      opponentTexture: DEFAULT_OPPONENT_TEXTURE,
      isCustomTexture: false,
      lastHitTime: 0,
    })
  },
}))
