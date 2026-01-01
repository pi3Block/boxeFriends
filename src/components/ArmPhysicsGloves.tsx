import { useRef, useEffect, useMemo, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore, ImpactManager } from '../stores'
import type { PunchType } from '../stores'

/**
 * ArmPhysicsGloves - Bras articulés avec muscles-ressorts
 *
 * Architecture par bras:
 * - ANCRE ÉPAULE (static) → Humérus → Avant-bras → Gant
 * - Joints: btConeTwist (épaule), btHinge (coude), btGeneric6Dof (poignet)
 * - Muscles: Springs deltoïde, biceps, triceps
 */

// =============================================
// CONFIGURATION
// =============================================

// Positions des épaules (ancrages fixes)
const LEFT_SHOULDER_POS = new THREE.Vector3(-0.6, 3.5, 4.5)
const RIGHT_SHOULDER_POS = new THREE.Vector3(0.6, 3.5, 4.5)

// Longueurs des segments
const UPPER_ARM_LENGTH = 0.5   // Humérus
const FOREARM_LENGTH = 0.45    // Avant-bras

// Configuration des segments (rigid bodies)
const SEGMENT_CONFIG = {
  shoulder: { radius: 0.05, mass: 0 },           // Static anchor
  upperArm: { radius: 0.08, height: UPPER_ARM_LENGTH, mass: 0.8 },
  forearm: { radius: 0.06, height: FOREARM_LENGTH, mass: 0.5 },
  glove: { radius: 0.25, mass: 1.0 }
}

// Configuration des muscles (springs) - valeurs élevées pour maintenir position
const MUSCLE_CONFIG = {
  deltoid: { stiffness: 500, damping: 15 },    // Épaule → Humérus (maintien bras levé)
  biceps: { stiffness: 400, damping: 12 },     // Flexion coude
  triceps: { stiffness: 450, damping: 10 }     // Extension coude
}

// Force de centrage pour maintenir la position de garde
const CENTERING_FORCE = 50  // Force appliquée vers la position de repos

// Impulsions par type de coup
const PUNCH_IMPULSES = {
  jab: {
    direction: new THREE.Vector3(0, 0, -1),
    force: 15
  },
  hook: {
    getDirection: (side: 'left' | 'right') =>
      new THREE.Vector3(
        side === 'left' ? 0.6 : -0.6,
        0.1,
        -0.8
      ).normalize(),
    force: 18
  },
  uppercut: {
    direction: new THREE.Vector3(0, 0.7, -0.6).normalize(),
    force: 20
  }
}

// Couleurs des gants
const GLOVE_COLORS = {
  rest: new THREE.Color(0xcc0000),
  jab: new THREE.Color(0xff4400),
  hook: new THREE.Color(0xffaa00),
  uppercut: new THREE.Color(0xff00aa)
}

// Couleur des bras (style cartoon)
const ARM_COLOR = 0xffccaa  // Couleur peau

// =============================================
// TYPES
// =============================================

interface ArmState {
  shoulderAnchor: any      // btRigidBody static
  upperArmBody: any        // btRigidBody dynamic
  forearmBody: any         // btRigidBody dynamic
  gloveBody: any           // btRigidBody dynamic
  shoulderConstraint: any  // btConeTwistConstraint
  elbowConstraint: any     // btHingeConstraint
  wristConstraint: any     // btGeneric6DofSpringConstraint
  deltoidSpring: any       // btGeneric6DofSpringConstraint
  bicepsSpring: any        // btGeneric6DofSpringConstraint
  tricepsSpring: any       // btGeneric6DofSpringConstraint
}

// =============================================
// COMPOSANT PRINCIPAL
// =============================================

export function ArmPhysicsGloves() {
  // Refs meshes Three.js
  const leftUpperArmRef = useRef<THREE.Mesh>(null)
  const leftForearmRef = useRef<THREE.Mesh>(null)
  const leftGloveRef = useRef<THREE.Mesh>(null)
  const rightUpperArmRef = useRef<THREE.Mesh>(null)
  const rightForearmRef = useRef<THREE.Mesh>(null)
  const rightGloveRef = useRef<THREE.Mesh>(null)

  // Refs physics Ammo.js
  const leftArmRef = useRef<ArmState | null>(null)
  const rightArmRef = useRef<ArmState | null>(null)

  // Refs Ammo globaux
  const ammoRef = useRef<any>(null)
  const physicsWorldRef = useRef<any>(null)
  const transformAuxRef = useRef<any>(null)

  // État d'initialisation
  const initializedRef = useRef(false)

  // Cooldown impacts
  const leftImpactCooldownRef = useRef(0)
  const rightImpactCooldownRef = useRef(0)

  // Vitesse précédente pour détection collision
  const leftPrevSpeedRef = useRef(0)
  const rightPrevSpeedRef = useRef(0)

  // Store state
  const gameState = useGameStore((state) => state.gameState)
  const selectedTool = useGameStore((state) => state.selectedTool)
  const queuedPunch = useGameStore((state) => state.queuedPunch)
  const consumeQueuedPunch = useGameStore((state) => state.consumeQueuedPunch)

  // Vecteurs réutilisables
  const tempVec = useMemo(() => new THREE.Vector3(), [])
  const impulseVec = useMemo(() => new THREE.Vector3(), [])

  // =============================================
  // CRÉATION DES RIGID BODIES
  // =============================================

  const createSphereBody = useCallback((
    Ammo: any,
    physicsWorld: any,
    radius: number,
    mass: number,
    position: THREE.Vector3,
    disableGravity: boolean = true
  ) => {
    const shape = new Ammo.btSphereShape(radius)
    shape.setMargin(0.05)

    const transform = new Ammo.btTransform()
    transform.setIdentity()
    transform.setOrigin(new Ammo.btVector3(position.x, position.y, position.z))

    const motionState = new Ammo.btDefaultMotionState(transform)
    const localInertia = new Ammo.btVector3(0, 0, 0)

    if (mass > 0) {
      shape.calculateLocalInertia(mass, localInertia)
    }

    const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia)
    const body = new Ammo.btRigidBody(rbInfo)

    if (mass > 0) {
      body.setFriction(0.5)
      body.setRestitution(0.2)
      body.setDamping(0.1, 0.3)
      body.setActivationState(4) // DISABLE_DEACTIVATION

      if (disableGravity) {
        const zeroGravity = new Ammo.btVector3(0, 0, 0)
        body.setGravity(zeroGravity)
        Ammo.destroy(zeroGravity)
      }

      // CCD pour éviter tunneling
      body.setCcdMotionThreshold(radius * 0.5)
      body.setCcdSweptSphereRadius(radius * 0.8)
    }

    physicsWorld.addRigidBody(body)
    return body
  }, [])

  const createCapsuleBody = useCallback((
    Ammo: any,
    physicsWorld: any,
    radius: number,
    height: number,
    mass: number,
    position: THREE.Vector3,
    disableGravity: boolean = true
  ) => {
    // Capsule alignée sur Y
    const shape = new Ammo.btCapsuleShape(radius, height)
    shape.setMargin(0.05)

    const transform = new Ammo.btTransform()
    transform.setIdentity()
    transform.setOrigin(new Ammo.btVector3(position.x, position.y, position.z))

    const motionState = new Ammo.btDefaultMotionState(transform)
    const localInertia = new Ammo.btVector3(0, 0, 0)
    shape.calculateLocalInertia(mass, localInertia)

    const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia)
    const body = new Ammo.btRigidBody(rbInfo)

    body.setFriction(0.5)
    body.setRestitution(0.2)
    body.setDamping(0.1, 0.3)
    body.setActivationState(4)

    if (disableGravity) {
      const zeroGravity = new Ammo.btVector3(0, 0, 0)
      body.setGravity(zeroGravity)
      Ammo.destroy(zeroGravity)
    }

    physicsWorld.addRigidBody(body)
    return body
  }, [])

  // =============================================
  // CRÉATION DES CONSTRAINTS
  // =============================================

  /**
   * Crée un joint épaule (cone twist) - permet rotation 3D limitée
   */
  const createShoulderConstraint = useCallback((
    Ammo: any,
    physicsWorld: any,
    anchorBody: any,
    upperArmBody: any,
    anchorPos: THREE.Vector3
  ) => {
    // Frame dans l'ancre (point de pivot)
    const frameInA = new Ammo.btTransform()
    frameInA.setIdentity()
    frameInA.setOrigin(new Ammo.btVector3(0, 0, 0))

    // Frame dans le bras (au bout supérieur)
    const frameInB = new Ammo.btTransform()
    frameInB.setIdentity()
    frameInB.setOrigin(new Ammo.btVector3(0, UPPER_ARM_LENGTH / 2 + 0.05, 0))

    const constraint = new Ammo.btConeTwistConstraint(
      anchorBody,
      upperArmBody,
      frameInA,
      frameInB
    )

    // Limites angulaires (radians)
    // Swing = mouvement latéral, Twist = rotation axiale
    constraint.setLimit(
      Math.PI / 2,   // Swing span 1 (90°)
      Math.PI / 2,   // Swing span 2 (90°)
      Math.PI / 4    // Twist (45°)
    )

    // Softness pour mouvement plus naturel
    constraint.setDamping(0.3)

    physicsWorld.addConstraint(constraint, true)
    return constraint
  }, [])

  /**
   * Crée un joint coude (hinge) - 1 DOF flexion/extension
   */
  const createElbowConstraint = useCallback((
    Ammo: any,
    physicsWorld: any,
    upperArmBody: any,
    forearmBody: any
  ) => {
    // Pivot au bout inférieur du bras supérieur
    const pivotInA = new Ammo.btVector3(0, -UPPER_ARM_LENGTH / 2, 0)
    // Pivot au bout supérieur de l'avant-bras
    const pivotInB = new Ammo.btVector3(0, FOREARM_LENGTH / 2, 0)

    // Axe de rotation (X = latéral, permet flexion avant/arrière)
    const axisInA = new Ammo.btVector3(1, 0, 0)
    const axisInB = new Ammo.btVector3(1, 0, 0)

    const constraint = new Ammo.btHingeConstraint(
      upperArmBody,
      forearmBody,
      pivotInA,
      pivotInB,
      axisInA,
      axisInB,
      true  // useReferenceFrameA
    )

    // Limites: 0° (bras tendu) à 140° (flexion max)
    constraint.setLimit(0, Math.PI * 0.78)  // 0 à ~140°

    Ammo.destroy(pivotInA)
    Ammo.destroy(pivotInB)
    Ammo.destroy(axisInA)
    Ammo.destroy(axisInB)

    physicsWorld.addConstraint(constraint, true)
    return constraint
  }, [])

  /**
   * Crée un joint poignet (6DOF spring) - maintient le gant aligné
   */
  const createWristConstraint = useCallback((
    Ammo: any,
    physicsWorld: any,
    forearmBody: any,
    gloveBody: any
  ) => {
    const frameInA = new Ammo.btTransform()
    frameInA.setIdentity()
    frameInA.setOrigin(new Ammo.btVector3(0, -FOREARM_LENGTH / 2 - 0.1, 0))

    const frameInB = new Ammo.btTransform()
    frameInB.setIdentity()

    const constraint = new Ammo.btGeneric6DofSpringConstraint(
      forearmBody,
      gloveBody,
      frameInA,
      frameInB,
      true
    )

    // Limites angulaires serrées (poignet rigide)
    const angularLimit = Math.PI / 6  // ±30°
    constraint.setAngularLowerLimit(new Ammo.btVector3(-angularLimit, -angularLimit, -angularLimit))
    constraint.setAngularUpperLimit(new Ammo.btVector3(angularLimit, angularLimit, angularLimit))

    // Spring sur les axes linéaires pour maintenir position
    const linearLimit = 0.1
    constraint.setLinearLowerLimit(new Ammo.btVector3(-linearLimit, -linearLimit, -linearLimit))
    constraint.setLinearUpperLimit(new Ammo.btVector3(linearLimit, linearLimit, linearLimit))

    for (let i = 0; i < 3; i++) {
      constraint.enableSpring(i, true)
      constraint.setStiffness(i, 200)  // Très rigide
      constraint.setDamping(i, 0.5)
    }

    constraint.setEquilibriumPoint()
    physicsWorld.addConstraint(constraint, true)
    return constraint
  }, [])

  /**
   * Crée un muscle (spring constraint)
   */
  const createMuscleSpring = useCallback((
    Ammo: any,
    physicsWorld: any,
    bodyA: any,
    bodyB: any,
    config: { stiffness: number; damping: number },
    pivotInA: THREE.Vector3,
    pivotInB: THREE.Vector3
  ) => {
    const frameInA = new Ammo.btTransform()
    frameInA.setIdentity()
    frameInA.setOrigin(new Ammo.btVector3(pivotInA.x, pivotInA.y, pivotInA.z))

    const frameInB = new Ammo.btTransform()
    frameInB.setIdentity()
    frameInB.setOrigin(new Ammo.btVector3(pivotInB.x, pivotInB.y, pivotInB.z))

    const spring = new Ammo.btGeneric6DofSpringConstraint(
      bodyA,
      bodyB,
      frameInA,
      frameInB,
      true
    )

    // Grande liberté de mouvement
    const limit = 2.0
    spring.setLinearLowerLimit(new Ammo.btVector3(-limit, -limit, -limit))
    spring.setLinearUpperLimit(new Ammo.btVector3(limit, limit, limit))

    // Activer springs sur les 3 axes
    for (let i = 0; i < 3; i++) {
      spring.enableSpring(i, true)
      spring.setStiffness(i, config.stiffness)
      spring.setDamping(i, config.damping)
    }

    spring.setEquilibriumPoint()
    physicsWorld.addConstraint(spring, true)
    return spring
  }, [])

  // =============================================
  // CRÉATION D'UN BRAS COMPLET
  // =============================================

  const createArm = useCallback((
    Ammo: any,
    physicsWorld: any,
    shoulderPos: THREE.Vector3,
    side: 'left' | 'right'
  ): ArmState => {
    const sideMultiplier = side === 'left' ? -1 : 1

    // Calculer positions initiales (position de garde)
    const upperArmPos = new THREE.Vector3(
      shoulderPos.x + sideMultiplier * 0.1,
      shoulderPos.y - UPPER_ARM_LENGTH / 2 - 0.1,
      shoulderPos.z - 0.2
    )

    const forearmPos = new THREE.Vector3(
      upperArmPos.x + sideMultiplier * 0.1,
      upperArmPos.y - UPPER_ARM_LENGTH / 2 - FOREARM_LENGTH / 2 - 0.05,
      upperArmPos.z - 0.3
    )

    const glovePos = new THREE.Vector3(
      forearmPos.x + sideMultiplier * 0.05,
      forearmPos.y - FOREARM_LENGTH / 2 - SEGMENT_CONFIG.glove.radius - 0.05,
      forearmPos.z - 0.2
    )

    // Créer les rigid bodies
    const shoulderAnchor = createSphereBody(
      Ammo, physicsWorld,
      SEGMENT_CONFIG.shoulder.radius,
      SEGMENT_CONFIG.shoulder.mass,  // 0 = static
      shoulderPos,
      false
    )

    const upperArmBody = createCapsuleBody(
      Ammo, physicsWorld,
      SEGMENT_CONFIG.upperArm.radius,
      SEGMENT_CONFIG.upperArm.height,
      SEGMENT_CONFIG.upperArm.mass,
      upperArmPos
    )

    const forearmBody = createCapsuleBody(
      Ammo, physicsWorld,
      SEGMENT_CONFIG.forearm.radius,
      SEGMENT_CONFIG.forearm.height,
      SEGMENT_CONFIG.forearm.mass,
      forearmPos
    )

    const gloveBody = createSphereBody(
      Ammo, physicsWorld,
      SEGMENT_CONFIG.glove.radius,
      SEGMENT_CONFIG.glove.mass,
      glovePos
    )

    // Créer les constraints articulaires
    const shoulderConstraint = createShoulderConstraint(
      Ammo, physicsWorld,
      shoulderAnchor,
      upperArmBody,
      shoulderPos
    )

    const elbowConstraint = createElbowConstraint(
      Ammo, physicsWorld,
      upperArmBody,
      forearmBody
    )

    const wristConstraint = createWristConstraint(
      Ammo, physicsWorld,
      forearmBody,
      gloveBody
    )

    // Créer les muscles (springs)
    // Deltoïde: épaule → humérus (maintient le bras levé)
    const deltoidSpring = createMuscleSpring(
      Ammo, physicsWorld,
      shoulderAnchor,
      upperArmBody,
      MUSCLE_CONFIG.deltoid,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, UPPER_ARM_LENGTH / 3, 0)
    )

    // Biceps: humérus → avant-bras (flexion)
    const bicepsSpring = createMuscleSpring(
      Ammo, physicsWorld,
      upperArmBody,
      forearmBody,
      MUSCLE_CONFIG.biceps,
      new THREE.Vector3(0, -UPPER_ARM_LENGTH / 4, 0.05),
      new THREE.Vector3(0, FOREARM_LENGTH / 3, 0.03)
    )

    // Triceps: humérus → avant-bras (extension)
    const tricepsSpring = createMuscleSpring(
      Ammo, physicsWorld,
      upperArmBody,
      forearmBody,
      MUSCLE_CONFIG.triceps,
      new THREE.Vector3(0, -UPPER_ARM_LENGTH / 4, -0.05),
      new THREE.Vector3(0, FOREARM_LENGTH / 3, -0.03)
    )

    console.log(`[ArmPhysicsGloves] ${side} arm created with muscles`)

    return {
      shoulderAnchor,
      upperArmBody,
      forearmBody,
      gloveBody,
      shoulderConstraint,
      elbowConstraint,
      wristConstraint,
      deltoidSpring,
      bicepsSpring,
      tricepsSpring
    }
  }, [
    createSphereBody,
    createCapsuleBody,
    createShoulderConstraint,
    createElbowConstraint,
    createWristConstraint,
    createMuscleSpring
  ])

  // =============================================
  // INITIALISATION
  // =============================================

  useEffect(() => {
    const checkPhysicsWorld = () => {
      const Ammo = (window as any).__ammoInstance
      const physicsWorld = (window as any).__ammoPhysicsWorld

      if (!Ammo || !physicsWorld) {
        setTimeout(checkPhysicsWorld, 100)
        return
      }

      if (initializedRef.current) return
      initializedRef.current = true

      ammoRef.current = Ammo
      physicsWorldRef.current = physicsWorld
      transformAuxRef.current = new Ammo.btTransform()

      console.log('[ArmPhysicsGloves] Creating arms with muscle-spring system...')

      // Créer les deux bras
      leftArmRef.current = createArm(Ammo, physicsWorld, LEFT_SHOULDER_POS, 'left')
      rightArmRef.current = createArm(Ammo, physicsWorld, RIGHT_SHOULDER_POS, 'right')

      console.log('[ArmPhysicsGloves] Both arms created successfully')
    }

    checkPhysicsWorld()

    // Cleanup
    return () => {
      const physicsWorld = physicsWorldRef.current
      if (physicsWorld) {
        // Supprimer les constraints et bodies du bras gauche
        if (leftArmRef.current) {
          const arm = leftArmRef.current
          physicsWorld.removeConstraint(arm.tricepsSpring)
          physicsWorld.removeConstraint(arm.bicepsSpring)
          physicsWorld.removeConstraint(arm.deltoidSpring)
          physicsWorld.removeConstraint(arm.wristConstraint)
          physicsWorld.removeConstraint(arm.elbowConstraint)
          physicsWorld.removeConstraint(arm.shoulderConstraint)
          physicsWorld.removeRigidBody(arm.gloveBody)
          physicsWorld.removeRigidBody(arm.forearmBody)
          physicsWorld.removeRigidBody(arm.upperArmBody)
          physicsWorld.removeRigidBody(arm.shoulderAnchor)
        }
        // Supprimer bras droit
        if (rightArmRef.current) {
          const arm = rightArmRef.current
          physicsWorld.removeConstraint(arm.tricepsSpring)
          physicsWorld.removeConstraint(arm.bicepsSpring)
          physicsWorld.removeConstraint(arm.deltoidSpring)
          physicsWorld.removeConstraint(arm.wristConstraint)
          physicsWorld.removeConstraint(arm.elbowConstraint)
          physicsWorld.removeConstraint(arm.shoulderConstraint)
          physicsWorld.removeRigidBody(arm.gloveBody)
          physicsWorld.removeRigidBody(arm.forearmBody)
          physicsWorld.removeRigidBody(arm.upperArmBody)
          physicsWorld.removeRigidBody(arm.shoulderAnchor)
        }
      }
      initializedRef.current = false
      console.log('[ArmPhysicsGloves] Cleaned up')
    }
  }, [createArm])

  // =============================================
  // EXÉCUTION DES COUPS
  // =============================================

  const executePunch = useCallback((type: PunchType, side: 'left' | 'right') => {
    const Ammo = ammoRef.current
    const arm = side === 'left' ? leftArmRef.current : rightArmRef.current
    if (!Ammo || !arm) return

    // Appliquer impulsion sur le GANT
    const config = PUNCH_IMPULSES[type]
    let direction: THREE.Vector3

    if (type === 'hook') {
      direction = config.getDirection(side)
    } else {
      direction = config.direction.clone()
    }

    // Légère variation selon le côté pour jab/uppercut
    if (type !== 'hook') {
      direction.x += side === 'left' ? 0.1 : -0.1
      direction.normalize()
    }

    impulseVec.copy(direction).multiplyScalar(config.force)

    const btImpulse = new Ammo.btVector3(impulseVec.x, impulseVec.y, impulseVec.z)
    arm.gloveBody.applyCentralImpulse(btImpulse)
    Ammo.destroy(btImpulse)

    console.log(`[ArmPhysicsGloves] ${side} ${type} - impulse applied`)
  }, [impulseVec])

  // =============================================
  // GESTION DES PUNCHES UI
  // =============================================

  useEffect(() => {
    if (queuedPunch && selectedTool === 'gloves' && gameState === 'FIGHTING') {
      const punch = consumeQueuedPunch()
      if (punch) {
        executePunch(punch.type, punch.hand)
      }
    }
  }, [queuedPunch, selectedTool, gameState, consumeQueuedPunch, executePunch])

  // Gestion clics directs
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (gameState !== 'FIGHTING' || selectedTool !== 'gloves') return

      const target = event.target as HTMLElement
      if (target.tagName !== 'CANVAS') return

      const normalizedX = (event.clientX / window.innerWidth) * 2 - 1
      const normalizedY = -(event.clientY / window.innerHeight) * 2 + 1

      let punchType: PunchType
      if (normalizedY > 0.33) {
        punchType = 'hook'
      } else if (normalizedY < -0.33) {
        punchType = 'uppercut'
      } else {
        punchType = 'jab'
      }

      const side = normalizedX < 0 ? 'left' : 'right'
      executePunch(punchType, side)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [gameState, selectedTool, executePunch])

  // =============================================
  // BOUCLE DE MISE À JOUR
  // =============================================

  useFrame((_, delta) => {
    const Ammo = ammoRef.current
    const transform = transformAuxRef.current
    if (!Ammo || !transform) return

    // Mettre à jour cooldowns
    if (leftImpactCooldownRef.current > 0) {
      leftImpactCooldownRef.current -= delta
    }
    if (rightImpactCooldownRef.current > 0) {
      rightImpactCooldownRef.current -= delta
    }

    // Appliquer force de centrage pour maintenir la position de garde
    const applyCenteringForce = (
      arm: ArmState | null,
      shoulderPos: THREE.Vector3
    ) => {
      if (!arm) return

      // Force vers la position de repos pour chaque segment
      const applyForceToBody = (body: any, targetY: number) => {
        if (!body) return
        body.getMotionState().getWorldTransform(transform)
        const origin = transform.getOrigin()

        // Force vers le haut si en dessous de la cible
        const dy = targetY - origin.y()
        if (dy > 0.05) {  // Seulement si significativement en dessous
          const force = new Ammo.btVector3(0, dy * CENTERING_FORCE, 0)
          body.applyCentralForce(force)
          Ammo.destroy(force)
        }

        // Amortissement de la vélocité verticale négative (anti-chute)
        const vel = body.getLinearVelocity()
        if (vel.y() < -0.5) {
          const dampingForce = new Ammo.btVector3(0, -vel.y() * 20, 0)
          body.applyCentralForce(dampingForce)
          Ammo.destroy(dampingForce)
        }
      }

      // Maintenir chaque segment à sa hauteur de repos
      applyForceToBody(arm.upperArmBody, shoulderPos.y - 0.3)
      applyForceToBody(arm.forearmBody, shoulderPos.y - 0.7)
      applyForceToBody(arm.gloveBody, shoulderPos.y - 0.5)
    }

    // Appliquer forces de centrage aux deux bras
    applyCenteringForce(leftArmRef.current, LEFT_SHOULDER_POS)
    applyCenteringForce(rightArmRef.current, RIGHT_SHOULDER_POS)

    // Synchroniser meshes avec physics
    const syncArmMeshes = (
      arm: ArmState | null,
      upperArmMesh: THREE.Mesh | null,
      forearmMesh: THREE.Mesh | null,
      gloveMesh: THREE.Mesh | null,
      cooldownRef: React.MutableRefObject<number>,
      prevSpeedRef: React.MutableRefObject<number>,
      side: 'left' | 'right'
    ) => {
      if (!arm) return

      // Synchroniser humérus
      if (upperArmMesh && arm.upperArmBody) {
        arm.upperArmBody.getMotionState().getWorldTransform(transform)
        const origin = transform.getOrigin()
        const rotation = transform.getRotation()
        upperArmMesh.position.set(origin.x(), origin.y(), origin.z())
        upperArmMesh.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w())
      }

      // Synchroniser avant-bras
      if (forearmMesh && arm.forearmBody) {
        arm.forearmBody.getMotionState().getWorldTransform(transform)
        const origin = transform.getOrigin()
        const rotation = transform.getRotation()
        forearmMesh.position.set(origin.x(), origin.y(), origin.z())
        forearmMesh.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w())
      }

      // Synchroniser gant
      if (gloveMesh && arm.gloveBody) {
        arm.gloveBody.getMotionState().getWorldTransform(transform)
        const origin = transform.getOrigin()
        gloveMesh.position.set(origin.x(), origin.y(), origin.z())

        // Détecter impact via chute de vélocité
        if (gameState === 'FIGHTING' && cooldownRef.current <= 0) {
          const velocity = arm.gloveBody.getLinearVelocity()
          const currentSpeed = Math.sqrt(
            velocity.x() * velocity.x() +
            velocity.y() * velocity.y() +
            velocity.z() * velocity.z()
          )

          const speedDrop = prevSpeedRef.current - currentSpeed
          if (speedDrop > 1.0 && prevSpeedRef.current > 1.5) {
            // Impact détecté!
            const strength = Math.min(1.0, prevSpeedRef.current / 4)
            ImpactManager.addImpact(
              [origin.x(), origin.y(), origin.z()],
              strength
            )
            useGameStore.getState().recordHit()
            cooldownRef.current = 0.2
            console.log(`[ArmPhysicsGloves] ${side} HIT! Speed drop: ${speedDrop.toFixed(1)}`)
          }

          prevSpeedRef.current = currentSpeed
        }
      }
    }

    // Synchroniser les deux bras
    syncArmMeshes(
      leftArmRef.current,
      leftUpperArmRef.current,
      leftForearmRef.current,
      leftGloveRef.current,
      leftImpactCooldownRef,
      leftPrevSpeedRef,
      'left'
    )

    syncArmMeshes(
      rightArmRef.current,
      rightUpperArmRef.current,
      rightForearmRef.current,
      rightGloveRef.current,
      rightImpactCooldownRef,
      rightPrevSpeedRef,
      'right'
    )
  })

  // =============================================
  // RENDU
  // =============================================

  if (selectedTool !== 'gloves') {
    return null
  }

  // Positions initiales de garde (seront synchronisées avec physics)
  const leftUpperArmInitPos: [number, number, number] = [-0.5, 3.2, 4.3]
  const leftForearmInitPos: [number, number, number] = [-0.6, 2.8, 3.9]
  const leftGloveInitPos: [number, number, number] = [-0.7, 3.0, 3.5]
  const rightUpperArmInitPos: [number, number, number] = [0.5, 3.2, 4.3]
  const rightForearmInitPos: [number, number, number] = [0.6, 2.8, 3.9]
  const rightGloveInitPos: [number, number, number] = [0.7, 3.0, 3.5]

  return (
    <group>
      {/* === BRAS GAUCHE === */}
      {/* Humérus gauche */}
      <mesh ref={leftUpperArmRef} position={leftUpperArmInitPos} castShadow>
        <capsuleGeometry args={[
          SEGMENT_CONFIG.upperArm.radius,
          SEGMENT_CONFIG.upperArm.height,
          8, 16
        ]} />
        <meshStandardMaterial
          color={ARM_COLOR}
          roughness={0.7}
          metalness={0}
        />
      </mesh>

      {/* Avant-bras gauche */}
      <mesh ref={leftForearmRef} position={leftForearmInitPos} castShadow>
        <capsuleGeometry args={[
          SEGMENT_CONFIG.forearm.radius,
          SEGMENT_CONFIG.forearm.height,
          8, 16
        ]} />
        <meshStandardMaterial
          color={ARM_COLOR}
          roughness={0.7}
          metalness={0}
        />
      </mesh>

      {/* Gant gauche */}
      <mesh ref={leftGloveRef} position={leftGloveInitPos} castShadow>
        <sphereGeometry args={[SEGMENT_CONFIG.glove.radius, 16, 16]} />
        <meshStandardMaterial
          color={GLOVE_COLORS.rest}
          roughness={0.4}
          metalness={0.1}
          emissive={0x110000}
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* === BRAS DROIT === */}
      {/* Humérus droit */}
      <mesh ref={rightUpperArmRef} position={rightUpperArmInitPos} castShadow>
        <capsuleGeometry args={[
          SEGMENT_CONFIG.upperArm.radius,
          SEGMENT_CONFIG.upperArm.height,
          8, 16
        ]} />
        <meshStandardMaterial
          color={ARM_COLOR}
          roughness={0.7}
          metalness={0}
        />
      </mesh>

      {/* Avant-bras droit */}
      <mesh ref={rightForearmRef} position={rightForearmInitPos} castShadow>
        <capsuleGeometry args={[
          SEGMENT_CONFIG.forearm.radius,
          SEGMENT_CONFIG.forearm.height,
          8, 16
        ]} />
        <meshStandardMaterial
          color={ARM_COLOR}
          roughness={0.7}
          metalness={0}
        />
      </mesh>

      {/* Gant droit */}
      <mesh ref={rightGloveRef} position={rightGloveInitPos} castShadow>
        <sphereGeometry args={[SEGMENT_CONFIG.glove.radius, 16, 16]} />
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

export default ArmPhysicsGloves
