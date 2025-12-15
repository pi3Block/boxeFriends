import { useCallback, useEffect, useState } from 'react'
import { useHandTrackingStore } from '../stores/useHandTrackingStore'

/**
 * Overlay de calibration pour le hand tracking
 * Affiché quand la caméra est active mais pas encore calibrée
 */
export function CalibrationOverlay() {
  const {
    isCameraEnabled,
    isTracking,
    isCalibrated,
    isCalibrating,
    leftHand,
    rightHand,
    startCalibration,
    calibrate,
    resetCalibration,
  } = useHandTrackingStore()

  // Compte à rebours pour la calibration
  const [countdown, setCountdown] = useState<number | null>(null)

  // Démarrer le compte à rebours de calibration
  const handleStartCalibration = useCallback(() => {
    startCalibration()
    setCountdown(3)
  }, [startCalibration])

  // Gérer le compte à rebours
  useEffect(() => {
    if (countdown === null) return

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      // Calibrer !
      const success = calibrate()
      if (!success) {
        // Échec - réessayer
        setCountdown(null)
      }
    }
  }, [countdown, calibrate])

  // Ne pas afficher si :
  // - Caméra désactivée
  // - Pas en tracking
  // - Déjà calibré
  if (!isCameraEnabled || !isTracking || isCalibrated) {
    return null
  }

  // Nombre de mains détectées
  const handsDetected = (leftHand ? 1 : 0) + (rightHand ? 1 : 0)

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="mx-4 max-w-md rounded-2xl bg-gray-900 p-8 text-center text-white shadow-2xl">
        {/* Titre */}
        <h2 className="mb-4 text-2xl font-bold">Calibration</h2>

        {/* Instructions */}
        <p className="mb-6 text-gray-300">
          Placez vos mains en position de garde (comme pour boxer) devant la caméra.
          Cette position sera votre position de repos.
        </p>

        {/* Indicateur de mains détectées */}
        <div className="mb-6 flex justify-center gap-8">
          <div className="flex flex-col items-center">
            <div
              className={`mb-2 h-16 w-16 rounded-full border-4 ${
                leftHand ? 'border-green-500 bg-green-500/20' : 'border-gray-600 bg-gray-800'
              } flex items-center justify-center transition-all`}
            >
              <span className="text-2xl">{leftHand ? '✋' : '?'}</span>
            </div>
            <span className={`text-sm ${leftHand ? 'text-green-400' : 'text-gray-500'}`}>
              Main gauche
            </span>
          </div>

          <div className="flex flex-col items-center">
            <div
              className={`mb-2 h-16 w-16 rounded-full border-4 ${
                rightHand ? 'border-green-500 bg-green-500/20' : 'border-gray-600 bg-gray-800'
              } flex items-center justify-center transition-all`}
            >
              <span className="text-2xl">{rightHand ? '✋' : '?'}</span>
            </div>
            <span className={`text-sm ${rightHand ? 'text-green-400' : 'text-gray-500'}`}>
              Main droite
            </span>
          </div>
        </div>

        {/* État de détection */}
        <p className="mb-6 text-sm text-gray-400">
          {handsDetected === 0 && 'Aucune main détectée - Montrez vos mains à la caméra'}
          {handsDetected === 1 && '1 main détectée - Montrez vos deux mains'}
          {handsDetected === 2 && '2 mains détectées !'}
        </p>

        {/* Compte à rebours ou bouton */}
        {isCalibrating && countdown !== null ? (
          <div className="flex flex-col items-center">
            <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-red-600 text-5xl font-bold">
              {countdown > 0 ? countdown : '!'}
            </div>
            <p className="text-gray-300">
              {countdown > 0 ? 'Ne bougez pas...' : 'Calibration !'}
            </p>
          </div>
        ) : (
          <button
            onClick={handleStartCalibration}
            disabled={handsDetected < 1}
            className={`rounded-lg px-8 py-4 text-xl font-bold transition ${
              handsDetected >= 1
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'cursor-not-allowed bg-gray-700 text-gray-500'
            }`}
          >
            Calibrer
          </button>
        )}

        {/* Note */}
        <p className="mt-6 text-xs text-gray-500">
          Vous pourrez recalibrer à tout moment depuis les paramètres
        </p>
      </div>
    </div>
  )
}

export default CalibrationOverlay
