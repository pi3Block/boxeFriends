import { useGameStore, type OpponentType } from '../stores'

/**
 * Sélecteur d'adversaire (type de sac de frappe)
 * Affiché dans le lobby et en combat pour changer rapidement
 */
export function OpponentSelector() {
  const selectedOpponent = useGameStore((state) => state.selectedOpponent)
  const setSelectedOpponent = useGameStore((state) => state.setSelectedOpponent)

  const opponents: { id: OpponentType; name: string; icon: JSX.Element }[] = [
    {
      id: 'sphere',
      name: 'Sphère',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          <circle cx="12" cy="12" r="10" />
        </svg>
      ),
    },
    {
      id: 'box',
      name: 'Box',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          <rect x="6" y="2" width="12" height="20" rx="2" />
        </svg>
      ),
    },
    {
      id: 'fluffy',
      name: 'Fluffy',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          {/* Icone blob/soft */}
          <ellipse cx="12" cy="12" rx="10" ry="8" />
        </svg>
      ),
    },
    {
      id: 'littlemac',
      name: 'Little Mac',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          {/* Icone tête ovale */}
          <ellipse cx="12" cy="10" rx="8" ry="9" />
          <rect x="8" y="18" width="8" height="4" rx="1" />
        </svg>
      ),
    },
    {
      id: 'multipart',
      name: 'Multi-Part',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          {/* Icone personnage multi-parties */}
          <ellipse cx="12" cy="5" rx="5" ry="4" />
          <rect x="11" y="9" width="2" height="3" />
          <ellipse cx="12" cy="16" rx="6" ry="5" />
        </svg>
      ),
    },
  ]

  return (
    <div className="pointer-events-auto flex items-center justify-center gap-2 rounded-full bg-black/70 px-4 py-2 backdrop-blur-sm">
      {opponents.map((opponent) => (
        <button
          key={opponent.id}
          onClick={() => setSelectedOpponent(opponent.id)}
          className={`flex flex-col items-center gap-1 rounded-lg px-4 py-2 transition-all ${
            selectedOpponent === opponent.id
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/50'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {opponent.icon}
          <span className="text-xs font-medium">{opponent.name}</span>
        </button>
      ))}
    </div>
  )
}

export default OpponentSelector
