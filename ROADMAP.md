# Roadmap d'Implémentation - Face Puncher

## Phase 1 : Migration TypeScript & Setup (Fondations)

### 1.1 Configuration TypeScript
- [ ] Renommer `.jsx` → `.tsx`
- [ ] Configurer `tsconfig.json` en mode strict
- [ ] Ajouter les types manquants (`@types/three` déjà présent)

### 1.2 Installation des dépendances manquantes
```bash
npm install zustand gsap @use-gesture/react @react-three/rapier three-custom-shader-material
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 1.3 Configuration Tailwind
- [ ] Créer `tailwind.config.js`
- [ ] Modifier `index.css` pour les directives Tailwind

### 1.4 Optimisation mobile Canvas
- [ ] Limiter `dpr` à `[1, 2]` dans le Canvas
- [ ] Désactiver `castShadow` sur DirectionalLight
- [ ] Changer Environment preset → `'studio'`

**Livrable :** Projet TypeScript strict avec toutes les dépendances, scène basique fonctionnelle.

---

## Phase 2 : State Management (Zustand Store)

### 2.1 Créer le store global
- [ ] Créer `src/stores/useGameStore.ts`
- [ ] Implémenter l'interface `GameStore` complète :
  ```typescript
  type GameState = 'LOBBY' | 'FIGHTING' | 'KO'
  ```
- [ ] Actions : `setTexture`, `takeDamage`, `resetGame`

### 2.2 Logique de dégâts
- [ ] Calcul des dégâts avec multiplicateur critique
- [ ] Gestion du combo meter (reset après délai)
- [ ] Transition automatique vers 'KO' quand HP ≤ 0

**Livrable :** Store Zustand fonctionnel avec logique de jeu.

---

## Phase 3 : Input System (@use-gesture)

### 3.1 Créer le hook d'input
- [ ] Créer `src/hooks/useGestureInput.ts`
- [ ] Binder sur le container Canvas

### 3.2 Détection des gestes
- [ ] **Tap** → Jab (coup rapide)
- [ ] **Swipe vertical (↑)** → Uppercut
- [ ] **Swipe horizontal (←/→)** → Hook gauche/droit

### 3.3 Calcul de puissance
- [ ] Extraire `vx`, `vy` (velocité)
- [ ] Mapper velocity → `impactStrength` (0.0 - 1.0)
- [ ] Seuil minimum pour déclencher un coup

**Livrable :** Système d'input gestuel avec détection de type et puissance.

---

## Phase 4 : Composants 3D Atomiques

### 4.1 Restructurer Scene.tsx
- [ ] Nettoyer le code actuel (retirer cube/sphère démo)
- [ ] Préparer l'import des sous-composants

### 4.2 Créer Opponent.tsx
- [ ] Sphère/Capsule représentant la tête
- [ ] Placeholder pour la texture uploadée
- [ ] Ref pour le mesh (accès shader)

### 4.3 Créer Gloves.tsx
- [ ] Deux meshes (Box) pour les gants gauche/droit
- [ ] Position de repos en bas de l'écran
- [ ] Refs pour animations GSAP

### 4.4 Créer UI.tsx (Overlay)
- [ ] Barre de vie adversaire (top)
- [ ] Barre de vie joueur (bottom)
- [ ] Combo counter
- [ ] Écran LOBBY / KO

**Livrable :** Architecture de composants propre et modulaire.

---

## Phase 5 : Animations GSAP

### 5.1 Créer le système d'animation
- [ ] Créer `src/hooks/usePunchAnimation.ts`
- [ ] Timeline GSAP pour chaque type de coup

### 5.2 Animations des poings
- [ ] **Jab** : Translation rapide Z → retour
- [ ] **Hook** : Arc horizontal + rotation
- [ ] **Uppercut** : Arc vertical ascendant

### 5.3 Camera shake
- [ ] Secousse sur impact (intensité = impactStrength)
- [ ] Utiliser `useThree` pour accéder à la caméra

### 5.4 Feedback visuel
- [ ] Flash blanc sur hit
- [ ] Slow-motion sur coup critique

**Livrable :** Animations fluides et satisfaisantes pour chaque coup.

---

## Phase 6 : Shader de Déformation (CRITIQUE)

> **Note** : Utiliser `three-custom-shader-material` (CSM) au lieu de `onBeforeCompile` brut.
> Voir [docs/SHADER_EXPLORATION.md](docs/SHADER_EXPLORATION.md) pour le détail technique.

### 6.1 Store des impacts (Ring Buffer)
- [ ] Créer `src/stores/useImpactStore.ts`
- [ ] Ring buffer de 5 impacts max
- [ ] Decay automatique (strength diminue avec le temps)
- [ ] Action `addImpact(hitPoint, strength)`

### 6.2 Material Custom avec CSM
- [ ] Installer `three-custom-shader-material`
- [ ] Créer `src/shaders/DeformableFaceMaterial.tsx`
- [ ] Étendre `MeshStandardMaterial` via CSM

### 6.3 Uniforms multi-impact
```glsl
uniform vec3 uHitPoints[5];
uniform float uStrengths[5];
uniform int uActiveImpacts;
uniform float uRadius;
uniform float uMaxDeform;
```

### 6.4 Logique Vertex Shader
- [ ] Boucle sur les 5 impacts actifs
- [ ] Calculer distance vertex ↔ hitPoint
- [ ] Falloff quadratique smooth
- [ ] Déplacement : `position - normal * strength * falloff * maxDeform`

### 6.5 Effet élastique (rebond cartoon)
- [ ] Oscillation amortie : `sin(age * 15) * exp(-age * 5)`
- [ ] Paramétrable via uniforms

### 6.6 Hook de connexion
- [ ] Créer `src/hooks/useHitDetection.ts`
- [ ] Connecte Input → Impact Store → Damage

**Livrable :** Visage qui se déforme de manière cartoon avec multi-impact et rebond élastique.

---

## Phase 7 : Physique Rapier (Collisions)

### 7.1 Setup Physics World
- [ ] Wrapper `<Physics>` dans App.tsx
- [ ] Configurer gravity à [0, 0, 0] (pas de chute)

### 7.2 Opponent Collider
- [ ] `<RigidBody type="fixed">`
- [ ] `<SphereCollider>` ou `<CapsuleCollider>`
- [ ] `sensor={true}`

### 7.3 Gloves Colliders
- [ ] RigidBody kinematic pour chaque gant
- [ ] `<SphereCollider>` petit rayon
- [ ] Synchroniser position avec animation GSAP

### 7.4 Détection de collision
- [ ] `onIntersectionEnter` → `onHit()`
- [ ] Calculer `hitPoint` (point de contact)
- [ ] Déclencher déformation + dégâts

**Livrable :** Collisions précises entre gants et tête adversaire.

---

## Phase 8 : Upload Photo & Texture

### 8.1 Input file (UI)
- [ ] Bouton upload dans écran LOBBY
- [ ] Accepter uniquement images (jpg, png, webp)
- [ ] Preview de l'image sélectionnée

### 8.2 Traitement de l'image
- [ ] Créer blob URL
- [ ] Stocker dans Zustand (`opponentTexture`)
- [ ] Optionnel : crop circulaire côté client

### 8.3 Application texture
- [ ] Charger texture via `useTexture` (drei)
- [ ] Appliquer sur le material de l'opponent
- [ ] Mapping UV sphérique

**Livrable :** Photo uploadée visible sur le visage de l'adversaire.

---

## Phase 9 : Game Loop & Polish

### 9.1 Flow de jeu complet
- [ ] LOBBY → Sélection photo → Start
- [ ] FIGHTING → Combat jusqu'à KO
- [ ] KO → Écran victoire → Restart

### 9.2 Feedback audio (optionnel)
- [ ] Sons de coups (Web Audio API)
- [ ] Son de KO

### 9.3 PWA Setup
- [ ] Manifest.json
- [ ] Service Worker basique
- [ ] Icons et splash screens

### 9.4 Optimisations finales
- [ ] Profiling performance mobile
- [ ] Lazy loading des assets
- [ ] Compression textures

**Livrable :** Jeu complet et jouable en PWA.

---

## Ordre de Priorité

```
┌─────────────────────────────────────────────────────────┐
│  CRITIQUE (Bloquant)                                    │
├─────────────────────────────────────────────────────────┤
│  Phase 1 → Phase 2 → Phase 3 → Phase 6                  │
│  (Setup)   (State)   (Input)   (Shader)                 │
└─────────────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────────────┐
│  IMPORTANT (Core Gameplay)                              │
├─────────────────────────────────────────────────────────┤
│  Phase 4 → Phase 5 → Phase 7                            │
│  (Compos)  (Anims)   (Physics)                          │
└─────────────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────────────┐
│  FINITION (MVP Complet)                                 │
├─────────────────────────────────────────────────────────┤
│  Phase 8 → Phase 9                                      │
│  (Photo)   (Polish)                                     │
└─────────────────────────────────────────────────────────┘
```

---

## Dépendances entre Phases

| Phase | Dépend de |
|-------|-----------|
| 2 (Zustand) | 1 (TypeScript) |
| 3 (Input) | 1 |
| 4 (Composants) | 1 |
| 5 (GSAP) | 3, 4 |
| 6 (Shader) | 4 |
| 7 (Rapier) | 4, 5, 6 |
| 8 (Photo) | 2, 4 |
| 9 (Polish) | Toutes |

---

## Estimations de Complexité

| Phase | Complexité | Risque |
|-------|------------|--------|
| 1 - Setup | Faible | Faible |
| 2 - Zustand | Faible | Faible |
| 3 - Input | Moyenne | Moyen |
| 4 - Composants | Faible | Faible |
| 5 - GSAP | Moyenne | Moyen |
| 6 - Shader | **Élevée** | **Élevé** |
| 7 - Rapier | Moyenne | Moyen |
| 8 - Photo | Faible | Faible |
| 9 - Polish | Moyenne | Faible |

**Point de vigilance :** La Phase 6 (Shader) est la plus critique et risquée. Prévoir du temps pour debug et itérations.
