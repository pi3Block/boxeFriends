import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import { useGameStore, useHandTrackingStore } from '../stores'
import { CharacterSelector } from './CharacterSelector'
import { FaceCropper } from './FaceCropper'
import { alignFace } from '../utils/FaceAligner'

/**
 * Composant UI overlay (HTML au-dessus du Canvas)
 */
export function UI() {
  const gameState = useGameStore((state) => state.gameState)
  const playerHp = useGameStore((state) => state.playerHp)
  const opponentHp = useGameStore((state) => state.opponentHp)
  const opponentTexture = useGameStore((state) => state.opponentTexture)
  const isCustomTexture = useGameStore((state) => state.isCustomTexture)
  const setTexture = useGameStore((state) => state.setTexture)
  const startFight = useGameStore((state) => state.startFight)
  const resetGame = useGameStore((state) => state.resetGame)

  // Hand tracking store
  const isCameraEnabled = useHandTrackingStore((state) => state.isCameraEnabled)
  const isTracking = useHandTrackingStore((state) => state.isTracking)
  const isCalibrated = useHandTrackingStore((state) => state.isCalibrated)
  const setCameraEnabled = useHandTrackingStore((state) => state.setCameraEnabled)
  const resetCalibration = useHandTrackingStore((state) => state.resetCalibration)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')

  // État pour le cropper
  const [showCropper, setShowCropper] = useState(false)
  const [rawImageUrl, setRawImageUrl] = useState<string | null>(null)

  /**
   * Gère l'upload de photo - ouvre le cropper
   */
  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      // Vérifier le type
      if (!file.type.startsWith('image/')) {
        alert('Veuillez sélectionner une image')
        return
      }

      // Créer URL et ouvrir le cropper
      const url = URL.createObjectURL(file)
      setRawImageUrl(url)
      setShowCropper(true)
    },
    []
  )

  /**
   * Callback quand l'utilisateur confirme le crop
   */
  const handleCropConfirm = useCallback(
    async (croppedImageUrl: string) => {
      setShowCropper(false)

      // Nettoyer l'ancienne URL
      if (rawImageUrl) {
        URL.revokeObjectURL(rawImageUrl)
        setRawImageUrl(null)
      }

      setIsProcessing(true)
      setProcessingStatus('Alignement du visage...')

      try {
        // Aligner le visage avec MediaPipe sur l'image croppée
        const result = await alignFace(croppedImageUrl, {
          outputSize: 512,
          eyeLineY: 0.38,
          faceWidthRatio: 0.65,
        })

        if (result.success && result.alignedImageUrl) {
          setProcessingStatus('Visage aligné!')
          // Nettoyer l'URL croppée
          URL.revokeObjectURL(croppedImageUrl)
          setTexture(result.alignedImageUrl)
          console.log('[UI] Face alignment successful')
        } else {
          // Utiliser l'image croppée directement si MediaPipe échoue
          console.warn('[UI] MediaPipe alignment failed, using cropped image:', result.error)
          setProcessingStatus('Utilisation de l\'image recadrée')
          setTexture(croppedImageUrl)
        }
      } catch (error) {
        console.error('[UI] Error during face alignment:', error)
        // Utiliser l'image croppée directement
        setTexture(croppedImageUrl)
      } finally {
        setTimeout(() => {
          setIsProcessing(false)
          setProcessingStatus('')
        }, 1000)
      }
    },
    [rawImageUrl, setTexture]
  )

  /**
   * Callback quand l'utilisateur annule le crop
   */
  const handleCropCancel = useCallback(() => {
    setShowCropper(false)
    if (rawImageUrl) {
      URL.revokeObjectURL(rawImageUrl)
      setRawImageUrl(null)
    }
  }, [rawImageUrl])

  /**
   * Déclenche l'input file
   */
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      {/* Input file caché */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* LOBBY */}
      {gameState === 'LOBBY' && (
        <div className="pointer-events-auto flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto bg-black/50 py-8">
          <h1 className="text-4xl font-bold text-white">FACE PUNCHER</h1>

          {/* Sélecteur de personnage */}
          <CharacterSelector />

          {/* Preview de la photo */}
          <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-white">
            <img
              src={opponentTexture}
              alt="Opponent"
              className="h-full w-full object-cover"
            />
          </div>

          {/* Bouton upload */}
          <button
            onClick={handleUploadClick}
            disabled={isProcessing}
            className={`rounded-lg px-6 py-3 font-bold text-white transition ${
              isProcessing
                ? 'cursor-wait bg-gray-500'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isProcessing
              ? processingStatus || 'Traitement...'
              : isCustomTexture
                ? 'Changer la photo'
                : 'Choisir une photo (visage)'}
          </button>

          {/* Info sur le processus */}
          <p className="text-xs text-gray-300">
            Recadrez le visage, puis alignement automatique
          </p>

          {/* Toggle caméra pour hand tracking */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCameraEnabled(!isCameraEnabled)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 font-bold transition ${
                isCameraEnabled
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
              }`}
            >
              {/* Icône caméra */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
              {isCameraEnabled ? 'Caméra ON' : 'Caméra OFF'}
            </button>
            <span className="text-xs text-gray-400">
              Contrôle par gestes
            </span>
          </div>

          {/* Bouton start */}
          <button
            onClick={startFight}
            className="rounded-lg bg-red-600 px-8 py-4 text-xl font-bold text-white transition hover:bg-red-700"
          >
            FIGHT!
          </button>
        </div>
      )}

      {/* FIGHTING - HUD */}
      {gameState === 'FIGHTING' && (
        <>
          {/* Indicateur de tracking caméra + recalibrer (coin supérieur droit) */}
          {isCameraEnabled && (
            <div className="absolute right-4 top-4 flex items-center gap-2">
              {/* Bouton recalibrer */}
              {isCalibrated && (
                <button
                  onClick={resetCalibration}
                  className="rounded-full bg-black/50 px-3 py-1 text-xs text-white transition hover:bg-black/70"
                >
                  Recalibrer
                </button>
              )}
              {/* Statut tracking */}
              <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1">
                <span
                  className={`h-2 w-2 rounded-full ${
                    isTracking ? 'animate-pulse bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className="text-xs text-white">
                  {isTracking ? 'Tracking' : 'No hands'}
                </span>
              </div>
            </div>
          )}

          {/* Barre de vie adversaire (top) */}
          <div className="p-4">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-1 text-center text-sm font-bold text-white drop-shadow-lg">
                ADVERSAIRE
              </div>
              <div className="h-6 w-full overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-200"
                  style={{ width: `${opponentHp}%` }}
                />
              </div>
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Barre de vie joueur (bottom) */}
          <div className="p-4">
            <div className="mx-auto w-full max-w-md">
              <div className="h-4 w-full overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-200"
                  style={{ width: `${playerHp}%` }}
                />
              </div>
              <div className="mt-1 text-center text-xs font-bold text-white drop-shadow-lg">
                VOUS
              </div>
            </div>
          </div>
        </>
      )}

      {/* KO */}
      {gameState === 'KO' && (
        <div className="pointer-events-auto flex flex-1 flex-col items-center justify-center gap-6 bg-black/70">
          <h1 className="animate-bounce text-6xl font-black text-red-500">
            K.O.!
          </h1>

          {opponentHp <= 0 && (
            <p className="text-2xl font-bold text-green-400">VICTOIRE!</p>
          )}

          {playerHp <= 0 && (
            <p className="text-2xl font-bold text-red-400">DÉFAITE...</p>
          )}

          <button
            onClick={resetGame}
            className="rounded-lg bg-blue-600 px-8 py-4 text-xl font-bold text-white transition hover:bg-blue-700"
          >
            REJOUER
          </button>
        </div>
      )}

      {/* Modal de crop */}
      {showCropper && rawImageUrl && (
        <FaceCropper
          imageUrl={rawImageUrl}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  )
}

export default UI
