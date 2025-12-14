import { useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera, Environment } from '@react-three/drei'
import Scene from './components/Scene'
import { UI } from './components/UI'
import { usePunchDrag, type PunchData } from './hooks'
import { useGameStore, useImpactStore } from './stores'

/**
 * Composant principal de l'application
 * Configure le Canvas React Three Fiber avec l'UI overlay
 */
function App() {
  const gameState = useGameStore((state) => state.gameState)
  const takeDamage = useGameStore((state) => state.takeDamage)
  const addImpact = useImpactStore((state) => state.addImpact)

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

      // Calculer le point d'impact (simplifié pour MVP)
      // Convertir position écran en coordonnées locales [-1, 1]
      const x = ((screenPosition[0] / window.innerWidth) * 2 - 1) * 0.8
      const y = (-(screenPosition[1] / window.innerHeight) * 2 + 1) * 0.8

      // Ajouter l'impact visuel
      addImpact([x, y, 0.5], velocity * mult)

      // Appliquer les dégâts
      const damage = 15 * mult * velocity
      const isCritical = velocity * mult > 0.85
      takeDamage(damage, isCritical)

      // Debug
      if (import.meta.env.DEV) {
        console.log(`[PUNCH] ${type} | vel: ${velocity.toFixed(2)} | dmg: ${damage.toFixed(1)}`)
      }
    },
    [gameState, addImpact, takeDamage]
  )

  // Bind des gestes sur le container
  const bind = usePunchDrag(handlePunch, gameState === 'FIGHTING')

  return (
    <div className="relative h-screen w-screen touch-none">
      {/* Container avec gestes */}
      <div {...bind()} className="h-full w-full">
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
    </div>
  )
}

export default App
