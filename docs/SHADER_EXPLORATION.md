# Exploration : Système de Déformation Robuste

## Problèmes avec `onBeforeCompile` brut

1. **Fragilité** : Dépend des noms internes de Three.js (`#include <begin_vertex>`)
2. **Pas de typing** : Uniforms non typés, erreurs silencieuses
3. **Multi-impacts** : Difficile de gérer plusieurs déformations simultanées
4. **Maintenance** : Code GLSL en string = pas d'IDE support

---

## Solution Recommandée : `three-custom-shader-material` (CSM)

### Installation

```bash
npm install three-custom-shader-material
```

### Pourquoi CSM ?

- ✅ Étend proprement `MeshStandardMaterial` (conserve PBR, shadows, etc.)
- ✅ API déclarative React-friendly
- ✅ TypeScript support
- ✅ Ne casse pas entre versions Three.js
- ✅ Permet d'injecter UNIQUEMENT la logique custom

---

## Architecture Proposée

### 1. Système Multi-Impact avec Ring Buffer

Le problème : l'utilisateur peut frapper 3x rapidement. On doit gérer plusieurs déformations qui s'estompent indépendamment.

```typescript
// src/stores/useImpactStore.ts
import { create } from 'zustand'

interface Impact {
  id: number
  hitPoint: [number, number, number]
  strength: number
  createdAt: number
}

interface ImpactStore {
  impacts: Impact[]
  addImpact: (hitPoint: [number, number, number], strength: number) => void
  tick: (deltaTime: number) => void
}

const MAX_IMPACTS = 5  // Ring buffer size
const DECAY_RATE = 2.0 // Strength diminue de 2.0/sec

let impactId = 0

export const useImpactStore = create<ImpactStore>((set, get) => ({
  impacts: [],

  addImpact: (hitPoint, strength) => {
    const newImpact: Impact = {
      id: impactId++,
      hitPoint,
      strength: Math.min(strength, 1.0),
      createdAt: performance.now()
    }

    set(state => ({
      impacts: [...state.impacts.slice(-MAX_IMPACTS + 1), newImpact]
    }))
  },

  tick: (deltaTime) => {
    set(state => ({
      impacts: state.impacts
        .map(impact => ({
          ...impact,
          strength: impact.strength - DECAY_RATE * deltaTime
        }))
        .filter(impact => impact.strength > 0.01)
    }))
  }
}))
```

---

### 2. Material Custom avec CSM

```typescript
// src/shaders/DeformableFaceMaterial.tsx
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import CustomShaderMaterial from 'three-custom-shader-material'
import * as THREE from 'three'
import { useImpactStore } from '../stores/useImpactStore'

// Vertex shader - logique de déformation
const vertexShader = /* glsl */ `
  // Uniforms pour multi-impact (max 5)
  uniform vec3 uHitPoints[5];
  uniform float uStrengths[5];
  uniform int uActiveImpacts;

  // Paramètres de déformation
  uniform float uRadius;      // Rayon d'influence
  uniform float uMaxDeform;   // Déformation max en unités

  // Varying pour le fragment shader (optionnel: effet visuel)
  varying float vDeformAmount;

  void main() {
    vec3 pos = position;
    float totalDeform = 0.0;

    // Appliquer chaque impact actif
    for (int i = 0; i < 5; i++) {
      if (i >= uActiveImpacts) break;

      float dist = distance(pos, uHitPoints[i]);

      if (dist < uRadius) {
        // Falloff smooth (ease-out quadratic)
        float falloff = 1.0 - (dist / uRadius);
        falloff = falloff * falloff;

        // Déformation dans la direction opposée à la normale
        float deform = uStrengths[i] * falloff * uMaxDeform;
        pos -= normal * deform;

        totalDeform += deform;
      }
    }

    vDeformAmount = totalDeform;

    // CSM injecte automatiquement dans le bon endroit
    csm_Position = pos;
  }
`

// Fragment shader - effet visuel optionnel (rougeur sur impact)
const fragmentShader = /* glsl */ `
  varying float vDeformAmount;
  uniform float uFlashIntensity;

  void main() {
    // Ajouter une teinte rouge proportionnelle à la déformation
    vec3 impactTint = vec3(1.0, 0.3, 0.3) * vDeformAmount * uFlashIntensity;
    csm_DiffuseColor.rgb += impactTint;
  }
`

interface DeformableFaceMaterialProps {
  map?: THREE.Texture
  color?: string
}

export function DeformableFaceMaterial({ map, color = '#ffdbac' }: DeformableFaceMaterialProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const impacts = useImpactStore(state => state.impacts)
  const tick = useImpactStore(state => state.tick)

  // Uniforms mémorisés pour éviter re-renders
  const uniforms = useMemo(() => ({
    uHitPoints: { value: Array(5).fill(new THREE.Vector3()) },
    uStrengths: { value: Array(5).fill(0) },
    uActiveImpacts: { value: 0 },
    uRadius: { value: 0.5 },
    uMaxDeform: { value: 0.3 },
    uFlashIntensity: { value: 2.0 }
  }), [])

  // Update uniforms chaque frame
  useFrame((_, delta) => {
    tick(delta)

    if (materialRef.current) {
      const mat = materialRef.current

      // Reset arrays
      for (let i = 0; i < 5; i++) {
        mat.uniforms.uHitPoints.value[i].set(0, 0, 0)
        mat.uniforms.uStrengths.value[i] = 0
      }

      // Populate with active impacts
      impacts.forEach((impact, i) => {
        if (i < 5) {
          mat.uniforms.uHitPoints.value[i].set(...impact.hitPoint)
          mat.uniforms.uStrengths.value[i] = impact.strength
        }
      })

      mat.uniforms.uActiveImpacts.value = Math.min(impacts.length, 5)
    }
  })

  return (
    <CustomShaderMaterial
      ref={materialRef}
      baseMaterial={THREE.MeshStandardMaterial}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
      map={map}
      color={color}
      flatShading={false}
    />
  )
}
```

---

### 3. Composant Opponent avec le Material

```typescript
// src/components/Opponent.tsx
import { useRef } from 'react'
import { Sphere } from '@react-three/drei'
import { useTexture } from '@react-three/drei'
import { DeformableFaceMaterial } from '../shaders/DeformableFaceMaterial'
import { useGameStore } from '../stores/useGameStore'

export function Opponent() {
  const meshRef = useRef<THREE.Mesh>(null)
  const textureUrl = useGameStore(state => state.opponentTexture)

  // Charger la texture si disponible
  const texture = textureUrl ? useTexture(textureUrl) : null

  return (
    <Sphere
      ref={meshRef}
      args={[1, 64, 64]} // Haute résolution pour déformation smooth
      position={[0, 0, 0]}
    >
      <DeformableFaceMaterial
        map={texture}
        color={texture ? '#ffffff' : '#ffdbac'}
      />
    </Sphere>
  )
}
```

---

### 4. Hook pour Déclencher les Impacts

```typescript
// src/hooks/useHitDetection.ts
import { useImpactStore } from '../stores/useImpactStore'
import { useGameStore } from '../stores/useGameStore'

interface HitData {
  point: [number, number, number]
  velocity: number  // 0-1 normalized
  type: 'jab' | 'hook' | 'uppercut'
}

export function useHitDetection() {
  const addImpact = useImpactStore(state => state.addImpact)
  const takeDamage = useGameStore(state => state.takeDamage)

  const registerHit = (data: HitData) => {
    // Calculer la force basée sur velocity et type
    const typeMultiplier = {
      jab: 0.5,
      hook: 0.8,
      uppercut: 1.0
    }

    const strength = data.velocity * typeMultiplier[data.type]
    const isCritical = strength > 0.85

    // Déclencher la déformation visuelle
    addImpact(data.point, strength)

    // Appliquer les dégâts
    const baseDamage = 10
    takeDamage(baseDamage * strength, isCritical)
  }

  return { registerHit }
}
```

---

## Effet Élastique Avancé (Optionnel)

Pour un effet "rebond" plus cartoon, modifier le vertex shader :

```glsl
// Ajouter uniform pour le temps
uniform float uTime;

// Dans la boucle d'impact
float age = uTime - uImpactTimes[i]; // Temps depuis l'impact
float bounce = 1.0 + sin(age * 15.0) * exp(-age * 5.0) * 0.3;
float deform = uStrengths[i] * falloff * uMaxDeform * bounce;
```

Cela crée une oscillation amortie qui simule l'élasticité de la chair cartoon.

---

## Comparatif Final

| Aspect | `onBeforeCompile` | CSM |
|--------|-------------------|-----|
| Stabilité | ⚠️ Fragile | ✅ Stable |
| TypeScript | ❌ Non | ✅ Oui |
| PBR conservé | ✅ Oui | ✅ Oui |
| Debug | ❌ Difficile | ⚠️ Moyen |
| Setup | Simple | +1 dépendance |
| Maintenance | ❌ Risqué | ✅ Facile |

**Recommandation finale** : Utiliser CSM avec le système multi-impact ring buffer.

---

## Sources

- [THREE-CustomShaderMaterial GitHub](https://github.com/FarazzShaikh/THREE-CustomShaderMaterial)
- [drei shaderMaterial docs](https://drei.docs.pmnd.rs/shaders/shader-material)
- [Maxime Heckel - Shaders with R3F](https://blog.maximeheckel.com/posts/the-study-of-shaders-with-react-three-fiber/)
