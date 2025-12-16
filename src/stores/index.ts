export { useGameStore, DEFAULT_OPPONENT_TEXTURE, DEFAULT_TEXTURE_SETTINGS } from './useGameStore'
export type { GameState, PunchType, TextureSettings } from './useGameStore'

export { useImpactStore } from './useImpactStore'
export type { Impact } from './useImpactStore'

export { useCharacterStore, useSelectedCharacter } from './useCharacterStore'
export type { CharacterConfig } from './useCharacterStore'

export { useJellyStore, DEFAULT_JELLY_PARAMS } from './useJellyStore'
export type { JellyParams } from './useJellyStore'

export { useFacialStore, ARKIT_BLEND_SHAPES, FACIAL_PRESETS } from './useFacialStore'
export type { BlendShapeName, FacialState, FacialPresetName } from './useFacialStore'

export { useHandTrackingStore } from './useHandTrackingStore'
export type { HandState, CameraPermission } from './useHandTrackingStore'

export { useJellyPhysicsStore } from './useJellyPhysicsStore'

export { useCartoonEffectsStore } from './useCartoonEffectsStore'
export type { CartoonEffectType, ActiveEffect } from './useCartoonEffectsStore'

export { useFluffySoftBodyStore, DEFAULT_FLUFFY_CONFIG } from './useFluffySoftBodyStore'
export type { FluffyConfig } from './useFluffySoftBodyStore'
