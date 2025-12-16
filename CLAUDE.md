# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Face Puncher" - A mobile-first PWA boxing game in first-person view using React Three Fiber. Users upload a photo that becomes the opponent's face, then box via touch gestures with cartoon-style deformation effects.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## Suivi des Avancées (IMPORTANT)

**Après chaque tâche complétée de la roadmap**, mettre à jour:

1. **docs/ROADMAP ACHIEVEMENT.md** — Ajouter une ligne dans le tableau de la phase concernée:
   ```markdown
   | YYYY-MM-DD | Description courte | fichiers modifiés |
   ```

2. **docs/ROADMAP.md** — Cocher la tâche correspondante `- [x]`

**Format de commit recommandé:**
```
[Phase X] Description de la tâche

- Détail 1
- Détail 2
```

## Architecture

```
main.jsx → App.jsx (Canvas/Camera/Lighting) → Scene.jsx (3D objects/animations)
```

- **App.jsx**: Configures R3F Canvas, PerspectiveCamera, lighting, Environment, and OrbitControls
- **Scene.jsx**: Contains 3D business logic, animations via `useFrame`, organizes 3D objects
- New 3D components go in `src/components/`

## Tech Stack (Strict - No Alternatives)

- **Framework**: React 18+ with Vite
- **Language**: TypeScript (Strict mode) - to be implemented
- **3D Engine**: React Three Fiber v8+ with `@react-three/drei`
- **Shader**: `three-custom-shader-material` (CSM) for extending materials
- **Physics**: `@react-three/rapier` (collision detection)
- **State**: Zustand (HP, Score, Game State)
- **Animations**: GSAP (procedural punch movements, camera shake)
- **Input**: `@use-gesture/react` (swipe/tap detection with velocity)
- **Styling**: Tailwind CSS (UI overlay)

## React Three Fiber (R3F) - API Reference

> Documentation: https://r3f.docs.pmnd.rs | Version: R3F v8 pairs with React 18, R3F v9 pairs with React 19

### Canvas Props
```tsx
<Canvas
  gl={{ powerPreference: "high-performance", alpha: false, antialias: true }}
  camera={{ fov: 75, near: 0.1, far: 1000, position: [0, 0, 5] }}
  shadows="soft"           // false | true | 'soft' | 'basic' | 'percentage' | 'variance'
  dpr={[1, 2]}             // Device pixel ratio [min, max]
  frameloop="always"       // 'always' | 'demand' | 'never'
  flat={false}             // NoToneMapping instead of ACESFilmicToneMapping
  linear={false}           // Disable sRGB color correction
  orthographic={false}     // Use OrthographicCamera
  onCreated={(state) => {}}
  onPointerMissed={(e) => {}}
/>
```

### Hooks Principaux

#### useFrame - Render Loop
```tsx
useFrame((state, delta, xrFrame) => {
  // state: { gl, scene, camera, clock, pointer, viewport, size, ... }
  // delta: temps écoulé depuis le dernier frame (en secondes)
  meshRef.current.rotation.y += delta  // Utiliser delta pour être indépendant du framerate
}, priority?)  // priority: négatif = avant le rendu, positif = après
```
**⚠️ NE JAMAIS appeler setState dans useFrame** - muter directement via refs.

#### useThree - Accès au State
```tsx
// ❌ Mauvais: cause re-renders inutiles
const { camera, gl, scene } = useThree()

// ✅ Bon: selector pattern - ne re-render que si camera change
const camera = useThree((state) => state.camera)

// Propriétés disponibles: gl, scene, camera, raycaster, pointer, clock,
// size, viewport, set, get, invalidate, setSize, setDpr
```

#### useLoader - Chargement d'Assets
```tsx
const texture = useLoader(TextureLoader, '/texture.png')
const gltf = useLoader(GLTFLoader, '/model.glb', (loader) => {
  // Extensions (Draco, etc.)
})

// Preload pour optimisation
useLoader.preload(GLTFLoader, '/model.glb')
```

#### useGraph - Extraction Scene
```tsx
const { nodes, materials } = useGraph(gltf.scene)
```

## @react-three/drei - Helpers Reference

> Documentation: https://github.com/pmndrs/drei | Uses `three-stdlib` instead of `three/examples/jsm`

### Hooks Essentiels
```tsx
// Chargement GLTF avec cache automatique
const { nodes, materials } = useGLTF('/model.glb')
useGLTF.preload('/model.glb')  // Preload en background

// Textures (simple ou multiple)
const texture = useTexture('/texture.png')
const [colorMap, normalMap] = useTexture(['/color.png', '/normal.png'])
useTexture.preload('/texture.png')

// Helper pour visualiser objets Three.js
useHelper(meshRef, BoxHelper, 'red')
```

### Composants par Catégorie

**Cameras:**
- `<PerspectiveCamera makeDefault />` - Caméra perspective déclarative
- `<OrthographicCamera />` - Caméra orthographique
- `<CubeCamera />` - Caméra cubique pour reflections

**Controls:**
- `<OrbitControls />` - Rotation autour d'un point
- `<CameraControls />` - Contrôles caméra avancés
- `<ScrollControls pages={3}>` - Scroll-driven animations
- `<PresentationControls />` - Rotation par drag
- `<KeyboardControls />` - Input clavier mappé

**Environment & Lighting:**
- `<Environment preset="sunset" />` - HDR environment maps
- `<Sky />` - Ciel procédural
- `<Stars />` - Champ d'étoiles
- `<ContactShadows />` - Ombres de contact planaires

**Abstractions:**
- `<Html>` - HTML overlay dans l'espace 3D
- `<Text>` - Texte 2D (troika-three-text)
- `<Text3D font="/font.json">` - Texte 3D extrudé
- `<Billboard />` - Toujours face caméra
- `<Clone object={gltf.scene} />` - Instancing efficace
- `<Decal />` - Décalcomanies sur surfaces
- `<Edges />` - Contours de géométrie
- `<Outlines />` - Effet outline

**Materials Spéciaux:**
- `<MeshReflectorMaterial />` - Sol réfléchissant
- `<MeshWobbleMaterial />` - Déformation ondulante
- `<MeshDistortMaterial />` - Distorsion noise
- `<MeshTransmissionMaterial />` - Verre/transmission

**Geometries:**
- `<RoundedBox />`, `<Sphere />`, `<Plane />`, `<Torus />`
- `<Line points={[...]} />` - Lignes
- `<QuadraticBezierLine />`, `<CubicBezierLine />`

**Performance:**
- `<PerformanceMonitor>` - Ajustement qualité automatique
- `<Detailed distances={[0, 50, 100]}>` - LOD (Level of Detail)
- `<Preload all />` - Preload tous les assets dans Suspense

## Optimisation Performance (Mobile-First)

### Règles Critiques
1. **Limiter DPR à 2**: `dpr={[1, 2]}` - ne jamais dépasser sur mobile
2. **On-demand rendering**: `frameloop="demand"` pour scènes statiques, puis `invalidate()` pour déclencher un rendu
3. **Instancing**: Une seule draw call pour objets répétés (`<Instances>`)
4. **Max ~1000 draw calls**, idéalement quelques centaines

### Anti-Patterns à Éviter
```tsx
// ❌ MAUVAIS: setState dans useFrame
useFrame(() => {
  setRotation(rotation + 0.01)  // Déclenche re-render React!
})

// ✅ BON: mutation directe via ref
useFrame((_, delta) => {
  meshRef.current.rotation.y += delta
})

// ❌ MAUVAIS: création d'objets dans loop
useFrame(() => {
  const vec = new THREE.Vector3()  // Garbage collection!
})

// ✅ BON: réutiliser les objets
const vec = useMemo(() => new THREE.Vector3(), [])
useFrame(() => {
  vec.set(x, y, z)
})

// ❌ MAUVAIS: subscription réactive à state rapide
const position = useGameStore(state => state.glovePosition)  // 60 re-renders/sec!

// ✅ BON: getState() dans useFrame
useFrame(() => {
  const pos = useGameStore.getState().glovePosition
})
```

### Bonnes Pratiques Assets
- **Partager materials/geometries** via refs globaux ou `useMemo`
- **useLoader** cache automatiquement les assets
- **useGLTF.preload()** pour charger en avance
- **Suspense** imbriqués pour chargement progressif
- **GLTFJSX** pour générer composants JSX optimisés depuis GLTF

### Configuration Canvas Mobile
```tsx
<Canvas
  gl={{
    powerPreference: "high-performance",
    alpha: false,
    antialias: false,  // Désactiver sur mobile si possible
    stencil: false,
    depth: true
  }}
  dpr={[1, 2]}
  frameloop="demand"  // Pour scènes avec peu d'animation
/>
```

### Outils de Profiling
- **r3f-perf**: Stats shaders, textures, vertices (R3F spécifique)
- **stats.js**: FPS/MS/MB monitoring
- **spector.js**: Extension Chrome/Firefox pour debug WebGL

## Key Technical Specifications

### Deformation Shader (Critical)
Use `three-custom-shader-material` (CSM) to extend MeshStandardMaterial - NOT MorphTargets or raw `onBeforeCompile`.
See [docs/SHADER_EXPLORATION.md](docs/SHADER_EXPLORATION.md) for detailed implementation.

**Multi-impact system:**
- Ring buffer of 5 simultaneous impacts in `useImpactStore`
- Uniforms: `uHitPoints[5]`, `uStrengths[5]`, `uActiveImpacts`, `uRadius`, `uMaxDeform`
- Automatic decay with elastic bounce effect: `sin(age * 15) * exp(-age * 5)`

### Input System
Bind gestures on Canvas container (no HTML buttons for punching):
- `onDrag` (swipe up) → Uppercut
- `onDrag` (swipe side) → Hook
- `onClick` (tap) → Jab
- Use `vx`/`vy` velocity data for punch power

### Physics (Rapier)
- Opponent: RigidBody `Fixed`, Collider `Sphere`/`Capsule`, Sensor `true`
- Gloves: Invisible colliders following finger/mouse, trigger `onHit()` via `onIntersectionEnter`

## Code Conventions

- Documentation/comments: French
- Code (variables, functions): English
- Functional components only (no classes)
- Mobile-first: limit `devicePixelRatio` to 2, avoid heavy loops in `useFrame`
- Atomic components: separate files for Scene, Opponent, Gloves, UI

## Game State Structure (Zustand)

```typescript
type GameState = 'LOBBY' | 'FIGHTING' | 'KO';
interface GameStore {
  gameState: GameState;
  playerHp: number;      // 0-100
  comboMeter: number;
  opponentHp: number;    // 0-100
  opponentTexture: string | null;  // Blob URL of uploaded photo
}
```

## Facial Animation System (ARKit Morph Targets)

### Model: facecap.glb
Located at `public/meshes/facecap.glb` - requires special loaders:
```typescript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

// Configure loader
ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/gh/pmndrs/drei-assets/basis/')
loader.setKTX2Loader(ktx2Loader)
loader.setMeshoptDecoder(MeshoptDecoder)
```

### 52 ARKit Blend Shapes
Defined in `useFacialStore.ts` - includes: browInnerUp, eyeBlink_L/R, jawOpen, mouthSmile_L/R, noseSneer_L/R, cheekPuff, etc.

### Facial Store (useFacialStore)
- **Presets**: idle, guard, lightHit, mediumHit, heavyHit, critical, jawHit, leftCheekHit, rightCheekHit, noseHit, foreheadHit, uppercutHit, stunned, knockout, hurt, taunt, angry, recovery
- **triggerHitReaction(intensity, hitZone?)**: Auto-selects preset based on hit zone and intensity
- **Hit zones**: 'jaw' | 'leftCheek' | 'rightCheek' | 'nose' | 'forehead' | 'uppercut'

### Expression Design Tips
For expressive reactions, use many blend shapes together with high values (0.8-1.0). Example for cheek hit:
- mouthRight/Left: 0.96 (very high for asymmetric mouth)
- eyeWide_L/R: 0.88
- browInnerUp: 0.9
- jawRight/Left: 0.38
- Multiple mouth shapes: mouthPucker, mouthFunnel, mouthRollLower, mouthShrugUpper

## Ammo.js Soft Body Physics

### Overview
Ammo.js is the Bullet Physics engine compiled to WebAssembly. Used for the "Fluffy" opponent character with volumetric soft body deformation.

**Files**: `public/libs/ammo.wasm.js`, `public/libs/ammo.wasm.wasm`

### Hook: useAmmoPhysics
Located at `src/hooks/useAmmoPhysics.ts` - singleton pattern to avoid multiple physics worlds.

```typescript
const {
  isReady,
  createSoftVolume,
  updatePhysics,
  applySoftBodyImpulse,
  applyCenteringForce,
  removeSoftBody,
} = useAmmoPhysics()
```

### Creating a Soft Body
```typescript
const state = createSoftVolume(geometry, mesh, {
  mass: 15,           // Total mass (default: 15)
  pressure: 200,      // Internal pressure kPR (120-400)
  disableGravity: true, // Apply anti-gravity force
})
```

### btSoftBody Configuration Parameters (m_cfg)
From the Bullet Physics / Ammo.js API:
- `viterations(40)` - Velocity solver iterations
- `piterations(40)` - Position solver iterations
- `kDF(0.1)` - Dynamic friction coefficient
- `kDP(0.01)` - Damping coefficient (low = bouncy)
- `kPR(200)` - Pressure coefficient (high = inflated balloon)
- `kLST(0.9)` - Linear stiffness (0-1, 0.9 = rigid edges)
- `kAST(0.9)` - Angular stiffness
- `collisions(0x11)` - Collision flags

### Key btSoftBody Methods
Reference: [btSoftBody.h on GitHub](https://github.com/kripken/ammo.js/blob/main/bullet/src/BulletSoftBody/btSoftBody.h)

**Forces:**
- `addForce(btVector3)` - Apply force to entire body
- `addForce(btVector3, nodeIndex)` - Apply to specific node
- `addVelocity(btVector3)` - Add velocity to entire body
- `setVelocity(btVector3)` - Set velocity for entire body

**Structure:**
- `get_m_nodes()` - Access nodes array
- `get_m_cfg()` - Access configuration
- `setTotalMass(mass, fromFaces)` - Set total mass
- `appendAnchor(nodeIndex, rigidBody)` - Anchor node to rigid body

**Node properties (via nodes.at(i)):**
- `get_m_x()` - Position (btVector3)
- `get_m_v()` - Velocity (btVector3)
- `get_m_n()` - Normal (btVector3)
- `get_m_im()` - Inverse mass
- `set_m_im(0)` - Set inverse mass to 0 = fixed node

### Important Notes
- btSoftBody does NOT have `setGravity()` - use `addForce()` to counteract world gravity
- Must use `btSoftRigidDynamicsWorld` (not btDiscreteDynamicsWorld) for soft bodies
- Always call `Ammo.destroy(btVector3)` after creating temporary vectors
- Vertex merging required: Three.js duplicates vertices, Ammo needs unique vertices

### Reference Demo
[Three.js Ammo Volume Example](https://threejs.org/examples/physics_ammo_volume.html)
