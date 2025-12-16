# Boxe Friends - Projet React Three Fiber

Projet React utilisant React Three Fiber, Three.js et Drei pour créer des expériences 3D interactives.

## 🚀 Technologies utilisées

- **React 18.3** - Bibliothèque UI
- **Vite 5.4** - Build tool moderne et rapide
- **Three.js 0.169** - Bibliothèque 3D
- **React Three Fiber 8.17** - Renderer React pour Three.js
- **Drei 9.114** - Helpers et abstractions utiles pour R3F

## 📦 Installation

```bash
# Installer les dépendances
npm install

# Ou avec yarn
yarn install

# Ou avec pnpm
pnpm install
```

## 🏃 Démarrage

```bash
# Lancer le serveur de développement
npm run dev

# Build pour la production
npm run build

# Prévisualiser le build de production
npm run preview
```

## 📁 Structure du projet

```
boxeFriends/
├── src/
│   ├── components/
│   │   └── Scene.jsx      # Composant de la scène 3D principale
│   ├── App.jsx            # Composant principal de l'application
│   ├── main.jsx           # Point d'entrée de l'application
│   └── index.css          # Styles globaux
├── index.html             # Template HTML
├── vite.config.js         # Configuration Vite
└── package.json           # Dépendances du projet
```

## 🎮 Utilisation

Le projet démarre avec une scène 3D de base contenant :
- Un cube orange animé
- Une sphère rose animée
- Un sol gris
- Des contrôles d'orbite pour naviguer (clic + glisser pour tourner, molette pour zoomer)

## 📚 Ressources

- [Documentation React Three Fiber](https://docs.pmnd.rs/react-three-fiber/getting-started/introduction)
- [Documentation Drei](https://github.com/pmndrs/drei)
- [Documentation Three.js](https://threejs.org/docs/)
- [Documentation Vite](https://vitejs.dev/)

## 🛠️ Développement

### Ajouter de nouveaux composants 3D

Créez vos composants dans `src/components/` et importez-les dans `Scene.jsx` ou `App.jsx`.

### Exemple de composant 3D

```jsx
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Box } from '@react-three/drei'

function MyComponent() {
  const ref = useRef()
  
  useFrame((state, delta) => {
    ref.current.rotation.y += delta
  })
  
  return (
    <Box ref={ref} args={[1, 1, 1]}>
      <meshStandardMaterial color="blue" />
    </Box>
  )
}
```

## 📝 Notes

- Les commentaires et la documentation sont en français
- Le code est écrit en anglais
- Utilisez les hooks de React Three Fiber (`useFrame`, `useThree`, etc.) pour l'animation et l'interaction


