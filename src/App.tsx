import { useCallback, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera, Environment } from '@react-three/drei'
import Scene from './components/Scene'
import { UI } from './components/UI'
import { JellyControls } from './components/JellyControls'
import { ImpactOverlay } from './components/ImpactOverlay'
import { usePunchDrag, type PunchData } from './hooks'
import { useGameStore, useImpactStore } from './stores'
import { AnimationProvider, useAnimationContext } from './context'

/**
 * Composant interne avec accès au contexte d'animation
 */
function AppContent() {
  const gameState = useGameStore((state) => state.gameState)
  const takeDamage = useGameStore((state) => state.takeDamage)
  const addImpact = useImpactStore((state) => state.addImpact)
  const { triggerPunch, triggerPunchAt } = useAnimationContext()

  // Alterner les mains
  const lastHand = useRef<'left' | 'right'>('right')

  /**
   * Gère les coups détectés par les gestes
   */
  const handlePunch = useCallback(
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

      // Déclencher l'animation du gant vers la position cliquée
      triggerPunchAt(screenPosition[0], screenPosition[1])

      // Déclencher l'animation legacy
      triggerPunch(type, hand, velocity, isCritical)

      // Debug
      if (import.meta.env.DEV) {
        console.log(
          `[PUNCH] ${type} (${hand}) | vel: ${velocity.toFixed(2)} | dmg: ${damage.toFixed(1)}${isCritical ? ' CRITICAL!' : ''}`
        )
      }
    },
    [gameState, addImpact, takeDamage, triggerPunch, triggerPunchAt]
  )

  // Bind des gestes sur le container
  const bind = usePunchDrag(handlePunch, gameState === 'FIGHTING')

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

      {/* Contrôles GUI pour les paramètres jelly (dev only) */}
      {import.meta.env.DEV && <JellyControls />}
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
