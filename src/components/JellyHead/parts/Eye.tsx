import { useRef, useCallback } from 'react'
import { useFrame, ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useCartoonEffectsStore } from '../../../stores/useCartoonEffectsStore'

interface EyeProps {
  side: 'left' | 'right'
  position: [number, number, number]
  popIntensity?: number // 0-1, intensité de l'effet pop
  onHit?: (intensity: number) => void
}

/**
 * Composant Eye avec effet "pop out" cartoon
 * Priorité 5 - Effet le plus important
 *
 * L'œil sort de son orbite sur impact fort, avec :
 * - Déplacement vers l'avant (Z)
 * - Légère rotation wobble
 * - Scale bulge (gonflement)
 */
export function Eye({ side, position, popIntensity = 0, onHit }: EyeProps) {
  const groupRef = useRef<THREE.Group>(null)
  const eyeballRef = useRef<THREE.Mesh>(null)
  const pupilRef = useRef<THREE.Mesh>(null)

  // Store pour les effets
  const processHit = useCartoonEffectsStore((s) => s.processHit)

  // Valeurs animées avec spring
  const currentPop = useRef(0)
  const popVelocity = useRef(0)

  /**
   * Gestionnaire de clic direct sur l'œil
   */
  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()

    const intensity = 0.8 + Math.random() * 0.2 // Fort impact sur l'œil
    const zone = side === 'left' ? 'leftEye' : 'rightEye'

    console.log(`[Eye ${side}] Direct hit:`, { intensity })

    // Déclencher l'effet eye pop
    processHit(zone, intensity)

    // Callback optionnel
    onHit?.(intensity)
  }, [side, processHit, onHit])

  useFrame((_, delta) => {
    if (!groupRef.current) return

    // Spring physics pour le pop - modéré
    const targetPop = popIntensity
    const springStrength = 20
    const damping = 3.5

    // Accélération du ressort
    const acceleration =
      (targetPop - currentPop.current) * springStrength -
      popVelocity.current * damping
    popVelocity.current += acceleration * delta
    currentPop.current += popVelocity.current * delta

    // Permettre légère valeur négative pour effet rebond
    currentPop.current = Math.max(-0.08, currentPop.current)

    const pop = Math.max(0, currentPop.current)

    // === Déplacement Z (sortie de l'orbite) - modéré ===
    groupRef.current.position.z = position[2] + pop * 0.15

    // === Scale bulge (gonflement) - modéré ===
    const bulgeScale = 1 + pop * 0.25
    groupRef.current.scale.setScalar(bulgeScale)

    // === Rotation wobble - modéré ===
    if (pop > 0.05) {
      const wobbleSpeed = 25
      const wobbleAmount = pop * 0.15
      groupRef.current.rotation.x =
        Math.sin(performance.now() * 0.001 * wobbleSpeed) * wobbleAmount
      groupRef.current.rotation.y =
        Math.cos(performance.now() * 0.001 * wobbleSpeed * 0.8) * wobbleAmount
      groupRef.current.rotation.z =
        Math.sin(performance.now() * 0.001 * wobbleSpeed * 1.2) * wobbleAmount * 0.3
    } else {
      // Retour progressif à rotation 0
      groupRef.current.rotation.x *= 0.92
      groupRef.current.rotation.y *= 0.92
      groupRef.current.rotation.z *= 0.92
    }

    // === Animation de la pupille - modéré ===
    if (pupilRef.current) {
      const pupilScale = 1 + pop * 0.35
      pupilRef.current.scale.setScalar(pupilScale)

      // Décalage de la pupille (base: 0.0455)
      pupilRef.current.position.z = 0.0455 + pop * 0.015
    }
  })

  // Couleur de l'iris selon le côté (pour variété)
  const irisColor = side === 'left' ? '#4a7c59' : '#4a7c59' // Vert pour les deux

  return (
    <group ref={groupRef} position={position}>
      {/* Globe oculaire (sclera) - cliquable */}
      <mesh ref={eyeballRef} onPointerDown={handlePointerDown}>
        <sphereGeometry args={[0.045, 12, 10]} />
        <meshStandardMaterial color="white" roughness={0.3} metalness={0} />
      </mesh>

      {/* Iris - positionné à la surface de la sphère (rayon 0.045) */}
      <mesh position={[0, 0, 0.044]}>
        <circleGeometry args={[0.022, 16]} />
        <meshStandardMaterial
          color={irisColor}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>

      {/* Pupille - légèrement devant l'iris */}
      <mesh ref={pupilRef} position={[0, 0, 0.0455]}>
        <circleGeometry args={[0.01, 12]} />
        <meshBasicMaterial color="black" />
      </mesh>

      {/* Reflet (highlight) */}
      <mesh position={[0.008, 0.012, 0.047]}>
        <circleGeometry args={[0.005, 8]} />
        <meshBasicMaterial color="white" transparent opacity={0.9} />
      </mesh>
    </group>
  )
}
