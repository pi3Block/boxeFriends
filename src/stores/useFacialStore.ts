import { create } from 'zustand'

/**
 * Liste des 52 blend shapes ARKit disponibles sur le modèle facecap.glb
 */
export const ARKIT_BLEND_SHAPES = [
  'browInnerUp', 'browDown_L', 'browDown_R', 'browOuterUp_L', 'browOuterUp_R',
  'eyeLookUp_L', 'eyeLookUp_R', 'eyeLookDown_L', 'eyeLookDown_R',
  'eyeLookIn_L', 'eyeLookIn_R', 'eyeLookOut_L', 'eyeLookOut_R',
  'eyeBlink_L', 'eyeBlink_R', 'eyeSquint_L', 'eyeSquint_R', 'eyeWide_L', 'eyeWide_R',
  'cheekPuff', 'cheekSquint_L', 'cheekSquint_R',
  'noseSneer_L', 'noseSneer_R',
  'jawOpen', 'jawForward', 'jawLeft', 'jawRight',
  'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight',
  'mouthRollUpper', 'mouthRollLower', 'mouthShrugUpper', 'mouthShrugLower',
  'mouthClose', 'mouthSmile_L', 'mouthSmile_R', 'mouthFrown_L', 'mouthFrown_R',
  'mouthDimple_L', 'mouthDimple_R', 'mouthUpperUp_L', 'mouthUpperUp_R',
  'mouthLowerDown_L', 'mouthLowerDown_R', 'mouthPress_L', 'mouthPress_R',
  'mouthStretch_L', 'mouthStretch_R', 'tongueOut'
] as const

export type BlendShapeName = typeof ARKIT_BLEND_SHAPES[number]

/**
 * Type pour un état facial (ensemble de valeurs de blend shapes)
 */
export type FacialState = Partial<Record<BlendShapeName, number>>

/**
 * Presets d'expressions faciales pour le jeu de boxe
 */
export const FACIAL_PRESETS: Record<string, FacialState> = {
  // État neutre / repos
  idle: {
    mouthSmile_L: 0.1,
    mouthSmile_R: 0.1,
    eyeWide_L: 0.2,
    eyeWide_R: 0.2,
  },

  // État de garde (concentré)
  guard: {
    browDown_L: 0.3,
    browDown_R: 0.3,
    eyeSquint_L: 0.2,
    eyeSquint_R: 0.2,
    jawForward: 0.2,
  },

  // Coup léger - grimace légère
  lightHit: {
    jawOpen: 0.25,
    eyeSquint_L: 0.5,
    eyeSquint_R: 0.5,
    browDown_L: 0.4,
    browDown_R: 0.4,
    noseSneer_L: 0.3,
    noseSneer_R: 0.3,
  },

  // Coup moyen - douleur visible
  mediumHit: {
    jawOpen: 0.5,
    cheekPuff: 0.3,
    eyeBlink_L: 0.6,
    eyeBlink_R: 0.4,
    browInnerUp: 0.5,
    noseSneer_L: 0.5,
    noseSneer_R: 0.5,
    mouthFrown_L: 0.4,
    mouthFrown_R: 0.4,
  },

  // Coup fort - douleur intense, expression dramatique
  heavyHit: {
    jawOpen: 0.85,
    eyeWide_L: 0.95,
    eyeWide_R: 0.95,
    browInnerUp: 0.95,
    browOuterUp_L: 0.6,
    browOuterUp_R: 0.6,
    mouthFunnel: 0.5,
    mouthStretch_L: 0.6,
    mouthStretch_R: 0.6,
    cheekPuff: 0.4,
    noseSneer_L: 0.8,
    noseSneer_R: 0.8,
    mouthShrugUpper: 0.4,
  },

  // Coup critique - choc maximal, expression de stupeur
  critical: {
    jawOpen: 1,
    eyeWide_L: 1,
    eyeWide_R: 1,
    browInnerUp: 1,
    browOuterUp_L: 0.8,
    browOuterUp_R: 0.8,
    mouthStretch_L: 0.8,
    mouthStretch_R: 0.8,
    cheekPuff: 0.6,
    noseSneer_L: 0.6,
    noseSneer_R: 0.6,
    mouthShrugUpper: 0.7,
    mouthFunnel: 0.3,
  },

  // Coup à la mâchoire - douleur intense
  jawHit: {
    jawOpen: 0.9,
    jawForward: 0.3,
    browInnerUp: 0.95,
    browDown_L: 0.3,
    browDown_R: 0.3,
    eyeWide_L: 0.7,
    eyeWide_R: 0.7,
    eyeSquint_L: 0.3,
    eyeSquint_R: 0.3,
    noseSneer_L: 0.5,
    noseSneer_R: 0.5,
    mouthStretch_L: 0.7,
    mouthStretch_R: 0.7,
    mouthFrown_L: 0.5,
    mouthFrown_R: 0.5,
    cheekPuff: 0.3,
  },

  // Coup à la joue gauche - miroir de rightCheekHit
  leftCheekHit: {
    browInnerUp: 0.9,
    browOuterUp_R: 0.8,
    browOuterUp_L: 0.75,
    eyeWide_L: 0.87,
    eyeWide_R: 0.88,
    eyeLookDown_L: 0.5,
    eyeLookDown_R: 0.5,
    eyeLookIn_L: 0.4,
    eyeLookOut_R: 0.3,
    cheekPuff: 0.2,
    cheekSquint_L: 0.16,
    jawOpen: 0.2,
    jawLeft: 0.38,
    mouthLeft: 0.96,
    mouthPucker: 0.45,
    mouthFunnel: 0.2,
    mouthRollLower: 0.47,
    mouthShrugUpper: 0.55,
    mouthShrugLower: 0.29,
    mouthClose: 0.27,
  },

  // Coup à la joue droite - très expressif basé sur l'exemple three.js
  rightCheekHit: {
    browInnerUp: 0.9,
    browOuterUp_L: 0.8,
    browOuterUp_R: 0.75,
    eyeWide_L: 0.88,
    eyeWide_R: 0.87,
    eyeLookDown_L: 0.5,
    eyeLookDown_R: 0.5,
    eyeLookOut_L: 0.3,
    eyeLookIn_R: 0.4,
    cheekPuff: 0.2,
    cheekSquint_R: 0.16,
    jawOpen: 0.2,
    jawRight: 0.38,
    mouthRight: 0.96,
    mouthPucker: 0.45,
    mouthFunnel: 0.2,
    mouthRollLower: 0.47,
    mouthShrugUpper: 0.55,
    mouthShrugLower: 0.29,
    mouthClose: 0.27,
  },

  // Coup au nez - yeux qui se ferment, grimace
  noseHit: {
    noseSneer_L: 0.95,
    noseSneer_R: 0.95,
    eyeBlink_L: 0.8,
    eyeBlink_R: 0.8,
    eyeSquint_L: 0.9,
    eyeSquint_R: 0.9,
    browInnerUp: 0.85,
    browDown_L: 0.5,
    browDown_R: 0.5,
    mouthFunnel: 0.4,
    mouthPucker: 0.3,
    jawOpen: 0.15,
    cheekSquint_L: 0.6,
    cheekSquint_R: 0.6,
  },

  // Coup au front / sourcils - choc
  foreheadHit: {
    browDown_L: 0.95,
    browDown_R: 0.95,
    eyeBlink_L: 0.85,
    eyeBlink_R: 0.85,
    eyeSquint_L: 0.7,
    eyeSquint_R: 0.7,
    jawOpen: 0.4,
    mouthFrown_L: 0.6,
    mouthFrown_R: 0.6,
    noseSneer_L: 0.4,
    noseSneer_R: 0.4,
  },

  // Uppercut (coup par en dessous) - tête en arrière, choc
  uppercutHit: {
    jawOpen: 1,
    eyeWide_L: 0.95,
    eyeWide_R: 0.95,
    browInnerUp: 1,
    browOuterUp_L: 0.7,
    browOuterUp_R: 0.7,
    eyeLookUp_L: 0.8,
    eyeLookUp_R: 0.8,
    mouthUpperUp_L: 0.7,
    mouthUpperUp_R: 0.7,
    mouthStretch_L: 0.5,
    mouthStretch_R: 0.5,
    noseSneer_L: 0.3,
    noseSneer_R: 0.3,
  },

  // Étourdi / sonné
  stunned: {
    eyeLookIn_L: 0.4,
    eyeLookOut_R: 0.4,
    eyeLookUp_L: 0.3,
    eyeLookDown_R: 0.3,
    jawOpen: 0.4,
    mouthPucker: 0.3,
    browInnerUp: 0.5,
  },

  // K.O. - yeux fermés, bouche ouverte, expression de défaite
  knockout: {
    eyeBlink_L: 1,
    eyeBlink_R: 1,
    jawOpen: 0.7,
    mouthRollLower: 0.5,
    mouthRollUpper: 0.2,
    browInnerUp: 0.4,
    browDown_L: 0.2,
    browDown_R: 0.2,
    mouthFrown_L: 0.7,
    mouthFrown_R: 0.7,
    mouthLowerDown_L: 0.3,
    mouthLowerDown_R: 0.3,
    cheekPuff: 0.1,
  },

  // Douleur persistante (HP bas)
  hurt: {
    browInnerUp: 0.6,
    eyeSquint_L: 0.5,
    eyeSquint_R: 0.5,
    mouthFrown_L: 0.4,
    mouthFrown_R: 0.4,
    noseSneer_L: 0.3,
    noseSneer_R: 0.3,
    jawOpen: 0.15,
  },

  // Provocation / sourire moqueur
  taunt: {
    mouthSmile_L: 0.7,
    mouthSmile_R: 0.3,
    eyeSquint_L: 0.4,
    browOuterUp_L: 0.5,
    cheekSquint_L: 0.3,
  },

  // Colère
  angry: {
    browDown_L: 0.7,
    browDown_R: 0.7,
    eyeSquint_L: 0.4,
    eyeSquint_R: 0.4,
    noseSneer_L: 0.5,
    noseSneer_R: 0.5,
    jawForward: 0.3,
    mouthPress_L: 0.4,
    mouthPress_R: 0.4,
  },

  // Récupération / respiration
  recovery: {
    jawOpen: 0.2,
    mouthFunnel: 0.15,
    browInnerUp: 0.2,
    eyeWide_L: 0.3,
    eyeWide_R: 0.3,
  },
}

/**
 * Type pour les noms de presets
 */
export type FacialPresetName = keyof typeof FACIAL_PRESETS

/**
 * Store pour gérer l'état facial du personnage
 */
interface FacialStore {
  // État actuel des morph targets (0-1 pour chaque)
  currentInfluences: FacialState

  // Preset actuel
  currentPreset: FacialPresetName

  // État cible pour l'interpolation
  targetInfluences: FacialState

  // Vitesse de transition (0-1, où 1 = instantané)
  transitionSpeed: number

  // Actions
  setPreset: (preset: FacialPresetName, speed?: number) => void
  setInfluence: (name: BlendShapeName, value: number) => void
  setInfluences: (influences: FacialState) => void
  triggerHitReaction: (intensity: number, hitZone?: 'jaw' | 'leftCheek' | 'rightCheek' | 'nose' | 'forehead' | 'uppercut') => void
  reset: () => void
}

export const useFacialStore = create<FacialStore>((set, get) => ({
  currentInfluences: { ...FACIAL_PRESETS.idle },
  currentPreset: 'idle',
  targetInfluences: { ...FACIAL_PRESETS.idle },
  transitionSpeed: 0.15,

  setPreset: (preset, speed = 0.15) => {
    const presetData = FACIAL_PRESETS[preset]
    if (presetData) {
      set({
        currentPreset: preset,
        targetInfluences: { ...presetData },
        transitionSpeed: speed,
      })
    }
  },

  setInfluence: (name, value) => {
    set((state) => ({
      targetInfluences: {
        ...state.targetInfluences,
        [name]: Math.max(0, Math.min(1, value)),
      },
    }))
  },

  setInfluences: (influences) => {
    set((state) => ({
      targetInfluences: {
        ...state.targetInfluences,
        ...influences,
      },
    }))
  },

  triggerHitReaction: (intensity, hitZone) => {
    const { setPreset } = get()

    // Choisir le preset en fonction de la zone et de l'intensité
    let preset: FacialPresetName = 'lightHit'

    // D'abord par zone de frappe
    if (hitZone) {
      switch (hitZone) {
        case 'jaw':
          preset = 'jawHit'
          break
        case 'leftCheek':
          preset = 'leftCheekHit'
          break
        case 'rightCheek':
          preset = 'rightCheekHit'
          break
        case 'nose':
          preset = 'noseHit'
          break
        case 'forehead':
          preset = 'foreheadHit'
          break
        case 'uppercut':
          preset = 'uppercutHit'
          break
      }
    } else {
      // Par intensité si pas de zone spécifique
      if (intensity > 0.85) {
        preset = 'critical'
      } else if (intensity > 0.6) {
        preset = 'heavyHit'
      } else if (intensity > 0.3) {
        preset = 'mediumHit'
      }
    }

    // Transition rapide pour les coups
    setPreset(preset, 0.3)

    // Retour progressif vers idle/hurt après un délai
    setTimeout(() => {
      const hpBasedPreset = intensity > 0.5 ? 'hurt' : 'recovery'
      setPreset(hpBasedPreset, 0.1)

      // Puis retour à idle
      setTimeout(() => {
        setPreset('idle', 0.08)
      }, 300)
    }, 150 + intensity * 200)
  },

  reset: () => {
    set({
      currentInfluences: { ...FACIAL_PRESETS.idle },
      currentPreset: 'idle',
      targetInfluences: { ...FACIAL_PRESETS.idle },
      transitionSpeed: 0.15,
    })
  },
}))

export default useFacialStore
