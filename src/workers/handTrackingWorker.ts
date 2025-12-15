/**
 * Web Worker pour le hand tracking MediaPipe
 * Worker classique (non-module) pour compatibilité avec importScripts()
 *
 * NOTE: Ce fichier sera bundlé par Vite et converti en classic worker
 */

// Types pour la communication avec le thread principal
export interface WorkerMessage {
  type: 'init' | 'process' | 'setOptions' | 'stop'
  payload?: ImageBitmap | HandTrackingOptions
  timestamp?: number
}

export interface WorkerResponse {
  type: 'ready' | 'result' | 'error' | 'stopped'
  payload?: HandTrackingResult
  error?: string
}

export interface HandTrackingOptions {
  numHands?: number
  minDetectionConfidence?: number
  minTrackingConfidence?: number
}

export interface DetectedHand {
  handedness: 'Left' | 'Right'
  landmarks: { x: number; y: number; z: number }[]
  worldLandmarks: { x: number; y: number; z: number }[]
}

export interface HandTrackingResult {
  hands: DetectedHand[]
  timestamp: number
  processingTime: number
}

// Ce fichier exporte seulement les types
// L'implémentation réelle est dans handTrackingWorkerImpl.js
