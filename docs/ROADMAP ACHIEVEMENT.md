# Avancees Roadmap

> Suivi minimaliste des taches completees

---

## Phase 1: Nettoyage Critique ✅

| Date | Tache | Fichiers |
|------|-------|----------|
| 2024-12-16 | C1 - Debug logging DEV only | CharacterModel.tsx, Scene.tsx |
| 2024-12-16 | C2 - Supprime setInterval polling | Scene.tsx (109→36 LOC) |
| 2024-12-16 | Documente Gloves.tsx legacy | Gloves.tsx (@deprecated) |
| 2024-12-16 | Ajoute Error Boundary | ErrorBoundary.tsx, App.tsx |

**Status:** TERMINEE

---

## Phase 2: Centraliser Physique Ammo.js ✅

| Date | Tache | Fichiers |
|------|-------|----------|
| 2024-12-16 | Etendu useAmmoPhysics pour rigid bodies | useAmmoPhysics.ts (+250 LOC) |
| 2024-12-16 | Ajoute API: createRigidBody, createSpringConstraint | useAmmoPhysics.ts |
| 2024-12-16 | Ajoute COLLISION_GROUPS (GLOVES, SOFT_BODY, STATIC) | useAmmoPhysics.ts |
| 2024-12-16 | Refactore SpringGloves monde global | SpringGloves.tsx (560→445 LOC) |
| 2024-12-16 | Supprime monde physique separe | SpringGloves.tsx |
| 2024-12-16 | Impact gloves→soft bodies fonctionnel | SpringGloves.tsx |

**Status:** TERMINEE

---

## Phase 3: Clarification API ✅

| Date | Tache | Fichiers |
|------|-------|----------|
| 2024-12-16 | M1 - Renommer fonctions AnimationContext | AnimationContext.tsx, App.tsx, Gloves.tsx |
| 2024-12-16 | M5 - Consolider Zustand selectors (useShallow) | App.tsx |
| 2024-12-16 | M3 - Creer interface IOpponent | src/types/opponent.ts (nouveau) |

**Status:** TERMINEE

---

## Phase 4: Optimisation Performance ✅

| Date | Tache | Fichiers |
|------|-------|----------|
| 2024-12-16 | Install r3f-perf (DEV only) | App.tsx, package.json |
| 2024-12-16 | Audit useFrame (17 occurrences) | - |
| 2024-12-16 | Pool particules ImpactEffects | ImpactEffects.tsx |
| 2024-12-16 | Preload GLTF en background | CharacterSelector.tsx |

**Status:** TERMINEE

---

## Phase 5: Refactoring Structure ✅

| Date | Tache | Fichiers |
|------|-------|----------|
| 2024-12-16 | Fusionner useTextureSettingsStore → useGameStore | useGameStore.ts, stores/index.ts |
| 2024-12-16 | Migrer FaceOpponent vers useGameStore | FaceOpponent.tsx |
| 2024-12-16 | Migrer CharacterModel vers useGameStore | CharacterModel.tsx |
| 2024-12-16 | Migrer JellyControls vers useGameStore | JellyControls.tsx |
| 2024-12-16 | Migrer FluffyOpponent vers useGameStore | FluffyOpponent.tsx |
| 2024-12-16 | Migrer Cranium vers useGameStore | JellyHead/parts/Cranium.tsx |
| 2024-12-16 | Ajout useShallow pour selectors optimises | 4 fichiers |
| 2024-12-16 | Supprimer useTextureSettingsStore.ts | stores/ (10 → 9 stores) |

**Status:** TERMINEE (consolidation stores prioritaire effectuee)
