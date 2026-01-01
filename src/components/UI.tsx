import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import { useGameStore, useHandTrackingStore } from '../stores'
import { FaceCropper } from './FaceCropper'
import { PunchButtons } from './PunchButtons'
import { SettingsPanel } from './SettingsPanel'
import { GameHUD } from './GameHUD'
import { ResultsScreen } from './ResultsScreen'
import { alignFace } from '../utils/FaceAligner'

/**
 * Composant UI overlay (HTML au-dessus du Canvas)
 */
export function UI() {
  const gameState = useGameStore((state) => state.gameState)
  const opponentTexture = useGameStore((state) => state.opponentTexture)
  const isCustomTexture = useGameStore((state) => state.isCustomTexture)
  const setTexture = useGameStore((state) => state.setTexture)
  const startFight = useGameStore((state) => state.startFight)

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

      {/* LOBBY - Modern Mobile-First Design */}
      {gameState === 'LOBBY' && (
        <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-8 bg-black/90 px-6 py-8">
          {/* Header */}
          <div className="flex flex-col items-center gap-2">
            <h1 className="bg-gradient-to-r from-red-500 via-orange-400 to-yellow-400 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl">
              FACE PUNCHER
            </h1>
            <p className="text-sm text-gray-400">Tape sur la tête de quelqu'un</p>
          </div>

          {/* Photo Section - Central Focus */}
          <div className="flex flex-col items-center gap-4">
            {/* Photo Preview - Interactive */}
            <button
              onClick={handleUploadClick}
              disabled={isProcessing}
              className="group relative"
            >
              <div className={`h-32 w-32 overflow-hidden rounded-full border-4 transition-all duration-300 sm:h-40 sm:w-40 ${
                isProcessing
                  ? 'animate-pulse border-gray-500'
                  : 'border-white/80 group-hover:border-white group-hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]'
              }`}>
                {opponentTexture ? (
                  <img
                    src={opponentTexture}
                    alt="Opponent"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-800 to-amber-950">
                    <svg className="h-16 w-16 text-amber-600/50" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                  </div>
                )}
              </div>
              {/* Overlay on hover/tap */}
              {!isProcessing && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100">
                  <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              )}
              {/* Processing indicator */}
              {isProcessing && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-6 w-6 animate-spin rounded-full border-3 border-white/30 border-t-white" />
                    <span className="text-xs text-white">{processingStatus}</span>
                  </div>
                </div>
              )}
            </button>

            {/* Upload hint */}
            <p className="text-center text-sm text-gray-400">
              {isCustomTexture ? 'Touche pour changer' : 'Ajoute un visage'}
            </p>
          </div>

          {/* Camera Toggle - Compact */}
          <button
            onClick={() => setCameraEnabled(!isCameraEnabled)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
              isCameraEnabled
                ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/50'
                : 'bg-white/10 text-gray-400 ring-1 ring-white/20 active:bg-white/20'
            }`}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
            {isCameraEnabled ? 'Gestes ON' : 'Gestes OFF'}
          </button>

          {/* Fight Button - Large and Prominent */}
          <button
            onClick={startFight}
            className="group relative w-full max-w-xs overflow-hidden rounded-2xl bg-gradient-to-r from-red-600 via-red-500 to-orange-500 py-4 text-xl font-black uppercase tracking-wider text-white shadow-lg shadow-red-500/30 transition-all duration-300 active:scale-95 sm:py-5 sm:text-2xl"
          >
            {/* Shine effect */}
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className="relative flex items-center justify-center gap-3">
              {/* Boxing glove icon */}
              <svg className="h-7 w-7 sm:h-8 sm:w-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 12c0-3.31-2.69-6-6-6h-2c-3.31 0-6 2.69-6 6v4c0 1.1.9 2 2 2h2v2c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2v-2h2c1.1 0 2-.9 2-2v-4zm-6-4c2.21 0 4 1.79 4 4v2h-8v-2c0-2.21 1.79-4 4-4z"/>
              </svg>
              FIGHT!
            </span>
          </button>
        </div>
      )}

      {/* COUNTDOWN et FIGHTING - HUD */}
      {(gameState === 'COUNTDOWN' || gameState === 'FIGHTING') && (
        <>
          {/* GameHUD (timer, score, countdown) */}
          <GameHUD />

          {/* Indicateur de tracking caméra (en bas du score, donc à droite) */}
          {isCameraEnabled && gameState === 'FIGHTING' && (
            <div className="pointer-events-auto absolute right-4 top-28 flex items-center gap-2">
              {isCalibrated && (
                <button
                  onClick={resetCalibration}
                  className="rounded-full bg-black/50 px-3 py-1 text-xs text-white transition hover:bg-black/70"
                >
                  Recalibrer
                </button>
              )}
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

          {/* Spacer */}
          <div className="flex-1" />

          {/* Boutons de punch centrés (seulement en FIGHTING) */}
          {gameState === 'FIGHTING' && (
            <div className="mb-20 sm:mb-6">
              <PunchButtons />
            </div>
          )}

          {/* Panneau de paramètres (bas droite) - seulement en FIGHTING */}
          {gameState === 'FIGHTING' && <SettingsPanel />}
        </>
      )}

      {/* Écran de résultats */}
      <ResultsScreen />

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
