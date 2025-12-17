import { useGameStore } from '../stores'

/**
 * Indicateur visuel des zones de frappe
 * Affiché sur les côtés de l'écran quand les gants sont sélectionnés
 */
export function PunchZoneIndicator() {
  const selectedTool = useGameStore((state) => state.selectedTool)

  // N'afficher que si les gants sont sélectionnés
  if (selectedTool !== 'gloves') return null

  const zones = [
    { name: 'Crochet', color: 'bg-amber-500/60', position: 'top-1/4', emoji: '↪' },
    { name: 'Jab', color: 'bg-orange-500/60', position: 'top-1/2', emoji: '→' },
    { name: 'Uppercut', color: 'bg-pink-500/60', position: 'top-3/4', emoji: '↗' },
  ]

  return (
    <>
      {/* Indicateur gauche */}
      <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2">
        <div className="flex flex-col items-start gap-8">
          {zones.map((zone, i) => (
            <div
              key={`left-${i}`}
              className={`flex items-center gap-2 rounded-lg ${zone.color} px-2 py-1 text-white shadow-lg backdrop-blur-sm`}
            >
              <span className="text-lg">{zone.emoji}</span>
              <span className="text-xs font-bold">{zone.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Indicateur droit */}
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        <div className="flex flex-col items-end gap-8">
          {zones.map((zone, i) => (
            <div
              key={`right-${i}`}
              className={`flex items-center gap-2 rounded-lg ${zone.color} px-2 py-1 text-white shadow-lg backdrop-blur-sm`}
            >
              <span className="text-xs font-bold">{zone.name}</span>
              <span className="text-lg" style={{ transform: 'scaleX(-1)' }}>{zone.emoji}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Lignes de séparation des zones (optionnel, subtil) */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-0 right-0 top-1/3 h-px bg-white/10" />
        <div className="absolute left-0 right-0 top-2/3 h-px bg-white/10" />
      </div>
    </>
  )
}

export default PunchZoneIndicator
