import { useRef, useEffect, useMemo, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore, ImpactManager } from '../stores'
import type { PunchType } from '../stores'
import { usePhysicsCategory } from '../hooks/usePhysicsScene'
import { PhysicsSceneManager } from '../systems/PhysicsSceneManager'

/**
 * PhysicsGloves - Gants avec physique Ammo.js native
 *
 * Architecture:
 * - Ancres STATIC (mass=0) aux positions de garde
 * - Gants DYNAMIC (mass>0) attachés aux ancres par spring constraints
 * - Collisions gérées nativement par Ammo.js (pas de tunneling)
 * - Impulsions pour les coups, ressorts pour le retour
 */

// Positions de garde (repos)
const LEFT_REST_POS = new THREE.Vector3(-0.8, 3.0, 4.0)
const RIGHT_REST_POS = new THREE.Vector3(0.8, 3.0, 4.0)

// Configuration des impulsions par type de coup
// Forces augmentées pour vaincre la résistance du ressort
const PUNCH_IMPULSES = {
  jab: {
    direction: new THREE.Vector3(0, 0, -1),
    force: 12,  // Force importante pour mouvement visible
  },
  hook: {
    getDirection: (side: 'left' | 'right') =>
      new THREE.Vector3(
        side === 'left' ? 0.5 : -0.5,
        0.1,
        -0.9
      ).normalize(),
    force: 15,
  },
  uppercut: {
    direction: new THREE.Vector3(0, 0.6, -0.7).normalize(),
    force: 18,
  },
}

// Configuration du ressort - faible raideur pour permettre le mouvement
const SPRING_CONFIG = {
  stiffness: 30,     // Très faible pour laisser le gant aller loin
  damping: 3,        // Faible pour retour lent et visible
  linearLimit: 5.0,  // Large limite pour atteindre le sac (distance ~2.5)
}

// Rayon du gant pour collision
const GLOVE_RADIUS = 0.4

// Couleurs des gants selon l'état
const GLOVE_COLORS = {
  rest: new THREE.Color(0xcc0000),
  jab: new THREE.Color(0xff4400),
  hook: new THREE.Color(0xffaa00),
  uppercut: new THREE.Color(0xff00aa),
}

/**
 * Composant PhysicsGloves
 * Utilise PhysicsSceneManager pour la gestion centralisée de la physique
 */
export function PhysicsGloves() {
  // Hook de gestion de la physique avec cleanup automatique
  const { isReady, addRigidBody, addConstraint } = usePhysicsCategory('gloves')

  // Refs pour les meshes Three.js
  const leftGloveRef = useRef<THREE.Mesh>(null)
  const rightGloveRef = useRef<THREE.Mesh>(null)

  // Refs pour les rigid bodies Ammo
  const leftGloveBodyRef = useRef<any>(null)
  const rightGloveBodyRef = useRef<any>(null)
  const leftAnchorBodyRef = useRef<any>(null)
  const rightAnchorBodyRef = useRef<any>(null)

  // Refs pour les spring constraints
  const leftSpringRef = useRef<any>(null)
  const rightSpringRef = useRef<any>(null)

  // Ref pour le transform réutilisable
  const transformAuxRef = useRef<any>(null)

  // État d'initialisation
  const initializedRef = useRef(false)

  // Cooldown pour éviter les impacts multiples
  const leftImpactCooldownRef = useRef(0)
  const rightImpactCooldownRef = useRef(0)

  // Vitesse précédente pour détecter les collisions (chute de vitesse = impact)
  const leftPrevSpeedRef = useRef(0)
  const rightPrevSpeedRef = useRef(0)

  // État du store
  const gameState = useGameStore((state) => state.gameState)
  const selectedTool = useGameStore((state) => state.selectedTool)
  const queuedPunch = useGameStore((state) => state.queuedPunch)
  const consumeQueuedPunch = useGameStore((state) => state.consumeQueuedPunch)

  // Vecteurs réutilisables (évite GC)
  const impulseVec = useMemo(() => new THREE.Vector3(), [])

  /**
   * Initialiser les rigid bodies et spring constraints
   * Utilise PhysicsSceneManager pour la gestion centralisée
   */
  useEffect(() => {
    // Attendre que PhysicsSceneManager soit prêt
    if (!isReady || initializedRef.current) return

    const Ammo = PhysicsSceneManager.getAmmo()
    const physicsWorld = PhysicsSceneManager.getWorld()

    if (!Ammo || !physicsWorld) {
      console.warn('[PhysicsGloves] PhysicsSceneManager not fully ready')
      return
    }

    initializedRef.current = true
    transformAuxRef.current = new Ammo.btTransform()

    console.log('[PhysicsGloves] Creating DYNAMIC gloves with spring constraints via PhysicsSceneManager...')

    // === Créer les ancres (STATIC, invisibles) ===
    const createAnchor = (pos: THREE.Vector3, id: string) => {
      const shape = new Ammo.btSphereShape(0.1)
      const transform = new Ammo.btTransform()
      transform.setIdentity()
      transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z))
      const motionState = new Ammo.btDefaultMotionState(transform)
      const localInertia = new Ammo.btVector3(0, 0, 0)
      const rbInfo = new Ammo.btRigidBodyConstructionInfo(0, motionState, shape, localInertia)
      const body = new Ammo.btRigidBody(rbInfo)

      // Enregistrer dans PhysicsSceneManager (ajoute aussi au world)
      addRigidBody(id, body)

      return body
    }

    leftAnchorBodyRef.current = createAnchor(LEFT_REST_POS, 'left-anchor')
    rightAnchorBodyRef.current = createAnchor(RIGHT_REST_POS, 'right-anchor')

    // === Créer les gants (DYNAMIC) ===
    const createGlove = (pos: THREE.Vector3, mass: number, id: string, mesh: THREE.Mesh | null) => {
      const shape = new Ammo.btSphereShape(GLOVE_RADIUS)
      shape.setMargin(0.05)
      const transform = new Ammo.btTransform()
      transform.setIdentity()
      transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z))
      const motionState = new Ammo.btDefaultMotionState(transform)
      const localInertia = new Ammo.btVector3(0, 0, 0)
      shape.calculateLocalInertia(mass, localInertia)
      const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia)
      const body = new Ammo.btRigidBody(rbInfo)

      // Configuration du gant
      body.setFriction(0.5)
      body.setRestitution(0.3)
      body.setDamping(0.05, 0.05)  // Damping très bas pour permettre le mouvement
      body.setActivationState(4) // DISABLE_DEACTIVATION

      // Désactiver la gravité sur les gants - les ressorts gèrent tout
      const zeroGravity = new Ammo.btVector3(0, 0, 0)
      body.setGravity(zeroGravity)
      Ammo.destroy(zeroGravity)

      // CCD pour éviter le tunneling à haute vitesse
      body.setCcdMotionThreshold(GLOVE_RADIUS * 0.5)
      body.setCcdSweptSphereRadius(GLOVE_RADIUS * 0.8)

      // Enregistrer dans PhysicsSceneManager (ajoute aussi au world)
      addRigidBody(id, body, mesh ?? undefined)

      return body
    }

    leftGloveBodyRef.current = createGlove(LEFT_REST_POS, 1.0, 'left-glove', leftGloveRef.current)
    rightGloveBodyRef.current = createGlove(RIGHT_REST_POS, 1.0, 'right-glove', rightGloveRef.current)

    // === Créer les spring constraints ===
    const createSpring = (anchorBody: any, gloveBody: any, id: string) => {
      const frameInA = new Ammo.btTransform()
      frameInA.setIdentity()
      const frameInB = new Ammo.btTransform()
      frameInB.setIdentity()

      const spring = new Ammo.btGeneric6DofSpringConstraint(
        anchorBody,
        gloveBody,
        frameInA,
        frameInB,
        true // useLinearReferenceFrameA
      )

      // Limites de mouvement (liberté dans toutes les directions)
      const limit = SPRING_CONFIG.linearLimit
      spring.setLinearLowerLimit(new Ammo.btVector3(-limit, -limit, -limit))
      spring.setLinearUpperLimit(new Ammo.btVector3(limit, limit, limit))

      // Activer les ressorts sur les 3 axes linéaires
      for (let i = 0; i < 3; i++) {
        spring.enableSpring(i, true)
        spring.setStiffness(i, SPRING_CONFIG.stiffness)
        spring.setDamping(i, SPRING_CONFIG.damping)
      }

      // Définir l'équilibre = position actuelle (garde)
      spring.setEquilibriumPoint()

      // Enregistrer dans PhysicsSceneManager (ajoute aussi au world)
      addConstraint(id, spring)

      return spring
    }

    leftSpringRef.current = createSpring(leftAnchorBodyRef.current, leftGloveBodyRef.current, 'left-spring')
    rightSpringRef.current = createSpring(rightAnchorBodyRef.current, rightGloveBodyRef.current, 'right-spring')

    console.log('[PhysicsGloves] Spring constraints created via PhysicsSceneManager')

    // Cleanup géré automatiquement par usePhysicsCategory('gloves')
    return () => {
      initializedRef.current = false
      console.log('[PhysicsGloves] Component unmounting (cleanup by PhysicsSceneManager)')
    }
  }, [isReady, addRigidBody, addConstraint])

  /**
   * Appliquer une impulsion pour un coup
   * Utilise PhysicsSceneManager pour accéder à Ammo
   */
  const executePunch = useCallback((type: PunchType, side: 'left' | 'right') => {
    const Ammo = PhysicsSceneManager.getAmmo()
    const body = side === 'left' ? leftGloveBodyRef.current : rightGloveBodyRef.current
    if (!Ammo || !body) return

    // Calculer la direction et la force
    const config = PUNCH_IMPULSES[type]
    let direction: THREE.Vector3

    if (type === 'hook') {
      direction = config.getDirection(side)
    } else {
      direction = config.direction.clone()
    }

    // Appliquer un peu de variation latérale selon le côté
    if (type !== 'hook') {
      direction.x += side === 'left' ? 0.15 : -0.15
      direction.normalize()
    }

    impulseVec.copy(direction).multiplyScalar(config.force)

    const btImpulse = new Ammo.btVector3(impulseVec.x, impulseVec.y, impulseVec.z)
    body.applyCentralImpulse(btImpulse)
    Ammo.destroy(btImpulse)

    console.log(`[PhysicsGloves] ${side} ${type} - impulse applied`)
  }, [impulseVec])

  /**
   * Gérer les punches de l'UI
   */
  useEffect(() => {
    if (queuedPunch && selectedTool === 'gloves' && gameState === 'FIGHTING') {
      const punch = consumeQueuedPunch()
      if (punch) {
        executePunch(punch.type, punch.hand)
      }
    }
  }, [queuedPunch, selectedTool, gameState, consumeQueuedPunch, executePunch])

  /**
   * Gérer les clics pour déclencher les coups
   */
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (gameState !== 'FIGHTING' || selectedTool !== 'gloves') return

      const target = event.target as HTMLElement
      if (target.tagName !== 'CANVAS') return

      // Coordonnées normalisées
      const normalizedX = (event.clientX / window.innerWidth) * 2 - 1
      const normalizedY = -(event.clientY / window.innerHeight) * 2 + 1

      // Déterminer le type de coup selon la zone Y
      let punchType: PunchType
      if (normalizedY > 0.33) {
        punchType = 'hook'
      } else if (normalizedY < -0.33) {
        punchType = 'uppercut'
      } else {
        punchType = 'jab'
      }

      // Déterminer le côté selon X
      const side = normalizedX < 0 ? 'left' : 'right'

      executePunch(punchType, side)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [gameState, selectedTool, executePunch])

  /**
   * Boucle de mise à jour
   * Utilise le transform stocké localement (créé à l'init)
   */
  useFrame((_, delta) => {
    const transform = transformAuxRef.current
    // Vérifier que les gants sont initialisés
    if (!transform || !leftGloveBodyRef.current || !rightGloveBodyRef.current) return

    // Mettre à jour le cooldown des impacts
    if (leftImpactCooldownRef.current > 0) {
      leftImpactCooldownRef.current -= delta
    }
    if (rightImpactCooldownRef.current > 0) {
      rightImpactCooldownRef.current -= delta
    }

    // Synchroniser les meshes avec les rigid bodies
    const syncMesh = (body: any, mesh: THREE.Mesh | null) => {
      if (!body || !mesh) return

      body.getMotionState().getWorldTransform(transform)
      const origin = transform.getOrigin()
      mesh.position.set(origin.x(), origin.y(), origin.z())
    }

    syncMesh(leftGloveBodyRef.current, leftGloveRef.current)
    syncMesh(rightGloveBodyRef.current, rightGloveRef.current)

    // Détecter les impacts via chute de vélocité (Ammo gère les collisions)
    if (gameState === 'FIGHTING') {
      detectImpacts()
    }
  })

  /**
   * Détecter les impacts via changement de vélocité (collision native Ammo.js)
   * btSoftRigidDynamicsWorld gère automatiquement les collisions soft-rigid.
   * On détecte simplement si le gant a été ralenti (= il a touché quelque chose)
   */
  const detectImpacts = useCallback(() => {
    const transform = transformAuxRef.current
    if (!transform) return

    const checkGloveImpact = (
      gloveBody: any,
      cooldownRef: React.MutableRefObject<number>,
      prevSpeedRef: React.MutableRefObject<number>,
      side: 'left' | 'right'
    ) => {
      if (!gloveBody || cooldownRef.current > 0) return

      // Obtenir vélocité actuelle
      const velocity = gloveBody.getLinearVelocity()
      const currentSpeed = Math.sqrt(
        velocity.x() * velocity.x() +
        velocity.y() * velocity.y() +
        velocity.z() * velocity.z()
      )

      // Si la vitesse a chuté significativement = collision détectée par Ammo
      const speedDrop = prevSpeedRef.current - currentSpeed
      if (speedDrop > 1.0 && prevSpeedRef.current > 1.5) {
        // Obtenir position du gant
        gloveBody.getMotionState().getWorldTransform(transform)
        const origin = transform.getOrigin()

        // Enregistrer l'impact visuel
        const strength = Math.min(1.0, prevSpeedRef.current / 4)
        ImpactManager.addImpact(
          [origin.x(), origin.y(), origin.z()],
          strength
        )

        // Enregistrer le hit pour le score
        useGameStore.getState().recordHit()

        // Cooldown
        cooldownRef.current = 0.2

        console.log(`[PhysicsGloves] ${side} HIT! Speed drop: ${speedDrop.toFixed(1)}`)
      }

      prevSpeedRef.current = currentSpeed
    }

    checkGloveImpact(leftGloveBodyRef.current, leftImpactCooldownRef, leftPrevSpeedRef, 'left')
    checkGloveImpact(rightGloveBodyRef.current, rightImpactCooldownRef, rightPrevSpeedRef, 'right')
  }, [])

  // Ne pas afficher si pas en mode gants ou pas en combat
  if (selectedTool !== 'gloves') {
    return null
  }

  return (
    <group>
      {/* Gant gauche */}
      <mesh ref={leftGloveRef} position={LEFT_REST_POS.toArray()} castShadow>
        <sphereGeometry args={[GLOVE_RADIUS, 16, 16]} />
        <meshStandardMaterial
          color={GLOVE_COLORS.rest}
          roughness={0.4}
          metalness={0.1}
          emissive={0x110000}
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* Gant droit */}
      <mesh ref={rightGloveRef} position={RIGHT_REST_POS.toArray()} castShadow>
        <sphereGeometry args={[GLOVE_RADIUS, 16, 16]} />
        <meshStandardMaterial
          color={GLOVE_COLORS.rest}
          roughness={0.4}
          metalness={0.1}
          emissive={0x110000}
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>
  )
}

export default PhysicsGloves
