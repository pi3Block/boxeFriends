import { useCallback, useRef, type ChangeEvent } from 'react'
import { useGameStore } from '../stores'
import { CharacterSelector } from './CharacterSelector'

/**
 * Composant UI overlay (HTML au-dessus du Canvas)
 */
export function UI() {
  const gameState = useGameStore((state) => state.gameState)
  const playerHp = useGameStore((state) => state.playerHp)
  const opponentHp = useGameStore((state) => state.opponentHp)
  const comboCount = useGameStore((state) => state.comboCount)
  const opponentTexture = useGameStore((state) => state.opponentTexture)
  const isCustomTexture = useGameStore((state) => state.isCustomTexture)
  const setTexture = useGameStore((state) => state.setTexture)
  const startFight = useGameStore((state) => state.startFight)
  const resetGame = useGameStore((state) => state.resetGame)

  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * Gère l'upload de photo
   */
  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      // Vérifier le type
      if (!file.type.startsWith('image/')) {
        alert('Veuillez sélectionner une image')
        return
      }

      // Créer un blob URL
      const url = URL.createObjectURL(file)
      setTexture(url)
    },
    [setTexture]
  )

  /**
   * Déclenche l'input file
   */
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      {/* Input file caché */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* LOBBY */}
      {gameState === 'LOBBY' && (
        <div className="pointer-events-auto flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto bg-black/50 py-8">
          <h1 className="text-4xl font-bold text-white">FACE PUNCHER</h1>

          {/* Sélecteur de personnage */}
          <CharacterSelector />

          {/* Preview de la photo */}
          <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-white">
            <img
              src={opponentTexture}
              alt="Opponent"
              className="h-full w-full object-cover"
            />
          </div>

          {/* Bouton upload */}
          <button
            onClick={handleUploadClick}
            className="rounded-lg bg-blue-600 px-6 py-3 font-bold text-white transition hover:bg-blue-700"
          >
            {isCustomTexture ? 'Changer la photo' : 'Choisir une photo (visage)'}
          </button>

          {/* Bouton start */}
          <button
            onClick={startFight}
            className="rounded-lg bg-red-600 px-8 py-4 text-xl font-bold text-white transition hover:bg-red-700"
          >
            FIGHT!
          </button>
        </div>
      )}

      {/* FIGHTING - HUD */}
      {gameState === 'FIGHTING' && (
        <>
          {/* Barre de vie adversaire (top) */}
          <div className="p-4">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-1 text-center text-sm font-bold text-white drop-shadow-lg">
                ADVERSAIRE
              </div>
              <div className="h-6 w-full overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-200"
                  style={{ width: `${opponentHp}%` }}
                />
              </div>
            </div>
          </div>

          {/* Combo counter (centre) */}
          {comboCount > 1 && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="animate-pulse text-6xl font-black text-yellow-400 drop-shadow-lg">
                {comboCount}x COMBO!
              </div>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Barre de vie joueur (bottom) */}
          <div className="p-4">
            <div className="mx-auto w-full max-w-md">
              <div className="h-4 w-full overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-200"
                  style={{ width: `${playerHp}%` }}
                />
              </div>
              <div className="mt-1 text-center text-xs font-bold text-white drop-shadow-lg">
                VOUS
              </div>
            </div>
          </div>
        </>
      )}

      {/* KO */}
      {gameState === 'KO' && (
        <div className="pointer-events-auto flex flex-1 flex-col items-center justify-center gap-6 bg-black/70">
          <h1 className="animate-bounce text-6xl font-black text-red-500">
            K.O.!
          </h1>

          {opponentHp <= 0 && (
            <p className="text-2xl font-bold text-green-400">VICTOIRE!</p>
          )}

          {playerHp <= 0 && (
            <p className="text-2xl font-bold text-red-400">DÉFAITE...</p>
          )}

          <button
            onClick={resetGame}
            className="rounded-lg bg-blue-600 px-8 py-4 text-xl font-bold text-white transition hover:bg-blue-700"
          >
            REJOUER
          </button>
        </div>
      )}
    </div>
  )
}

export default UI
