# Architecture du projet

## Vue d'ensemble

Le projet utilise une architecture modulaire basée sur React et React Three Fiber.

## Flux de données

```
index.html
  └── main.jsx (Point d'entrée)
      └── App.jsx (Configuration Canvas)
          └── Scene.jsx (Logique 3D)
              └── Composants 3D individuels
```

## Responsabilités

### `main.jsx`
- Point d'entrée de l'application
- Initialise React et monte l'application

### `App.jsx`
- Configure le Canvas React Three Fiber
- Définit l'éclairage global
- Configure la caméra
- Ajoute les contrôles de navigation

### `Scene.jsx`
- Contient la logique métier de la scène 3D
- Gère les animations
- Organise les objets 3D

## Bonnes pratiques

1. **Séparation des responsabilités** : Chaque composant a un rôle clair
2. **Réutilisabilité** : Créez des composants 3D réutilisables
3. **Performance** : Utilisez `useMemo` et `useCallback` pour optimiser
4. **Documentation** : Documentez vos composants en français

## Extensions futures

- Système de composants 3D réutilisables
- Gestion d'état (Context API ou Zustand)
- Chargement de modèles 3D (GLTF)
- Système de particules
- Post-processing effects

