import { useCallback, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera, Environment } from '@react-three/drei'
import { Perf } from 'r3f-perf'
import { useShallow } from 'zustand/react/shallow'
import Scene from './components/Scene'
import { UI } from './components/UI'
import { JellyControls } from './components/JellyControls'
import { ImpactOverlay } from './components/ImpactOverlay'
import { HandTrackingOverlay } from './components/HandTrackingOverlay'
import { CalibrationOverlay } from './components/CalibrationOverlay'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useMousePunch, useUnifiedInput, type PunchData, type CameraInputCallbacks } from './hooks'
import { useGameStore, useImpactStore, useHandTrackingStore } from './stores'
import { AnimationProvider, useAnimationContext } from './context'

/**
 * Composant interne avec accès au contexte d'animation
 */
function AppContent() {
  // Selectors consolidés avec useShallow pour éviter les re-renders inutiles
  const { gameState, takeDamage } = useGameStore(
    useShallow((state) => ({ gameState: state.gameState, takeDamage: state.takeDamage }))
  )
  const addImpact = useImpactStore((state) => state.addImpact)
  const isCameraEnabled = useHandTrackingStore((state) => state.isCameraEnabled)
  const {
    triggerPunch,
    updateBothGloves,
    triggerMousePunch,
    updateHandPosition,
    triggerCameraShake
  } = useAnimationContext()

  /**
   * Souris bouge - les deux gants suivent
   * Note: Pas de check gameState ici car useMousePunch gère déjà le enabled state
   */
  const handleMouseMove = useCallback(
    (screenX: number, screenY: number) => {
      updateBothGloves(screenX, screenY)
    },
    [updateBothGloves]
  )

  /**
   * Traite un punch (souris ou caméra)
   */
  const handlePunch = useCallback(
    (hand: 'left' | 'right', data: PunchData) => {
      if (gameState !== 'FIGHTING') return

      const { type, velocity, screenPosition } = data

      // Multiplicateurs de dégâts
      const multipliers = { jab: 0.5, hook: 0.8, uppercut: 1.0 }
      const mult = multipliers[type]

      // Calculer le point d'impact
      const x = ((screenPosition[0] / window.innerWidth) * 2 - 1) * 0.8
      const y = (-(screenPosition[1] / window.innerHeight) * 2 + 1) * 0.8

      // Déterminer si critique
      const isCritical = velocity * mult > 0.85

      // Ajouter l'impact visuel
      addImpact([x, y, 0.5], velocity * mult)

      // Appliquer les dégâts
      const damage = 15 * mult * velocity
      takeDamage(damage, isCritical)

      // Déclencher l'animation du punch pour ce gant
      triggerMousePunch(hand, screenPosition[0], screenPosition[1])

      // Camera shake
      triggerCameraShake(velocity * mult)

      // Déclencher l'animation legacy pour les effets visuels
      triggerPunch(type, hand, velocity, isCritical)

      // Debug
      if (import.meta.env.DEV) {
        console.log(
          `[PUNCH] ${type} (${hand}) | vel: ${velocity.toFixed(2)} | dmg: ${damage.toFixed(1)}${isCritical ? ' CRITICAL!' : ''}`
        )
      }
    },
    [gameState, addImpact, takeDamage, triggerPunch, triggerMousePunch, triggerCameraShake]
  )

  // Hook souris: gants suivent, clic gauche = poing gauche, clic droit = poing droit
  useMousePunch(
    {
      onMouseMove: handleMouseMove,
      onLeftPunch: (data) => handlePunch('left', data),
      onRightPunch: (data) => handlePunch('right', data),
    },
    gameState === 'FIGHTING' && !isCameraEnabled
  )

  // Callbacks pour le mode caméra
  const cameraCallbacks = useMemo<CameraInputCallbacks>(() => ({
    onLeftHandMove: (x, y) => updateHandPosition('left', x, y),
    onRightHandMove: (x, y) => updateHandPosition('right', x, y),
    onLeftPunch: (data) => handlePunch('left', data),
    onRightPunch: (data) => handlePunch('right', data),
  }), [updateHandPosition, handlePunch])

  // Hook d'input unifié pour le mode caméra
  useUnifiedInput({
    touchCallbacks: { onDragEnd: () => {} }, // Pas utilisé en mode souris
    cameraCallbacks,
    useCameraInput: isCameraEnabled,
  })

  return (
    <div className="relative h-screen w-screen touch-none">
      {/* Container avec gestes - touch-none requis pour @use-gesture */}
      <div className="h-full w-full touch-none">
        <Canvas dpr={[1, 2]}>
          {/* Performance monitor (DEV only) */}
          {import.meta.env.DEV && <Perf position="top-left" />}

          {/* Configuration de la caméra - FOV 75, position fixe */}
          <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={75} />

          {/* Éclairage optimisé mobile */}
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[10, 10, 5]}
            intensity={1}
            castShadow={false}
          />

          {/* Environnement studio pour éclairage global */}
          <Environment preset="studio" />

          {/* Scène 3D */}
          <Scene />
        </Canvas>
      </div>

      {/* UI overlay (HTML) */}
      <UI />

      {/* Effets d'impact (HTML overlay) */}
      <ImpactOverlay />

      {/* Hand tracking overlay (video caché + debug optionnel) */}
      <HandTrackingOverlay showDebug={import.meta.env.DEV} />

      {/* Overlay de calibration (affiché si caméra active mais pas calibrée) */}
      <CalibrationOverlay />

      {/* Contrôles GUI pour les paramètres jelly */}
      <JellyControls />
    </div>
  )
}

/**
 * Composant principal avec Provider et Error Boundary
 */
function App() {
  return (
    <ErrorBoundary>
      <AnimationProvider>
        <AppContent />
      </AnimationProvider>
    </ErrorBoundary>
  )
}

export default App
