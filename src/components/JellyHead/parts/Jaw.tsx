import { useRef, useMemo, useEffect, useCallback } from 'react'
import { useFrame, ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useCartoonEffectsStore } from '../../../stores/useCartoonEffectsStore'

interface JawProps {
  position: [number, number, number]
  isDetached?: boolean
  detachProgress?: number // 0-1
  onHit?: (intensity: number) => void
}

/**
 * Composant Jaw avec effet détachement cartoon
 * Priorité 2 - Mâchoire qui se décroche et rebondit
 *
 * Animation :
 * - Détachement avec vélocité initiale
 * - Chute avec gravité
 * - Rebond sur le sol
 * - Retour progressif à la position initiale
 */
export function Jaw({ position, isDetached = false, detachProgress: _detachProgress = 0, onHit }: JawProps) {
  const groupRef = useRef<THREE.Group>(null)

  // Store pour les effets
  const processHit = useCartoonEffectsStore((s) => s.processHit)

  // Physique du détachement
  const velocity = useRef(new THREE.Vector3())
  const angularVelocity = useRef(new THREE.Vector3())
  const physicsPosition = useRef(new THREE.Vector3(...position))
  const physicsRotation = useRef(new THREE.Euler())

  // État précédent pour détecter le changement
  const wasDetached = useRef(false)

  /**
   * Gestionnaire de clic direct sur la mâchoire
   */
  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()

    // Impact très fort sur la mâchoire = plus de chance de détachement
    const intensity = 0.75 + Math.random() * 0.25

    console.log('[Jaw] Direct hit:', { intensity })

    // Déclencher l'effet jaw
    processHit('jaw', intensity)

    // Callback optionnel
    onHit?.(intensity)
  }, [processHit, onHit])

  // Initialiser vélocité au moment du détachement
  useEffect(() => {
    if (isDetached && !wasDetached.current) {
      // Vélocité initiale : pop vers le haut/avant
      velocity.current.set(
        (Math.random() - 0.5) * 1.5,
        2.5 + Math.random() * 1.5, // Fort mouvement vers le haut
        -1.5 - Math.random() * 1 // Vers la caméra
      )

      // Rotation aléatoire
      angularVelocity.current.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 12
      )

      // Position de départ = position attachée
      physicsPosition.current.set(...position)
      physicsRotation.current.set(0, 0, 0)
    }

    wasDetached.current = isDetached
  }, [isDetached, position])

  // Géométrie de la mâchoire (demi-ellipsoïde)
  const jawGeometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
    // Aplatir légèrement
    geo.scale(1, 0.6, 0.8)
    return geo
  }, [])

  useFrame((_, delta) => {
    if (!groupRef.current) return

    if (isDetached) {
      // === Physique de détachement ===

      // Gravité
      velocity.current.y -= 15 * delta

      // Mise à jour position
      physicsPosition.current.addScaledVector(velocity.current, delta)

      // Mise à jour rotation
      physicsRotation.current.x += angularVelocity.current.x * delta
      physicsRotation.current.y += angularVelocity.current.y * delta
      physicsRotation.current.z += angularVelocity.current.z * delta

      // Collision avec le sol (Y = -0.8)
      const floorY = -0.8
      if (physicsPosition.current.y < floorY) {
        physicsPosition.current.y = floorY

        // Rebond avec perte d'énergie
        velocity.current.y *= -0.5
        velocity.current.x *= 0.7
        velocity.current.z *= 0.7

        // Réduire rotation angulaire
        angularVelocity.current.multiplyScalar(0.6)
      }

      // Air resistance
      velocity.current.multiplyScalar(0.995)
      angularVelocity.current.multiplyScalar(0.99)

      // Appliquer à l'objet
      groupRef.current.position.copy(physicsPosition.current)
      groupRef.current.rotation.copy(physicsRotation.current)

    } else {
      // === Retour à la position attachée ===

      // Interpolation douce vers position de repos
      groupRef.current.position.x = THREE.MathUtils.lerp(
        groupRef.current.position.x,
        position[0],
        0.08
      )
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        position[1],
        0.08
      )
      groupRef.current.position.z = THREE.MathUtils.lerp(
        groupRef.current.position.z,
        position[2],
        0.08
      )

      // Retour rotation à zéro
      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        0,
        0.1
      )
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        0,
        0.1
      )
      groupRef.current.rotation.z = THREE.MathUtils.lerp(
        groupRef.current.rotation.z,
        0,
        0.1
      )

      // Petit wobble idle
      const time = performance.now() * 0.001
      const idleWobble = Math.sin(time * 2) * 0.003
      groupRef.current.position.y = position[1] + idleWobble
    }
  })

  return (
    <group ref={groupRef} position={position} onPointerDown={handlePointerDown}>
      {/* Mâchoire principale */}
      <mesh geometry={jawGeometry}>
        <meshStandardMaterial
          color="#f5c4a8"
          roughness={0.55}
          metalness={0}
        />
      </mesh>

      {/* Lèvre inférieure */}
      <mesh position={[0, 0.02, 0.08]}>
        <boxGeometry args={[0.12, 0.025, 0.04]} />
        <meshStandardMaterial
          color="#d4908a" // Rose lèvre
          roughness={0.4}
          metalness={0}
        />
      </mesh>

      {/* Dents du bas (optionnel, visible quand détaché) */}
      {isDetached && (
        <group position={[0, 0.04, 0.05]}>
          {[-0.03, -0.01, 0.01, 0.03].map((x, i) => (
            <mesh key={i} position={[x, 0, 0]}>
              <boxGeometry args={[0.015, 0.02, 0.01]} />
              <meshBasicMaterial color="white" />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}
