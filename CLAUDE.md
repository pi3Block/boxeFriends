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
