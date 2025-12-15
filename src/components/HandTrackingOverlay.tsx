import { useEffect } from 'react'
import { useHandTracking } from '../hooks/useHandTracking'
import { useHandTrackingStore } from '../stores/useHandTrackingStore'

/**
 * Props pour HandTrackingOverlay
 */
interface HandTrackingOverlayProps {
  showDebug?: boolean // Afficher les indicateurs de debug
}

/**
 * Overlay pour le hand tracking
 * - Contient l'élément video caché pour la capture caméra
 * - Optionnellement affiche des indicateurs de debug
 */
export function HandTrackingOverlay({ showDebug = false }: HandTrackingOverlayProps) {
  const { videoRef, isReady, isTracking, error } = useHandTracking()
  const { leftHand, rightHand, isCameraEnabled, isInitializing } = useHandTrackingStore()

  // Log les erreurs
  useEffect(() => {
    if (error) {
      console.error('[HandTrackingOverlay] Error:', error)
    }
  }, [error])

  // Ne rien afficher si la caméra n'est pas activée
  if (!isCameraEnabled) {
    return null
  }

  return (
    <>
      {/* Élément video caché pour la capture caméra */}
      <video
        ref={videoRef as React.RefObject<HTMLVideoElement>}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
          transform: 'scaleX(-1)', // Miroir
        }}
        playsInline
        muted
        autoPlay
      />

      {/* Indicateurs de debug (optionnel) */}
      {showDebug && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            padding: '8px 12px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            borderRadius: 8,
            color: 'white',
            fontSize: 12,
            fontFamily: 'monospace',
            zIndex: 1000,
          }}
        >
          <div style={{ marginBottom: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: isReady ? '#4ade80' : isInitializing ? '#fbbf24' : '#ef4444',
                marginRight: 6,
              }}
            />
            {isInitializing ? 'Initializing...' : isReady ? 'Tracking' : 'Not tracking'}
          </div>
          {isTracking && (
            <>
              <div>
                L: {leftHand ? `(${leftHand.screenPosition.x.toFixed(0)}, ${leftHand.screenPosition.y.toFixed(0)})` : 'none'}
              </div>
              <div>
                R: {rightHand ? `(${rightHand.screenPosition.x.toFixed(0)}, ${rightHand.screenPosition.y.toFixed(0)})` : 'none'}
              </div>
            </>
          )}
          {error && <div style={{ color: '#ef4444' }}>Error: {error}</div>}
        </div>
      )}

      {/* Indicateurs de position des mains sur l'écran (debug) */}
      {showDebug && isTracking && (
        <>
          {leftHand && (
            <div
              style={{
                position: 'absolute',
                left: leftHand.screenPosition.x - 15,
                top: leftHand.screenPosition.y - 15,
                width: 30,
                height: 30,
                borderRadius: '50%',
                border: '3px solid #3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.3)',
                pointerEvents: 'none',
                zIndex: 999,
              }}
            />
          )}
          {rightHand && (
            <div
              style={{
                position: 'absolute',
                left: rightHand.screenPosition.x - 15,
                top: rightHand.screenPosition.y - 15,
                width: 30,
                height: 30,
                borderRadius: '50%',
                border: '3px solid #ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.3)',
                pointerEvents: 'none',
                zIndex: 999,
              }}
            />
          )}
        </>
      )}
    </>
  )
}

export default HandTrackingOverlay
