import { useControls, folder, button } from 'leva'
import { useEffect } from 'react'
import {
  useJellyStore,
  DEFAULT_JELLY_PARAMS,
  useTextureSettingsStore,
  DEFAULT_TEXTURE_SETTINGS,
} from '../stores'

/**
 * Composant de contrôles GUI pour les paramètres jelly et texture
 * Utilise leva pour l'interface et synchronise avec les stores Zustand
 */
export function JellyControls() {
  const setJellyParams = useJellyStore((state) => state.setParams)
  const resetJelly = useJellyStore((state) => state.reset)

  const setTextureSettings = useTextureSettingsStore((state) => state.setSettings)
  const resetTexture = useTextureSettingsStore((state) => state.reset)

  // Contrôles pour l'effet jelly (réduit - seulement les paramètres essentiels)
  const jellyValues = useControls({
    'Effet Jelly': folder(
      {
        wobbleSpeed: {
          value: DEFAULT_JELLY_PARAMS.wobbleSpeed,
          min: 0,
          max: 5,
          step: 0.1,
          label: 'Vitesse idle',
        },
        wobbleAmplitude: {
          value: DEFAULT_JELLY_PARAMS.wobbleAmplitude,
          min: 0,
          max: 0.1,
          step: 0.001,
          label: 'Amplitude idle',
        },
        jellyDamping: {
          value: DEFAULT_JELLY_PARAMS.jellyDamping,
          min: 0.5,
          max: 8,
          step: 0.1,
          label: 'Amortissement impact',
        },
        'Reset Jelly': button(() => resetJelly()),
      },
      { collapsed: true }
    ),
  })

  // Contrôles pour la texture (zoom et position - réduit)
  const textureValues = useControls({
    'Texture Visage': folder(
      {
        zoom: {
          value: DEFAULT_TEXTURE_SETTINGS.zoom,
          min: 0.5,
          max: 4,
          step: 0.1,
          label: 'Zoom',
        },
        offsetX: {
          value: DEFAULT_TEXTURE_SETTINGS.offsetX,
          min: -1,
          max: 1,
          step: 0.05,
          label: 'Horizontal',
        },
        offsetY: {
          value: DEFAULT_TEXTURE_SETTINGS.offsetY,
          min: -1,
          max: 1,
          step: 0.05,
          label: 'Vertical',
        },
        'Reset Texture': button(() => resetTexture()),
      },
      { collapsed: true }
    ),
  })

  // Synchroniser les valeurs jelly vers le store (avec valeurs par défaut pour les paramètres masqués)
  useEffect(() => {
    setJellyParams({
      wobbleSpeed: jellyValues.wobbleSpeed,
      wobbleAmplitude: jellyValues.wobbleAmplitude,
      wobbleFrequency: DEFAULT_JELLY_PARAMS.wobbleFrequency, // Valeur par défaut
      jellyDamping: jellyValues.jellyDamping,
      massGradient: DEFAULT_JELLY_PARAMS.massGradient, // Valeur par défaut
      jellySheen: DEFAULT_JELLY_PARAMS.jellySheen, // Valeur par défaut
    })
  }, [
    jellyValues.wobbleSpeed,
    jellyValues.wobbleAmplitude,
    jellyValues.jellyDamping,
    setJellyParams,
  ])

  // Synchroniser les valeurs texture vers le store
  useEffect(() => {
    setTextureSettings({
      zoom: textureValues.zoom,
      offsetX: textureValues.offsetX,
      offsetY: textureValues.offsetY,
    })
  }, [
    textureValues.zoom,
    textureValues.offsetX,
    textureValues.offsetY,
    setTextureSettings,
  ])

  return null // Leva s'affiche automatiquement
}

export default JellyControls
