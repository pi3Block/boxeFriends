import { useEffect, useState, useRef } from 'react'
import { useImpactStore, useGameStore } from '../stores'

/**
 * Textes d'impact style comics
 */
const IMPACT_TEXTS = ['POW!', 'BAM!', 'WHAM!', 'CRACK!', 'BOOM!', 'SMASH!']
const CRITICAL_TEXTS = ['CRITICAL!', 'K.O.!', 'DEVASTATOR!', 'ULTRA!']

/**
 * Interface pour un effet d'écran
 */
interface ScreenEffect {
  id: number
  type: 'flash' | 'text' | 'damage'
  x: number
  y: number
  text?: string
  damage?: number
  isCritical: boolean
  createdAt: number
}

/**
 * Composant overlay pour les effets visuels HTML
 * - Flash d'écran à l'impact
 * - Texte style comics
 * - Nombres de dégâts
 */
export function ImpactOverlay() {
  const impacts = useImpactStore((state) => state.impacts)
  const opponentHp = useGameStore((state) => state.opponentHp)
  const gameState = useGameStore((state) => state.gameState)

  const [effects, setEffects] = useState<ScreenEffect[]>([])
  const lastImpactId = useRef<number>(-1)
  const lastHp = useRef<number>(100)
  const effectId = useRef<number>(0)

  // Détecter les nouveaux impacts
  useEffect(() => {
    if (gameState !== 'FIGHTING') return
    if (impacts.length === 0) return

    const latestImpact = impacts[impacts.length - 1]
    if (!latestImpact || latestImpact.id === lastImpactId.current) return

    lastImpactId.current = latestImpact.id

    const isCritical = latestImpact.strength > 0.85
    const damage = Math.round((lastHp.current - opponentHp) * 10) / 10

    // Position à l'écran (convertir de -1,1 vers pixels)
    const screenX = ((latestImpact.hitPoint[0] + 1) / 2) * window.innerWidth
    const screenY = ((1 - latestImpact.hitPoint[1]) / 2) * window.innerHeight

    const newEffects: ScreenEffect[] = []

    // Flash d'écran
    newEffects.push({
      id: effectId.current++,
      type: 'flash',
      x: screenX,
      y: screenY,
      isCritical,
      createdAt: Date.now(),
    })

    // Texte d'impact (seulement pour les coups forts)
    if (latestImpact.strength > 0.4) {
      const texts = isCritical ? CRITICAL_TEXTS : IMPACT_TEXTS
      const text = texts[Math.floor(Math.random() * texts.length)]

      newEffects.push({
        id: effectId.current++,
        type: 'text',
        x: screenX + (Math.random() - 0.5) * 100,
        y: screenY + (Math.random() - 0.5) * 100,
        text,
        isCritical,
        createdAt: Date.now(),
      })
    }

    // Nombre de dégâts
    if (damage > 0) {
      newEffects.push({
        id: effectId.current++,
        type: 'damage',
        x: screenX + (Math.random() - 0.5) * 50,
        y: screenY - 30,
        damage,
        isCritical,
        createdAt: Date.now(),
      })
    }

    setEffects((prev) => [...prev, ...newEffects])
    lastHp.current = opponentHp
  }, [impacts, opponentHp, gameState])

  // Nettoyer les vieux effets
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setEffects((prev) =>
        prev.filter((effect) => {
          const age = now - effect.createdAt
          if (effect.type === 'flash') return age < 150
          if (effect.type === 'text') return age < 600
          if (effect.type === 'damage') return age < 800
          return false
        })
      )
    }, 50)

    return () => clearInterval(interval)
  }, [])

  if (gameState !== 'FIGHTING') return null

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {effects.map((effect) => {
        const age = Date.now() - effect.createdAt

        if (effect.type === 'flash') {
          const opacity = 1 - age / 150
          return (
            <div
              key={effect.id}
              className="absolute inset-0"
              style={{
                background: effect.isCritical
                  ? `radial-gradient(circle at ${effect.x}px ${effect.y}px, rgba(255,255,255,${opacity}) 0%, rgba(255,200,0,${opacity * 0.5}) 30%, transparent 60%)`
                  : `radial-gradient(circle at ${effect.x}px ${effect.y}px, rgba(255,255,255,${opacity * 0.7}) 0%, transparent 40%)`,
              }}
            />
          )
        }

        if (effect.type === 'text') {
          const progress = age / 600
          const scale = 1 + progress * 0.5
          const opacity = 1 - progress
          const rotation = (Math.random() - 0.5) * 20

          return (
            <div
              key={effect.id}
              className="absolute font-black"
              style={{
                left: effect.x,
                top: effect.y,
                transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
                opacity,
                fontSize: effect.isCritical ? '4rem' : '3rem',
                color: effect.isCritical ? '#ff0000' : '#ffcc00',
                textShadow: effect.isCritical
                  ? '0 0 20px #ff0000, 0 0 40px #ff0000, 2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000'
                  : '0 0 10px #ffcc00, 2px 2px 0 #000, -2px -2px 0 #000',
                fontFamily: 'Impact, sans-serif',
                letterSpacing: '2px',
              }}
            >
              {effect.text}
            </div>
          )
        }

        if (effect.type === 'damage') {
          const progress = age / 800
          const yOffset = -progress * 80
          const opacity = 1 - progress
          const scale = effect.isCritical ? 1.5 : 1

          return (
            <div
              key={effect.id}
              className="absolute font-bold"
              style={{
                left: effect.x,
                top: effect.y + yOffset,
                transform: `translate(-50%, -50%) scale(${scale})`,
                opacity,
                fontSize: effect.isCritical ? '2.5rem' : '1.5rem',
                color: effect.isCritical ? '#ff0000' : '#ffffff',
                textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                fontFamily: 'monospace',
              }}
            >
              -{effect.damage?.toFixed(1)}
            </div>
          )
        }

        return null
      })}
    </div>
  )
}

export default ImpactOverlay
