import { useGameStore } from '../stores'

/**
 * Écran de résultats après un round
 * Affiche le score, le meilleur score et permet de rejouer
 */
export function ResultsScreen() {
  const gameState = useGameStore((state) => state.gameState)
  const hitCount = useGameStore((state) => state.hitCount)
  const bestScore = useGameStore((state) => state.bestScore)
  const resetGame = useGameStore((state) => state.resetGame)

  if (gameState !== 'FINISHED') return null

  const isNewRecord = hitCount >= bestScore && hitCount > 0
  const hitsPerSecond = (hitCount / 33).toFixed(1)

  // Déterminer le grade basé sur le score
  const grade = getGrade(hitCount)

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        {/* Titre */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-bold uppercase tracking-wider text-gray-400">
            Temps écoulé!
          </h1>

          {/* Badge nouveau record */}
          {isNewRecord && (
            <div className="animate-bounce rounded-full bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500 px-4 py-1 text-sm font-bold text-white shadow-lg shadow-amber-500/50">
              NOUVEAU RECORD!
            </div>
          )}
        </div>

        {/* Grade */}
        <div
          className={`text-8xl font-black ${grade.colorClass}`}
          style={{
            textShadow: `0 0 60px ${grade.glowColor}`,
          }}
        >
          {grade.letter}
        </div>

        {/* Score principal */}
        <div className="flex flex-col items-center gap-1">
          <div
            className="font-black text-white"
            style={{
              fontSize: '5rem',
              lineHeight: 1,
              textShadow: '0 0 30px rgba(255, 255, 255, 0.3)',
            }}
          >
            {hitCount}
          </div>
          <div className="text-xl font-semibold text-gray-400">coups</div>
        </div>

        {/* Stats détaillées */}
        <div className="flex gap-8 text-center">
          <div className="flex flex-col">
            <div className="text-2xl font-bold text-white">{hitsPerSecond}</div>
            <div className="text-xs text-gray-500">coups/sec</div>
          </div>
          <div className="h-10 w-px bg-gray-700" />
          <div className="flex flex-col">
            <div className="text-2xl font-bold text-amber-400">{bestScore}</div>
            <div className="text-xs text-gray-500">record</div>
          </div>
        </div>

        {/* Message motivant */}
        <p className="max-w-xs text-sm text-gray-500">{grade.message}</p>

        {/* Bouton rejouer */}
        <button
          onClick={resetGame}
          className="group relative mt-4 overflow-hidden rounded-2xl bg-gradient-to-r from-green-600 to-emerald-500 px-12 py-4 text-xl font-bold uppercase tracking-wider text-white shadow-lg shadow-green-500/30 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-green-500/40 active:scale-95"
        >
          {/* Effet de brillance */}
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          <span className="relative flex items-center gap-3">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Rejouer
          </span>
        </button>
      </div>
    </div>
  )
}

/**
 * Système de grades basé sur le score
 */
interface Grade {
  letter: string
  colorClass: string
  glowColor: string
  message: string
}

function getGrade(score: number): Grade {
  if (score >= 100) {
    return {
      letter: 'S',
      colorClass: 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500',
      glowColor: 'rgba(251, 191, 36, 0.8)',
      message: 'Incroyable! Tu es un vrai champion de boxe!',
    }
  }
  if (score >= 80) {
    return {
      letter: 'A',
      colorClass: 'text-green-400',
      glowColor: 'rgba(74, 222, 128, 0.6)',
      message: 'Excellent! Tes poings sont des armes!',
    }
  }
  if (score >= 60) {
    return {
      letter: 'B',
      colorClass: 'text-blue-400',
      glowColor: 'rgba(96, 165, 250, 0.6)',
      message: 'Bien joué! Continue comme ça!',
    }
  }
  if (score >= 40) {
    return {
      letter: 'C',
      colorClass: 'text-yellow-400',
      glowColor: 'rgba(250, 204, 21, 0.6)',
      message: 'Pas mal! Tu peux faire mieux!',
    }
  }
  if (score >= 20) {
    return {
      letter: 'D',
      colorClass: 'text-orange-400',
      glowColor: 'rgba(251, 146, 60, 0.6)',
      message: 'Il faut t\'entraîner plus!',
    }
  }
  return {
    letter: 'F',
    colorClass: 'text-red-500',
    glowColor: 'rgba(239, 68, 68, 0.6)',
    message: 'Allez, tu peux le faire!',
  }
}

export default ResultsScreen
