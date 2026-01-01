import { useState, useCallback } from 'react'
import { useGameStore } from '../stores'
import type { CombatTool, OpponentType, PhysicsPreset, GlovePhysicsMode } from '../stores'

/**
 * Panneau de paramètres regroupé (outils + adversaires)
 * Positionné en bas à droite avec un bouton toggle
 */
export function SettingsPanel() {
  const [isOpen, setIsOpen] = useState(false)

  const selectedTool = useGameStore((state) => state.selectedTool)
  const setSelectedTool = useGameStore((state) => state.setSelectedTool)
  const selectedOpponent = useGameStore((state) => state.selectedOpponent)
  const setSelectedOpponent = useGameStore((state) => state.setSelectedOpponent)
  const selectedPhysicsPreset = useGameStore((state) => state.selectedPhysicsPreset)
  const setPhysicsPreset = useGameStore((state) => state.setPhysicsPreset)
  const glovePhysicsMode = useGameStore((state) => state.glovePhysicsMode)
  const setGlovePhysicsMode = useGameStore((state) => state.setGlovePhysicsMode)
  const isCustomTexture = useGameStore((state) => state.isCustomTexture)
  const clearTexture = useGameStore((state) => state.clearTexture)

  const togglePanel = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const tools: { id: CombatTool; name: string; icon: JSX.Element }[] = [
    {
      id: 'gloves',
      name: 'Gants',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M12 2C8.5 2 6 4.5 6 7v5c0 1.5.5 2.8 1.3 3.8L5 20c-.3.5-.1 1.1.4 1.4.5.3 1.1.1 1.4-.4l2.5-4.5c.8.3 1.7.5 2.7.5s1.9-.2 2.7-.5l2.5 4.5c.2.3.5.5.9.5.2 0 .3 0 .5-.1.5-.3.7-.9.4-1.4l-2.3-4.2c.8-1 1.3-2.3 1.3-3.8V7c0-2.5-2.5-5-6-5zm-2 5c0-.6.4-1 1-1s1 .4 1 1v4c0 .6-.4 1-1 1s-1-.4-1-1V7zm4 0c0-.6.4-1 1-1s1 .4 1 1v4c0 .6-.4 1-1 1s-1-.4-1-1V7z" />
        </svg>
      ),
    },
    {
      id: 'ball',
      name: 'Balles',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <circle cx="12" cy="12" r="10" />
        </svg>
      ),
    },
  ]

  const opponents: { id: OpponentType; name: string; icon: JSX.Element }[] = [
    {
      id: 'sphere',
      name: 'Sphère',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <circle cx="12" cy="12" r="10" />
        </svg>
      ),
    },
    {
      id: 'box',
      name: 'Box',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <rect x="6" y="2" width="12" height="20" rx="2" />
        </svg>
      ),
    },
    {
      id: 'fluffy',
      name: 'Fluffy',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <ellipse cx="12" cy="12" rx="10" ry="8" />
        </svg>
      ),
    },
    {
      id: 'littlemac',
      name: 'Mac',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <ellipse cx="12" cy="10" rx="8" ry="9" />
          <rect x="8" y="18" width="8" height="4" rx="1" />
        </svg>
      ),
    },
    {
      id: 'multipart',
      name: 'Multi',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <ellipse cx="12" cy="5" rx="5" ry="4" />
          <rect x="11" y="9" width="2" height="3" />
          <ellipse cx="12" cy="16" rx="6" ry="5" />
        </svg>
      ),
    },
    {
      id: 'brickwall',
      name: 'Mur',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          {/* Mur de briques */}
          <rect x="2" y="2" width="9" height="4" rx="0.5" />
          <rect x="13" y="2" width="9" height="4" rx="0.5" />
          <rect x="6" y="8" width="9" height="4" rx="0.5" />
          <rect x="2" y="14" width="9" height="4" rx="0.5" />
          <rect x="13" y="14" width="9" height="4" rx="0.5" />
          <rect x="6" y="20" width="9" height="4" rx="0.5" />
        </svg>
      ),
    },
  ]

  const physicsPresets: { id: PhysicsPreset; name: string; description: string; icon: JSX.Element }[] = [
    {
      id: 'soft',
      name: 'Mou',
      description: 'Très bouncy',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          {/* Nuage / coussin */}
          <ellipse cx="12" cy="14" rx="8" ry="5" opacity="0.6" />
          <circle cx="8" cy="11" r="4" />
          <circle cx="14" cy="10" r="5" />
          <circle cx="17" cy="13" r="3" />
        </svg>
      ),
    },
    {
      id: 'medium',
      name: 'Normal',
      description: 'Équilibré',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          {/* Ballon standard */}
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="9" ry="4" opacity="0.3" />
        </svg>
      ),
    },
    {
      id: 'hard',
      name: 'Dur',
      description: 'Résistant',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          {/* Rocher / diamant */}
          <polygon points="12,2 22,9 18,22 6,22 2,9" />
          <polygon points="12,2 17,9 12,12 7,9" opacity="0.5" />
        </svg>
      ),
    },
  ]

  const glovePhysicsModes: { id: GlovePhysicsMode; name: string; description: string; icon: JSX.Element }[] = [
    {
      id: 'kinematic',
      name: 'Animé',
      description: 'Gants animés manuellement (actuel)',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          {/* Main / animation */}
          <path d="M12 2C8.5 2 6 4.5 6 7v5c0 2.5 1.5 4.5 4 5.5V21h4v-3.5c2.5-1 4-3 4-5.5V7c0-2.5-2.5-5-6-5z" />
          <circle cx="9" cy="8" r="1" />
          <circle cx="15" cy="8" r="1" />
        </svg>
      ),
    },
    {
      id: 'physics',
      name: 'Physique',
      description: 'Gants avec ressorts Ammo.js (expérimental)',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          {/* Ressort / spring */}
          <path d="M12 2v2M12 6v2M12 10v2M12 14v2M12 18v2" stroke="currentColor" strokeWidth="2" fill="none" />
          <circle cx="12" cy="22" r="2" />
          <rect x="8" y="0" width="8" height="3" rx="1" />
        </svg>
      ),
    },
  ]

  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 flex flex-col items-end gap-2">
      {/* Panneau déplié */}
      {isOpen && (
        <div className="flex flex-col gap-3 rounded-2xl bg-black/80 p-4 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
          {/* Section Outils */}
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">
              Outils
            </span>
            <div className="flex gap-2">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => setSelectedTool(tool.id)}
                  className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all ${
                    selectedTool === tool.id
                      ? 'bg-red-600 text-white shadow-lg shadow-red-500/30'
                      : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {tool.icon}
                  <span className="text-[10px] font-medium">{tool.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Section Mode Gants (visible seulement si gants sélectionnés) */}
          {selectedTool === 'gloves' && (
            <>
              <div className="h-px bg-gray-600/50" />
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Mode Gants
                </span>
                <div className="flex gap-2">
                  {glovePhysicsModes.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setGlovePhysicsMode(mode.id)}
                      className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all ${
                        glovePhysicsMode === mode.id
                          ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/30'
                          : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
                      }`}
                      title={mode.description}
                    >
                      {mode.icon}
                      <span className="text-[10px] font-medium">{mode.name}</span>
                    </button>
                  ))}
                </div>
                {glovePhysicsMode === 'physics' && (
                  <p className="mt-2 text-[10px] text-amber-400">
                    ⚠️ Mode expérimental - Spring constraints
                  </p>
                )}
              </div>
            </>
          )}

          {/* Séparateur */}
          <div className="h-px bg-gray-600/50" />

          {/* Section Adversaires */}
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">
              Adversaire
            </span>
            <div className="flex flex-wrap gap-2">
              {opponents.map((opponent) => (
                <button
                  key={opponent.id}
                  onClick={() => setSelectedOpponent(opponent.id)}
                  className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all ${
                    selectedOpponent === opponent.id
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                      : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {opponent.icon}
                  <span className="text-[10px] font-medium">{opponent.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Séparateur */}
          <div className="h-px bg-gray-600/50" />

          {/* Section Physique */}
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">
              Physique
            </span>
            <div className="flex gap-2">
              {physicsPresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setPhysicsPreset(preset.id)}
                  className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all ${
                    selectedPhysicsPreset === preset.id
                      ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/30'
                      : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
                  }`}
                  title={preset.description}
                >
                  {preset.icon}
                  <span className="text-[10px] font-medium">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Séparateur */}
          <div className="h-px bg-gray-600/50" />

          {/* Section Texture */}
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">
              Texture visage
            </span>
            <button
              onClick={clearTexture}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 transition-all ${
                isCustomTexture
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/30 hover:bg-rose-500'
                  : 'bg-green-600 text-white shadow-lg shadow-green-500/30 hover:bg-green-500'
              }`}
            >
              {isCustomTexture ? (
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              )}
              <span className="text-xs font-medium">
                {isCustomTexture ? 'Désactiver' : 'Par défaut'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Bouton toggle */}
      <button
        onClick={togglePanel}
        className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
          isOpen
            ? 'bg-gray-700 text-white rotate-45'
            : 'bg-gradient-to-br from-gray-700 to-gray-800 text-gray-300 hover:from-gray-600 hover:to-gray-700'
        }`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          {isOpen ? (
            // Icone X (fermé)
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          ) : (
            // Icone engrenage
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          )}
        </svg>
      </button>
    </div>
  )
}

export default SettingsPanel
