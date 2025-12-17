# Plan d'Unification Architecturale - Face Puncher

> Document de référence pour la refactorisation vers une architecture enterprise-grade, modulaire et conforme aux standards Three.js/R3F.

## Problème Actuel

### Deux Mondes Physiques Séparés

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SITUATION ACTUELLE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  AmmoVolumeDemo.tsx                  useAmmoPhysics.ts              │
│  ┌─────────────────────┐            ┌─────────────────────┐        │
│  │ physicsWorld #1     │            │ physicsWorld #2     │        │
│  │ ─────────────────── │            │ ─────────────────── │        │
│  │ • Gloves (rigid)    │            │ • MultiPartOpponent │        │
│  │ • Opponent (soft)   │     ❌     │   - Head (soft)     │        │
│  │ • Room (rigid)      │ ←─────→    │   - Torso (soft)    │        │
│  │ • Ropes (soft)      │ NO CONTACT │   - Neck (rope)     │        │
│  └─────────────────────┘            └─────────────────────┘        │
│                                                                     │
│  Résultat: Les gants ne peuvent pas frapper le MultiPartOpponent    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Autres Problèmes Identifiés

1. **Code dupliqué**: Fonctions similaires dans les deux fichiers (createRope, createRigidBody, etc.)
2. **State dispersé**: Logique physique mélangée avec rendu 3D
3. **Couplage fort**: AmmoVolumeDemo gère tout (scene, physics, input, animation)
4. **Difficile à tester**: Pas de séparation des responsabilités

---

## Architecture Cible

### Pattern Recommandé: Physics Provider + Context

Basé sur les best practices R3F et les patterns enterprise:

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ARCHITECTURE CIBLE                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    AmmoPhysicsProvider                       │   │
│  │  ┌────────────────────────────────────────────────────────┐  │   │
│  │  │              physicsWorld (UNIQUE)                     │  │   │
│  │  │  • softBodies: Map<string, SoftBodyState>              │  │   │
│  │  │  • rigidBodies: Map<string, RigidBodyState>            │  │   │
│  │  │  • constraints: Map<string, ConstraintState>           │  │   │
│  │  └────────────────────────────────────────────────────────┘  │   │
│  │                                                              │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐  │   │
│  │  │  BoxingGloves   │  │ MultiPartBody   │  │   Room       │  │   │
│  │  │  (usePhysics)   │  │ (usePhysics)    │  │ (usePhysics) │  │   │
│  │  └─────────────────┘  └─────────────────┘  └──────────────┘  │   │
│  │           │                    │                   │         │   │
│  │           └────────────────────┴───────────────────┘         │   │
│  │                         COLLISIONS ✓                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Structure de Fichiers Proposée

```
src/
├── physics/                          # Module Physique Isolé
│   ├── AmmoPhysicsProvider.tsx       # Provider React Context
│   ├── AmmoPhysicsContext.ts         # Context + Types
│   ├── usePhysics.ts                 # Hook principal (consomme le context)
│   ├── usePhysicsBody.ts             # Hook pour créer un body
│   ├── ammoLoader.ts                 # Chargement Ammo.js (singleton)
│   ├── softBody/
│   │   ├── createSoftVolume.ts       # Création soft body depuis mesh
│   │   ├── createEllipsoid.ts        # Création ellipsoïde
│   │   ├── createRope.ts             # Création corde
│   │   └── syncSoftBody.ts           # Synchronisation mesh ↔ physics
│   ├── rigidBody/
│   │   ├── createRigidBody.ts        # Création rigid body
│   │   └── syncRigidBody.ts          # Synchronisation mesh ↔ physics
│   └── constraints/
│       ├── anchorSoftToRigid.ts      # appendAnchor wrapper
│       └── createJoint.ts            # Joints génériques
│
├── components/
│   ├── scene/
│   │   ├── BoxingGym.tsx             # Scene principale (layout only)
│   │   ├── Room.tsx                  # Murs, sol, plafond
│   │   └── Decorations.tsx           # Éléments décoratifs
│   │
│   ├── opponents/
│   │   ├── OpponentBase.tsx          # Composant de base (abstract)
│   │   ├── SphereOpponent.tsx        # Sac sphérique
│   │   ├── BoxOpponent.tsx           # Sac rectangulaire
│   │   ├── EllipsoidOpponent.tsx     # Little Mac head
│   │   └── MultiPartOpponent/
│   │       ├── index.tsx             # Assemblage
│   │       ├── Head.tsx              # Tête (ellipsoïde soft)
│   │       ├── Torso.tsx             # Torse (ellipsoïde soft)
│   │       └── Neck.tsx              # Cou (rope soft)
│   │
│   ├── player/
│   │   ├── BoxingGloves.tsx          # Gants (rigid bodies)
│   │   ├── usePunchAnimation.ts      # Hook animation coups
│   │   └── PunchTrajectories.ts      # Config trajectoires
│   │
│   └── effects/
│       └── ImpactEffects.tsx         # Effets visuels impact
│
├── stores/
│   ├── useGameStore.ts               # État jeu (HP, score, etc.)
│   ├── useImpactStore.ts             # Impacts ring buffer
│   └── index.ts
│
└── App.tsx                           # Canvas + Provider wrapping
```

---

## Implémentation Détaillée

### Phase 1: Physics Provider Central (Priorité Haute)

#### 1.1 AmmoPhysicsContext.ts

```typescript
// src/physics/AmmoPhysicsContext.ts
import { createContext } from 'react'
import type * as THREE from 'three'

export interface SoftBodyEntry {
  id: string
  softBody: any                     // btSoftBody
  mesh: THREE.Mesh
  indexAssociation: number[][]
  type: 'volume' | 'ellipsoid' | 'rope'
}

export interface RigidBodyEntry {
  id: string
  rigidBody: any                    // btRigidBody
  mesh: THREE.Mesh | null
  mass: number
}

export interface AmmoPhysicsState {
  isReady: boolean
  ammo: any                         // Ammo module
  world: any                        // btSoftRigidDynamicsWorld
  softBodyHelpers: any

  // Registries
  softBodies: Map<string, SoftBodyEntry>
  rigidBodies: Map<string, RigidBodyEntry>

  // Actions
  addSoftBody: (entry: SoftBodyEntry) => void
  removeSoftBody: (id: string) => void
  addRigidBody: (entry: RigidBodyEntry) => void
  removeRigidBody: (id: string) => void

  // Physics helpers
  createSoftVolume: (opts: CreateSoftVolumeOptions) => SoftBodyEntry | null
  createEllipsoid: (opts: CreateEllipsoidOptions) => SoftBodyEntry | null
  createRope: (opts: CreateRopeOptions) => SoftBodyEntry | null
  createRigidBody: (opts: CreateRigidBodyOptions) => RigidBodyEntry | null
  anchorSoftToRigid: (softId: string, nodeIndex: number, rigidId: string) => void

  // Update (called in useFrame)
  stepSimulation: (delta: number) => void
  syncAllBodies: () => void
}

export const AmmoPhysicsContext = createContext<AmmoPhysicsState | null>(null)
```

#### 1.2 AmmoPhysicsProvider.tsx

```typescript
// src/physics/AmmoPhysicsProvider.tsx
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AmmoPhysicsContext, type AmmoPhysicsState } from './AmmoPhysicsContext'
import { loadAmmo } from './ammoLoader'

export function AmmoPhysicsProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false)
  const ammoRef = useRef<any>(null)
  const worldRef = useRef<any>(null)
  const softBodyHelpersRef = useRef<any>(null)

  // Registries avec useRef pour éviter re-renders
  const softBodiesRef = useRef(new Map<string, SoftBodyEntry>())
  const rigidBodiesRef = useRef(new Map<string, RigidBodyEntry>())

  // Initialisation unique
  useEffect(() => {
    loadAmmo().then(({ Ammo, world, softBodyHelpers }) => {
      ammoRef.current = Ammo
      worldRef.current = world
      softBodyHelpersRef.current = softBodyHelpers
      setIsReady(true)
    })

    return () => {
      // Cleanup: destroy all bodies
      softBodiesRef.current.forEach((entry) => {
        worldRef.current?.removeSoftBody(entry.softBody)
      })
      rigidBodiesRef.current.forEach((entry) => {
        worldRef.current?.removeRigidBody(entry.rigidBody)
      })
    }
  }, [])

  // Physics step dans useFrame
  useFrame((_, delta) => {
    if (!isReady || !worldRef.current) return

    worldRef.current.stepSimulation(delta, 5)

    // Sync soft bodies
    for (const entry of softBodiesRef.current.values()) {
      syncSoftBodyToMesh(entry)
    }

    // Sync rigid bodies
    for (const entry of rigidBodiesRef.current.values()) {
      if (entry.mesh) syncRigidBodyToMesh(entry)
    }
  })

  // Memoize context value
  const contextValue = useMemo<AmmoPhysicsState>(() => ({
    isReady,
    ammo: ammoRef.current,
    world: worldRef.current,
    softBodyHelpers: softBodyHelpersRef.current,
    softBodies: softBodiesRef.current,
    rigidBodies: rigidBodiesRef.current,

    addSoftBody: (entry) => softBodiesRef.current.set(entry.id, entry),
    removeSoftBody: (id) => {
      const entry = softBodiesRef.current.get(id)
      if (entry) {
        worldRef.current?.removeSoftBody(entry.softBody)
        softBodiesRef.current.delete(id)
      }
    },
    // ... autres méthodes
  }), [isReady])

  return (
    <AmmoPhysicsContext.Provider value={contextValue}>
      {children}
    </AmmoPhysicsContext.Provider>
  )
}
```

#### 1.3 usePhysics.ts (Hook Consumer)

```typescript
// src/physics/usePhysics.ts
import { useContext } from 'react'
import { AmmoPhysicsContext } from './AmmoPhysicsContext'

export function usePhysics() {
  const context = useContext(AmmoPhysicsContext)
  if (!context) {
    throw new Error('usePhysics must be used within AmmoPhysicsProvider')
  }
  return context
}
```

---

### Phase 2: Composants Modulaires (Priorité Moyenne)

#### 2.1 Opponent Base Pattern

```typescript
// src/components/opponents/OpponentBase.tsx
import { useRef, useEffect } from 'react'
import { usePhysics } from '../../physics/usePhysics'
import type * as THREE from 'three'

export interface OpponentProps {
  id: string
  position: THREE.Vector3
  onHit?: (impactPoint: THREE.Vector3, strength: number) => void
}

// Chaque opponent hérite de ce pattern
export function useOpponentBase(props: OpponentProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const { isReady, addSoftBody, removeSoftBody } = usePhysics()

  useEffect(() => {
    if (!isReady || !meshRef.current) return

    // Créer le physics body (à override dans chaque opponent)
    // ...

    return () => removeSoftBody(props.id)
  }, [isReady, props.id])

  return { meshRef }
}
```

#### 2.2 MultiPartOpponent Refactorisé

```typescript
// src/components/opponents/MultiPartOpponent/index.tsx
import { usePhysics } from '../../../physics/usePhysics'
import { Head } from './Head'
import { Torso } from './Torso'
import { Neck } from './Neck'

export function MultiPartOpponent({ id, position }: OpponentProps) {
  const { isReady, createRigidBody, anchorSoftToRigid } = usePhysics()

  // IDs uniques pour chaque partie
  const headId = `${id}-head`
  const torsoId = `${id}-torso`
  const neckId = `${id}-neck`
  const neckTopJointId = `${id}-neck-top-joint`
  const neckBottomJointId = `${id}-neck-bottom-joint`

  // Créer les joints rigides (invisibles)
  useEffect(() => {
    if (!isReady) return

    createRigidBody({ id: neckTopJointId, /* ... */ })
    createRigidBody({ id: neckBottomJointId, /* ... */ })

    // Connexions seront faites dans les composants enfants via callbacks
  }, [isReady])

  return (
    <group>
      <Head
        id={headId}
        onCreated={(bottomNodeIndex) => {
          anchorSoftToRigid(headId, bottomNodeIndex, neckTopJointId)
        }}
      />
      <Neck
        id={neckId}
        onCreated={() => {
          anchorSoftToRigid(neckId, 0, neckTopJointId)
          anchorSoftToRigid(neckId, NECK_SEGMENTS, neckBottomJointId)
        }}
      />
      <Torso
        id={torsoId}
        onCreated={(topNodeIndex) => {
          anchorSoftToRigid(torsoId, topNodeIndex, neckBottomJointId)
        }}
      />
    </group>
  )
}
```

---

### Phase 3: App.tsx Restructuré

```typescript
// src/App.tsx
import { Canvas } from '@react-three/fiber'
import { AmmoPhysicsProvider } from './physics/AmmoPhysicsProvider'
import { BoxingGym } from './components/scene/BoxingGym'
import { UI } from './components/UI'

export default function App() {
  return (
    <div className="h-screen w-screen">
      <Canvas camera={{ position: [0, 3.5, 6], fov: 60 }}>
        <AmmoPhysicsProvider>
          {/* Tout ce qui utilise la physique est DANS le provider */}
          <BoxingGym />
        </AmmoPhysicsProvider>
      </Canvas>
      <UI />
    </div>
  )
}
```

---

## Plan de Migration

### Étape 1: Créer le Provider (Sans Casser l'Existant)

1. Créer `src/physics/` avec le nouveau système
2. Exporter le provider et hooks
3. Ajouter le provider dans App.tsx en parallèle de l'existant

### Étape 2: Migrer les Gants

1. Créer `BoxingGloves.tsx` utilisant `usePhysics()`
2. Tester les collisions avec les opponents existants
3. Supprimer le code gants de AmmoVolumeDemo

### Étape 3: Migrer MultiPartOpponent

1. Refactoriser pour utiliser `usePhysics()` au lieu de `useAmmoPhysics()`
2. Tester les collisions avec les gants
3. Supprimer `useAmmoPhysics.ts`

### Étape 4: Migrer les Autres Opponents

1. Créer SphereOpponent, BoxOpponent, etc.
2. Chacun utilise `usePhysics()`
3. Nettoyer AmmoVolumeDemo progressivement

### Étape 5: Finalisation

1. Renommer AmmoVolumeDemo → BoxingGym
2. Supprimer tout code dupliqué
3. Tests de régression

---

## Standards Enterprise Respectés

| Standard | Implementation |
|----------|----------------|
| **Separation of Concerns** | Physics module isolé, composants purs |
| **Single Source of Truth** | Un seul physicsWorld dans le Provider |
| **Dependency Injection** | Context React pour injecter physics |
| **Composition over Inheritance** | Hooks + composants composables |
| **Registry Pattern** | Maps pour softBodies/rigidBodies |
| **Singleton** | ammoLoader.ts charge Ammo une seule fois |
| **Clean Architecture** | physics/ indépendant de components/ |

---

## Références

- [React Three Fiber Best Practices](https://r3f.docs.pmnd.rs/)
- [enable3d Physics](https://enable3d.io/) - Pattern d'intégration Ammo+Three
- [use-ammojs](https://github.com/pmndrs/use-ammojs) - Inspiration R3F
- [Three.js Ammo Volume Example](https://threejs.org/examples/physics_ammo_volume.html)
- [Bullet Physics Manual](https://pybullet.org/Bullet/BulletFull/index.html)

---

## Checklist de Validation

- [ ] Un seul `btSoftRigidDynamicsWorld` dans toute l'app
- [ ] Gloves peuvent collisionner avec tous les opponents
- [ ] MultiPartOpponent réagit aux coups
- [ ] Pas de code dupliqué entre composants
- [ ] Tests unitaires pour physics/
- [ ] Performance stable (60 FPS sur mobile)
- [ ] Documentation à jour

---

*Document créé le 2025-12-17*
*Auteur: Claude (Assistant IA)*
