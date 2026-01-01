import { useEffect, useRef } from 'react'
import { useGameStore, ROUND_DURATION } from '../stores'

/**
 * HUD du jeu - Affiche timer, score et countdown
 * Enterprise-grade avec animations fluides
 */
export function GameHUD() {
  const gameState = useGameStore((state) => state.gameState)
  const timeRemaining = useGameStore((state) => state.timeRemaining)
  const countdown = useGameStore((state) => state.countdown)
  const hitCount = useGameStore((state) => state.hitCount)
  const comboCount = useGameStore((state) => state.comboCount)
  const tickCountdown = useGameStore((state) => state.tickCountdown)
  const tickTimer = useGameStore((state) => state.tickTimer)

  // Référence pour le timer interval
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Gérer le countdown (3, 2, 1, GO!)
  useEffect(() => {
    if (gameState === 'COUNTDOWN') {
      timerRef.current = setInterval(() => {
        tickCountdown()
      }, 1000)

      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }
  }, [gameState, tickCountdown])

  // Gérer le timer pendant FIGHTING
  useEffect(() => {
    if (gameState === 'FIGHTING') {
      timerRef.current = setInterval(() => {
        tickTimer()
      }, 1000)

      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }
  }, [gameState, tickTimer])

  // Nettoyer le timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Ne rien afficher au lobby
  if (gameState === 'LOBBY') return null

  // Afficher le countdown
  if (gameState === 'COUNTDOWN') {
    return <CountdownOverlay countdown={countdown} />
  }

  // Afficher le HUD pendant FIGHTING
  if (gameState === 'FIGHTING') {
    return (
      <>
        <TimerDisplay timeRemaining={timeRemaining} />
        <ScoreDisplay hitCount={hitCount} comboCount={comboCount} />
      </>
    )
  }

  return null
}

/**
 * Overlay de compte à rebours (3, 2, 1, GO!)
 */
function CountdownOverlay({ countdown }: { countdown: number }) {
  const text = countdown > 0 ? countdown.toString() : 'GO!'
  const isGo = countdown <= 0

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      <div
        className={`
          animate-ping-once text-center font-black
          ${isGo ? 'text-green-400' : 'text-white'}
        `}
        style={{
          fontSize: isGo ? '8rem' : '12rem',
          textShadow: `0 0 40px ${isGo ? 'rgba(74, 222, 128, 0.8)' : 'rgba(255, 255, 255, 0.5)'}`,
        }}
      >
        {text}
      </div>
    </div>
  )
}

/**
 * Affichage du timer avec barre de progression circulaire
 */
function TimerDisplay({ timeRemaining }: { timeRemaining: number }) {
  const progress = timeRemaining / ROUND_DURATION
  const isLow = timeRemaining <= 10
  const isCritical = timeRemaining <= 5

  // Calculer le circumference pour le cercle SVG
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-40 -translate-x-1/2">
      <div className="relative flex items-center justify-center">
        {/* Cercle de fond */}
        <svg width="88" height="88" className="rotate-[-90deg]">
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="transparent"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="6"
          />
          {/* Cercle de progression */}
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="transparent"
            stroke={isCritical ? '#ef4444' : isLow ? '#f59e0b' : '#22c55e'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>

        {/* Temps restant */}
        <div
          className={`
            absolute text-center font-black
            ${isCritical ? 'animate-pulse text-red-500' : isLow ? 'text-amber-400' : 'text-white'}
          `}
          style={{ fontSize: '1.75rem' }}
        >
          {timeRemaining}
        </div>
      </div>

      {/* Label */}
      <div className="mt-1 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">
        Secondes
      </div>
    </div>
  )
}

/**
 * Affichage du score avec compteur de combo
 */
function ScoreDisplay({ hitCount, comboCount }: { hitCount: number; comboCount: number }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-40 flex flex-col items-end gap-2">
      {/* Score principal */}
      <div className="flex flex-col items-end rounded-2xl bg-black/60 px-4 py-3 backdrop-blur-sm">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Coups
        </div>
        <div
          className="font-black text-white"
          style={{
            fontSize: '2.5rem',
            lineHeight: 1,
            textShadow: '0 0 20px rgba(255, 255, 255, 0.3)',
          }}
        >
          {hitCount}
        </div>
      </div>

      {/* Combo indicator */}
      {comboCount > 2 && (
        <div
          className="animate-bounce rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-sm font-bold text-white shadow-lg"
          style={{
            animationDuration: '0.5s',
          }}
        >
          x{comboCount} COMBO!
        </div>
      )}
    </div>
  )
}

export default GameHUD
