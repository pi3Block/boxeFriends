import { useCallback, useRef, useEffect } from 'react'
import { useDrag, useGesture } from '@use-gesture/react'
import type { PunchType } from '../stores'

/**
 * Données d'un coup détecté
 */
export interface PunchData {
  type: PunchType
  velocity: number // 0-1 normalisé
  direction: [number, number] // Direction du swipe normalisée
  screenPosition: [number, number] // Position sur l'écran
}

/**
 * Configuration du système d'input
 */
interface GestureConfig {
  onPunch: (data: PunchData) => void
  enabled?: boolean
}

// Seuils de détection
const SWIPE_THRESHOLD = 50 // Distance minimum pour un swipe (px)
const VELOCITY_THRESHOLD = 0.3 // Vélocité minimum
const MAX_VELOCITY = 2.0 // Vélocité pour normalisation
const VERTICAL_RATIO = 1.5 // Ratio pour distinguer vertical/horizontal

/**
 * Hook pour détecter les gestes de boxe
 * - Tap → Jab
 * - Swipe vertical (haut) → Uppercut
 * - Swipe horizontal → Hook
 */
export function useGestureInput({ onPunch, enabled = true }: GestureConfig) {
  const lastTapTime = useRef(0)
  const isDragging = useRef(false)

  /**
   * Détermine le type de coup basé sur la direction du swipe
   */
  const determinePunchType = useCallback(
    (dx: number, dy: number, vx: number, vy: number): PunchType | null => {
      const distance = Math.sqrt(dx * dx + dy * dy)
      const velocity = Math.sqrt(vx * vx + vy * vy)

      // Si pas assez de mouvement, c'est un tap → Jab
      if (distance < SWIPE_THRESHOLD) {
        return 'jab'
      }

      // Vélocité trop faible
      if (velocity < VELOCITY_THRESHOLD) {
        return null
      }

      const absX = Math.abs(dx)
      const absY = Math.abs(dy)

      // Swipe vertical (vers le haut) → Uppercut
      if (absY > absX * VERTICAL_RATIO && dy < 0) {
        return 'uppercut'
      }

      // Swipe horizontal → Hook
      if (absX > absY) {
        return 'hook'
      }

      // Swipe vers le bas ou diagonal ambigu → Jab par défaut
      return 'jab'
    },
    []
  )

  /**
   * Normalise la vélocité entre 0 et 1
   */
  const normalizeVelocity = useCallback((vx: number, vy: number): number => {
    const velocity = Math.sqrt(vx * vx + vy * vy)
    return Math.min(velocity / MAX_VELOCITY, 1)
  }, [])

  /**
   * Bind pour le gesture handler
   */
  const bind = useGesture(
    {
      onDragStart: () => {
        if (!enabled) return
        isDragging.current = true
      },

      onDragEnd: ({ movement: [dx, dy], velocity: [vx, vy], xy: [x, y] }) => {
        if (!enabled || !isDragging.current) return
        isDragging.current = false

        const punchType = determinePunchType(dx, dy, vx, vy)
        if (!punchType) return

        const normalizedVelocity = normalizeVelocity(vx, vy)

        // Boost pour les uppercuts (plus difficiles à exécuter)
        const velocityBoost = punchType === 'uppercut' ? 1.2 : 1

        onPunch({
          type: punchType,
          velocity: Math.min(normalizedVelocity * velocityBoost, 1),
          direction: [
            dx === 0 ? 0 : dx / Math.abs(dx),
            dy === 0 ? 0 : dy / Math.abs(dy),
          ],
          screenPosition: [x, y],
        })
      },

      onClick: ({ event }) => {
        if (!enabled) return

        // Éviter le double-trigger avec drag
        const now = Date.now()
        if (now - lastTapTime.current < 100) return
        lastTapTime.current = now

        // Simple tap → Jab rapide
        if (!isDragging.current) {
          const target = event.target as HTMLElement
          const rect = target.getBoundingClientRect()
          const x = (event as MouseEvent).clientX ?? rect.width / 2
          const y = (event as MouseEvent).clientY ?? rect.height / 2

          onPunch({
            type: 'jab',
            velocity: 0.5, // Vélocité par défaut pour tap
            direction: [0, 0],
            screenPosition: [x, y],
          })
        }
      },
    },
    {
      drag: {
        threshold: 5,
        filterTaps: true,
      },
    }
  )

  return { bind }
}

/**
 * Callbacks pour le nouveau système de gestes
 */
export interface PunchDragCallbacks {
  onDragStart?: (screenX: number, screenY: number) => void
  onDragMove?: (screenX: number, screenY: number) => void
  onDragEnd: (data: PunchData) => void
  onRelease?: () => void
}

/**
 * Hook legacy pour compatibilité
 */
export function usePunchDrag(callbacks: PunchDragCallbacks, enabled = true) {
  const { onDragMove, onDragEnd } = callbacks

  const bind = useDrag(
    ({ xy: [x, y], first, last, active }) => {
      if (!enabled) return

      if (first) {
        onDragEnd({
          type: 'jab',
          velocity: 0.6,
          direction: [0, 0],
          screenPosition: [x, y],
        })
        return
      }

      if (active && !first && !last) {
        onDragMove?.(x, y)
        return
      }
    },
    {
      filterTaps: false,
      threshold: 1,
    }
  )

  return bind
}

/**
 * Callbacks pour le système souris avec suivi permanent
 */
export interface MousePunchCallbacks {
  onMouseMove: (screenX: number, screenY: number) => void
  onLeftPunch: (data: PunchData) => void
  onRightPunch: (data: PunchData) => void
}

/**
 * Hook pour gestion souris: gants suivent toujours, clic gauche/droit = punch
 */
export function useMousePunch(callbacks: MousePunchCallbacks, enabled = true) {
  const { onMouseMove, onLeftPunch, onRightPunch } = callbacks

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!enabled) return
    onMouseMove(e.clientX, e.clientY)
  }, [enabled, onMouseMove])

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!enabled) return

    const punchData: PunchData = {
      type: 'jab',
      velocity: 0.6,
      direction: [0, 0],
      screenPosition: [e.clientX, e.clientY],
    }

    // Bouton 0 = clic gauche, bouton 2 = clic droit
    if (e.button === 0) {
      onLeftPunch(punchData)
    } else if (e.button === 2) {
      onRightPunch(punchData)
    }
  }, [enabled, onLeftPunch, onRightPunch])

  const handleContextMenu = useCallback((e: MouseEvent) => {
    if (!enabled) return
    e.preventDefault() // Empêcher le menu contextuel
  }, [enabled])

  // Attacher les événements au document
  useEffect(() => {
    if (!enabled) return

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('contextmenu', handleContextMenu)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [enabled, handleMouseMove, handleMouseDown, handleContextMenu])
}
