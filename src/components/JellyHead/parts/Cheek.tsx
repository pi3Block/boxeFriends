import { useRef, useMemo, useCallback } from 'react'
import { useFrame, ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useCartoonEffectsStore } from '../../../stores/useCartoonEffectsStore'

interface CheekProps {
  side: 'left' | 'right'
  position: [number, number, number]
  wobbleIntensity?: number // 0-1
  onHit?: (intensity: number) => void
}

/**
 * Composant Cheek avec effet wobble jelly
 * Priorité 4 - Joues qui ondulent comme de la gelée
 *
 * Effet basé sur :
 * - Déformation sinusoïdale multi-fréquence
 * - Scale oscillant
 * - Mouvement latéral
 */
export function Cheek({ side, position, wobbleIntensity = 0, onHit }: CheekProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  // Store pour les effets
  const processHit = useCartoonEffectsStore((s) => s.processHit)

  // Phase offset selon le côté (les joues oscillent en opposition)
  const phaseOffset = side === 'left' ? 0 : Math.PI

  // Valeurs animées avec inertie
  const currentWobble = useRef(0)
  const wobbleVelocity = useRef(0)

  /**
   * Gestionnaire de clic direct sur la joue
   */
  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()

    const intensity = 0.6 + Math.random() * 0.4
    const zone = side === 'left' ? 'leftCheek' : 'rightCheek'

    console.log(`[Cheek ${side}] Direct hit:`, { intensity })

    // Déclencher l'effet cheek wobble
    processHit(zone, intensity)

    // Callback optionnel
    onHit?.(intensity)
  }, [side, processHit, onHit])

  // Créer la géométrie aplatie (ellipsoïde)
  const geometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(0.08, 10, 8)
    // Aplatir légèrement pour forme de joue
    geo.scale(1, 0.9, 0.7)
    return geo
  }, [])

  useFrame(() => {
    if (!meshRef.current) return

    const time = performance.now() * 0.001

    // Spring physics pour wobble - modéré
    const targetWobble = wobbleIntensity
    const springStrength = 22
    const damping = 3.0

    const acceleration =
      (targetWobble - currentWobble.current) * springStrength -
      wobbleVelocity.current * damping
    wobbleVelocity.current += acceleration * 0.016 // ~60fps
    currentWobble.current += wobbleVelocity.current * 0.016

    // Limiter l'overshoot
    currentWobble.current = Math.max(-0.1, currentWobble.current)

    const wobble = Math.max(0, currentWobble.current)

    // === Wobble idle (toujours actif) - léger ===
    const idleWobble = 0.02

    // === Scale oscillant (squash & stretch) - modéré ===
    const scaleWobble1 = Math.sin(time * 10 + phaseOffset) * wobble * 0.18
    const scaleWobble2 = Math.sin(time * 15 + phaseOffset * 0.7) * wobble * 0.1
    const scaleWobble3 = Math.sin(time * 20 + phaseOffset * 1.3) * wobble * 0.06
    const idleScale = Math.sin(time * 4 + phaseOffset) * idleWobble

    meshRef.current.scale.x = 1 + scaleWobble1 + scaleWobble3 + idleScale
    meshRef.current.scale.y = 1 - scaleWobble1 * 0.4 + scaleWobble2 * 0.15 + idleScale * 0.3
    meshRef.current.scale.z = 1 + scaleWobble2 + idleScale * 0.2

    // === Position oscillante - modéré ===
    const sideMultiplier = side === 'left' ? -1 : 1
    const positionWobble = Math.sin(time * 12 + phaseOffset) * wobble * 0.025
    const idlePosition = Math.sin(time * 3 + phaseOffset) * idleWobble * 0.3

    meshRef.current.position.x =
      position[0] + (positionWobble + idlePosition) * sideMultiplier
    meshRef.current.position.y =
      position[1] +
      Math.sin(time * 8 + phaseOffset * 1.3) * wobble * 0.018 +
      Math.cos(time * 2.5) * idleWobble * 0.2
    meshRef.current.position.z =
      position[2] + Math.cos(time * 10 + phaseOffset) * wobble * 0.015

    // === Rotation - modéré ===
    meshRef.current.rotation.z =
      Math.sin(time * 8 + phaseOffset) * wobble * 0.12 * sideMultiplier
    meshRef.current.rotation.x =
      Math.cos(time * 8 + phaseOffset) * wobble * 0.06
  })

  return (
    <mesh ref={meshRef} geometry={geometry} position={position} onPointerDown={handlePointerDown}>
      <meshStandardMaterial
        color="#ffb8a8" // Rose joue
        roughness={0.5}
        metalness={0}
        // Légère transparence pour effet subsurface
        transparent
        opacity={0.95}
      />
    </mesh>
  )
}
