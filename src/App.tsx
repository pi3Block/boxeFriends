import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei'
import Scene from './components/Scene'

/**
 * Composant principal de l'application
 * Configure le Canvas React Three Fiber avec les contrôles de base
 */
function App() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]} // Limite pour performance mobile
    >
      {/* Configuration de la caméra */}
      <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={75} />

      {/* Éclairage de la scène - optimisé mobile */}
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={1}
        castShadow={false} // Désactivé pour performance mobile
      />

      {/* Environnement pour l'éclairage global */}
      <Environment preset="studio" />

      {/* Composant de la scène 3D */}
      <Scene />

      {/* Contrôles d'orbite pour naviguer dans la scène */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        maxDistance={20}
      />
    </Canvas>
  )
}

export default App
