import { create } from 'zustand'

/**
 * États possibles du jeu
 */
export type GameState = 'LOBBY' | 'COUNTDOWN' | 'FIGHTING' | 'FINISHED'

/**
 * Durée du round en secondes
 */
export const ROUND_DURATION = 33

/**
 * Clé localStorage pour le meilleur score
 */
const BEST_SCORE_KEY = 'facepuncher_best_score'

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
export type OpponentType = 'sphere' | 'box' | 'fluffy' | 'littlemac' | 'multipart' | 'brickwall'

/**
 * Mode de physique des gants
 * - kinematic: Gants animés manuellement (détection collision manuelle)
 * - physics: Gants DYNAMIC avec spring constraints (collision Ammo.js native)
 */
export type GlovePhysicsMode = 'kinematic' | 'physics'

/**
 * Preset de physique pour le soft body
 */
export type PhysicsPreset = 'soft' | 'medium' | 'hard'

/**
 * Configuration physique pour Ammo.js soft body
 * Basé sur btSoftBody::Config de Bullet Physics
 */
export interface PhysicsConfig {
  // Solver iterations (qualité vs performance)
  viterations: number  // Velocity solver iterations
  piterations: number  // Position solver iterations
  // Coefficients de matériau
  kDP: number          // Damping coefficient (0-1, higher = more damping)
  kDF: number          // Dynamic friction (0-1)
  kPR: number          // Pressure coefficient (balloon effect)
  // Stiffness
  kLST: number         // Linear stiffness (0-1)
  kAST: number         // Angular stiffness (0-1)
  // Impact
  impulseMultiplier: number  // Multiplicateur de force d'impact
  impulseRadius: number      // Rayon d'effet de l'impact
}

/**
 * Presets physiques prédéfinis
 */
export const PHYSICS_PRESETS: Record<PhysicsPreset, PhysicsConfig> = {
  soft: {
    viterations: 20,
    piterations: 20,
    kDP: 0.01,       // Peu d'amortissement = très bouncy
    kDF: 0.3,        // Friction légère
    kPR: 600,        // Pression moyenne
    kLST: 0.85,      // Moins rigide
    kAST: 0.85,
    impulseMultiplier: 20,  // Plus d'impact visuel
    impulseRadius: 2.0,     // Rayon large
  },
  medium: {
    viterations: 25,
    piterations: 25,
    kDP: 0.03,       // Amortissement modéré
    kDF: 0.5,        // Friction moyenne
    kPR: 800,        // Pression élevée
    kLST: 0.95,      // Rigidité standard
    kAST: 0.95,
    impulseMultiplier: 12,  // Impact modéré
    impulseRadius: 1.5,     // Rayon moyen
  },
  hard: {
    viterations: 30,
    piterations: 30,
    kDP: 0.08,       // Fort amortissement
    kDF: 0.7,        // Friction élevée
    kPR: 1200,       // Haute pression = très gonflé
    kLST: 0.98,      // Très rigide
    kAST: 0.98,
    impulseMultiplier: 8,   // Moins d'impact
    impulseRadius: 1.0,     // Rayon serré
  },
}

/**
 * Texture par défaut de l'adversaire (photo par défaut au démarrage)
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

  // Timer et score
  timeRemaining: number      // Temps restant en secondes
  countdown: number          // Compte à rebours avant départ (3, 2, 1)
  hitCount: number           // Nombre de coups portés ce round
  bestScore: number          // Meilleur score (persisté)
  lastHitTimestamp: number   // Pour éviter les double-hits

  // Stats Joueur (legacy, gardé pour compatibilité)
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

  // Preset physique sélectionné
  selectedPhysicsPreset: PhysicsPreset

  // Mode physique des gants
  glovePhysicsMode: GlovePhysicsMode

  // Timestamp du dernier coup (pour reset combo)
  lastHitTime: number

  // Actions timer/score
  startCountdown: () => void
  tickCountdown: () => void
  tickTimer: () => void
  recordHit: () => void
  endRound: () => void

  // Actions legacy
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

  // Action physique
  setPhysicsPreset: (preset: PhysicsPreset) => void
  getPhysicsConfig: () => PhysicsConfig

  // Action mode gants
  setGlovePhysicsMode: (mode: GlovePhysicsMode) => void

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

// Charger le meilleur score depuis localStorage
const loadBestScore = (): number => {
  try {
    const saved = localStorage.getItem(BEST_SCORE_KEY)
    return saved ? parseInt(saved, 10) : 0
  } catch {
    return 0
  }
}

// Sauvegarder le meilleur score
const saveBestScore = (score: number): void => {
  try {
    localStorage.setItem(BEST_SCORE_KEY, score.toString())
  } catch {
    // Ignorer les erreurs localStorage
  }
}

export const useGameStore = create<GameStore>((set, get) => ({
  // État initial
  gameState: 'LOBBY',

  // Timer et score
  timeRemaining: ROUND_DURATION,
  countdown: 3,
  hitCount: 0,
  bestScore: loadBestScore(),
  lastHitTimestamp: 0,

  // Legacy
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

  // Physique par défaut
  selectedPhysicsPreset: 'medium',

  // Mode physique des gants par défaut (kinematic = système actuel)
  glovePhysicsMode: 'kinematic',

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

  // Désactiver la texture (afficher sac de frappe uni)
  clearTexture: () => {
    const state = get()
    // Révoquer l'URL blob si c'était une texture custom
    if (state.opponentTexture && state.opponentTexture !== DEFAULT_OPPONENT_TEXTURE) {
      URL.revokeObjectURL(state.opponentTexture)
    }
    // Mettre une chaîne vide = pas de texture = sac de frappe rouge uni
    set({ opponentTexture: '', isCustomTexture: false })
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
    })
  },

  // Infliger des dégâts au joueur (contre-attaque) - legacy, non utilisé en mode timer
  playerTakeDamage: (amount: number) => {
    const state = get()
    if (state.gameState !== 'FIGHTING') return

    const newHp = Math.max(0, state.playerHp - amount)

    set({
      playerHp: newHp,
      comboCount: 0,
      comboMeter: 0,
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

  // Démarrer le compte à rebours (3, 2, 1, GO!)
  startCountdown: () => {
    const state = get()
    if (state.gameState === 'LOBBY') {
      set({
        gameState: 'COUNTDOWN',
        countdown: 3,
        hitCount: 0,
        timeRemaining: ROUND_DURATION,
        comboCount: 0,
        comboMeter: 0,
      })
    }
  },

  // Décrémenter le compte à rebours (appelé chaque seconde)
  tickCountdown: () => {
    const state = get()
    if (state.gameState !== 'COUNTDOWN') return

    const newCountdown = state.countdown - 1
    if (newCountdown <= 0) {
      // GO! Démarrer le combat
      set({ gameState: 'FIGHTING', countdown: 0 })
    } else {
      set({ countdown: newCountdown })
    }
  },

  // Décrémenter le timer (appelé chaque seconde pendant FIGHTING)
  tickTimer: () => {
    const state = get()
    if (state.gameState !== 'FIGHTING') return

    const newTime = state.timeRemaining - 1
    if (newTime <= 0) {
      // Fin du round!
      get().endRound()
    } else {
      set({ timeRemaining: newTime })
    }
  },

  // Enregistrer un coup (appelé à chaque impact)
  recordHit: () => {
    const state = get()
    if (state.gameState !== 'FIGHTING') return

    // Anti-spam: minimum 100ms entre deux hits
    const now = Date.now()
    if (now - state.lastHitTimestamp < 100) return

    const newHitCount = state.hitCount + 1
    const newComboCount = state.comboCount + 1

    set({
      hitCount: newHitCount,
      comboCount: newComboCount,
      comboMeter: Math.min(100, state.comboMeter + 5),
      lastHitTimestamp: now,
    })
  },

  // Terminer le round
  endRound: () => {
    const state = get()
    const newBestScore = Math.max(state.bestScore, state.hitCount)

    // Sauvegarder si nouveau record
    if (state.hitCount > state.bestScore) {
      saveBestScore(state.hitCount)
    }

    set({
      gameState: 'FINISHED',
      timeRemaining: 0,
      bestScore: newBestScore,
    })
  },

  // Démarrer le combat (legacy - maintenant démarre le countdown)
  startFight: () => {
    get().startCountdown()
  },

  // Reset complet du jeu
  resetGame: () => {
    set({
      gameState: 'LOBBY',
      // Timer/score
      timeRemaining: ROUND_DURATION,
      countdown: 3,
      hitCount: 0,
      lastHitTimestamp: 0,
      // Legacy
      playerHp: 100,
      comboMeter: 0,
      comboCount: 0,
      opponentHp: 100,
      lastHitTime: 0,
      // Note: on garde la texture et les settings
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

  // Actions physique
  setPhysicsPreset: (preset) => set({ selectedPhysicsPreset: preset }),
  getPhysicsConfig: () => PHYSICS_PRESETS[get().selectedPhysicsPreset],

  // Action mode gants
  setGlovePhysicsMode: (mode) => set({ glovePhysicsMode: mode }),

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
