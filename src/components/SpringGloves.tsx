import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useControls, folder } from 'leva'
import {
  useAmmoPhysics,
  COLLISION_GROUPS,
  type SoftBodyState,
} from '../hooks/useAmmoPhysics'
import { ImpactManager } from '../stores'

/**
 * Génère les points d'un ressort hélicoïdal
 */
function generateSpringPoints(
  start: THREE.Vector3,
  end: THREE.Vector3,
  coils: number = 8,
  radius: number = 0.06,
  segments: number = 64
): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  const direction = new THREE.Vector3().subVectors(end, start)
  const length = direction.length()
  direction.normalize()

  const up = new THREE.Vector3(0, 1, 0)
  if (Math.abs(direction.dot(up)) > 0.99) {
    up.set(1, 0, 0)
  }
  const right = new THREE.Vector3().crossVectors(direction, up).normalize()
  const forward = new THREE.Vector3().crossVectors(right, direction).normalize()

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = t * coils * Math.PI * 2
    const axisPos = start.clone().add(direction.clone().multiplyScalar(t * length))
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius

    const point = axisPos
      .add(right.clone().multiplyScalar(x))
      .add(forward.clone().multiplyScalar(y))

    points.push(point.clone())
  }

  return points
}

interface SpringGlovesProps {
  softBodyState?: SoftBodyState | null
}

/**
 * Poings montés sur ressorts avec physique Ammo.js
 * Utilise le monde physique GLOBAL partagé avec le Fluffy
 */
export function SpringGloves({ softBodyState }: SpringGlovesProps) {
  const { camera, gl, size } = useThree()

  // Hook Ammo.js unifié - utilise le monde partagé
  const {
    isReady,
    createRigidBody,
    createSpringConstraint,
    syncRigidBodyMesh,
    applyRigidBodyForce,
    applyRigidBodyImpulse,
    getRigidBodyPosition,
    getRigidBodyVelocity,
    setRigidBodyVelocity,
    applySoftBodyImpulse,
    softBodies,
  } = useAmmoPhysics()

  // Références aux meshes
  const leftGloveRef = useRef<THREE.Mesh>(null)
  const rightGloveRef = useRef<THREE.Mesh>(null)

  // État
  const [leftCharging, setLeftCharging] = useState(false)
  const [rightCharging, setRightCharging] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Positions pour les ressorts visuels (refs pour éviter les re-renders)
  const leftGlovePosRef = useRef(new THREE.Vector3(-0.8, -0.3, 2.5))
  const rightGlovePosRef = useRef(new THREE.Vector3(0.8, -0.3, 2.5))

  // Positions d'ancrage
  const leftAnchorPos = useMemo(() => new THREE.Vector3(-1.0, -0.5, 4.0), [])
  const rightAnchorPos = useMemo(() => new THREE.Vector3(1.0, -0.5, 4.0), [])

  // Géométries pré-allouées pour les ressorts hélicoïdaux
  const SPRING_SEGMENTS = 64
  const leftSpringGeometry = useMemo(() => {
    const initialPoints = generateSpringPoints(leftAnchorPos, leftGlovePosRef.current, 10, 0.05, SPRING_SEGMENTS)
    const positions = new Float32Array(initialPoints.length * 3)
    initialPoints.forEach((p, i) => {
      positions[i * 3] = p.x
      positions[i * 3 + 1] = p.y
      positions[i * 3 + 2] = p.z
    })
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [leftAnchorPos])

  const rightSpringGeometry = useMemo(() => {
    const initialPoints = generateSpringPoints(rightAnchorPos, rightGlovePosRef.current, 10, 0.05, SPRING_SEGMENTS)
    const positions = new Float32Array(initialPoints.length * 3)
    initialPoints.forEach((p, i) => {
      positions[i * 3] = p.x
      positions[i * 3 + 1] = p.y
      positions[i * 3 + 2] = p.z
    })
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [rightAnchorPos])

  // Materials pour les ressorts (refs pour mise à jour directe de la couleur)
  const leftSpringMaterial = useMemo(() => new THREE.LineBasicMaterial({ color: 0x888888, linewidth: 3 }), [])
  const rightSpringMaterial = useMemo(() => new THREE.LineBasicMaterial({ color: 0x888888, linewidth: 3 }), [])

  // Objets Line pré-alloués
  const leftSpringLine = useMemo(() => new THREE.Line(leftSpringGeometry, leftSpringMaterial), [leftSpringGeometry, leftSpringMaterial])
  const rightSpringLine = useMemo(() => new THREE.Line(rightSpringGeometry, rightSpringMaterial), [rightSpringGeometry, rightSpringMaterial])

  // Contrôles Leva
  const springControls = useControls('Spring Gloves', {
    physics: folder({
      stiffness: { value: 50, min: 10, max: 200, step: 5, label: 'Raideur ressort' },
      damping: { value: 0.5, min: 0.1, max: 2, step: 0.1, label: 'Amortissement' },
      mass: { value: 2, min: 0.5, max: 10, step: 0.5, label: 'Masse gant' },
      pullForce: { value: 30, min: 10, max: 100, step: 5, label: 'Force de tir' },
    }),
    appearance: folder({
      gloveSize: { value: 0.2, min: 0.1, max: 0.4, step: 0.05, label: 'Taille gant' },
    }),
  })

  // Refs pour éviter les re-renders
  const mousePos = useRef(new THREE.Vector3())
  const activeHand = useRef<'left' | 'right' | null>(null)
  const controlsRef = useRef(springControls)
  controlsRef.current = springControls

  /**
   * Initialiser les gants dans le monde physique global
   */
  useEffect(() => {
    if (!isReady || initialized) return

    console.log('SpringGloves: Initializing in shared physics world...')

    const controls = controlsRef.current

    // Créer les ancrages (masse = 0 = statique)
    createRigidBody({
      id: 'left-anchor',
      shape: 'sphere',
      size: 0.05,
      position: leftAnchorPos,
      mass: 0,
      collisionGroup: COLLISION_GROUPS.STATIC,
      collisionMask: 0, // Ne collisionne avec rien
    })

    createRigidBody({
      id: 'right-anchor',
      shape: 'sphere',
      size: 0.05,
      position: rightAnchorPos,
      mass: 0,
      collisionGroup: COLLISION_GROUPS.STATIC,
      collisionMask: 0,
    })

    // Créer les gants (dynamiques, collisionnent avec soft bodies, sans gravité)
    createRigidBody({
      id: 'left-glove',
      shape: 'sphere',
      size: controls.gloveSize,
      position: new THREE.Vector3(-0.8, -0.3, 2.5),
      mass: controls.mass,
      friction: 0.5,
      restitution: 0.3,
      damping: [0.1, 0.1],
      collisionGroup: COLLISION_GROUPS.GLOVES,
      collisionMask: COLLISION_GROUPS.SOFT_BODY | COLLISION_GROUPS.GLOVES,
      disableGravity: true, // Les gants ne tombent pas
    })

    createRigidBody({
      id: 'right-glove',
      shape: 'sphere',
      size: controls.gloveSize,
      position: new THREE.Vector3(0.8, -0.3, 2.5),
      mass: controls.mass,
      friction: 0.5,
      restitution: 0.3,
      damping: [0.1, 0.1],
      collisionGroup: COLLISION_GROUPS.GLOVES,
      collisionMask: COLLISION_GROUPS.SOFT_BODY | COLLISION_GROUPS.GLOVES,
      disableGravity: true, // Les gants ne tombent pas
    })

    // Créer les contraintes ressorts
    createSpringConstraint('left-anchor', 'left-glove', {
      stiffness: [controls.stiffness * 0.5, controls.stiffness * 0.5, controls.stiffness],
      damping: [controls.damping, controls.damping, controls.damping],
      linearLowerLimit: [-0.5, -0.5, -3],
      linearUpperLimit: [0.5, 0.5, 0.5],
    })

    createSpringConstraint('right-anchor', 'right-glove', {
      stiffness: [controls.stiffness * 0.5, controls.stiffness * 0.5, controls.stiffness],
      damping: [controls.damping, controls.damping, controls.damping],
      linearLowerLimit: [-0.5, -0.5, -3],
      linearUpperLimit: [0.5, 0.5, 0.5],
    })

    setInitialized(true)
    console.log('SpringGloves: Initialized in shared world with soft body collision!')
  }, [isReady, initialized, createRigidBody, createSpringConstraint, leftAnchorPos, rightAnchorPos])

  /**
   * Calculer la position 3D de la souris
   */
  const getMousePosition3D = useCallback(
    (clientX: number, clientY: number): THREE.Vector3 => {
      const x = (clientX / size.width) * 2 - 1
      const y = -(clientY / size.height) * 2 + 1

      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera)

      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.5)
      const target = new THREE.Vector3()
      raycaster.ray.intersectPlane(plane, target)

      return target
    },
    [camera, size]
  )

  /**
   * Appliquer une force de tir au gant
   */
  const pullGlove = useCallback(
    (gloveId: string, targetPos: THREE.Vector3) => {
      const currentPos = getRigidBodyPosition(gloveId)
      if (!currentPos) return

      const pullForce = controlsRef.current.pullForce
      const dir = new THREE.Vector3().subVectors(targetPos, currentPos)

      applyRigidBodyForce(gloveId, dir.multiplyScalar(pullForce))
    },
    [getRigidBodyPosition, applyRigidBodyForce]
  )

  /**
   * Lancer le poing (boost vers le Fluffy)
   */
  const releaseGlove = useCallback(
    (gloveId: string) => {
      const velocity = getRigidBodyVelocity(gloveId)
      if (!velocity) return

      // Impulse vers l'avant (z négatif = vers le Fluffy)
      const impulse = new THREE.Vector3(
        velocity.x * 0.5,
        velocity.y * 0.5,
        -(Math.abs(velocity.z) * 2 + 20)
      )

      applyRigidBodyImpulse(gloveId, impulse)
      console.log(`Released ${gloveId} with boost towards Fluffy!`)
    },
    [getRigidBodyVelocity, applyRigidBodyImpulse]
  )

  // Gestionnaires d'événements
  useEffect(() => {
    if (!initialized) return

    const handlePointerDown = (e: PointerEvent) => {
      const pos = getMousePosition3D(e.clientX, e.clientY)
      mousePos.current.copy(pos)

      const hand = pos.x < 0 ? 'left' : 'right'
      activeHand.current = hand

      if (hand === 'left') {
        setLeftCharging(true)
      } else {
        setRightCharging(true)
      }
    }

    const handlePointerMove = (e: PointerEvent) => {
      const pos = getMousePosition3D(e.clientX, e.clientY)
      mousePos.current.copy(pos)
    }

    const handlePointerUp = () => {
      if (activeHand.current === 'left') {
        releaseGlove('left-glove')
        setLeftCharging(false)
      }
      if (activeHand.current === 'right') {
        releaseGlove('right-glove')
        setRightCharging(false)
      }
      activeHand.current = null
    }

    const canvas = gl.domElement
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointerleave', handlePointerUp)

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointerleave', handlePointerUp)
    }
  }, [initialized, getMousePosition3D, releaseGlove, gl])

  // Fonction helper pour mettre à jour la géométrie du ressort (évite les allocations)
  const updateSpringGeometry = useCallback((
    geometry: THREE.BufferGeometry,
    anchorPos: THREE.Vector3,
    glovePos: THREE.Vector3
  ) => {
    const points = generateSpringPoints(anchorPos, glovePos, 10, 0.05, SPRING_SEGMENTS)
    const positions = geometry.attributes.position as THREE.BufferAttribute
    points.forEach((p, i) => {
      positions.setXYZ(i, p.x, p.y, p.z)
    })
    positions.needsUpdate = true
  }, [])

  // Boucle de rendu (pas de stepSimulation ici, c'est fait dans useAmmoPhysics.updatePhysics)
  useFrame(() => {
    if (!initialized) return

    // Appliquer les forces de tir si en cours de chargement
    if (leftCharging) {
      pullGlove('left-glove', mousePos.current)
    }
    if (rightCharging) {
      pullGlove('right-glove', mousePos.current)
    }

    // Synchroniser les meshes et mettre à jour les positions refs
    if (leftGloveRef.current) {
      syncRigidBodyMesh('left-glove', leftGloveRef.current)
      const pos = getRigidBodyPosition('left-glove')
      if (pos) {
        leftGlovePosRef.current.copy(pos)
        // Mettre à jour la géométrie du ressort directement
        updateSpringGeometry(leftSpringGeometry, leftAnchorPos, pos)
        // Mettre à jour la couleur du ressort
        leftSpringMaterial.color.setHex(leftCharging ? 0xff6600 : 0x888888)
      }
    }

    if (rightGloveRef.current) {
      syncRigidBodyMesh('right-glove', rightGloveRef.current)
      const pos = getRigidBodyPosition('right-glove')
      if (pos) {
        rightGlovePosRef.current.copy(pos)
        // Mettre à jour la géométrie du ressort directement
        updateSpringGeometry(rightSpringGeometry, rightAnchorPos, pos)
        // Mettre à jour la couleur du ressort
        rightSpringMaterial.color.setHex(rightCharging ? 0xff6600 : 0x888888)
      }
    }

    // Détection d'impact avec soft bodies
    const checkImpact = (gloveId: string, hand: 'left' | 'right') => {
      const pos = getRigidBodyPosition(gloveId)
      const velocity = getRigidBodyVelocity(gloveId)
      if (!pos || !velocity) return

      // Zone d'impact (Fluffy est centré à z=0)
      if (pos.z < 1.0 && pos.z > -0.5) {
        const speed = velocity.length()

        if (speed > 5) {
          const impactForce = Math.min(speed * 0.1, 1)

          // Ajouter l'impact visuel (ImpactManager - pas de re-render)
          ImpactManager.addImpact([pos.x, pos.y, pos.z], impactForce)

          // Appliquer l'impulsion à TOUS les soft bodies du monde
          // Forces réduites pour éviter les déformations excessives
          for (const sb of softBodies) {
            const forceVec = new THREE.Vector3(
              velocity.x * 1,
              velocity.y * 1,
              velocity.z * 2
            )
            applySoftBodyImpulse(sb, pos, forceVec, 0.4)
          }

          // Rebond du gant
          const newVel = new THREE.Vector3(
            velocity.x * 0.3,
            velocity.y * 0.3,
            -velocity.z * 0.5
          )
          setRigidBodyVelocity(gloveId, newVel)

          console.log(`${hand} PUNCH! Force: ${impactForce.toFixed(2)}`)
        }
      }
    }

    checkImpact('left-glove', 'left')
    checkImpact('right-glove', 'right')
  })

  const getGloveColor = (isCharging: boolean) => {
    return isCharging ? '#ff4400' : '#cc0000'
  }

  if (!initialized) {
    return (
      <group>
        <mesh position={[-0.8, -0.3, 2.5]}>
          <sphereGeometry args={[springControls.gloveSize, 8, 8]} />
          <meshStandardMaterial color="#cc0000" opacity={0.5} transparent />
        </mesh>
        <mesh position={[0.8, -0.3, 2.5]}>
          <sphereGeometry args={[springControls.gloveSize, 8, 8]} />
          <meshStandardMaterial color="#cc0000" opacity={0.5} transparent />
        </mesh>
      </group>
    )
  }

  return (
    <group>
      {/* Ressort hélicoïdal gauche (primitive pour éviter re-render) */}
      <primitive object={leftSpringLine} />

      {/* Ressort hélicoïdal droit (primitive pour éviter re-render) */}
      <primitive object={rightSpringLine} />

      {/* Poing gauche */}
      <mesh ref={leftGloveRef} position={leftGlovePosRef.current.toArray()}>
        <sphereGeometry args={[springControls.gloveSize, 16, 16]} />
        <meshStandardMaterial
          color={getGloveColor(leftCharging)}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>

      {/* Poing droit */}
      <mesh ref={rightGloveRef} position={rightGlovePosRef.current.toArray()}>
        <sphereGeometry args={[springControls.gloveSize, 16, 16]} />
        <meshStandardMaterial
          color={getGloveColor(rightCharging)}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>

      {/* Points d'ancrage */}
      <mesh position={leftAnchorPos.toArray()}>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshStandardMaterial color="#666" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={rightAnchorPos.toArray()}>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshStandardMaterial color="#666" metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  )
}

export default SpringGloves
