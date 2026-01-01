import { useRef, useEffect, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useImpactListener } from '../hooks/useImpactListener'
// NOTE: On n'utilise PAS useAmmoPhysics car il crée un monde physique DIFFÉRENT
// On utilise le monde physique exposé par AmmoVolumeDemo via window.__ammoPhysicsWorld

/**
 * BrickWallOpponent - Mur de briques destructible
 *
 * Basé EXACTEMENT sur l'exemple three.js physics_ammo_rope.html
 * Les briques sont des rigid bodies Ammo.js qui entrent en collision
 * avec les balles lancées par le joueur.
 */

// =============================================
// CONFIGURATION DU MUR (basée sur l'exemple)
// =============================================

const WALL_CONFIG = {
  // Dimensions des briques (taille moyenne)
  brickLength: 1.0,           // Longueur de la brique (direction X)
  brickDepth: 0.5,            // Profondeur (direction Z)
  brickHeight: 0.5,           // Hauteur

  // Structure du mur
  numBricksLength: 6,         // Nombre de briques en largeur
  numBricksHeight: 7,         // Nombre de rangées

  // Physique
  brickMass: 0.5,
  margin: 0.02,               // Marge collision Ammo.js

  // Position - le mur est posé sur le sol
  wallZ: 1.5,                 // Position Z (proche du joueur)
  wallBaseY: 0,               // Base du mur au niveau du sol

  // Reset
  fallThreshold: -2,          // Y en dessous duquel une brique est "tombée" (sous le sol)
  resetDelay: 15000,          // Délai avant reset (ms)
  resetThreshold: 0.7,        // % de briques tombées pour trigger reset
}

// =============================================
// TYPES
// =============================================

interface BrickMeshData {
  mesh: THREE.Mesh
  body: any  // Ammo.btRigidBody
  initialPos: THREE.Vector3
}

interface BrickWallOpponentProps {
  textureUrl?: string | null
}

// Liste globale des rigid bodies pour la synchronisation (comme dans l'exemple)
const rigidBodiesList: Array<{ mesh: THREE.Mesh; body: any }> = []

// =============================================
// COMPOSANT PRINCIPAL
// =============================================

export function BrickWallOpponent({ textureUrl: _textureUrl }: BrickWallOpponentProps) {
  // NOTE: On n'utilise PAS useAmmoPhysics() car il crée son propre monde physique
  // On utilise le monde physique d'AmmoVolumeDemo exposé via window.__ammoPhysicsWorld

  // Refs (utiliser une ref au lieu de state pour éviter les re-renders en boucle)
  const bricksRef = useRef<BrickMeshData[]>([])
  const groupRef = useRef<THREE.Group>(null)
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null)
  const ammoRef = useRef<any>(null)
  const physicsWorldRef = useRef<any>(null)
  const transformAuxRef = useRef<any>(null)
  const isInitializedRef = useRef(false)
  const isInitializingRef = useRef(false) // Guard pour éviter double init

  // Couleur aléatoire pour chaque brique (comme dans l'exemple)
  const createRandomColor = useCallback(() => {
    return Math.floor(Math.random() * (1 << 24))
  }, [])

  // Créer un matériau avec couleur aléatoire
  const createMaterial = useCallback(() => {
    return new THREE.MeshPhongMaterial({ color: createRandomColor() })
  }, [createRandomColor])

  /**
   * Créer un parallélépipède avec rigid body (EXACTEMENT comme l'exemple)
   */
  const createParalellepiped = useCallback((
    sx: number, sy: number, sz: number,
    mass: number,
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
    material: THREE.Material
  ): THREE.Mesh | null => {
    const Ammo = ammoRef.current
    const physicsWorld = physicsWorldRef.current
    if (!Ammo || !physicsWorld) return null

    // Créer le mesh Three.js
    const threeObject = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz, 1, 1, 1),
      material
    )

    // Créer la forme de collision Ammo.js
    // IMPORTANT: Détruire le btVector3 temporaire après utilisation (cf. CLAUDE.md)
    const halfExtents = new Ammo.btVector3(sx * 0.5, sy * 0.5, sz * 0.5)
    const shape = new Ammo.btBoxShape(halfExtents)
    Ammo.destroy(halfExtents)
    shape.setMargin(WALL_CONFIG.margin)

    // Créer le rigid body (EXACTEMENT comme l'exemple)
    createRigidBody(Ammo, physicsWorld, threeObject, shape, mass, pos, quat)

    return threeObject
  }, [])

  /**
   * Créer un rigid body (EXACTEMENT comme l'exemple)
   * IMPORTANT: Détruit les objets Ammo temporaires pour éviter les fuites mémoire (cf. CLAUDE.md)
   */
  const createRigidBody = useCallback((
    Ammo: any,
    physicsWorld: any,
    threeObject: THREE.Mesh,
    physicsShape: any,
    mass: number,
    pos: THREE.Vector3,
    quat: THREE.Quaternion
  ) => {
    threeObject.position.copy(pos)
    threeObject.quaternion.copy(quat)

    // Créer les vecteurs temporaires
    const btOrigin = new Ammo.btVector3(pos.x, pos.y, pos.z)
    const btRotation = new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w)
    const localInertia = new Ammo.btVector3(0, 0, 0)

    const transform = new Ammo.btTransform()
    transform.setIdentity()
    transform.setOrigin(btOrigin)
    transform.setRotation(btRotation)
    const motionState = new Ammo.btDefaultMotionState(transform)

    physicsShape.calculateLocalInertia(mass, localInertia)

    const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, physicsShape, localInertia)
    const body = new Ammo.btRigidBody(rbInfo)

    // Nettoyer les objets temporaires (CRITICAL pour éviter fuites mémoire)
    Ammo.destroy(btOrigin)
    Ammo.destroy(btRotation)
    Ammo.destroy(localInertia)
    Ammo.destroy(rbInfo)

    threeObject.userData.physicsBody = body

    if (mass > 0) {
      rigidBodiesList.push({ mesh: threeObject, body })
      // Disable deactivation (comme dans l'exemple)
      body.setActivationState(4)
    }

    // Ajouter au monde SANS groupes de collision (comme dans l'exemple)
    physicsWorld.addRigidBody(body)

    return body
  }, [])

  /**
   * Initialise le mur de briques
   * Adapté de l'exemple pour ce jeu:
   * - Le mur s'étend le long de l'axe X (face au joueur)
   * - Le joueur regarde vers -Z, donc le mur est épais en Z
   * - Position à Z = wallZ (configurable) pour être devant le joueur
   */
  const initializeWall = useCallback(() => {
    const Ammo = ammoRef.current
    const physicsWorld = physicsWorldRef.current
    if (!Ammo || !physicsWorld || !groupRef.current) return

    // Guard contre double initialisation
    if (isInitializedRef.current || isInitializingRef.current) {
      console.log('[BrickWall] Already initialized or initializing, skipping')
      return
    }
    isInitializingRef.current = true

    console.log('[BrickWall] Initializing wall (adapted for game)...')

    const { brickLength, brickDepth, brickHeight, numBricksLength, numBricksHeight, brickMass, wallBaseY, wallZ } = WALL_CONFIG

    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion(0, 0, 0, 1)

    // Centre du mur sur l'axe X (s'étend de gauche à droite)
    const x0 = -numBricksLength * brickLength * 0.5

    // Position initiale
    pos.set(x0, wallBaseY + brickHeight * 0.5, wallZ)

    const newBricks: BrickMeshData[] = []

    for (let j = 0; j < numBricksHeight; j++) {
      const oddRow = (j % 2) === 1

      pos.x = x0

      if (oddRow) {
        pos.x -= 0.25 * brickLength
      }

      const nRow = oddRow ? numBricksLength + 1 : numBricksLength

      for (let i = 0; i < nRow; i++) {
        let brickLengthCurrent = brickLength
        let brickMassCurrent = brickMass

        // Demi-briques aux extrémités des rangées impaires
        if (oddRow && (i === 0 || i === nRow - 1)) {
          brickLengthCurrent *= 0.5
          brickMassCurrent *= 0.5
        }

        // Créer la brique
        // Pour ce jeu: brique longue en X, épaisse en Z
        // X = longueur de la brique, Y = hauteur, Z = profondeur (épaisseur)
        const brick = createParalellepiped(
          brickLengthCurrent,   // sx (X) - longueur de la brique
          brickHeight,          // sy (Y) - hauteur
          brickDepth,           // sz (Z) - épaisseur (vers le joueur)
          brickMassCurrent,
          pos.clone(),
          quat,
          createMaterial()
        )

        if (brick) {
          brick.castShadow = true
          brick.receiveShadow = true
          groupRef.current!.add(brick)

          newBricks.push({
            mesh: brick,
            body: brick.userData.physicsBody,
            initialPos: pos.clone(),
          })
        }

        // Avancer la position X pour la prochaine brique
        if (oddRow && (i === 0 || i === nRow - 2)) {
          pos.x += 0.75 * brickLength
        } else {
          pos.x += brickLength
        }
      }

      // Monter d'une rangée
      pos.y += brickHeight
    }

    bricksRef.current = newBricks
    console.log(`[BrickWall] Created ${newBricks.length} bricks at Z=${wallZ}`)
    isInitializedRef.current = true
    isInitializingRef.current = false
  }, [createParalellepiped, createMaterial])

  /**
   * Nettoyer le mur
   */
  const cleanupWall = useCallback(() => {
    const physicsWorld = physicsWorldRef.current

    // Supprimer les rigid bodies du monde physique
    for (const brick of bricksRef.current) {
      if (physicsWorld && brick.body) {
        try {
          physicsWorld.removeRigidBody(brick.body)
        } catch (e) {
          console.warn('[BrickWall] Error removing rigid body:', e)
        }
      }

      // Supprimer de la liste globale
      const idx = rigidBodiesList.findIndex(rb => rb.body === brick.body)
      if (idx !== -1) rigidBodiesList.splice(idx, 1)
    }

    // Supprimer les meshes du groupe
    if (groupRef.current) {
      while (groupRef.current.children.length > 0) {
        const child = groupRef.current.children[0]
        groupRef.current.remove(child)
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      }
    }

    bricksRef.current = []
    isInitializedRef.current = false
    isInitializingRef.current = false
  }, [])

  /**
   * Reset le mur
   */
  const resetWall = useCallback(() => {
    console.log('[BrickWall] Resetting wall...')
    cleanupWall()
    setTimeout(() => {
      initializeWall()
    }, 100)
  }, [cleanupWall, initializeWall])

  /**
   * Compter les briques tombées
   */
  const countFallenBricks = useCallback((): number => {
    let fallen = 0
    for (const brick of bricksRef.current) {
      if (brick.mesh.position.y < WALL_CONFIG.fallThreshold) {
        fallen++
      }
    }
    return fallen
  }, [])

  // Effet: attendre que AmmoVolumeDemo expose son monde physique, puis initialiser le mur
  // Utilise le polling car AmmoVolumeDemo initialise son propre Ammo.js indépendamment
  useEffect(() => {
    let pollTimer: NodeJS.Timeout | null = null
    let isMounted = true

    const checkAmmoAndInit = () => {
      if (!isMounted) return

      // Attendre que AmmoVolumeDemo expose son monde physique
      const ammoInst = (window as any).__ammoInstance
      const physicsWorld = (window as any).__ammoPhysicsWorld

      if (ammoInst && physicsWorld) {
        ammoRef.current = ammoInst
        physicsWorldRef.current = physicsWorld
        transformAuxRef.current = new ammoInst.btTransform()

        // Initialiser le mur une seule fois
        if (!isInitializedRef.current && !isInitializingRef.current) {
          console.log('[BrickWall] AmmoVolumeDemo physics world ready, initializing wall...')
          initializeWall()
        }
      } else {
        // Réessayer - AmmoVolumeDemo n'a pas encore initialisé Ammo.js
        pollTimer = setTimeout(checkAmmoAndInit, 100)
      }
    }

    checkAmmoAndInit()

    return () => {
      // Cleanup quand le composant est démonté
      isMounted = false
      if (pollTimer) {
        clearTimeout(pollTimer)
      }
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current)
      }
      cleanupWall()
    }
  }, []) // Dépendances vides - s'exécute une seule fois au montage

  // Écouter les impacts des gants (en plus des collisions physiques)
  useImpactListener((impact) => {
    if (!isInitializedRef.current || !ammoRef.current) return

    const Ammo = ammoRef.current
    const hitWorldPos = new THREE.Vector3(
      impact.hitPoint[0],
      impact.hitPoint[1],
      impact.hitPoint[2]
    )

    // Trouver les briques proches et appliquer une impulsion
    const impactRadius = 1.5
    for (const brick of bricksRef.current) {
      const distance = brick.mesh.position.distanceTo(hitWorldPos)
      if (distance < impactRadius && brick.body) {
        const falloff = 1 - distance / impactRadius
        const strength = impact.strength * falloff

        // Impulsion vers l'arrière (direction -Z) et vers le haut
        const impulse = new Ammo.btVector3(
          hitWorldPos.x * 2 * strength,
          3 + strength * 5,
          -10 * strength
        )
        brick.body.applyCentralImpulse(impulse)
        Ammo.destroy(impulse)
      }
    }
  })

  // Boucle de rendu: synchroniser meshes et vérifier reset
  useFrame(() => {
    if (!isInitializedRef.current || !transformAuxRef.current) return

    const transformAux = transformAuxRef.current

    // Synchroniser les positions des meshes avec les rigid bodies
    // (EXACTEMENT comme updatePhysics dans l'exemple)
    for (const brick of bricksRef.current) {
      const body = brick.body
      if (!body) continue

      const ms = body.getMotionState()
      if (ms) {
        ms.getWorldTransform(transformAux)
        const p = transformAux.getOrigin()
        const q = transformAux.getRotation()
        brick.mesh.position.set(p.x(), p.y(), p.z())
        brick.mesh.quaternion.set(q.x(), q.y(), q.z(), q.w())
      }
    }

    // Vérifier si on doit reset le mur
    const totalBricks = bricksRef.current.length
    if (totalBricks === 0) return

    const fallenBricks = countFallenBricks()
    const fallenRatio = fallenBricks / totalBricks

    if (fallenRatio >= WALL_CONFIG.resetThreshold && !resetTimerRef.current) {
      console.log(`[BrickWall] ${Math.round(fallenRatio * 100)}% bricks fallen, scheduling reset...`)
      resetTimerRef.current = setTimeout(() => {
        resetTimerRef.current = null
        resetWall()
      }, WALL_CONFIG.resetDelay)
    }
  })

  return (
    <group ref={groupRef} name="brick-wall-opponent">
      {/* Les meshes sont ajoutés dynamiquement via initializeWall */}
    </group>
  )
}

export default BrickWallOpponent
