/**
 * useOpponent - Hook React pour l'OpponentManager
 *
 * Fournit un accès React-friendly au gestionnaire d'adversaires avec:
 * - État réactif du type d'adversaire
 * - Initialisation automatique
 * - Cleanup automatique au démontage
 *
 * Usage:
 *   const { currentType, setOpponent, cleanup } = useOpponent()
 */

import { useState, useEffect, useCallback } from 'react'
import { useThree } from '@react-three/fiber'
import { OpponentManager } from '../systems/OpponentManager'
import type { OpponentType } from '../stores'

interface UseOpponentReturn {
  isReady: boolean
  currentType: OpponentType | null
  setOpponent: typeof OpponentManager.setOpponent
  cleanup: typeof OpponentManager.cleanup
  trackMesh: typeof OpponentManager.trackMesh
  trackGeometry: typeof OpponentManager.trackGeometry
  replaceGeometry: typeof OpponentManager.replaceGeometry
  createOpponentGeometry: typeof OpponentManager.createOpponentGeometry
  logState: typeof OpponentManager.logState
}

/**
 * Hook principal pour accéder à l'OpponentManager
 */
export function useOpponent(): UseOpponentReturn {
  const { scene } = useThree()
  const [isReady, setIsReady] = useState(OpponentManager.isReady)
  const [currentType, setCurrentType] = useState<OpponentType | null>(
    OpponentManager.currentType
  )

  // Initialiser le manager avec la scène
  useEffect(() => {
    if (!scene) return

    // Initialiser si pas déjà fait
    if (!OpponentManager.isReady) {
      OpponentManager.initialize(scene)
    }

    setIsReady(OpponentManager.isReady)

    // S'abonner aux changements
    const unsubscribe = OpponentManager.onChange((type) => {
      setCurrentType(type)
    })

    return () => {
      unsubscribe()
    }
  }, [scene])

  // Wrapper pour setOpponent qui met à jour l'état local
  const setOpponent = useCallback(
    async (
      type: OpponentType,
      mesh: THREE.Mesh,
      options?: Parameters<typeof OpponentManager.setOpponent>[2]
    ) => {
      await OpponentManager.setOpponent(type, mesh, options)
      setCurrentType(type)
    },
    []
  )

  // Wrapper pour cleanup
  const cleanup = useCallback(async () => {
    await OpponentManager.cleanup()
    setCurrentType(null)
  }, [])

  return {
    isReady,
    currentType,
    setOpponent,
    cleanup,
    trackMesh: OpponentManager.trackMesh.bind(OpponentManager),
    trackGeometry: OpponentManager.trackGeometry.bind(OpponentManager),
    replaceGeometry: OpponentManager.replaceGeometry.bind(OpponentManager),
    createOpponentGeometry: OpponentManager.createOpponentGeometry.bind(OpponentManager),
    logState: OpponentManager.logState.bind(OpponentManager),
  }
}

export default useOpponent
