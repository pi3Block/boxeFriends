import { useEffect, useRef, useCallback } from 'react'
import { useHandTrackingStore, type HandState } from '../stores/useHandTrackingStore'

/**
 * Configuration du logger
 */
const LOGGER_CONFIG = {
  // Fréquence de log des positions (ms)
  positionLogInterval: 500,
  // Activer les logs de position
  logPositions: true,
  // Activer les logs de vélocité
  logVelocity: true,
  // Activer les logs de coups
  logPunches: true,
  // Activer l'enregistrement des données
  recordData: true,
  // Durée max d'enregistrement (ms)
  maxRecordDuration: 30000,
}

/**
 * Structure d'un échantillon de données
 */
interface DataSample {
  timestamp: number
  leftHand: {
    position: { x: number; y: number; z: number } | null
    screenPosition: { x: number; y: number } | null
    velocity: { x: number; y: number; z: number } | null
  }
  rightHand: {
    position: { x: number; y: number; z: number } | null
    screenPosition: { x: number; y: number } | null
    velocity: { x: number; y: number; z: number } | null
  }
}

/**
 * Structure d'un événement de coup
 */
interface PunchEvent {
  timestamp: number
  hand: 'left' | 'right'
  type: 'jab' | 'hook' | 'uppercut'
  velocity: number
  handPosition: { x: number; y: number; z: number }
  glovePosition: { x: number; y: number }
  velocityVector: { x: number; y: number; z: number }
}

/**
 * Hook pour logger et analyser les données du hand tracking
 */
export function useHandTrackingLogger(enabled: boolean = true) {
  const { leftHand, rightHand, isTracking, isCalibrated, leftCalibration, rightCalibration } =
    useHandTrackingStore()

  // Données enregistrées
  const samplesRef = useRef<DataSample[]>([])
  const punchEventsRef = useRef<PunchEvent[]>([])
  const startTimeRef = useRef<number>(0)
  const isRecordingRef = useRef<boolean>(false)
  const lastLogTimeRef = useRef<number>(0)

  /**
   * Démarre l'enregistrement
   */
  const startRecording = useCallback(() => {
    samplesRef.current = []
    punchEventsRef.current = []
    startTimeRef.current = performance.now()
    isRecordingRef.current = true
    console.log('[HandTrackingLogger] 🎬 Recording started')
  }, [])

  /**
   * Arrête l'enregistrement et exporte les données
   */
  const stopRecording = useCallback(() => {
    isRecordingRef.current = false
    const duration = performance.now() - startTimeRef.current

    console.log('[HandTrackingLogger] ⏹️ Recording stopped')
    console.log(`[HandTrackingLogger] Duration: ${(duration / 1000).toFixed(1)}s`)
    console.log(`[HandTrackingLogger] Samples: ${samplesRef.current.length}`)
    console.log(`[HandTrackingLogger] Punches: ${punchEventsRef.current.length}`)

    // Analyser les données
    analyzeRecording()

    return {
      samples: samplesRef.current,
      punches: punchEventsRef.current,
      duration,
    }
  }, [])

  /**
   * Analyse les données enregistrées
   */
  const analyzeRecording = useCallback(() => {
    const samples = samplesRef.current
    const punches = punchEventsRef.current

    if (samples.length === 0) {
      console.log('[HandTrackingLogger] No data to analyze')
      return
    }

    // Calculer les statistiques de position Z
    const leftZPositions = samples
      .filter((s) => s.leftHand.position)
      .map((s) => s.leftHand.position!.z)
    const rightZPositions = samples
      .filter((s) => s.rightHand.position)
      .map((s) => s.rightHand.position!.z)

    // Calculer les statistiques de vélocité Z
    const leftZVelocities = samples
      .filter((s) => s.leftHand.velocity)
      .map((s) => s.leftHand.velocity!.z)
    const rightZVelocities = samples
      .filter((s) => s.rightHand.velocity)
      .map((s) => s.rightHand.velocity!.z)

    console.log('\n📊 === ANALYSE DES DONNÉES ===')

    if (leftZPositions.length > 0) {
      console.log('\n🥊 MAIN GAUCHE:')
      console.log(`  Position Z: min=${Math.min(...leftZPositions).toFixed(4)}, max=${Math.max(...leftZPositions).toFixed(4)}, avg=${(leftZPositions.reduce((a, b) => a + b, 0) / leftZPositions.length).toFixed(4)}`)
      console.log(`  Vélocité Z: min=${Math.min(...leftZVelocities).toFixed(4)}, max=${Math.max(...leftZVelocities).toFixed(4)}`)
    }

    if (rightZPositions.length > 0) {
      console.log('\n🥊 MAIN DROITE:')
      console.log(`  Position Z: min=${Math.min(...rightZPositions).toFixed(4)}, max=${Math.max(...rightZPositions).toFixed(4)}, avg=${(rightZPositions.reduce((a, b) => a + b, 0) / rightZPositions.length).toFixed(4)}`)
      console.log(`  Vélocité Z: min=${Math.min(...rightZVelocities).toFixed(4)}, max=${Math.max(...rightZVelocities).toFixed(4)}`)
    }

    // Analyser les coups
    if (punches.length > 0) {
      console.log('\n👊 COUPS DÉTECTÉS:')
      const leftPunches = punches.filter((p) => p.hand === 'left')
      const rightPunches = punches.filter((p) => p.hand === 'right')

      console.log(`  Main gauche: ${leftPunches.length} coups`)
      console.log(`  Main droite: ${rightPunches.length} coups`)

      // Vélocité moyenne des coups
      const avgPunchVelocity = punches.reduce((a, p) => a + p.velocity, 0) / punches.length
      console.log(`  Vélocité moyenne: ${avgPunchVelocity.toFixed(2)}`)

      // Position Z au moment du coup
      const punchZPositions = punches.map((p) => p.handPosition.z)
      console.log(`  Position Z au coup: min=${Math.min(...punchZPositions).toFixed(4)}, max=${Math.max(...punchZPositions).toFixed(4)}`)

      // Types de coups
      const jabCount = punches.filter((p) => p.type === 'jab').length
      const uppercutCount = punches.filter((p) => p.type === 'uppercut').length
      const hookCount = punches.filter((p) => p.type === 'hook').length
      console.log(`  Types: ${jabCount} jabs, ${uppercutCount} uppercuts, ${hookCount} hooks`)
    }

    console.log('\n================================\n')
  }, [])

  /**
   * Log un coup détecté
   */
  const logPunch = useCallback(
    (
      hand: 'left' | 'right',
      type: 'jab' | 'hook' | 'uppercut',
      velocity: number,
      glovePosition: { x: number; y: number }
    ) => {
      if (!enabled || !LOGGER_CONFIG.logPunches) return

      const handState = hand === 'left' ? leftHand : rightHand
      if (!handState) return

      const wristLandmark = handState.landmarks[0]
      const handPosition = wristLandmark
        ? { x: wristLandmark.x, y: wristLandmark.y, z: wristLandmark.z }
        : { x: 0, y: 0, z: 0 }

      const event: PunchEvent = {
        timestamp: performance.now(),
        hand,
        type,
        velocity,
        handPosition,
        glovePosition,
        velocityVector: handState.velocity,
      }

      if (isRecordingRef.current) {
        punchEventsRef.current.push(event)
      }

      // Log formaté
      console.log(
        `[PUNCH] 👊 ${hand.toUpperCase()} ${type} | vel: ${velocity.toFixed(2)} | ` +
        `hand Z: ${handPosition.z.toFixed(4)} | velZ: ${handState.velocity.z.toFixed(4)} | ` +
        `glove: (${glovePosition.x.toFixed(0)}, ${glovePosition.y.toFixed(0)})`
      )
    },
    [enabled, leftHand, rightHand]
  )

  // Logger les positions périodiquement
  useEffect(() => {
    if (!enabled || !isTracking || !LOGGER_CONFIG.logPositions) return

    const now = performance.now()
    if (now - lastLogTimeRef.current < LOGGER_CONFIG.positionLogInterval) return
    lastLogTimeRef.current = now

    // Créer l'échantillon
    const sample: DataSample = {
      timestamp: now,
      leftHand: {
        position: leftHand?.landmarks[0]
          ? { x: leftHand.landmarks[0].x, y: leftHand.landmarks[0].y, z: leftHand.landmarks[0].z }
          : null,
        screenPosition: leftHand?.screenPosition ?? null,
        velocity: leftHand?.velocity ?? null,
      },
      rightHand: {
        position: rightHand?.landmarks[0]
          ? { x: rightHand.landmarks[0].x, y: rightHand.landmarks[0].y, z: rightHand.landmarks[0].z }
          : null,
        screenPosition: rightHand?.screenPosition ?? null,
        velocity: rightHand?.velocity ?? null,
      },
    }

    // Enregistrer si en cours
    if (isRecordingRef.current) {
      samplesRef.current.push(sample)

      // Arrêter si durée max atteinte
      if (now - startTimeRef.current > LOGGER_CONFIG.maxRecordDuration) {
        stopRecording()
      }
    }

    // Log périodique des positions
    if (import.meta.env.DEV && LOGGER_CONFIG.logVelocity) {
      const leftInfo = leftHand
        ? `L: z=${leftHand.landmarks[0]?.z.toFixed(4) ?? 'N/A'} vz=${leftHand.velocity.z.toFixed(4)}`
        : 'L: --'
      const rightInfo = rightHand
        ? `R: z=${rightHand.landmarks[0]?.z.toFixed(4) ?? 'N/A'} vz=${rightHand.velocity.z.toFixed(4)}`
        : 'R: --'

      console.log(`[HandPos] ${leftInfo} | ${rightInfo}`)
    }
  }, [enabled, isTracking, leftHand, rightHand, stopRecording])

  return {
    isRecording: isRecordingRef.current,
    startRecording,
    stopRecording,
    logPunch,
    analyzeRecording,
    samplesCount: samplesRef.current.length,
    punchesCount: punchEventsRef.current.length,
  }
}

/**
 * Expose les fonctions de log globalement pour debug console
 */
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__handTrackingLogger = {
    getStore: () => useHandTrackingStore.getState(),
    getSamples: () => console.log('Use startRecording() first via the logger hook'),
  }
}
