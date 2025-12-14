import { useRef, useCallback } from 'react'
import { useThree } from '@react-three/fiber'
import gsap from 'gsap'
import type { Mesh } from 'three'
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
    targetX: 0.8, // Arc horizontal
    rotation: 0.3,
  },
  uppercut: {
    duration: 0.3,
    targetZ: -1.2,
    targetY: 1, // Arc vertical
    targetX: 0,
    rotation: -0.2,
  },
}

/**
 * Positions de repos des gants
 */
const REST_POSITIONS = {
  left: { x: -0.8, y: -0.6, z: 2 },
  right: { x: 0.8, y: -0.6, z: 2 },
}

interface PunchAnimationRefs {
  leftGlove: React.RefObject<Mesh | null>
  rightGlove: React.RefObject<Mesh | null>
}

/**
 * Hook pour gérer les animations de coups avec GSAP
 */
export function usePunchAnimation(refs: PunchAnimationRefs) {
  const { camera } = useThree()
  const isAnimating = useRef(false)
  const currentTimeline = useRef<gsap.core.Timeline | null>(null)

  /**
   * Anime un coup de poing
   */
  const animatePunch = useCallback(
    (type: PunchType, hand: 'left' | 'right', velocity: number) => {
      const gloveRef = hand === 'left' ? refs.leftGlove : refs.rightGlove
      if (!gloveRef.current || isAnimating.current) return

      isAnimating.current = true
      const config = PUNCH_CONFIGS[type]
      const restPos = REST_POSITIONS[hand]

      // Ajuster la durée selon la vélocité (plus rapide = plus court)
      const duration = config.duration * (1 - velocity * 0.3)

      // Direction du coup (miroir pour main gauche sur hook)
      const directionX = hand === 'left' ? -config.targetX : config.targetX

      // Créer la timeline
      const tl = gsap.timeline({
        onComplete: () => {
          isAnimating.current = false
          currentTimeline.current = null
        },
      })

      currentTimeline.current = tl

      // Phase 1: Coup vers l'avant
      tl.to(gloveRef.current.position, {
        x: restPos.x + directionX * 0.5,
        y: restPos.y + config.targetY,
        z: config.targetZ,
        duration: duration,
        ease: 'power2.out',
      })

      // Rotation pendant le coup
      tl.to(
        gloveRef.current.rotation,
        {
          x: config.rotation,
          z: hand === 'left' ? -config.rotation * 0.5 : config.rotation * 0.5,
          duration: duration,
          ease: 'power2.out',
        },
        '<'
      )

      // Phase 2: Retour à la position de repos
      tl.to(gloveRef.current.position, {
        x: restPos.x,
        y: restPos.y,
        z: restPos.z,
        duration: duration * 1.5,
        ease: 'power2.inOut',
      })

      // Reset rotation
      tl.to(
        gloveRef.current.rotation,
        {
          x: 0.3,
          z: 0,
          duration: duration * 1.5,
          ease: 'power2.inOut',
        },
        '<'
      )

      return tl
    },
    [refs]
  )

  /**
   * Anime un camera shake lors d'un impact
   */
  const animateCameraShake = useCallback(
    (intensity: number) => {
      const originalPos = { x: camera.position.x, y: camera.position.y }
      const shakeIntensity = intensity * 0.1

      gsap.to(camera.position, {
        x: originalPos.x + (Math.random() - 0.5) * shakeIntensity,
        y: originalPos.y + (Math.random() - 0.5) * shakeIntensity,
        duration: 0.05,
        repeat: 3,
        yoyo: true,
        ease: 'power2.inOut',
        onComplete: () => {
          camera.position.x = originalPos.x
          camera.position.y = originalPos.y
        },
      })
    },
    [camera]
  )

  /**
   * Anime un flash blanc sur impact critique
   */
  const animateCriticalFlash = useCallback(() => {
    // On utilise un div overlay pour le flash
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
      { opacity: 0.8 },
      {
        opacity: 0,
        duration: 0.2,
        ease: 'power2.out',
        onComplete: () => flash.remove(),
      }
    )
  }, [])

  /**
   * Anime un slow-motion temporaire
   */
  const animateSlowMotion = useCallback((duration: number = 0.3) => {
    // Ralentir toutes les animations GSAP
    gsap.globalTimeline.timeScale(0.3)

    gsap.delayedCall(duration, () => {
      gsap.to(gsap.globalTimeline, {
        timeScale: 1,
        duration: 0.2,
        ease: 'power2.out',
      })
    })
  }, [])

  /**
   * Animation complète d'un coup avec tous les effets
   */
  const performPunch = useCallback(
    (
      type: PunchType,
      hand: 'left' | 'right',
      velocity: number,
      isCritical: boolean
    ) => {
      // Animation du gant
      animatePunch(type, hand, velocity)

      // Camera shake proportionnel à la force
      animateCameraShake(velocity)

      // Effets spéciaux pour coups critiques
      if (isCritical) {
        animateCriticalFlash()
        animateSlowMotion(0.2)
      }
    },
    [animatePunch, animateCameraShake, animateCriticalFlash, animateSlowMotion]
  )

  /**
   * Arrête l'animation en cours
   */
  const stopAnimation = useCallback(() => {
    if (currentTimeline.current) {
      currentTimeline.current.kill()
      currentTimeline.current = null
      isAnimating.current = false
    }
  }, [])

  return {
    animatePunch,
    animateCameraShake,
    animateCriticalFlash,
    animateSlowMotion,
    performPunch,
    stopAnimation,
    isAnimating: isAnimating.current,
  }
}
