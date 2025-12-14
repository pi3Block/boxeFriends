import { useRef, useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Opponent } from './Opponent'
import { Gloves, type GlovesHandle } from './Gloves'
import { ImpactEffects } from './ImpactEffects'
import { useAnimationContext } from '../context'

// #region agent log
const LOG_ENDPOINT = 'http://127.0.0.1:7243/ingest/bb23579b-81a8-4ebb-a165-6e012391b778'
const log = (location: string, message: string, data: any, hypothesisId?: string) => {
  fetch(LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location,
      message,
      data,
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'run1',
      hypothesisId,
    }),
  }).catch(() => {})
}
// #endregion

/**
 * Composant de la scène 3D principale
 * Orchestre les composants 3D et enregistre les refs pour les animations
 */
function Scene() {
  // #region agent log
  log('Scene.tsx:11', 'Scene render start', {}, 'H2')
  // #endregion

  const glovesRef = useRef<GlovesHandle>(null)
  
  // #region agent log
  log('Scene.tsx:17', 'Before useThree in Scene', {}, 'H2')
  // #endregion
  const { camera } = useThree()
  
  // #region agent log
  log('Scene.tsx:21', 'After useThree in Scene', { hasCamera: !!camera }, 'H2')
  // #endregion

  const { registerGloves, registerCamera, registerGlovesPunchAt } = useAnimationContext()

  // #region agent log
  log('Scene.tsx:25', 'Before rendering Opponent', {}, 'H2')
  // #endregion

  // Enregistrer la caméra pour les animations
  useEffect(() => {
    registerCamera(camera)
  }, [camera, registerCamera])

  // Enregistrer les gants quand ils sont montés
  useEffect(() => {
    const interval = setInterval(() => {
      if (glovesRef.current?.leftGlove && glovesRef.current?.rightGlove) {
        registerGloves(glovesRef.current.leftGlove, glovesRef.current.rightGlove)
        // Enregistrer aussi la fonction punchAt
        if (glovesRef.current.punchAt) {
          registerGlovesPunchAt(glovesRef.current.punchAt)
        }
        clearInterval(interval)
      }
    }, 100)

    return () => clearInterval(interval)
  }, [registerGloves, registerGlovesPunchAt])

  return (
    <group>
      {/* Adversaire (tête) */}
      <Opponent />

      {/* Gants du joueur */}
      <Gloves ref={glovesRef} />

      {/* Effets d'impact (particules, lignes) */}
      <ImpactEffects />
    </group>
  )
}

export default Scene
