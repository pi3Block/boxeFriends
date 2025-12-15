import { useCallback, useEffect, useRef } from 'react'
import { useHandTrackingStore, type HandState } from '../stores/useHandTrackingStore'
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

/**
 * Options pour le hook useHandTracking
 */
interface UseHandTrackingOptions {
  targetFps?: number // FPS cible pour le tracking (défaut: 30)
  minDetectionConfidence?: number // Confiance minimum pour détecter (défaut: 0.5)
  minTrackingConfidence?: number // Confiance minimum pour tracker (défaut: 0.5)
}

/**
 * Valeur de retour du hook
 */
interface UseHandTrackingReturn {
  isReady: boolean
  isTracking: boolean
  error: string | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  startTracking: () => Promise<void>
  stopTracking: () => void
}

// Configuration par défaut
const DEFAULT_OPTIONS: Required<UseHandTrackingOptions> = {
  targetFps: 30,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
}

// Configuration de la caméra
const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: 'user', // Caméra frontale
    width: { ideal: 640 },
    height: { ideal: 480 },
  },
  audio: false,
}

// Historique pour le calcul de vélocité
const VELOCITY_HISTORY_SIZE = 3

/**
 * Interface pour une main détectée
 */
interface DetectedHand {
  handedness: 'Left' | 'Right'
  landmarks: NormalizedLandmark[]
  worldLandmarks: { x: number; y: number; z: number }[]
}

/**
 * Hook pour gérer le hand tracking via MediaPipe
 * Exécute MediaPipe dans le thread principal (utilise WebGL pour l'inférence)
 */
export function useHandTracking(
  options: UseHandTrackingOptions = {}
): UseHandTrackingReturn {
  const config = { ...DEFAULT_OPTIONS, ...options }

  // Refs
  const handLandmarkerRef = useRef<HandLandmarker | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef<number>(0)
  const errorRef = useRef<string | null>(null)
  const isRunningRef = useRef<boolean>(false)

  // Historique des positions pour calcul vélocité
  const leftHandHistoryRef = useRef<{ pos: { x: number; y: number; z: number }; time: number }[]>([])
  const rightHandHistoryRef = useRef<{ pos: { x: number; y: number; z: number }; time: number }[]>([])

  // Store
  const {
    isCameraEnabled,
    isTracking,
    isInitializing,
    setLeftHand,
    setRightHand,
    setCameraPermission,
    setIsTracking,
    setIsInitializing,
  } = useHandTrackingStore()

  /**
   * Calcule la vélocité à partir de l'historique des positions
   */
  const calculateVelocity = useCallback(
    (
      history: { pos: { x: number; y: number; z: number }; time: number }[],
      currentPos: { x: number; y: number; z: number },
      currentTime: number
    ): { x: number; y: number; z: number } => {
      // Utiliser la position la plus ancienne pour un calcul plus stable
      const oldest = history[0]
      if (!oldest) {
        return { x: 0, y: 0, z: 0 }
      }

      const deltaTime = (currentTime - oldest.time) / 1000 // Convertir en secondes

      if (deltaTime <= 0) {
        return { x: 0, y: 0, z: 0 }
      }

      return {
        x: (currentPos.x - oldest.pos.x) / deltaTime,
        y: (currentPos.y - oldest.pos.y) / deltaTime,
        z: (currentPos.z - oldest.pos.z) / deltaTime,
      }
    },
    []
  )

  /**
   * Met à jour l'historique des positions
   */
  const updateHistory = useCallback(
    (
      history: { pos: { x: number; y: number; z: number }; time: number }[],
      pos: { x: number; y: number; z: number },
      time: number
    ) => {
      history.push({ pos, time })
      while (history.length > VELOCITY_HISTORY_SIZE) {
        history.shift()
      }
    },
    []
  )

  /**
   * Convertit une main détectée en HandState
   */
  const detectedHandToState = useCallback(
    (
      hand: DetectedHand,
      history: { pos: { x: number; y: number; z: number }; time: number }[],
      timestamp: number,
      screenWidth: number,
      screenHeight: number
    ): HandState => {
      // Landmark 0 = poignet (wrist)
      const wrist = hand.landmarks[0]
      const worldWrist = hand.worldLandmarks[0] || { x: 0, y: 0, z: 0 }

      // Position écran (inversée en X car caméra miroir)
      const screenPosition = wrist
        ? { x: (1 - wrist.x) * screenWidth, y: wrist.y * screenHeight }
        : { x: screenWidth / 2, y: screenHeight / 2 }

      // Calculer la vélocité
      const velocity = calculateVelocity(history, worldWrist, timestamp)

      // Mettre à jour l'historique
      updateHistory(history, worldWrist, timestamp)

      return {
        landmarks: hand.landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z })),
        screenPosition,
        velocity,
        lastUpdate: timestamp,
      }
    },
    [calculateVelocity, updateHistory]
  )

  /**
   * Traite les résultats de détection
   */
  const processResults = useCallback(
    (results: HandLandmarkerResult, timestamp: number) => {
      const screenWidth = window.innerWidth
      const screenHeight = window.innerHeight

      // Convertir les résultats en DetectedHand[]
      const hands: DetectedHand[] = []
      if (results.landmarks && results.handednesses) {
        for (let i = 0; i < results.landmarks.length; i++) {
          const handedness = results.handednesses[i]?.[0]
          const landmarks = results.landmarks[i]
          if (handedness && landmarks) {
            hands.push({
              // MediaPipe retourne "Left" ou "Right" du point de vue anatomique de l'utilisateur
              // Donc "Left" = main gauche de l'utilisateur, pas besoin d'inverser
              handedness: handedness.categoryName as 'Left' | 'Right',
              landmarks,
              worldLandmarks: results.worldLandmarks?.[i] ?? [],
            })
          }
        }
      }

      // Trouver la main gauche et droite
      const leftHand = hands.find((h) => h.handedness === 'Left')
      const rightHand = hands.find((h) => h.handedness === 'Right')

      // Convertir et mettre à jour le store
      if (leftHand) {
        const state = detectedHandToState(
          leftHand,
          leftHandHistoryRef.current,
          timestamp,
          screenWidth,
          screenHeight
        )
        setLeftHand(state)
      } else {
        setLeftHand(null)
        leftHandHistoryRef.current = []
      }

      if (rightHand) {
        const state = detectedHandToState(
          rightHand,
          rightHandHistoryRef.current,
          timestamp,
          screenWidth,
          screenHeight
        )
        setRightHand(state)
      } else {
        setRightHand(null)
        rightHandHistoryRef.current = []
      }
    },
    [detectedHandToState, setLeftHand, setRightHand]
  )

  /**
   * Boucle de détection des frames
   */
  const detectLoop = useCallback(() => {
    if (!isRunningRef.current) return

    const video = videoRef.current
    const handLandmarker = handLandmarkerRef.current

    if (!video || !handLandmarker || video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(detectLoop)
      return
    }

    const now = performance.now()
    const targetInterval = 1000 / config.targetFps

    // Throttle au FPS cible
    if (now - lastFrameTimeRef.current >= targetInterval) {
      lastFrameTimeRef.current = now

      try {
        // Détecter les mains directement (WebGL inference)
        const results = handLandmarker.detectForVideo(video, now)
        processResults(results, now)
      } catch (err) {
        console.error('[HandTracking] Detection error:', err)
      }
    }

    animationFrameRef.current = requestAnimationFrame(detectLoop)
  }, [config.targetFps, processResults])

  /**
   * Initialise MediaPipe HandLandmarker
   */
  const initializeHandLandmarker = useCallback(async (): Promise<HandLandmarker> => {
    // Charger le fileset (WASM et modèles)
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    )

    // Créer le HandLandmarker
    const handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU', // Utiliser le GPU si disponible
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: config.minDetectionConfidence,
      minHandPresenceConfidence: config.minTrackingConfidence,
      minTrackingConfidence: config.minTrackingConfidence,
    })

    return handLandmarker
  }, [config.minDetectionConfidence, config.minTrackingConfidence])

  /**
   * Démarre le tracking
   */
  const startTracking = useCallback(async (): Promise<void> => {
    if (isTracking || isInitializing) return

    setIsInitializing(true)
    errorRef.current = null

    try {
      // Demander l'accès à la caméra
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)
      streamRef.current = stream
      setCameraPermission('granted')

      // Configurer l'élément vidéo
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Initialiser MediaPipe
      console.log('[HandTracking] Initializing MediaPipe HandLandmarker...')
      handLandmarkerRef.current = await initializeHandLandmarker()
      console.log('[HandTracking] MediaPipe ready')

      // Marquer comme prêt
      setIsInitializing(false)
      setIsTracking(true)
      isRunningRef.current = true

      // Démarrer la boucle de détection
      animationFrameRef.current = requestAnimationFrame(detectLoop)
    } catch (error) {
      setIsInitializing(false)

      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          setCameraPermission('denied')
          errorRef.current = 'Camera permission denied'
        } else {
          errorRef.current = error.message
        }
        console.error('[HandTracking] Failed to start:', error)
      }

      throw error
    }
  }, [
    isTracking,
    isInitializing,
    detectLoop,
    initializeHandLandmarker,
    setCameraPermission,
    setIsInitializing,
    setIsTracking,
  ])

  /**
   * Arrête le tracking
   */
  const stopTracking = useCallback(() => {
    isRunningRef.current = false

    // Arrêter la boucle de détection
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Fermer le HandLandmarker
    if (handLandmarkerRef.current) {
      handLandmarkerRef.current.close()
      handLandmarkerRef.current = null
    }

    // Arrêter le stream caméra
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    // Reset l'élément vidéo
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    // Reset l'historique
    leftHandHistoryRef.current = []
    rightHandHistoryRef.current = []

    // Reset le store
    setLeftHand(null)
    setRightHand(null)
    setIsTracking(false)
    setIsInitializing(false)
  }, [setLeftHand, setRightHand, setIsTracking, setIsInitializing])

  // Démarrer/arrêter automatiquement selon isCameraEnabled
  useEffect(() => {
    if (isCameraEnabled && !isTracking && !isInitializing) {
      startTracking().catch((err) => {
        console.error('[HandTracking] Failed to start:', err)
      })
    } else if (!isCameraEnabled && (isTracking || isInitializing)) {
      stopTracking()
    }
  }, [isCameraEnabled, isTracking, isInitializing, startTracking, stopTracking])

  // Cleanup au démontage
  useEffect(() => {
    return () => {
      stopTracking()
    }
  }, [stopTracking])

  return {
    isReady: isTracking && !isInitializing,
    isTracking,
    error: errorRef.current,
    videoRef,
    startTracking,
    stopTracking,
  }
}
