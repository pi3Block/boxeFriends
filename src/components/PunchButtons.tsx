import { useCallback } from 'react'
import { useGameStore } from '../stores'
import type { PunchType, PunchHand } from '../stores'

/**
 * Configuration des types de coups
 */
const PUNCH_TYPES: { type: PunchType; name: string; icon: string; color: string }[] = [
  {
    type: 'hook',
    name: 'Crochet',
    icon: '↪',
    color: 'from-amber-500 to-orange-600',
  },
  {
    type: 'jab',
    name: 'Jab',
    icon: '👊',
    color: 'from-red-500 to-pink-600',
  },
  {
    type: 'uppercut',
    name: 'Uppercut',
    icon: '⬆',
    color: 'from-purple-500 to-indigo-600',
  },
]

/**
 * Boutons de punch tactiles - deux colonnes (gauche/droite)
 * Mobile-first design avec gros boutons facilement cliquables
 */
export function PunchButtons() {
  const selectedTool = useGameStore((state) => state.selectedTool)
  const queuePunch = useGameStore((state) => state.queuePunch)

  // N'afficher que si les gants sont sélectionnés
  if (selectedTool !== 'gloves') return null

  return (
    <div className="pointer-events-auto flex items-end justify-center gap-6 px-4 sm:gap-12">
      {/* Colonne gauche */}
      <PunchColumn hand="left" queuePunch={queuePunch} />

      {/* Colonne droite */}
      <PunchColumn hand="right" queuePunch={queuePunch} />
    </div>
  )
}

/**
 * Colonne de boutons pour une main
 */
function PunchColumn({
  hand,
  queuePunch
}: {
  hand: PunchHand
  queuePunch: (type: PunchType, hand: PunchHand) => void
}) {
  const isLeft = hand === 'left'

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Label de la main */}
      <span className={`text-xs font-bold uppercase tracking-wider ${
        isLeft ? 'text-blue-400' : 'text-red-400'
      }`}>
        {isLeft ? 'Gauche' : 'Droite'}
      </span>

      {/* Boutons de coups */}
      <div className="flex flex-col gap-2">
        {PUNCH_TYPES.map((punch) => (
          <PunchButton
            key={`${hand}-${punch.type}`}
            punch={punch}
            hand={hand}
            onPunch={() => queuePunch(punch.type, hand)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Bouton individuel de punch avec animation tactile
 */
function PunchButton({
  punch,
  hand,
  onPunch
}: {
  punch: { type: PunchType; name: string; icon: string; color: string }
  hand: PunchHand
  onPunch: () => void
}) {
  const handlePunch = useCallback(() => {
    // Vibration haptique si disponible
    if (navigator.vibrate) {
      navigator.vibrate(50)
    }
    onPunch()
  }, [onPunch])

  const isLeft = hand === 'left'

  return (
    <button
      onClick={handlePunch}
      className={`
        group relative flex items-center justify-center gap-2
        h-14 w-28 sm:h-16 sm:w-32
        rounded-xl
        bg-gradient-to-br ${punch.color}
        shadow-lg shadow-black/30
        transition-all duration-150
        active:scale-90 active:shadow-md
        hover:scale-105 hover:shadow-xl
        touch-manipulation
      `}
    >
      {/* Effet de brillance au hover/tap */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-transparent via-white/10 to-white/20 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100" />

      {/* Icone (miroir pour main gauche) */}
      <span
        className="text-xl sm:text-2xl drop-shadow-md"
        style={{ transform: isLeft ? 'scaleX(-1)' : undefined }}
      >
        {punch.icon}
      </span>

      {/* Nom */}
      <span className="text-xs sm:text-sm font-bold text-white drop-shadow-md">
        {punch.name}
      </span>

      {/* Ring animé au tap */}
      <div className="absolute -inset-1 rounded-xl border-2 border-white/0 transition-all duration-150 group-active:border-white/50 group-active:scale-105" />
    </button>
  )
}

export default PunchButtons
