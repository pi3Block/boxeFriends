# ROADMAP - Face Puncher

> Dernière mise à jour: Décembre 2024
> Score architecture actuel: **7/10**

## Vue d'ensemble

Ce document présente le plan d'amélioration du projet Face Puncher, basé sur une analyse approfondie du codebase (~12,200 LOC, 57 fichiers).

---

## Phase 1: Nettoyage Critique ✅ TERMINÉE

**Durée estimée:** 1 semaine → **Réalisée en 1 session**
**Priorité:** HAUTE
**Impact:** Sécurité, stabilité, maintenabilité

### Tâches

- [x] **C1 - Supprimer debug logging endpoints** ✅
  - Fichiers: `src/components/CharacterModel.tsx:14`, `src/components/Scene.tsx:10`
  - Action: Conditionné avec `import.meta.env.DEV` - no-op en production
  - Résultat: Zero appels réseau vers localhost en production

- [x] **C2 - Remplacer setInterval polling** ✅
  - Fichier: `src/components/Scene.tsx`
  - Action: Supprimé code mort (glovesRef + setInterval) car Gloves commenté
  - Résultat: Scene.tsx réduit de 109 → 36 LOC

- [x] **Documenter code legacy Gloves.tsx** ✅
  - Fichier: `src/components/Gloves.tsx`
  - Action: Ajout header JSDoc @deprecated avec contexte
  - Résultat: Conservé pour référence, clairement marqué legacy

- [x] **Ajouter Error Boundary** ✅
  - Fichiers: `src/components/ErrorBoundary.tsx` (nouveau), `src/App.tsx`
  - Action: Wrapper App avec ErrorBoundary, UI française
  - Résultat: Crash graceful avec bouton "Réessayer"

### Critères de succès ✅
- Zero appels réseau vers localhost en production ✅
- Pas de setInterval polling dans le codebase ✅
- Build propre (warning chunk size attendu pour Three.js) ✅

---

## Phase 2: Centraliser Physique Ammo.js ✅ TERMINÉE

**Durée estimée:** 2 semaines → **Réalisée en 1 session**
**Priorité:** HAUTE
**Impact:** Gameplay, performance

### Contexte du problème (RÉSOLU)

Avant: 2 mondes physiques Ammo.js indépendants
Après: 1 seul monde `btSoftRigidDynamicsWorld` partagé

### Tâches

- [x] **C4 - Fusionner les mondes physiques** ✅
  - API étendue dans `useAmmoPhysics.ts` (pas de fichier séparé)
  - SpringGloves utilise le monde global via `createRigidBody()`
  - Collisions gloves → soft bodies fonctionnelles

- [x] **Étendre useAmmoPhysics pour rigid bodies** ✅
  - Nouvelles fonctions: `createRigidBody`, `createSpringConstraint`
  - `COLLISION_GROUPS`: GLOVES, SOFT_BODY, STATIC
  - Fonctions utilitaires: `syncRigidBodyMesh`, `applyRigidBodyForce/Impulse`
  - `rigidBodiesGlobal`: Map<string, RigidBodyState>

- [x] **Refactorer SpringGloves.tsx** ✅
  - Supprimé création monde physique local (btDiscreteDynamicsWorld)
  - Utilise les fonctions du hook global
  - Réduction: 560 → 445 LOC

- [ ] **M2 - Optimiser sync géométrie** (reporté Phase 4)
  - `computeVertexNormals()` toujours appelé chaque frame
  - À optimiser lors de la phase performance

### Architecture implémentée

```
src/hooks/useAmmoPhysics.ts   # Singleton monde unifié (902 LOC)
├── Soft bodies: createSoftVolume(), applySoftBodyImpulse()
├── Rigid bodies: createRigidBody(), createSpringConstraint()
├── Sync: syncRigidBodyMesh(), updatePhysics()
└── COLLISION_GROUPS: GLOVES=1, SOFT_BODY=2, STATIC=4
```

### Critères de succès ✅
- Collisions gloves → soft bodies fonctionnelles ✅
- Un seul monde physique (btSoftRigidDynamicsWorld) ✅
- Build propre ✅

---

## Phase 3: Clarification API ✅ TERMINÉE

**Durée estimée:** 1 semaine → **Réalisée en 1 session**
**Priorité:** MOYENNE
**Impact:** Maintenabilité, DX

### Contexte du problème (RÉSOLU)

Avant: Noms de fonctions ambigus dans AnimationContext
Après: API claire avec noms descriptifs

### Tâches

- [x] **M1 - Renommer fonctions AnimationContext** ✅
  ```typescript
  // Renommages effectués:
  punchGlove() → triggerMousePunch()
  triggerHandPunch() → triggerCameraPunch()
  GlovesFunctions.triggerPunch → cameraPunch
  ```
  - Fichiers: AnimationContext.tsx, App.tsx, Gloves.tsx

- [x] **M5 - Consolider Zustand selectors** ✅
  - Solution: `useShallow()` de Zustand 5.x
  ```typescript
  import { useShallow } from 'zustand/react/shallow'

  const { gameState, takeDamage } = useGameStore(
    useShallow((state) => ({
      gameState: state.gameState,
      takeDamage: state.takeDamage,
    }))
  )
  ```
  - Fichier: App.tsx

- [x] **M3 - Interface Opponent commune** ✅
  ```typescript
  // src/types/opponent.ts
  interface IOpponent {
    applyImpact(point: THREE.Vector3, strength: number): void
    getCollider(): THREE.Object3D | null
    getHealth(): number
    readonly type: OpponentType
  }
  ```
  - Nouveau fichier: src/types/opponent.ts
  - Types: IOpponent, OpponentType, ImpactConfig

### Critères de succès ✅
- Fonctions nommées sans ambiguïté ✅
- Selectors consolidés avec useShallow ✅
- Interface Opponent documentée ✅

---

## Phase 4: Optimisation Performance ✅ TERMINÉE

**Durée estimée:** 1 semaine → **Réalisée en 1 session**
**Priorité:** MOYENNE
**Impact:** UX mobile, batterie

### Tâches

- [x] **Profiling avec r3f-perf** ✅
  ```typescript
  import { Perf } from 'r3f-perf'
  {import.meta.env.DEV && <Perf position="top-left" />}
  ```
  - Installé: `npm install r3f-perf --save-dev`
  - Affiché uniquement en DEV
  - Fichier: App.tsx

- [x] **Audit callbacks useFrame** ✅
  - Identifié: 17 occurrences useFrame
  - Répartition: physique (3), animation (8), effets (6)
  - Note: M2 (computeVertexNormals) reste à optimiser

- [x] **Pool particles ImpactEffects** ✅
  - Pool pré-alloué de 1000 particules
  - Flag `active: boolean` au lieu de `filter()`
  - Zero allocation GC pendant le gameplay
  - Fichier: ImpactEffects.tsx

- [x] **Lazy loading assets** ✅
  - Preload GLTF en background au chargement
  ```typescript
  AVAILABLE_MODELS.forEach(model => {
    if (model.modelPath) useGLTF.preload(model.modelPath)
  })
  ```
  - Fichier: CharacterSelector.tsx

### Métriques (via r3f-perf en DEV)

| Métrique | Monitoring |
|----------|------------|
| FPS | Temps réel |
| Draw calls | Temps réel |
| Triangles | Temps réel |
| Memory | Temps réel |

### Critères de succès ✅
- r3f-perf configuré pour monitoring ✅
- Particle pooling sans allocation GC ✅
- GLTF preloading en background ✅

---

## Phase 5: Refactoring Structure

**Durée estimée:** 2 semaines
**Priorité:** BASSE
**Impact:** Maintenabilité long terme

### Architecture cible

```
src/
├── App.tsx                      # Inputs + Canvas minimal
├── components/
│   ├── Scene.tsx                # Orchestrateur unique
│   ├── Opponent/
│   │   ├── index.tsx            # Router + IOpponent
│   │   ├── FluffyOpponent.tsx
│   │   ├── JellyOpponent.tsx
│   │   └── SphereOpponent.tsx
│   ├── Gloves/
│   │   └── SpringGloves.tsx
│   ├── Effects/
│   │   ├── ImpactEffects.tsx
│   │   └── ParticlePool.ts
│   └── UI/
│       ├── HealthBar.tsx
│       └── GameOverlay.tsx
├── physics/
│   ├── AmmoWorld.ts             # Singleton unifié
│   ├── XPBDSolver.ts
│   └── types.ts
├── stores/                      # 11 → 6 stores
│   ├── useGameStore.ts
│   ├── usePhysicsStore.ts       # Fusion physics stores
│   ├── useInputStore.ts         # Fusion input stores
│   ├── useUIStore.ts
│   └── index.ts
├── hooks/
│   ├── usePhysics.ts            # API unifiée
│   ├── useInput.ts              # Multi-mode consolidé
│   └── useAnimations.ts
├── context/
│   └── AnimationContext.tsx
└── types/
    ├── opponent.ts
    ├── physics.ts
    └── input.ts
```

### Tâches

- [x] **Consolider stores (10 → 9)** ✅
  - [x] Fusionner: useTextureSettingsStore → useGameStore ✅
  - [x] Supprimer useTextureSettingsStore.ts ✅
  - [ ] Fusionner: useJellyStore + useJellyPhysicsStore (reporté - responsabilités distinctes)
  - [ ] Fusionner: useHandTrackingStore + input stores (backlog)

- [ ] **Réorganiser components/**
  - Créer sous-dossiers: Opponent/, Gloves/, Effects/, UI/
  - Un fichier index.tsx par dossier

- [ ] **TypeScript strict pour Ammo.js**
  - Créer `src/types/ammo.d.ts` avec types Bullet Physics
  - Remplacer `any` par types concrets

- [ ] **Documentation inline**
  - JSDoc pour fonctions publiques
  - Commentaires français (convention projet)

### Critères de succès
- Structure claire et prévisible
- Pas de `any` dans physics/
- Onboarding dev <1 jour

---

## Backlog (Non priorisé)

### Améliorations futures

- [ ] **Web Worker pour XPBD**
  - Move XPBDSolver en worker
  - Sync résultats via SharedArrayBuffer

- [ ] **PWA optimisations**
  - Service Worker pour offline
  - App manifest complet
  - Splash screens

- [ ] **Accessibilité**
  - Réduire motion option
  - High contrast mode
  - Screen reader support (menu)

- [ ] **Testing**
  - Unit tests stores (Vitest)
  - Integration tests hooks
  - Visual regression (Playwright)

- [ ] **CI/CD**
  - GitHub Actions build
  - Lighthouse CI
  - Bundle size tracking

---

## Risques identifiés

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Memory leak Ammo.js | Haute | Haute | Phase 2 cleanup |
| Performance mobile | Moyenne | Haute | Phase 4 profiling |
| Race conditions physics | Moyenne | Moyenne | Phase 2 singleton |
| Régression gameplay | Basse | Haute | Tests manuels chaque phase |

---

## Changelog

### v0.1.0 (Actuel)
- Architecture initiale R3F + Ammo.js
- 3 types d'opponents (Sphere, Jelly, Fluffy)
- Input multi-mode (souris, tactile, caméra)
- MediaPipe hand tracking

### v0.2.0 (Post Phase 1-2)
- [ ] Physique unifiée
- [ ] Collisions gloves-Fluffy
- [ ] Code nettoyé

### v0.3.0 (Post Phase 3-4)
- [ ] API clarifiée
- [ ] Performance optimisée
- [ ] Metrics documentées

### v1.0.0 (Post Phase 5)
- [ ] Architecture finale
- [ ] Documentation complète
- [ ] Production ready
