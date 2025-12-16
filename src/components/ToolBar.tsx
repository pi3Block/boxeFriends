import { useGameStore } from '../stores'
import type { CombatTool } from '../stores'

/**
 * Barre de sélection d'outils de combat
 */
export function ToolBar() {
  const selectedTool = useGameStore((state) => state.selectedTool)
  const setSelectedTool = useGameStore((state) => state.setSelectedTool)

  const tools: { id: CombatTool; name: string; icon: JSX.Element }[] = [
    {
      id: 'gloves',
      name: 'Gants',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          {/* Icône gant de boxe */}
          <path d="M12 2C8.5 2 6 4.5 6 7v5c0 1.5.5 2.8 1.3 3.8L5 20c-.3.5-.1 1.1.4 1.4.5.3 1.1.1 1.4-.4l2.5-4.5c.8.3 1.7.5 2.7.5s1.9-.2 2.7-.5l2.5 4.5c.2.3.5.5.9.5.2 0 .3 0 .5-.1.5-.3.7-.9.4-1.4l-2.3-4.2c.8-1 1.3-2.3 1.3-3.8V7c0-2.5-2.5-5-6-5zm-2 5c0-.6.4-1 1-1s1 .4 1 1v4c0 .6-.4 1-1 1s-1-.4-1-1V7zm4 0c0-.6.4-1 1-1s1 .4 1 1v4c0 .6-.4 1-1 1s-1-.4-1-1V7z" />
        </svg>
      ),
    },
    {
      id: 'ball',
      name: 'Balles',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          {/* Icône balle */}
          <circle cx="12" cy="12" r="10" />
        </svg>
      ),
    },
  ]

  return (
    <div className="pointer-events-auto flex items-center justify-center gap-2 rounded-full bg-black/70 px-4 py-2 backdrop-blur-sm">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setSelectedTool(tool.id)}
          className={`flex flex-col items-center gap-1 rounded-lg px-4 py-2 transition-all ${
            selectedTool === tool.id
              ? 'bg-red-600 text-white shadow-lg shadow-red-500/50'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {tool.icon}
          <span className="text-xs font-medium">{tool.name}</span>
        </button>
      ))}
    </div>
  )
}

export default ToolBar
