---

#DOCUMENT DE CONTEXTE TECHNIQUE : PROJECT "FACE PUNCHER"##1. Vue d'ensemble du projetDéveloppement d'une **PWA (Progressive Web App) mobile-first** de boxe en vue première personne (FPV).
**Core Loop :** L'utilisateur upload une photo → La photo devient le visage de l'adversaire 3D → L'utilisateur boxe via des gestes tactiles → Le visage se déforme de manière exagérée (cartoon) sous les coups.

---

##2. Tech Stack (Strict)Ne pas proposer d'alternatives. Utiliser uniquement ces technologies :

* **Framework App :** React 18+ (Vite).
* **Langage :** TypeScript (Strict mode).
* **Moteur 3D :** React Three Fiber (R3F) v8+.
* **Helpers 3D :** `@react-three/drei` (pour loaders, environment, etc.).
* **Physique :** `@react-three/rapier` (Collision detection haute performance).
* **State Management :** `Zustand` (pour HP, Score, Game State).
* **Animations :** `GSAP` (pour les mouvements procéduraux des poings et camera shake).
* **Input :** `@use-gesture/react` (pour détecter swipe, tap, velocity).
* **Styling :** Tailwind CSS (pour l'UI overlay).

---

##3. Architecture des Données (Zustand Store)Le store global (`useGameStore`) doit gérer l'état suivant. Utiliser cette structure comme référence :

```typescript
type GameState = 'LOBBY' | 'FIGHTING' | 'KO';

interface GameStore {
  gameState: GameState;
  
  // Stats Joueur
  playerHp: number; // 0-100
  comboMeter: number;
  
  // Stats Adversaire
  opponentHp: number; // 0-100
  opponentTexture: string | null; // URL blob de la photo uploadée
  
  // Actions
  setTexture: (url: string) => void;
  takeDamage: (amount: number, isCritical: boolean) => void;
  resetGame: () => void;
}

```

---

##4. Modules et Spécifications Techniques###A. La Scène 3D (R3F)* **Camera :** PerspectiveCamera, FOV 75. Position fixe [0, 0, 5].
* **Lighting :** Setup simple pour mobile. 1 AmbientLight (0.5) + 1 DirectionalLight (castShadow = false pour perf) + Environment (preset 'studio').
* **Background :** Couleur unie ou gradient simple (pas de Skybox lourde).

###B. Gestion des Coups & Physique (Rapier)* **Adversaire :**
* RigidBody type: `Fixed` (il ne tombe pas, il encaisse).
* Collider: `Sphere` ou `Capsule` autour de la tête.
* Sensor: `true` (on veut juste détecter le contact, pas rebondir physiquement).


* **Poings (Joueur) :**
* Objets invisibles (Colliders) qui suivent la souris/doigt ou qui sont animés via GSAP lors d'un swipe.
* Lors d'un événement `onIntersectionEnter` (Rapier) -> Déclencher la fonction `onHit()`.



###C. Le Shader de Déformation (CRITIQUE)Nous n'utilisons **PAS** de MorphTargets. Nous utilisons une injection GLSL dans le `MeshStandardMaterial`.

**Logique du Shader à implémenter :**

1. Utiliser `onBeforeCompile` sur le matériel de la tête.
2. Uniforms à injecter : `uHitPoint` (vec3), `uImpactStrength` (float), `uTime` (float).
3. **Vertex Shader Logic :**
* Calculer la distance entre `position` (vertex) et `uHitPoint`.
* Si distance < Rayon, déplacer le vertex dans la direction opposée à la `normal`.
* Formule : `newPos = position - normal * sin(impactStrength) * falloff`.



###D. Input System (Use-Gesture)* Ne pas utiliser de boutons HTML pour frapper.
* Binder les gestes sur le container Canvas :
* `onDrag` (Swipe haut) -> Trigger Uppercut animation.
* `onDrag` (Swipe côté) -> Trigger Hook animation.
* `onClick` (Tap) -> Trigger Jab animation.


* **Velocité :** Utiliser la donnée `vx` et `vy` de use-gesture pour déterminer la puissance du coup (modifier `uImpactStrength` en conséquence).

---

##5. Directives de Développement pour l'IA (Cursor Rules)1. **Mobile First :** Toujours vérifier que le code est performant (pas de boucles lourdes dans `useFrame`). Limiter le `devicePixelRatio` à 2 maximum.
2. **Composants Atomiques :** Créer des fichiers séparés : `Scene.tsx`, `Opponent.tsx`, `Gloves.tsx`, `UI.tsx`.
3. **Pas de Classes :** Utiliser uniquement des composants fonctionnels React et des Hooks.
4. **Gestion des Assets :** Pour le MVP, utiliser des primitives (Box/Sphere) pour représenter la tête et les gants si les modèles GLB ne sont pas encore chargés.

---

##6. Plan d'Implantation (Step-by-Step)Si je demande "Démarre le projet", suis cet ordre scrupuleusement :

1. **Phase 1 : Boilerplate.** Setup Vite + R3F + Tailwind. Scène vide avec un cube.
2. **Phase 2 : Input & Anim.** Remplacer le cube par une sphère. Ajouter `use-gesture`. Faire bouger une "main" (cube) vers la sphère quand on swipe.
3. **Phase 3 : Shader.** Implémenter le `onBeforeCompile` pour que la sphère se déforme quand on clique dessus (sans physique pour l'instant).
4. **Phase 4 : Texture.** Créer l'input file HTML pour charger une image et l'appliquer sur la sphère.
5. **Phase 5 : Physique & Gameplay.** Intégrer Rapier pour les collisions réelles et connecter au Store (barres de vie).

---