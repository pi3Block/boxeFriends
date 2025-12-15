import { useCallback, useEffect, useRef } from 'react'
import { useHandTrackingStore, type HandState, type CalibrationPoint } from '../stores/useHandTrackingStore'
import type { PunchData, PunchDragCallbacks } from './useGestureInput'
import type { PunchType } from '../stores'

/**
 * Seuils pour la détection de coup via caméra
 */
const PUNCH_CONFIG = {
  // Seuil de vélocité Z pour déclencher un coup (unités par seconde)
  // Négatif = vers la caméra = vers l'adversaire
  velocityThreshold: 0.12,
  // Seuil de vélocité Y pour un uppercut (mouvement vers le haut)
  uppercutThreshold: 0.08,
  // Seuil de vélocité X pour un hook (mouvement latéral)
  hookThreshold: 0.1,
  // Vélocité max pour normalisation
  maxVelocity: 0.5,
  // Délai minimum entre deux coups de la même main (ms)
  punchCooldown: 250,
  // Seuil de position Z pour détecter un "armé" (main qui recule)
  windupZThreshold: 0.02,
  // Position Z de référence pour calculer l'extension du bras
  // Plus la valeur est basse, plus le bras est tendu vers l'avant
  punchExtensionBonus: 0.03,
}

/**
 * Positions de repos des gants sur l'écran (en pourcentage 0-1)
 */
const GLOVE_REST_POSITIONS = {
  left: { x: 0.25, y: 0.65 },  // 25% depuis la gauche, 65% depuis le haut
  right: { x: 0.75, y: 0.65 }, // 75% depuis la gauche, 65% depuis le haut
}

/**
 * Facteur de sensibilité pour le mouvement (amplifie les mouvements de main)
 */
const MOVEMENT_SENSITIVITY = 2.0

/**
 * État d'une main pour l'input unifié
 */
interface HandInputState {
  isActive: boolean
  screenPosition: { x: number; y: number }
  lastPunchTime: number
  // Position Z de calibration (référence pour l'extension)
  calibratedZ: number | null
  // Position Z précédente pour détecter le "wind-up"
  previousZ: number | null
  // Indique si la main est en phase d'armé
  isWindingUp: boolean
}

/**
 * Callbacks pour le mode caméra (contrôle indépendant des deux mains)
 */
export interface CameraInputCallbacks {
  onLeftHandMove?: (screenX: number, screenY: number) => void
  onRightHandMove?: (screenX: number, screenY: number) => void
  onLeftPunch?: (data: PunchData) => void
  onRightPunch?: (data: PunchData) => void
}

/**
 * Options pour useUnifiedInput
 */
interface UseUnifiedInputOptions {
  // Callbacks pour le mode tactile (existant)
  touchCallbacks: PunchDragCallbacks
  // Callbacks pour le mode caméra
  cameraCallbacks: CameraInputCallbacks
  // Mode actif (true = caméra, false = tactile)
  useCameraInput: boolean
}

/**
 * Valeur de retour du hook
 */
interface UseUnifiedInputReturn {
  // Source d'input actuelle
  inputSource: 'touch' | 'camera'
  // État des mains (pour debug/UI)
  leftHandActive: boolean
  rightHandActive: boolean
  // Calibration
  isCalibrated: boolean
}

/**
 * Calcule la position écran calibrée pour une main
 * Mappe le delta entre position actuelle et calibration vers les positions de gant
 */
function calculateCalibratedPosition(
  hand: HandState,
  calibration: CalibrationPoint | null,
  handSide: 'left' | 'right',
  screenWidth: number,
  screenHeight: number
): { x: number; y: number } {
  // Position actuelle normalisée du poignet (landmark 0)
  const currentNormalized = hand.landmarks[0] || { x: 0.5, y: 0.5 }

  // Position de repos du gant
  const restPosition = GLOVE_REST_POSITIONS[handSide]

  if (!calibration) {
    // Sans calibration, utiliser la position brute inversée en X (miroir caméra)
    return {
      x: (1 - currentNormalized.x) * screenWidth,
      y: currentNormalized.y * screenHeight,
    }
  }

  // Calculer le delta depuis la position calibrée
  // Note: on inverse X car la caméra est en miroir
  const deltaX = (calibration.x - currentNormalized.x) * MOVEMENT_SENSITIVITY
  const deltaY = (currentNormalized.y - calibration.y) * MOVEMENT_SENSITIVITY

  // Appliquer le delta à la position de repos du gant
  const calibratedX = (restPosition.x + deltaX) * screenWidth
  const calibratedY = (restPosition.y + deltaY) * screenHeight

  // Clamp aux limites de l'écran
  return {
    x: Math.max(0, Math.min(screenWidth, calibratedX)),
    y: Math.max(0, Math.min(screenHeight, calibratedY)),
  }
}

/**
 * Détecte si un mouvement de main constitue un coup
 * Utilise la vélocité Z + position Z pour une détection plus précise
 */
function detectPunch(
  hand: HandState,
  handState: HandInputState
): { isPunch: boolean; type: PunchType; velocity: number; extensionBonus: number } | null {
  const now = Date.now()

  // Cooldown entre les coups
  if (now - handState.lastPunchTime < PUNCH_CONFIG.punchCooldown) {
    return null
  }

  // Vérifier la vélocité Z (négatif = vers l'écran/adversaire)
  const velZ = hand.velocity.z
  if (velZ > -PUNCH_CONFIG.velocityThreshold) {
    return null
  }

  // Position Z actuelle du poignet
  const currentZ = hand.landmarks[0]?.z ?? 0

  // Calculer le bonus d'extension (si la main est plus avancée que la calibration)
  let extensionBonus = 0
  if (handState.calibratedZ !== null) {
    // Différence de Z par rapport à la calibration
    // Plus négatif = plus avancé vers la caméra
    const zDelta = handState.calibratedZ - currentZ
    if (zDelta > PUNCH_CONFIG.punchExtensionBonus) {
      extensionBonus = Math.min(zDelta / 0.1, 0.3) // Max 30% de bonus
    }
  }

  // Déterminer le type de coup basé sur la direction du mouvement
  let type: PunchType = 'jab'
  const velY = hand.velocity.y
  const velX = Math.abs(hand.velocity.x)

  // Uppercut: mouvement vers le haut (Y négatif en coordonnées écran = vers le haut)
  if (velY < -PUNCH_CONFIG.uppercutThreshold) {
    type = 'uppercut'
  }
  // Hook: mouvement latéral important
  else if (velX > PUNCH_CONFIG.hookThreshold && velX > Math.abs(velZ) * 0.5) {
    type = 'hook'
  }

  // Normaliser la vélocité entre 0 et 1
  const rawVelocity = Math.abs(velZ)
  const baseVelocity = Math.min(rawVelocity / PUNCH_CONFIG.maxVelocity, 1)

  // Ajouter le bonus d'extension
  const velocity = Math.min(baseVelocity + extensionBonus, 1)

  return { isPunch: true, type, velocity, extensionBonus }
}

/**
 * Hook unifié pour gérer les entrées tactile et caméra
 * En mode tactile: utilise les callbacks existants de usePunchDrag
 * En mode caméra: traduit les mouvements de mains en actions de gants
 */
export function useUnifiedInput(options: UseUnifiedInputOptions): UseUnifiedInputReturn {
  // Note: touchCallbacks est passé pour la cohérence de l'interface mais n'est pas utilisé ici
  // car le tactile est géré directement par usePunchDrag dans App.tsx
  const { cameraCallbacks, useCameraInput } = options

  // Store de hand tracking (avec calibration)
  const {
    leftHand,
    rightHand,
    isCameraEnabled,
    isTracking,
    isCalibrated,
    leftCalibration,
    rightCalibration,
  } = useHandTrackingStore()

  // État local des mains
  const leftHandState = useRef<HandInputState>({
    isActive: false,
    screenPosition: { x: 0, y: 0 },
    lastPunchTime: 0,
    calibratedZ: null,
    previousZ: null,
    isWindingUp: false,
  })
  const rightHandState = useRef<HandInputState>({
    isActive: false,
    screenPosition: { x: 0, y: 0 },
    lastPunchTime: 0,
    calibratedZ: null,
    previousZ: null,
    isWindingUp: false,
  })

  /**
   * Traite les mises à jour d'une main
   */
  const processHandUpdate = useCallback(
    (
      hand: HandState | null,
      calibration: CalibrationPoint | null,
      handState: React.MutableRefObject<HandInputState>,
      onMove: ((x: number, y: number) => void) | undefined,
      onPunch: ((data: PunchData) => void) | undefined,
      handSide: 'left' | 'right'
    ) => {
      if (!hand) {
        // Main perdue
        if (handState.current.isActive) {
          handState.current.isActive = false
          handState.current.calibratedZ = null
          handState.current.previousZ = null
          handState.current.isWindingUp = false
        }
        return
      }

      const currentZ = hand.landmarks[0]?.z ?? 0

      // Main détectée pour la première fois ou après calibration
      if (!handState.current.isActive) {
        handState.current.isActive = true
        // Initialiser la position Z de calibration
        handState.current.calibratedZ = currentZ
      }

      // Mettre à jour la calibration Z si on a une calibration globale
      if (calibration && handState.current.calibratedZ === null) {
        handState.current.calibratedZ = currentZ
      }

      // Détecter le "wind-up" (main qui recule avant de frapper)
      if (handState.current.previousZ !== null) {
        const zDelta = currentZ - handState.current.previousZ
        // Si la main recule (Z augmente), c'est un wind-up
        if (zDelta > PUNCH_CONFIG.windupZThreshold) {
          handState.current.isWindingUp = true
        }
      }
      handState.current.previousZ = currentZ

      // Calculer la position écran calibrée
      const screenPosition = calculateCalibratedPosition(
        hand,
        calibration,
        handSide,
        window.innerWidth,
        window.innerHeight
      )

      // Mettre à jour la position
      handState.current.screenPosition = screenPosition
      onMove?.(screenPosition.x, screenPosition.y)

      // Détecter un coup
      const punchResult = detectPunch(hand, handState.current)
      if (punchResult && punchResult.isPunch) {
        handState.current.lastPunchTime = Date.now()
        handState.current.isWindingUp = false

        const punchData: PunchData = {
          type: punchResult.type,
          velocity: punchResult.velocity,
          direction: [0, handSide === 'left' ? -1 : 1],
          screenPosition: [screenPosition.x, screenPosition.y],
        }

        // Log détaillé en dev
        if (import.meta.env.DEV) {
          console.log(
            `[${handSide.toUpperCase()}] ${punchResult.type} | vel: ${punchResult.velocity.toFixed(2)} ` +
            `(base + ${punchResult.extensionBonus.toFixed(2)} ext) | z: ${currentZ.toFixed(4)}`
          )
        }

        onPunch?.(punchData)
      }
    },
    []
  )

  // Traiter les mises à jour des mains quand en mode caméra
  useEffect(() => {
    if (!useCameraInput || !isCameraEnabled || !isTracking) {
      return
    }

    // Traiter la main gauche (avec calibration si disponible)
    processHandUpdate(
      leftHand,
      leftCalibration,
      leftHandState,
      cameraCallbacks.onLeftHandMove,
      cameraCallbacks.onLeftPunch,
      'left'
    )

    // Traiter la main droite (avec calibration si disponible)
    processHandUpdate(
      rightHand,
      rightCalibration,
      rightHandState,
      cameraCallbacks.onRightHandMove,
      cameraCallbacks.onRightPunch,
      'right'
    )
  }, [
    leftHand,
    rightHand,
    leftCalibration,
    rightCalibration,
    useCameraInput,
    isCameraEnabled,
    isTracking,
    cameraCallbacks,
    processHandUpdate,
  ])

  // Reset les états quand on change de mode
  useEffect(() => {
    if (!useCameraInput) {
      leftHandState.current = {
        isActive: false,
        screenPosition: { x: 0, y: 0 },
        lastPunchTime: 0,
        calibratedZ: null,
        previousZ: null,
        isWindingUp: false,
      }
      rightHandState.current = {
        isActive: false,
        screenPosition: { x: 0, y: 0 },
        lastPunchTime: 0,
        calibratedZ: null,
        previousZ: null,
        isWindingUp: false,
      }
    }
  }, [useCameraInput])

  return {
    inputSource: useCameraInput && isCameraEnabled && isTracking ? 'camera' : 'touch',
    leftHandActive: leftHandState.current.isActive,
    rightHandActive: rightHandState.current.isActive,
    isCalibrated,
  }
}
