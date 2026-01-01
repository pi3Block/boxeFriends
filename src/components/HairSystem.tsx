import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ImpactManager } from '../stores'

/**
 * Configuration des cheveux
 */
const HAIR_CONFIG = {
  count: 20,
  strandHeight: 0.12,
  baseWidth: 0.025,
  tipWidth: 0.008,
  crownRadius: 0.07,
  crownY: 0.09,
  color: '#5D4037',
  stiffness: 0.4,
}

interface HairSystemProps {
  parentObject: THREE.Object3D | null
}

/**
 * Crée la géométrie d'une mèche trapézoïdale
 */
function createHairStrandGeometry(): THREE.BufferGeometry {
  const { strandHeight, baseWidth, tipWidth } = HAIR_CONFIG

  // Forme trapézoïdale (large en bas, étroit en haut)
  const shape = new THREE.Shape()
  shape.moveTo(-baseWidth / 2, 0)
  shape.lineTo(baseWidth / 2, 0)
  shape.lineTo(tipWidth / 2, strandHeight)
  shape.lineTo(-tipWidth / 2, strandHeight)
  shape.closePath()

  const extrudeSettings = {
    depth: 0.015,
    bevelEnabled: false,
  }

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
  // Centrer sur Z
  geometry.translate(0, 0, -0.0075)

  return geometry
}

/**
 * Composant HairSystem - Cheveux procéduraux (ajout impératif)
 */
export function HairSystem({ parentObject }: HairSystemProps) {
  const hairGroupRef = useRef<THREE.Group | null>(null)

  // Créer le groupe de cheveux une seule fois
  useEffect(() => {
    if (!parentObject) {
      console.log('[HairSystem] No parent object, skipping')
      return
    }

    console.log('[HairSystem] Creating hair group imperatively')

    // Créer le groupe
    const hairGroup = new THREE.Group()
    hairGroup.name = 'HairSystem'
    hairGroupRef.current = hairGroup

    // Géométrie partagée
    const geometry = createHairStrandGeometry()

    // Matériau cartoon
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(HAIR_CONFIG.color),
      side: THREE.DoubleSide,
    })

    // Créer les mèches en cercle
    const { count, crownRadius, crownY } = HAIR_CONFIG

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const x = Math.cos(angle) * crownRadius
      const z = Math.sin(angle) * crownRadius

      const strand = new THREE.Mesh(geometry, material)
      strand.position.set(x, crownY, z)
      // Orienter vers l'extérieur
      strand.rotation.y = -angle
      // Légère inclinaison vers l'extérieur
      strand.rotation.z = -0.3

      strand.name = `hair_strand_${i}`
      hairGroup.add(strand)
    }

    // Ajouter au parent
    parentObject.add(hairGroup)
    console.log('[HairSystem] Hair group added to parent with', count, 'strands')

    // Cleanup
    return () => {
      parentObject.remove(hairGroup)
      geometry.dispose()
      material.dispose()
      console.log('[HairSystem] Cleaned up')
    }
  }, [parentObject])

  // Animation des cheveux
  useFrame(() => {
    if (!hairGroupRef.current) return

    const time = performance.now() * 0.001
    // Lecture directe depuis ImpactManager (pas de re-render React)
    const impacts = ImpactManager.getImpacts()

    // Oscillation naturelle + réaction aux impacts
    hairGroupRef.current.children.forEach((strand, i) => {
      if (strand instanceof THREE.Mesh) {
        // Oscillation de base
        const wave = Math.sin(time * 2 + i * 0.5) * 0.05
        strand.rotation.z = -0.3 + wave * (1 - HAIR_CONFIG.stiffness)

        // Réaction aux impacts récents
        if (impacts.length > 0) {
          const latestImpact = impacts[impacts.length - 1]
          if (latestImpact) {
            const age = (Date.now() - latestImpact.createdAt) / 1000
            if (age < 0.5) {
              const impactForce = latestImpact.strength * Math.exp(-age * 5)
              strand.rotation.z += impactForce * 0.5
              strand.rotation.x = Math.sin(age * 20) * impactForce * 0.3
            }
          }
        }
      }
    })
  })

  // Ce composant ne retourne rien visuellement (tout est impératif)
  return null
}

export default HairSystem
