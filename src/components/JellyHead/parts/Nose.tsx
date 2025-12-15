import { useRef, useMemo, useCallback } from 'react'
import { useFrame, ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useCartoonEffectsStore } from '../../../stores/useCartoonEffectsStore'

interface NoseProps {
  position: [number, number, number]
  squashIntensity?: number // 0-1
  onHit?: (intensity: number) => void
}

/**
 * Composant Nose avec effet accordion squash
 * Priorité 3 - Nez qui s'écrase comme un accordéon
 *
 * Effet :
 * - Compression en Z (profondeur)
 * - Élargissement en X/Y (conservation volume)
 * - Rebond élastique cartoon
 */
export function Nose({ position, squashIntensity = 0, onHit }: NoseProps) {
  const groupRef = useRef<THREE.Group>(null)
  const noseRef = useRef<THREE.Mesh>(null)

  // Store pour les effets
  const processHit = useCartoonEffectsStore((s) => s.processHit)

  // Animation avec spring
  const currentSquash = useRef(0)
  const squashVelocity = useRef(0)

  /**
   * Gestionnaire de clic direct sur le nez
   */
  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()

    const intensity = 0.7 + Math.random() * 0.3

    console.log('[Nose] Direct hit:', { intensity })

    // Déclencher l'effet nose squash
    processHit('nose', intensity)

    // Callback optionnel
    onHit?.(intensity)
  }, [processHit, onHit])

  // Géométrie du nez (cône arrondi)
  const noseGeometry = useMemo(() => {
    // Cone avec bout arrondi
    const geo = new THREE.ConeGeometry(0.04, 0.1, 8, 1)
    // Rotation pour pointer vers l'avant
    geo.rotateX(Math.PI / 2)
    return geo
  }, [])

  // Géométrie du bout du nez (sphère)
  const tipGeometry = useMemo(() => {
    return new THREE.SphereGeometry(0.025, 8, 6)
  }, [])

  useFrame(() => {
    if (!groupRef.current || !noseRef.current) return

    const time = performance.now() * 0.001

    // Spring physics - modéré pour éviter artefacts
    const targetSquash = squashIntensity
    const springStrength = 25
    const damping = 3.5

    const acceleration =
      (targetSquash - currentSquash.current) * springStrength -
      squashVelocity.current * damping
    squashVelocity.current += acceleration * 0.016
    currentSquash.current += squashVelocity.current * 0.016

    // Limiter l'overshoot
    currentSquash.current = Math.max(-0.1, Math.min(1.0, currentSquash.current))

    const squash = Math.max(0, currentSquash.current)

    // === Squash en Z - modéré ===
    const zScale = 1 - squash * 0.4
    groupRef.current.scale.z = Math.max(0.4, zScale)

    // === Stretch en X/Y - modéré ===
    const xyScale = 1 + squash * 0.35
    groupRef.current.scale.x = xyScale
    groupRef.current.scale.y = xyScale

    // === Position Z (recul) - modéré ===
    groupRef.current.position.z = position[2] - squash * 0.04

    // === Wobble secondaire - modéré ===
    if (squash > 0.05) {
      const wobbleDecay = Math.exp(-squash * 2.0)
      groupRef.current.position.x =
        position[0] + Math.sin(time * 15) * squash * 0.015 * wobbleDecay
      groupRef.current.position.y =
        position[1] + Math.cos(time * 12) * squash * 0.01 * wobbleDecay
      groupRef.current.rotation.z = Math.sin(time * 12) * squash * 0.12
      groupRef.current.rotation.x = Math.cos(time * 10) * squash * 0.08
    } else {
      // Retour progressif
      groupRef.current.position.x =
        THREE.MathUtils.lerp(groupRef.current.position.x, position[0], 0.12)
      groupRef.current.position.y =
        THREE.MathUtils.lerp(groupRef.current.position.y, position[1], 0.12)
      groupRef.current.rotation.z *= 0.92
      groupRef.current.rotation.x *= 0.92
    }

    // === Animation "accordion" - modéré ===
    if (squash > 0.1) {
      const accordionWave = Math.sin(time * 20 + squash * 10) * 0.06
      groupRef.current.scale.z *= 1 + accordionWave
    }
  })

  return (
    <group ref={groupRef} position={position} onPointerDown={handlePointerDown}>
      {/* Corps du nez (cône) */}
      <mesh ref={noseRef} geometry={noseGeometry} position={[0, 0, -0.02]}>
        <meshStandardMaterial
          color="#f5c4a8"
          roughness={0.55}
          metalness={0}
        />
      </mesh>

      {/* Bout du nez (sphère) */}
      <mesh geometry={tipGeometry} position={[0, 0, 0.04]}>
        <meshStandardMaterial
          color="#ffb8a0"
          roughness={0.5}
          metalness={0}
        />
      </mesh>

      {/* Narines (petites sphères sombres) */}
      <mesh position={[-0.015, -0.01, 0.02]}>
        <sphereGeometry args={[0.008, 6, 4]} />
        <meshBasicMaterial color="#3a2a2a" />
      </mesh>
      <mesh position={[0.015, -0.01, 0.02]}>
        <sphereGeometry args={[0.008, 6, 4]} />
        <meshBasicMaterial color="#3a2a2a" />
      </mesh>
    </group>
  )
}
