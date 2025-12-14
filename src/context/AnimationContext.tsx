import { createContext, useContext, useRef, useCallback, type ReactNode } from 'react'
import gsap from 'gsap'
import type { Mesh, Camera } from 'three'
import type { PunchType } from '../stores'

/**
 * Configuration des animations par type de coup
 */
const PUNCH_CONFIGS: Record<PunchType, {
  duration: number
  targetZ: number
  targetY: number
  targetX: number
  rotation: number
}> = {
  jab: {
    duration: 0.15,
    targetZ: -1.5,
    targetY: 0,
    targetX: 0,
    rotation: 0,
  },
  hook: {
    duration: 0.25,
    targetZ: -1,
    targetY: 0.2,
    targetX: 0.8,
    rotation: 0.3,
  },
  uppercut: {
    duration: 0.3,
    targetZ: -1.2,
    targetY: 1,
    targetX: 0,
    rotation: -0.2,
  },
}

const REST_POSITIONS = {
  left: { x: -0.8, y: -0.6, z: 2 },
  right: { x: 0.8, y: -0.6, z: 2 },
}

interface AnimationContextType {
  registerGloves: (left: Mesh | null, right: Mesh | null) => void
  registerCamera: (camera: Camera) => void
  registerGlovesPunchAt: (punchAt: (screenX: number, screenY: number) => void) => void
  triggerPunch: (type: PunchType, hand: 'left' | 'right', velocity: number, isCritical: boolean) => void
  triggerPunchAt: (screenX: number, screenY: number) => void
  triggerCameraShake: (intensity: number) => void
}

const AnimationContext = createContext<AnimationContextType | null>(null)

export function AnimationProvider({ children }: { children: ReactNode }) {
  const leftGloveRef = useRef<Mesh | null>(null)
  const rightGloveRef = useRef<Mesh | null>(null)
  const cameraRef = useRef<Camera | null>(null)
  const punchAtRef = useRef<((screenX: number, screenY: number) => void) | null>(null)
  const isAnimating = useRef(false)

  const registerGloves = useCallback((left: Mesh | null, right: Mesh | null) => {
    leftGloveRef.current = left
    rightGloveRef.current = right
  }, [])

  const registerGlovesPunchAt = useCallback((punchAt: (screenX: number, screenY: number) => void) => {
    punchAtRef.current = punchAt
  }, [])

  const triggerPunchAt = useCallback((screenX: number, screenY: number) => {
    if (punchAtRef.current) {
      punchAtRef.current(screenX, screenY)
    }
  }, [])

  const registerCamera = useCallback((camera: Camera) => {
    cameraRef.current = camera
  }, [])

  const triggerCameraShake = useCallback((intensity: number) => {
    if (!cameraRef.current) return

    const camera = cameraRef.current
    const originalPos = { x: camera.position.x, y: camera.position.y }
    const shakeIntensity = intensity * 0.15

    gsap.to(camera.position, {
      x: originalPos.x + (Math.random() - 0.5) * shakeIntensity,
      y: originalPos.y + (Math.random() - 0.5) * shakeIntensity,
      duration: 0.05,
      repeat: 4,
      yoyo: true,
      ease: 'power2.inOut',
      onComplete: () => {
        camera.position.x = originalPos.x
        camera.position.y = originalPos.y
      },
    })
  }, [])

  const triggerCriticalFlash = useCallback(() => {
    const flash = document.createElement('div')
    flash.style.cssText = `
      position: fixed;
      inset: 0;
      background: white;
      pointer-events: none;
      z-index: 9999;
    `
    document.body.appendChild(flash)

    gsap.fromTo(
      flash,
      { opacity: 0.7 },
      {
        opacity: 0,
        duration: 0.15,
        ease: 'power2.out',
        onComplete: () => flash.remove(),
      }
    )
  }, [])

  const triggerPunch = useCallback(
    (type: PunchType, hand: 'left' | 'right', velocity: number, isCritical: boolean) => {
      const glove = hand === 'left' ? leftGloveRef.current : rightGloveRef.current
      if (!glove || isAnimating.current) return

      isAnimating.current = true
      const config = PUNCH_CONFIGS[type]
      const restPos = REST_POSITIONS[hand]
      const duration = config.duration * (1 - velocity * 0.3)
      const directionX = hand === 'left' ? -config.targetX : config.targetX

      const tl = gsap.timeline({
        onComplete: () => {
          isAnimating.current = false
        },
      })

      // Phase 1: Coup vers l'avant
      tl.to(glove.position, {
        x: restPos.x + directionX * 0.5,
        y: restPos.y + config.targetY,
        z: config.targetZ,
        duration: duration,
        ease: 'power2.out',
      })

      tl.to(
        glove.rotation,
        {
          x: config.rotation,
          z: hand === 'left' ? -config.rotation * 0.5 : config.rotation * 0.5,
          duration: duration,
          ease: 'power2.out',
        },
        '<'
      )

      // Phase 2: Retour
      tl.to(glove.position, {
        x: restPos.x,
        y: restPos.y,
        z: restPos.z,
        duration: duration * 1.5,
        ease: 'power2.inOut',
      })

      tl.to(
        glove.rotation,
        {
          x: 0.3,
          z: 0,
          duration: duration * 1.5,
          ease: 'power2.inOut',
        },
        '<'
      )

      // Camera shake
      triggerCameraShake(velocity)

      // Effets critiques
      if (isCritical) {
        triggerCriticalFlash()
      }
    },
    [triggerCameraShake, triggerCriticalFlash]
  )

  return (
    <AnimationContext.Provider
      value={{
        registerGloves,
        registerCamera,
        registerGlovesPunchAt,
        triggerPunch,
        triggerPunchAt,
        triggerCameraShake,
      }}
    >
      {children}
    </AnimationContext.Provider>
  )
}

export function useAnimationContext() {
  const context = useContext(AnimationContext)
  if (!context) {
    throw new Error('useAnimationContext must be used within AnimationProvider')
  }
  return context
}
