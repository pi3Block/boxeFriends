import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useImpactStore } from '../stores'

/**
 * Configuration des particules d'impact
 */
const PARTICLE_CONFIG = {
  count: 20,              // Nombre de particules par impact
  size: 0.08,             // Taille des particules
  speed: 8,               // Vitesse d'éjection
  lifetime: 0.5,          // Durée de vie en secondes
  gravity: -15,           // Gravité
  colors: ['#ffff00', '#ff8800', '#ff0000', '#ffffff'], // Couleurs des étincelles
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
  const linesRef = useRef<THREE.LineSegments>(null)

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

  // Géométrie des lignes de vitesse
  const linesGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(32 * 2 * 3) // 32 lignes, 2 points chacune
    const colors = new Float32Array(32 * 2 * 3)

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

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

  // Material des lignes
  const lineMaterial = useMemo(() => {
    return new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
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

  /**
   * Crée les lignes de vitesse radiales
   */
  const updateSpeedLines = (hitPoint: [number, number, number], strength: number) => {
    if (!linesRef.current) return

    const positions = linesGeometry.attributes.position as THREE.BufferAttribute
    const colors = linesGeometry.attributes.color as THREE.BufferAttribute

    const lineCount = Math.floor(16 * strength)
    const center = new THREE.Vector3(hitPoint[0], hitPoint[1], hitPoint[2])

    for (let i = 0; i < 32; i++) {
      if (i < lineCount) {
        const angle = (i / lineCount) * Math.PI * 2
        const innerRadius = 0.1
        const outerRadius = 0.3 + strength * 0.3

        // Point intérieur
        positions.setXYZ(
          i * 2,
          center.x + Math.cos(angle) * innerRadius,
          center.y + Math.sin(angle) * innerRadius,
          center.z + 0.1
        )

        // Point extérieur
        positions.setXYZ(
          i * 2 + 1,
          center.x + Math.cos(angle) * outerRadius,
          center.y + Math.sin(angle) * outerRadius,
          center.z + 0.1
        )

        // Couleur (jaune/blanc)
        const c = new THREE.Color('#ffff88')
        colors.setXYZ(i * 2, c.r, c.g, c.b)
        colors.setXYZ(i * 2 + 1, c.r * 0.5, c.g * 0.5, c.b * 0.5)
      } else {
        // Cacher les lignes non utilisées
        positions.setXYZ(i * 2, 0, 0, -100)
        positions.setXYZ(i * 2 + 1, 0, 0, -100)
      }
    }

    positions.needsUpdate = true
    colors.needsUpdate = true
  }

  // Détecter les nouveaux impacts
  useEffect(() => {
    if (impacts.length > 0) {
      const latestImpact = impacts[impacts.length - 1]
      if (latestImpact && latestImpact.id !== lastImpactId.current) {
        lastImpactId.current = latestImpact.id

        // Spawner des particules
        spawnParticles(latestImpact.hitPoint, latestImpact.strength)

        // Créer les lignes de vitesse
        updateSpeedLines(latestImpact.hitPoint, latestImpact.strength)

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

    // Fade out des lignes de vitesse
    if (linesRef.current && hitStopTime.current <= 0) {
      lineMaterial.opacity *= 0.9
      if (lineMaterial.opacity < 0.01) {
        lineMaterial.opacity = 0
      }
    } else if (linesRef.current) {
      lineMaterial.opacity = 0.8
    }
  })

  return (
    <>
      {/* Particules d'étincelles */}
      <points ref={particlesRef} geometry={particleGeometry} material={particleMaterial} />

      {/* Lignes de vitesse radiales */}
      <lineSegments ref={linesRef} geometry={linesGeometry} material={lineMaterial} />
    </>
  )
}

export default ImpactEffects
