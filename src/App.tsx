import { useCallback, useRef, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera, Environment } from '@react-three/drei'
import Scene from './components/Scene'
import { UI } from './components/UI'
import { JellyControls } from './components/JellyControls'
import { ImpactOverlay } from './components/ImpactOverlay'
import { usePunchDrag, type PunchData, type PunchDragCallbacks } from './hooks'
import { useGameStore, useImpactStore } from './stores'
import { AnimationProvider, useAnimationContext } from './context'

/**
 * Composant interne avec accès au contexte d'animation
 */
function AppContent() {
  const gameState = useGameStore((state) => state.gameState)
  const takeDamage = useGameStore((state) => state.takeDamage)
  const addImpact = useImpactStore((state) => state.addImpact)
  const {
    triggerPunch,
    startGloveFollow,
    updateGloveFollow,
    triggerPunchRelease,
    triggerCameraShake
  } = useAnimationContext()

  // Alterner les mains
  const lastHand = useRef<'left' | 'right'>('right')

  /**
   * Appelé quand le doigt/clic commence - le gant commence à suivre
   */
  const handleDragStart = useCallback(
    (screenX: number, screenY: number) => {
      if (gameState !== 'FIGHTING') return
      startGloveFollow(screenX, screenY)
    },
    [gameState, startGloveFollow]
  )

  /**
   * Appelé pendant le mouvement - le gant suit
   */
  const handleDragMove = useCallback(
    (screenX: number, screenY: number) => {
      if (gameState !== 'FIGHTING') return
      updateGloveFollow(screenX, screenY)
    },
    [gameState, updateGloveFollow]
  )

  /**
   * Appelé au relâchement - déclenche le coup et les effets
   */
  const handleDragEnd = useCallback(
    (data: PunchData) => {
      if (gameState !== 'FIGHTING') return

      const { type, velocity, screenPosition } = data

      // Multiplicateurs de dégâts
      const multipliers = { jab: 0.5, hook: 0.8, uppercut: 1.0 }
      const mult = multipliers[type]

      // Alterner les mains
      const hand = lastHand.current === 'left' ? 'right' : 'left'
      lastHand.current = hand

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

      // Déclencher l'animation du coup (au relâchement)
      triggerPunchRelease(screenPosition[0], screenPosition[1])

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
    [gameState, addImpact, takeDamage, triggerPunch, triggerPunchRelease, triggerCameraShake]
  )

  // Callbacks pour le système de gestes
  const gestureCallbacks = useMemo<PunchDragCallbacks>(() => ({
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onDragEnd: handleDragEnd,
  }), [handleDragStart, handleDragMove, handleDragEnd])

  // Bind des gestes sur le container
  const bind = usePunchDrag(gestureCallbacks, gameState === 'FIGHTING')

  return (
    <div className="relative h-screen w-screen touch-none">
      {/* Container avec gestes - touch-none requis pour @use-gesture */}
      <div {...bind()} className="h-full w-full touch-none">
        <Canvas dpr={[1, 2]}>
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

      {/* Contrôles GUI pour les paramètres jelly */}
      <JellyControls />
    </div>
  )
}

/**
 * Composant principal avec Provider
 */
function App() {
  return (
    <AnimationProvider>
      <AppContent />
    </AnimationProvider>
  )
}

export default App
