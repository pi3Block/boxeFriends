/**
 * ImpactManager - Système de gestion des impacts sans re-renders React
 *
 * Ce système remplace useImpactStore pour éviter les re-renders massifs
 * causés par les appels à set() dans tick() à chaque frame.
 *
 * Architecture:
 * - Singleton pattern pour accès global
 * - Pas de Zustand/React state = pas de re-renders
 * - Pattern observer pour notifier les effets visuels
 * - Lecture directe via getImpacts() pour les shaders
 */

/**
 * Représente un impact sur l'adversaire
 */
export interface Impact {
  id: number
  hitPoint: [number, number, number] // Position 3D du point d'impact
  strength: number // Force de l'impact (0-1)
  createdAt: number // Timestamp de création
}

/**
 * Callback pour les listeners d'impacts
 */
export type ImpactListener = (impact: Impact) => void

// Configuration
const MAX_IMPACTS = 5
const DECAY_RATE = 2.0
const MIN_STRENGTH = 0.01

/**
 * Gestionnaire d'impacts singleton
 * Aucun re-render React - mutation directe des données
 */
class ImpactManagerClass {
  private impacts: Impact[] = []
  private listeners: Set<ImpactListener> = new Set()
  private nextId = 0

  /**
   * Ajoute un nouvel impact et notifie les listeners
   * @param hitPoint Position 3D de l'impact
   * @param strength Force de l'impact (0-1)
   */
  addImpact(hitPoint: [number, number, number], strength: number): void {
    const impact: Impact = {
      id: this.nextId++,
      hitPoint,
      strength: Math.min(Math.max(strength, 0), 1),
      createdAt: performance.now(),
    }

    // Ring buffer : garder MAX_IMPACTS - 1 plus le nouveau
    if (this.impacts.length >= MAX_IMPACTS) {
      this.impacts.shift()
    }
    this.impacts.push(impact)

    // Notifier tous les listeners (pour effets visuels)
    this.listeners.forEach((listener) => {
      try {
        listener(impact)
      } catch (e) {
        console.error('[ImpactManager] Listener error:', e)
      }
    })
  }

  /**
   * Met à jour les impacts (décroissance de la force)
   * Appelé dans useFrame - MUTATION DIRECTE, pas de set()
   * @param deltaTime Temps écoulé depuis le dernier frame
   */
  tick(deltaTime: number): void {
    // Parcourir à l'envers pour pouvoir supprimer en place
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const impact = this.impacts[i]
      impact.strength -= DECAY_RATE * deltaTime

      if (impact.strength <= MIN_STRENGTH) {
        // Supprimer l'impact expiré
        this.impacts.splice(i, 1)
      }
    }
  }

  /**
   * Retourne la liste des impacts actifs
   * ATTENTION: Retourne la référence directe (pas de copie)
   * pour éviter les allocations mémoire dans useFrame
   */
  getImpacts(): readonly Impact[] {
    return this.impacts
  }

  /**
   * Retourne le nombre d'impacts actifs
   */
  getActiveCount(): number {
    return this.impacts.length
  }

  /**
   * S'abonner aux nouveaux impacts
   * @param listener Callback appelé quand un nouvel impact est ajouté
   * @returns Fonction de désabonnement
   */
  subscribe(listener: ImpactListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Efface tous les impacts
   */
  clear(): void {
    this.impacts.length = 0
  }

  /**
   * Reset complet (pour changement de scène)
   */
  reset(): void {
    this.impacts.length = 0
    this.listeners.clear()
    this.nextId = 0
  }
}

// Export du singleton
export const ImpactManager = new ImpactManagerClass()

// Export par défaut pour import simple
export default ImpactManager
