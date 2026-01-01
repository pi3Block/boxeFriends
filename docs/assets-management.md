# Gestion des Assets Statiques

## Structure des Assets

Les assets statiques (textures, modèles 3D, etc.) sont placés dans le dossier `public/` et sont copiés tels quels dans le dossier `dist/` lors du build.

```
public/
├── textures/
│   └── default-face.png    # Texture par défaut de l'opposant
└── meshes/
    ├── facecap.glb         # Modèle ARKit avec morph targets
    └── Humanoid.glb        # Modèle humanoïde
```

## Référencement des Assets

### Assets dans `public/`

Les fichiers dans `public/` doivent être référencés avec des **chemins absolus** commençant par `/` :

```typescript
// ✅ Correct
export const DEFAULT_OPPONENT_TEXTURE = '/textures/default-face.png'
const modelPath = '/meshes/facecap.glb'

// ❌ Incorrect (ne fonctionnera pas en production)
const texture = './textures/default-face.png'
const model = '../public/meshes/facecap.glb'
```

### Chargement des Textures

#### Avec `useTexture` (drei)

```typescript
import { useTexture } from '@react-three/drei'

function MyComponent() {
  const texture = useTexture('/textures/default-face.png')
  // ...
}
```

#### Avec `TextureLoader` (three.js)

```typescript
import * as THREE from 'three'
import { useEffect, useState } from 'react'

function MyComponent() {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    loader.load(
      '/textures/default-face.png',
      (loadedTexture) => {
        loadedTexture.flipY = false
        loadedTexture.colorSpace = THREE.NoColorSpace
        setTexture(loadedTexture)
      },
      undefined,
      (error) => {
        console.error('Error loading texture:', error)
      }
    )
    
    return () => {
      if (texture) texture.dispose()
    }
  }, [])
  
  // ...
}
```

### Chargement des Modèles 3D

#### Avec `useGLTF` (drei)

```typescript
import { useGLTF } from '@react-three/drei'

function MyModel() {
  const { scene } = useGLTF('/meshes/facecap.glb')
  // ...
}
```

#### Avec `useLoader` (r3f)

```typescript
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

function MyModel() {
  const gltf = useLoader(GLTFLoader, '/meshes/facecap.glb')
  // ...
}
```

## Build et Production

### Vérification du Build

Après un `npm run build`, vérifiez que les assets sont bien copiés :

```bash
# Vérifier la présence des textures
ls -lh dist/textures/

# Vérifier la présence des meshes
ls -lh dist/meshes/
```

### Configuration Vite

La configuration dans `vite.config.ts` garantit que les assets sont copiés :

```typescript
export default defineConfig({
  publicDir: 'public',  // Dossier source des assets statiques
  build: {
    copyPublicDir: true,  // Copier le dossier public dans dist
  },
})
```

### Problèmes Courants

#### 1. La texture n'apparaît pas après le build

**Causes possibles :**
- Cache du navigateur
- Chemin incorrect (relatif au lieu d'absolu)
- Fichier non présent dans `public/`

**Solutions :**
1. Vider le cache du navigateur (Ctrl+Shift+R ou Cmd+Shift+R)
2. Vérifier que le chemin commence par `/` : `/textures/default-face.png`
3. Vérifier que le fichier existe dans `public/textures/`
4. Rebuild complet : `rm -rf dist && npm run build`

#### 2. Erreur 404 sur les assets en production

**Causes possibles :**
- Base path incorrect si l'app est servie depuis un sous-dossier
- Serveur web mal configuré

**Solutions :**
1. Si l'app est servie depuis un sous-dossier, configurer `base` dans `vite.config.ts` :
   ```typescript
   export default defineConfig({
     base: '/mon-app/',  // Si servi depuis /mon-app/
     // ...
   })
   ```
2. Vérifier la configuration du serveur web (nginx, Apache, etc.)

#### 3. Assets trop volumineux

**Solutions :**
- Optimiser les textures (compression, format WebP)
- Utiliser des formats optimisés pour les modèles 3D (glTF avec compression)
- Code splitting pour charger les assets à la demande

## Bonnes Pratiques

1. **Toujours utiliser des chemins absolus** pour les assets dans `public/`
2. **Vérifier la présence des assets** dans `dist/` après le build
3. **Optimiser les assets** avant de les ajouter au projet
4. **Documenter les nouveaux assets** ajoutés au projet
5. **Utiliser TypeScript** pour typer les chemins d'assets quand possible

## Assets Actuels du Projet

### Textures
- `/textures/default-face.png` : Texture par défaut de l'opposant (1.5 MB)

### Modèles 3D
- `/meshes/facecap.glb` : Modèle ARKit avec morph targets pour animations faciales
- `/meshes/Humanoid.glb` : Modèle humanoïde générique



