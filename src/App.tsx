import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera, OrbitControls } from '@react-three/drei'
import { Perf } from 'r3f-perf'
import { AmmoVolumeDemo } from './components/AmmoVolumeDemo'
import { UI } from './components/UI'
import { ErrorBoundary } from './components/ErrorBoundary'

/**
 * App principale - Salle de boxe avec soft bodies
 */
function App() {
  return (
    <ErrorBoundary>
      <div className="relative h-screen w-screen">
        {/* Canvas 3D */}
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true }}
        >
          {/* Performance monitor (DEV only) */}
          {import.meta.env.DEV && <Perf position="top-left" />}

          {/* Caméra */}
          <PerspectiveCamera
            makeDefault
            position={[0, 4, 8]}
            fov={60}
            near={0.2}
            far={2000}
          />

          {/* Contrôles orbit */}
          <OrbitControls
            target={[0, 3, 0]}
            maxPolarAngle={Math.PI / 2}
            minDistance={5}
            maxDistance={25}
          />

          {/* Éclairage salle de boxe */}
          <ambientLight color={0x404040} intensity={0.5} />

          {/* Lumière principale (plafond) */}
          <directionalLight
            position={[0, 9, 0]}
            intensity={2}
            castShadow
            shadow-camera-left={-15}
            shadow-camera-right={15}
            shadow-camera-top={15}
            shadow-camera-bottom={-15}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />

          {/* Spots latéraux */}
          <pointLight position={[-8, 6, 8]} intensity={50} color={0xffaa55} />
          <pointLight position={[8, 6, 8]} intensity={50} color={0xffaa55} />
          <pointLight position={[0, 6, -8]} intensity={30} color={0x5555ff} />

          {/* Scène de la salle de boxe */}
          <AmmoVolumeDemo />
        </Canvas>

        {/* UI overlay */}
        <UI />
      </div>
    </ErrorBoundary>
  )
}

export default App
