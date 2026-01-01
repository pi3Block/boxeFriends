import { useEffect, useRef } from 'react'
import { ImpactManager, type Impact } from '../systems/ImpactManager'

/**
 * Hook pour écouter les nouveaux impacts sans causer de re-renders
 *
 * Utilise le pattern callback : le composant est notifié quand un
 * nouvel impact arrive, mais ne re-render pas à chaque tick().
 *
 * @param onNewImpact Callback appelé quand un nouvel impact est détecté
 *
 * @example
 * ```tsx
 * useImpactListener((impact) => {
 *   // Spawner des particules, jouer un son, etc.
 *   spawnParticles(impact.hitPoint, impact.strength)
 * })
 * ```
 */
export function useImpactListener(onNewImpact: (impact: Impact) => void): void {
  // Ref pour garder la dernière version du callback sans re-render
  const callbackRef = useRef(onNewImpact)
  callbackRef.current = onNewImpact

  useEffect(() => {
    // S'abonner aux nouveaux impacts
    const unsubscribe = ImpactManager.subscribe((impact) => {
      callbackRef.current(impact)
    })

    return unsubscribe
  }, [])
}

/**
 * Hook pour accéder aux impacts dans useFrame sans re-render
 *
 * Retourne une fonction getImpacts() à appeler dans useFrame.
 * Ne cause JAMAIS de re-render React.
 *
 * @example
 * ```tsx
 * const getImpacts = useImpactGetter()
 *
 * useFrame(() => {
 *   const impacts = getImpacts()
 *   // Mettre à jour les uniforms du shader
 *   for (const impact of impacts) {
 *     // ...
 *   }
 * })
 * ```
 */
export function useImpactGetter(): () => readonly Impact[] {
  return ImpactManager.getImpacts.bind(ImpactManager)
}

/**
 * Hook pour gérer le tick des impacts dans useFrame
 *
 * Retourne la fonction tick() à appeler dans useFrame.
 * UN SEUL composant doit appeler cette fonction par scène.
 *
 * @example
 * ```tsx
 * const tickImpacts = useImpactTicker()
 *
 * useFrame((_, delta) => {
 *   tickImpacts(delta)
 * })
 * ```
 */
export function useImpactTicker(): (deltaTime: number) => void {
  return ImpactManager.tick.bind(ImpactManager)
}

export default useImpactListener
