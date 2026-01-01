/**
 * OpponentManager - Gestionnaire centralisé du cycle de vie des adversaires
 *
 * Responsabilités:
 * - Création et destruction propre des adversaires (soft bodies, meshes)
 * - Cleanup automatique lors des changements d'adversaire
 * - Gestion des ressources Three.js (geometries, materials, textures)
 * - Intégration avec PhysicsSceneManager pour la physique
 *
 * Usage:
 *   OpponentManager.initialize(scene, physicsWorld)
 *   OpponentManager.setOpponent('sphere', config)
 *   OpponentManager.destroy() // Cleanup complet
 */

import * as THREE from 'three'
import { PhysicsSceneManager } from './PhysicsSceneManager'
import type { OpponentType, PhysicsConfig } from '../stores'

// Types pour les ressources trackées
interface TrackedMesh {
  mesh: THREE.Mesh | THREE.Line | THREE.Object3D
  geometry?: THREE.BufferGeometry
  materials: THREE.Material[]
}

interface OpponentState {
  type: OpponentType | null
  mainMesh: THREE.Mesh | null
  softBodyId: string | null
  anchorId: string | null
  ropeIds: string[]
  trackedResources: TrackedMesh[]
}

// Catégories PhysicsSceneManager
const CATEGORY_OPPONENT = 'opponent'
const CATEGORY_OPPONENT_ROPE = 'opponent-rope'

class OpponentManagerClass {
  private scene: THREE.Scene | null = null
  private isInitialized = false

  // État actuel de l'adversaire
  private state: OpponentState = {
    type: null,
    mainMesh: null,
    softBodyId: null,
    anchorId: null,
    ropeIds: [],
    trackedResources: [],
  }

  // Callbacks pour notifier les changements
  private onChangeCallbacks: Array<(type: OpponentType | null) => void> = []

  /**
   * Initialiser le manager avec la scène Three.js
   */
  initialize(scene: THREE.Scene): void {
    if (this.isInitialized) {
      console.warn('[OpponentManager] Already initialized')
      return
    }

    this.scene = scene
    this.isInitialized = true
    console.log('[OpponentManager] Initialized')
  }

  /**
   * Vérifier si le manager est prêt
   */
  get isReady(): boolean {
    return this.isInitialized && PhysicsSceneManager.isReady
  }

  /**
   * Obtenir le type d'adversaire actuel
   */
  get currentType(): OpponentType | null {
    return this.state.type
  }

  /**
   * Obtenir le mesh principal de l'adversaire
   */
  get mainMesh(): THREE.Mesh | null {
    return this.state.mainMesh
  }

  /**
   * S'abonner aux changements d'adversaire
   */
  onChange(callback: (type: OpponentType | null) => void): () => void {
    this.onChangeCallbacks.push(callback)
    return () => {
      const idx = this.onChangeCallbacks.indexOf(callback)
      if (idx !== -1) this.onChangeCallbacks.splice(idx, 1)
    }
  }

  // =============================================
  // GESTION DU CYCLE DE VIE
  // =============================================

  /**
   * Définir un nouvel adversaire (avec cleanup automatique de l'ancien)
   */
  async setOpponent(
    type: OpponentType,
    mesh: THREE.Mesh,
    options?: {
      softBody?: any
      anchor?: { id: string; body: any }
      ropes?: Array<{ id: string; body: any; line: THREE.Line }>
    }
  ): Promise<void> {
    if (!this.isReady) {
      console.warn('[OpponentManager] Not ready, cannot set opponent')
      return
    }

    // Si même type, ne rien faire
    if (this.state.type === type && this.state.mainMesh === mesh) {
      console.log('[OpponentManager] Same opponent, skipping')
      return
    }

    console.log(`[OpponentManager] Switching opponent: ${this.state.type} -> ${type}`)

    // 1. Nettoyer l'ancien adversaire
    await this.cleanup()

    // 2. Configurer le nouvel état
    this.state.type = type
    this.state.mainMesh = mesh

    // 3. Tracker le mesh principal
    this.trackMesh(mesh)

    // 4. Enregistrer le soft body si fourni
    if (options?.softBody) {
      const softBodyId = `opponent-${type}`
      // Note: Le soft body est ajouté au monde par le code appelant (AmmoVolumeDemo)
      // On track juste l'ID pour le cleanup
      this.state.softBodyId = softBodyId
    }

    // 5. Enregistrer l'ancre si fournie
    if (options?.anchor) {
      PhysicsSceneManager.addRigidBody(
        options.anchor.id,
        options.anchor.body,
        undefined,
        CATEGORY_OPPONENT
      )
      this.state.anchorId = options.anchor.id
    }

    // 6. Enregistrer les cordes si fournies
    if (options?.ropes) {
      for (const rope of options.ropes) {
        this.trackMesh(rope.line)
        if (this.scene) {
          this.scene.add(rope.line)
        }
        // Note: Le soft body de la corde est géré séparément
        this.state.ropeIds.push(rope.id)
      }
    }

    // 7. Notifier les listeners
    this.notifyChange()

    console.log(`[OpponentManager] Opponent set: ${type}`)
  }

  /**
   * Nettoyer l'adversaire actuel
   */
  async cleanup(): Promise<void> {
    if (!this.state.type) {
      return
    }

    console.log(`[OpponentManager] Cleaning up opponent: ${this.state.type}`)

    // 1. Supprimer les cordes de la scène
    for (const resource of this.state.trackedResources) {
      if (resource.mesh instanceof THREE.Line && this.scene) {
        this.scene.remove(resource.mesh)
      }
    }

    // 2. Nettoyer via PhysicsSceneManager (categories)
    PhysicsSceneManager.clearCategory(CATEGORY_OPPONENT)
    PhysicsSceneManager.clearCategory(CATEGORY_OPPONENT_ROPE)

    // 3. Disposer les ressources Three.js
    this.disposeAllResources()

    // 4. Reset l'état
    this.state = {
      type: null,
      mainMesh: null,
      softBodyId: null,
      anchorId: null,
      ropeIds: [],
      trackedResources: [],
    }

    console.log('[OpponentManager] Cleanup complete')
  }

  /**
   * Détruire complètement le manager
   */
  destroy(): void {
    this.cleanup()
    this.scene = null
    this.isInitialized = false
    this.onChangeCallbacks = []
    console.log('[OpponentManager] Destroyed')
  }

  // =============================================
  // TRACKING DES RESSOURCES THREE.JS
  // =============================================

  /**
   * Tracker un mesh pour cleanup ultérieur
   */
  trackMesh(mesh: THREE.Mesh | THREE.Line | THREE.Object3D): void {
    const tracked: TrackedMesh = {
      mesh,
      materials: [],
    }

    // Extraire la géométrie
    if ('geometry' in mesh && mesh.geometry) {
      tracked.geometry = mesh.geometry as THREE.BufferGeometry
    }

    // Extraire les matériaux
    if ('material' in mesh) {
      const mat = mesh.material
      if (Array.isArray(mat)) {
        tracked.materials = mat
      } else if (mat) {
        tracked.materials = [mat as THREE.Material]
      }
    }

    this.state.trackedResources.push(tracked)
  }

  /**
   * Tracker une géométrie seule (pour remplacement)
   */
  trackGeometry(geometry: THREE.BufferGeometry): void {
    this.state.trackedResources.push({
      mesh: new THREE.Object3D(), // Placeholder
      geometry,
      materials: [],
    })
  }

  /**
   * Disposer toutes les ressources trackées
   */
  private disposeAllResources(): void {
    for (const resource of this.state.trackedResources) {
      // Disposer la géométrie
      if (resource.geometry) {
        resource.geometry.dispose()
      }

      // Disposer les matériaux
      for (const material of resource.materials) {
        this.disposeMaterial(material)
      }
    }

    this.state.trackedResources = []
  }

  /**
   * Disposer un matériau et ses textures
   */
  private disposeMaterial(material: THREE.Material): void {
    // Disposer les textures du matériau
    if (material instanceof THREE.MeshStandardMaterial) {
      if (material.map) material.map.dispose()
      if (material.normalMap) material.normalMap.dispose()
      if (material.roughnessMap) material.roughnessMap.dispose()
      if (material.metalnessMap) material.metalnessMap.dispose()
      if (material.aoMap) material.aoMap.dispose()
      if (material.emissiveMap) material.emissiveMap.dispose()
      if (material.envMap) material.envMap.dispose()
    }

    // Disposer le matériau lui-même
    material.dispose()
  }

  // =============================================
  // HELPERS POUR CRÉATION D'ADVERSAIRES
  // =============================================

  /**
   * Créer une géométrie d'adversaire selon le type
   */
  createOpponentGeometry(
    type: OpponentType,
    _config?: PhysicsConfig
  ): THREE.BufferGeometry | null {
    switch (type) {
      case 'sphere':
        return new THREE.IcosahedronGeometry(1.5, 5)

      case 'box':
        return new THREE.BoxGeometry(2.5, 2.5, 2.5, 10, 10, 10)

      case 'fluffy':
        return new THREE.IcosahedronGeometry(1.8, 4)

      case 'littlemac':
        // Capsule-like pour personnage
        return new THREE.CapsuleGeometry(0.8, 1.5, 8, 16)

      default:
        return null
    }
  }

  /**
   * Remplacer la géométrie du mesh principal
   * Dispose l'ancienne géométrie automatiquement
   */
  replaceGeometry(newGeometry: THREE.BufferGeometry): void {
    if (!this.state.mainMesh) {
      console.warn('[OpponentManager] No main mesh to replace geometry')
      return
    }

    // Disposer l'ancienne géométrie
    const oldGeometry = this.state.mainMesh.geometry
    if (oldGeometry) {
      oldGeometry.dispose()
    }

    // Assigner la nouvelle
    this.state.mainMesh.geometry = newGeometry

    // Tracker la nouvelle pour cleanup futur
    this.trackGeometry(newGeometry)
  }

  // =============================================
  // UTILITAIRES
  // =============================================

  private notifyChange(): void {
    for (const callback of this.onChangeCallbacks) {
      callback(this.state.type)
    }
  }

  /**
   * Obtenir des stats pour debug
   */
  getStats(): {
    type: OpponentType | null
    trackedResources: number
    ropeCount: number
  } {
    return {
      type: this.state.type,
      trackedResources: this.state.trackedResources.length,
      ropeCount: this.state.ropeIds.length,
    }
  }

  /**
   * Logger l'état actuel
   */
  logState(): void {
    console.log('[OpponentManager] State:')
    console.log('  Type:', this.state.type)
    console.log('  Main Mesh:', this.state.mainMesh ? 'yes' : 'no')
    console.log('  Soft Body ID:', this.state.softBodyId)
    console.log('  Anchor ID:', this.state.anchorId)
    console.log('  Rope IDs:', this.state.ropeIds)
    console.log('  Tracked Resources:', this.state.trackedResources.length)
  }
}

// Singleton exporté
export const OpponentManager = new OpponentManagerClass()
