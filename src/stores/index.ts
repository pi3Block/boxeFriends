export { useGameStore, DEFAULT_OPPONENT_TEXTURE, DEFAULT_TEXTURE_SETTINGS, PHYSICS_PRESETS, ROUND_DURATION } from './useGameStore'
export type { GameState, PunchType, PunchHand, QueuedPunch, TextureSettings, CombatTool, OpponentType, PhysicsPreset, PhysicsConfig, GlovePhysicsMode } from './useGameStore'

// Legacy - à supprimer après migration complète
export { useImpactStore } from './useImpactStore'
export type { Impact } from './useImpactStore'

// Nouveau système performant sans re-renders
export { ImpactManager } from '../systems/ImpactManager'
export type { ImpactListener } from '../systems/ImpactManager'

// Gestionnaire centralisé de physique Ammo.js
export { PhysicsSceneManager } from '../systems/PhysicsSceneManager'
export type { RigidBodyEntry, SoftBodyEntry, ConstraintEntry } from '../systems/PhysicsSceneManager'

// Gestionnaire centralisé des adversaires
export { OpponentManager } from '../systems/OpponentManager'

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
