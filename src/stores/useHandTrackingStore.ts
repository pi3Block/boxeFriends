import { create } from 'zustand'

/**
 * État d'une main détectée par le tracking
 */
export interface HandState {
  // Position normalisée du poignet (0-1)
  landmarks: { x: number; y: number; z: number }[]
  // Position du poignet convertie en coordonnées écran
  screenPosition: { x: number; y: number }
  // Vélocité calculée (unités par seconde)
  velocity: { x: number; y: number; z: number }
  // Timestamp de la dernière mise à jour
  lastUpdate: number
}

/**
 * État de permission de la caméra
 */
export type CameraPermission = 'prompt' | 'granted' | 'denied'

/**
 * Position de calibration d'une main (coordonnées normalisées 0-1)
 */
export interface CalibrationPoint {
  x: number // Position X normalisée (0 = gauche, 1 = droite)
  y: number // Position Y normalisée (0 = haut, 1 = bas)
}

/**
 * Interface du store de hand tracking
 */
interface HandTrackingStore {
  // État des mains détectées
  leftHand: HandState | null
  rightHand: HandState | null

  // Configuration utilisateur
  isCameraEnabled: boolean // Toggle ON/OFF par l'utilisateur

  // État du système
  cameraPermission: CameraPermission
  isTracking: boolean // Worker actif et détecte des mains
  isInitializing: boolean // Chargement du modèle MediaPipe

  // Calibration
  isCalibrated: boolean // La calibration a été effectuée
  isCalibrating: boolean // En cours de calibration
  leftCalibration: CalibrationPoint | null // Position neutre main gauche
  rightCalibration: CalibrationPoint | null // Position neutre main droite

  // Actions
  setHandState: (hand: 'left' | 'right', state: HandState | null) => void
  setLeftHand: (state: HandState | null) => void
  setRightHand: (state: HandState | null) => void
  setCameraEnabled: (enabled: boolean) => void
  setCameraPermission: (permission: CameraPermission) => void
  setIsTracking: (tracking: boolean) => void
  setIsInitializing: (initializing: boolean) => void
  // Calibration actions
  startCalibration: () => void
  calibrate: () => boolean // Capture les positions actuelles, retourne true si succès
  resetCalibration: () => void
  reset: () => void
}

export const useHandTrackingStore = create<HandTrackingStore>((set, get) => ({
  // État initial
  leftHand: null,
  rightHand: null,
  isCameraEnabled: false,
  cameraPermission: 'prompt',
  isTracking: false,
  isInitializing: false,
  // Calibration
  isCalibrated: false,
  isCalibrating: false,
  leftCalibration: null,
  rightCalibration: null,

  // Mettre à jour l'état d'une main (gauche ou droite)
  setHandState: (hand: 'left' | 'right', state: HandState | null) => {
    if (hand === 'left') {
      set({ leftHand: state })
    } else {
      set({ rightHand: state })
    }
  },

  // Raccourcis pour les mains individuelles
  setLeftHand: (state: HandState | null) => set({ leftHand: state }),
  setRightHand: (state: HandState | null) => set({ rightHand: state }),

  // Activer/désactiver la caméra
  setCameraEnabled: (enabled: boolean) => set({ isCameraEnabled: enabled }),

  // Mettre à jour la permission caméra
  setCameraPermission: (permission: CameraPermission) =>
    set({ cameraPermission: permission }),

  // Mettre à jour l'état de tracking
  setIsTracking: (tracking: boolean) => set({ isTracking: tracking }),

  // Mettre à jour l'état d'initialisation
  setIsInitializing: (initializing: boolean) =>
    set({ isInitializing: initializing }),

  // Démarrer le mode calibration
  startCalibration: () => set({ isCalibrating: true }),

  // Capturer les positions actuelles comme référence
  calibrate: () => {
    const { leftHand, rightHand } = get()

    // Il faut au moins une main détectée pour calibrer
    if (!leftHand && !rightHand) {
      return false
    }

    // Capturer les positions normalisées (landmark 0 = poignet)
    const leftCalibration = leftHand?.landmarks[0]
      ? { x: leftHand.landmarks[0].x, y: leftHand.landmarks[0].y }
      : null

    const rightCalibration = rightHand?.landmarks[0]
      ? { x: rightHand.landmarks[0].x, y: rightHand.landmarks[0].y }
      : null

    set({
      leftCalibration,
      rightCalibration,
      isCalibrated: true,
      isCalibrating: false,
    })

    console.log('[HandTracking] Calibration complete:', {
      left: leftCalibration,
      right: rightCalibration,
    })

    return true
  },

  // Réinitialiser la calibration
  resetCalibration: () =>
    set({
      leftCalibration: null,
      rightCalibration: null,
      isCalibrated: false,
      isCalibrating: false,
    }),

  // Reset complet du store
  reset: () =>
    set({
      leftHand: null,
      rightHand: null,
      isCameraEnabled: false,
      isTracking: false,
      isInitializing: false,
      isCalibrated: false,
      isCalibrating: false,
      leftCalibration: null,
      rightCalibration: null,
    }),
}))
