/**
 * usePhysicsScene - Hook React pour le PhysicsSceneManager
 *
 * Fournit un accès React-friendly au gestionnaire de physique avec:
 * - Initialisation automatique
 * - État de chargement
 * - Cleanup automatique au démontage
 *
 * Usage:
 *   const { isReady, manager } = usePhysicsScene()
 *   if (isReady) {
 *     manager.addRigidBody('my-body', body, mesh, 'gloves')
 *   }
 */

import { useState, useEffect, useCallback } from 'react'
import { PhysicsSceneManager } from '../systems/PhysicsSceneManager'

interface UsePhysicsSceneReturn {
  isReady: boolean
  manager: typeof PhysicsSceneManager
  // Raccourcis vers les méthodes courantes
  addRigidBody: typeof PhysicsSceneManager.addRigidBody
  removeRigidBody: typeof PhysicsSceneManager.removeRigidBody
  addSoftBody: typeof PhysicsSceneManager.addSoftBody
  removeSoftBody: typeof PhysicsSceneManager.removeSoftBody
  addConstraint: typeof PhysicsSceneManager.addConstraint
  removeConstraint: typeof PhysicsSceneManager.removeConstraint
  clearCategory: typeof PhysicsSceneManager.clearCategory
  getAmmo: typeof PhysicsSceneManager.getAmmo
  getWorld: typeof PhysicsSceneManager.getWorld
}

/**
 * Hook principal pour accéder au PhysicsSceneManager
 */
export function usePhysicsScene(): UsePhysicsSceneReturn {
  const [isReady, setIsReady] = useState(PhysicsSceneManager.isReady)

  useEffect(() => {
    // Si déjà prêt, ne rien faire
    if (PhysicsSceneManager.isReady) {
      setIsReady(true)
      return
    }

    // Sinon, initialiser
    PhysicsSceneManager.initialize()
      .then(() => {
        setIsReady(true)
      })
      .catch((error) => {
        console.error('[usePhysicsScene] Failed to initialize:', error)
      })
  }, [])

  return {
    isReady,
    manager: PhysicsSceneManager,
    // Raccourcis (bound au manager)
    addRigidBody: PhysicsSceneManager.addRigidBody.bind(PhysicsSceneManager),
    removeRigidBody: PhysicsSceneManager.removeRigidBody.bind(PhysicsSceneManager),
    addSoftBody: PhysicsSceneManager.addSoftBody.bind(PhysicsSceneManager),
    removeSoftBody: PhysicsSceneManager.removeSoftBody.bind(PhysicsSceneManager),
    addConstraint: PhysicsSceneManager.addConstraint.bind(PhysicsSceneManager),
    removeConstraint: PhysicsSceneManager.removeConstraint.bind(PhysicsSceneManager),
    clearCategory: PhysicsSceneManager.clearCategory.bind(PhysicsSceneManager),
    getAmmo: PhysicsSceneManager.getAmmo.bind(PhysicsSceneManager),
    getWorld: PhysicsSceneManager.getWorld.bind(PhysicsSceneManager),
  }
}

/**
 * Hook pour gérer une catégorie spécifique avec cleanup automatique
 *
 * Usage:
 *   const { addBody, removeBody } = usePhysicsCategory('gloves')
 *   // Au démontage, tous les objets 'gloves' sont supprimés
 */
export function usePhysicsCategory(category: string) {
  const { isReady, manager } = usePhysicsScene()

  // Cleanup au démontage
  useEffect(() => {
    return () => {
      if (manager.isReady) {
        manager.clearCategory(category)
      }
    }
  }, [category, manager])

  const addRigidBody = useCallback(
    (id: string, body: any, mesh?: THREE.Mesh) => {
      manager.addRigidBody(id, body, mesh, category)
    },
    [category, manager]
  )

  const addSoftBody = useCallback(
    (id: string, body: any, mesh: THREE.Mesh, indexAssociation: number[][]) => {
      manager.addSoftBody(id, body, mesh, indexAssociation, category)
    },
    [category, manager]
  )

  const addConstraint = useCallback(
    (id: string, constraint: any) => {
      manager.addConstraint(id, constraint, category)
    },
    [category, manager]
  )

  const clear = useCallback(() => {
    manager.clearCategory(category)
  }, [category, manager])

  return {
    isReady,
    addRigidBody,
    addSoftBody,
    addConstraint,
    removeRigidBody: manager.removeRigidBody.bind(manager),
    removeSoftBody: manager.removeSoftBody.bind(manager),
    removeConstraint: manager.removeConstraint.bind(manager),
    clear,
    getIds: () => manager.getIdsByCategory(category),
  }
}

export default usePhysicsScene
