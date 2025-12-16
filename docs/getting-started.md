# Guide de démarrage - React Three Fiber

## Introduction

Ce guide vous aidera à comprendre la structure du projet et comment commencer à développer avec React Three Fiber.

## Concepts de base

### Canvas

Le composant `<Canvas>` est le point d'entrée de React Three Fiber. Il crée automatiquement une scène Three.js, une caméra et un renderer.

```jsx
import { Canvas } from '@react-three/fiber'

<Canvas>
  {/* Vos composants 3D ici */}
</Canvas>
```

### Composants 3D

React Three Fiber permet d'utiliser les objets Three.js comme des composants React :

```jsx
<mesh>
  <boxGeometry args={[1, 1, 1]} />
  <meshStandardMaterial color="orange" />
</mesh>
```

### Hooks utiles

- `useFrame` : Pour les animations à chaque frame
- `useThree` : Pour accéder à la scène, la caméra, etc.
- `useLoader` : Pour charger des assets (modèles 3D, textures)

## Structure recommandée

```
src/
├── components/
│   ├── Scene.jsx          # Scène principale
│   ├── objects/            # Objets 3D réutilisables
│   └── effects/            # Effets visuels
├── hooks/                  # Hooks personnalisés
├── utils/                  # Utilitaires
└── App.jsx
```

## Exemples courants

### Animation simple

```jsx
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

function RotatingBox() {
  const ref = useRef()
  
  useFrame((state, delta) => {
    ref.current.rotation.y += delta
  })
  
  return (
    <mesh ref={ref}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="blue" />
    </mesh>
  )
}
```

### Interaction avec la souris

```jsx
import { useRef, useState } from 'react'

function InteractiveBox() {
  const [hovered, setHovered] = useState(false)
  const ref = useRef()
  
  return (
    <mesh
      ref={ref}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={hovered ? 'hotpink' : 'orange'} />
    </mesh>
  )
}
```

## Ressources Drei

Drei fournit de nombreux helpers utiles :

- `OrbitControls` : Contrôles de navigation
- `PerspectiveCamera` : Configuration de caméra
- `Environment` : Éclairage global
- `Box`, `Sphere`, `Plane` : Primitives 3D
- `Text3D` : Texte 3D
- `Html` : HTML dans la scène 3D
- Et bien plus...

Consultez la [documentation Drei](https://github.com/pmndrs/drei) pour la liste complète.


