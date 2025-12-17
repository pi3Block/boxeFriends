import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useImpactStore } from '../stores'

/**
 * Configuration des particules d'impact
 */
const PARTICLE_CONFIG = {
  count: 6,               // Nombre de particules par impact (réduit)
  size: 0.06,             // Taille des particules (petites gouttes)
  speed: 6,               // Vitesse d'éjection
  lifetime: 0.6,          // Durée de vie en secondes
  gravity: -12,           // Gravité
  colors: ['#ffffff', '#e0f0ff', '#a0d4ff', '#80c0ff', '#60b0ff'], // Blanc/bleu gouttes d'eau
}

/**
 * Configuration du hit-stop
 */
const HITSTOP_CONFIG = {
  duration: 0.08,         // Durée du freeze en secondes
  criticalDuration: 0.15, // Durée pour les coups critiques
  threshold: 0.5,         // Seuil de force pour déclencher le hit-stop
}

/**
 * Interface pour une particule (avec pooling)
 */
interface Particle {
  position: THREE.Vector3
  velocity: THREE.Vector3
  color: THREE.Color
  size: number
  life: number
  maxLife: number
  active: boolean // Flag pour le pooling - évite de créer de nouveaux arrays
}

/**
 * Composant pour les effets d'impact
 * - Particules d'étincelles
 * - Effet hit-stop (freeze frame)
 * - Lignes de vitesse radiales
 */
// Taille du pool de particules (fixe, pas de réallocation)
const POOL_SIZE = PARTICLE_CONFIG.count * 50

export function ImpactEffects() {
  const impacts = useImpactStore((state) => state.impacts)
  const lastImpactId = useRef<number>(-1)
  const hitStopTime = useRef<number>(0)
  useThree() // Pour accéder au contexte Three.js

  // Pool de particules pré-alloué (évite les allocations à chaque impact)
  const particlePool = useRef<Particle[]>(
    Array.from({ length: POOL_SIZE }, () => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      color: new THREE.Color(),
      size: 0,
      life: 0,
      maxLife: 0,
      active: false,
    }))
  )

  // Références pour le mesh de particules
  const particlesRef = useRef<THREE.Points>(null)

  // Géométrie des particules
  const particleGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(PARTICLE_CONFIG.count * 50 * 3) // Max 50 impacts simultanés
    const colors = new Float32Array(PARTICLE_CONFIG.count * 50 * 3)
    const sizes = new Float32Array(PARTICLE_CONFIG.count * 50)

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    return geo
  }, [])


  // Material des particules
  const particleMaterial = useMemo(() => {
    return new THREE.PointsMaterial({
      size: PARTICLE_CONFIG.size,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  }, [])


  /**
   * Crée des particules à partir d'un point d'impact (utilise le pool)
   * Pas d'allocation mémoire - réutilise les particules inactives
   */
  const spawnParticles = (hitPoint: [number, number, number], strength: number) => {
    const count = Math.floor(PARTICLE_CONFIG.count * strength)
    let spawned = 0

    for (const particle of particlePool.current) {
      if (spawned >= count) break
      if (particle.active) continue

      // Direction aléatoire (hémisphère vers la caméra)
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI * 0.5

      const speed = PARTICLE_CONFIG.speed * (0.5 + Math.random() * 0.5) * strength

      // Réutiliser les objets existants (pas de new)
      particle.position.set(hitPoint[0], hitPoint[1], hitPoint[2])
      particle.velocity.set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
        Math.cos(phi) * speed
      )

      // Couleur aléatoire
      const colorHex = PARTICLE_CONFIG.colors[Math.floor(Math.random() * PARTICLE_CONFIG.colors.length)]
      particle.color.set(colorHex)

      particle.size = PARTICLE_CONFIG.size * (0.5 + Math.random())
      particle.life = PARTICLE_CONFIG.lifetime
      particle.maxLife = PARTICLE_CONFIG.lifetime
      particle.active = true

      spawned++
    }
  }


  // Détecter les nouveaux impacts
  useEffect(() => {
    if (impacts.length > 0) {
      const latestImpact = impacts[impacts.length - 1]
      if (latestImpact && latestImpact.id !== lastImpactId.current) {
        lastImpactId.current = latestImpact.id

        // Spawner des particules
        spawnParticles(latestImpact.hitPoint, latestImpact.strength)

        // Déclencher le hit-stop si la force est suffisante
        if (latestImpact.strength > HITSTOP_CONFIG.threshold) {
          const duration = latestImpact.strength > 0.85
            ? HITSTOP_CONFIG.criticalDuration
            : HITSTOP_CONFIG.duration

          hitStopTime.current = duration
        }
      }
    }
  }, [impacts])

  // Animation des particules (optimisée avec pooling - pas de filter())
  useFrame((_, delta) => {
    // Hit-stop : ralentir le temps
    let effectiveDelta = delta
    if (hitStopTime.current > 0) {
      hitStopTime.current -= delta
      effectiveDelta = delta * 0.1 // Ralentir à 10%
    }

    // Mettre à jour les particules actives (pas de création d'array)
    for (const p of particlePool.current) {
      if (!p.active) continue

      p.life -= effectiveDelta

      if (p.life <= 0) {
        p.active = false // Désactiver au lieu de filter()
        continue
      }

      // Physique (modification in-place, pas de clone())
      p.velocity.y += PARTICLE_CONFIG.gravity * effectiveDelta
      p.position.x += p.velocity.x * effectiveDelta
      p.position.y += p.velocity.y * effectiveDelta
      p.position.z += p.velocity.z * effectiveDelta
    }

    // Mettre à jour la géométrie des particules
    if (particlesRef.current) {
      const positions = particleGeometry.attributes.position as THREE.BufferAttribute
      const colors = particleGeometry.attributes.color as THREE.BufferAttribute
      const sizes = particleGeometry.attributes.size as THREE.BufferAttribute

      let visibleIndex = 0
      for (const p of particlePool.current) {
        if (p.active) {
          positions.setXYZ(visibleIndex, p.position.x, p.position.y, p.position.z)

          const lifeRatio = p.life / p.maxLife
          colors.setXYZ(visibleIndex, p.color.r * lifeRatio, p.color.g * lifeRatio, p.color.b * lifeRatio)
          sizes.setX(visibleIndex, p.size * lifeRatio)

          visibleIndex++
        }
      }

      // Cacher les particules non utilisées
      for (let i = visibleIndex; i < POOL_SIZE; i++) {
        positions.setXYZ(i, 0, 0, -100)
        sizes.setX(i, 0)
      }

      positions.needsUpdate = true
      colors.needsUpdate = true
      sizes.needsUpdate = true
    }
  })

  return (
    <>
      {/* Particules gouttes d'eau */}
      <points ref={particlesRef} geometry={particleGeometry} material={particleMaterial} />
    </>
  )
}

export default ImpactEffects
