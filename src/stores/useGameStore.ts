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
 * Main utilisée pour le coup
 */
export type PunchHand = 'left' | 'right'

/**
 * Punch en attente déclenché par UI
 */
export interface QueuedPunch {
  type: PunchType
  hand: PunchHand
  timestamp: number
}

/**
 * Outil de combat sélectionné
 */
export type CombatTool = 'ball' | 'gloves'

/**
 * Type d'adversaire (sac de frappe)
 */
export type OpponentType = 'sphere' | 'box' | 'fluffy' | 'littlemac' | 'multipart'

/**
 * Texture par défaut de l'adversaire
 */
export const DEFAULT_OPPONENT_TEXTURE = '/textures/default.png'

/**
 * Paramètres de transformation de texture (fusionné depuis useTextureSettingsStore)
 */
export interface TextureSettings {
  zoom: number       // Niveau de zoom (1 = normal, >1 = zoom in)
  offsetX: number    // Décalage horizontal (-1 à 1)
  offsetY: number    // Décalage vertical (-1 à 1)
}

export const DEFAULT_TEXTURE_SETTINGS: TextureSettings = {
  zoom: 1.2,
  offsetX: 0.05,
  offsetY: 0.00,
}

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

  // Paramètres texture (fusionné)
  textureZoom: number
  textureOffsetX: number
  textureOffsetY: number
  textureEditMode: boolean

  // Outil de combat sélectionné
  selectedTool: CombatTool

  // Type d'adversaire sélectionné
  selectedOpponent: OpponentType

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

  // Actions texture (fusionné)
  setTextureEditMode: (mode: boolean) => void
  setTextureZoom: (zoom: number) => void
  setTextureOffsetX: (x: number) => void
  setTextureOffsetY: (y: number) => void
  setTextureSettings: (settings: Partial<TextureSettings>) => void
  resetTextureSettings: () => void

  // Action outil
  setSelectedTool: (tool: CombatTool) => void

  // Action adversaire
  setSelectedOpponent: (opponent: OpponentType) => void

  // Système de punch déclenché par UI
  queuedPunch: QueuedPunch | null
  queuePunch: (type: PunchType, hand?: PunchHand) => void
  consumeQueuedPunch: () => QueuedPunch | null
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

  // Texture settings (fusionné)
  textureZoom: DEFAULT_TEXTURE_SETTINGS.zoom,
  textureOffsetX: DEFAULT_TEXTURE_SETTINGS.offsetX,
  textureOffsetY: DEFAULT_TEXTURE_SETTINGS.offsetY,
  textureEditMode: false,

  // Outil par défaut
  selectedTool: 'gloves',

  // Adversaire par défaut
  selectedOpponent: 'sphere',

  // Punch en attente (déclenché par boutons UI)
  queuedPunch: null,

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
      // Reset texture settings aussi
      textureZoom: DEFAULT_TEXTURE_SETTINGS.zoom,
      textureOffsetX: DEFAULT_TEXTURE_SETTINGS.offsetX,
      textureOffsetY: DEFAULT_TEXTURE_SETTINGS.offsetY,
      textureEditMode: false,
    })
  },

  // Actions texture (fusionné depuis useTextureSettingsStore)
  setTextureEditMode: (mode) => set({ textureEditMode: mode }),
  setTextureZoom: (zoom) => set({ textureZoom: zoom }),
  setTextureOffsetX: (x) => set({ textureOffsetX: x }),
  setTextureOffsetY: (y) => set({ textureOffsetY: y }),
  setTextureSettings: (settings) => set({
    ...(settings.zoom !== undefined && { textureZoom: settings.zoom }),
    ...(settings.offsetX !== undefined && { textureOffsetX: settings.offsetX }),
    ...(settings.offsetY !== undefined && { textureOffsetY: settings.offsetY }),
  }),
  resetTextureSettings: () => set({
    textureZoom: DEFAULT_TEXTURE_SETTINGS.zoom,
    textureOffsetX: DEFAULT_TEXTURE_SETTINGS.offsetX,
    textureOffsetY: DEFAULT_TEXTURE_SETTINGS.offsetY,
  }),

  // Action outil
  setSelectedTool: (tool) => set({ selectedTool: tool }),

  // Action adversaire
  setSelectedOpponent: (opponent) => set({ selectedOpponent: opponent }),

  // Ajouter un punch à la queue (déclenché par boutons UI)
  queuePunch: (type: PunchType, hand?: PunchHand) => {
    // Alterner la main si non spécifiée
    const currentHand = hand || (Math.random() > 0.5 ? 'left' : 'right')
    set({
      queuedPunch: {
        type,
        hand: currentHand,
        timestamp: Date.now(),
      },
    })
  },

  // Consommer le punch en attente (appelé par le système de gloves)
  consumeQueuedPunch: () => {
    const state = get()
    const punch = state.queuedPunch
    if (punch) {
      set({ queuedPunch: null })
    }
    return punch
  },
}))
