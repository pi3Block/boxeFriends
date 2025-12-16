import { useRef, useMemo, useEffect, useCallback } from 'react'
import { useFrame, ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'
import { useShallow } from 'zustand/react/shallow'
import { useImpactStore, useGameStore } from '../../../stores'
import { useCartoonEffectsStore } from '../../../stores/useCartoonEffectsStore'
import { HitZone } from '../../../physics'

interface CraniumProps {
  textureUrl?: string | null
  wobbleIntensity?: number
  onHit?: (zone: HitZone, intensity: number, localPoint: THREE.Vector3) => void
}

/**
 * Vertex shader pour le crâne avec déformation jelly
 */
const vertexShader = /* glsl */ `
  // Impacts (pattern existant)
  uniform vec3 uHitPoints[5];
  uniform float uStrengths[5];
  uniform int uActiveImpacts;
  uniform float uTime;

  // Wobble/Jelly
  uniform float uWobbleIntensity;
  uniform float uWobbleSpeed;
  uniform float uWobbleFrequency;

  // Texture projection
  uniform float uTextureZoom;
  uniform float uTextureOffsetX;
  uniform float uTextureOffsetY;

  varying float vDeformAmount;
  varying vec2 vProjectedUv;

  // Simplex 3D noise
  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 1.0/7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vec3 pos = csm_Position;
    float totalDeform = 0.0;
    float time = uTime * 0.001;

    // 1. Wobble jelly organique - modéré
    vec3 noiseCoord = pos * uWobbleFrequency + vec3(time * uWobbleSpeed);
    float noise = snoise(noiseCoord);
    vec3 wobbleOffset = csm_Normal * noise * uWobbleIntensity * 0.04;
    pos += wobbleOffset;

    // 2. Déformation par impacts - modéré pour éviter artefacts
    for (int i = 0; i < 5; i++) {
      if (i >= uActiveImpacts) break;

      vec3 hitPoint = uHitPoints[i];
      float strength = uStrengths[i];
      float dist = distance(pos, hitPoint);

      // Rayon d'effet localisé
      float radius = 0.5;
      if (dist < radius) {
        float falloff = 1.0 - (dist / radius);
        falloff = falloff * falloff;

        // Rebond élastique cartoon modéré
        float bounce = 1.0 + sin(time * 18.0) * exp(-time * 3.0) * 0.3;
        float deform = strength * falloff * 0.35 * bounce;

        // Enfoncement localisé
        pos -= csm_Normal * deform;

        // Conservation volume : gonflement latéral modéré
        vec3 tangent = normalize(cross(csm_Normal, vec3(0.0, 1.0, 0.0)));
        pos += tangent * deform * 0.2;

        // Gonflement vertical léger
        vec3 vertTangent = normalize(cross(csm_Normal, vec3(1.0, 0.0, 0.0)));
        pos += vertTangent * deform * 0.12;

        totalDeform += deform;
      }

      // Wobble post-impact modéré
      float impactWobble = strength * exp(-dist * 2.0) * 0.12;
      pos += csm_Normal * sin(time * 12.0 + dist * 5.0) * impactWobble * exp(-time * 3.0);
    }

    vDeformAmount = clamp(totalDeform, 0.0, 1.0);
    csm_Position = pos;

    // 3. Projection UV pour texture photo
    // Projection sphérique simplifiée
    vec3 normalizedPos = normalize(csm_Position);
    float u = 0.5 + atan(normalizedPos.x, normalizedPos.z) / (2.0 * 3.14159);
    float v = 0.5 - asin(normalizedPos.y) / 3.14159;

    // Appliquer zoom et offset
    vec2 centeredUv = vec2(u, v) - 0.5;
    centeredUv = centeredUv / uTextureZoom;
    centeredUv += vec2(uTextureOffsetX, uTextureOffsetY);
    vProjectedUv = centeredUv + 0.5;
  }
`

/**
 * Fragment shader avec projection photo et effets visuels
 */
const fragmentShader = /* glsl */ `
  varying float vDeformAmount;
  varying vec2 vProjectedUv;

  uniform sampler2D uTextureMap;
  uniform bool uHasTexture;
  uniform float uFlashIntensity;

  void main() {
    vec3 baseColor = csm_DiffuseColor.rgb;

    // Appliquer texture photo si disponible
    if (uHasTexture) {
      // Masque pour éviter les bords
      vec2 centered = vProjectedUv - 0.5;
      float edgeMask = 1.0 - smoothstep(0.35, 0.5, length(centered));

      vec4 texColor = texture2D(uTextureMap, vProjectedUv);
      baseColor = mix(baseColor, texColor.rgb, edgeMask * texColor.a);
    }

    // Flash rouge sur impact
    vec3 impactTint = vec3(1.0, 0.3, 0.3) * vDeformAmount * uFlashIntensity;
    baseColor = mix(baseColor, baseColor + impactTint, vDeformAmount * 0.5);

    csm_DiffuseColor.rgb = baseColor;
  }
`

/**
 * Détermine la zone d'impact à partir de la position locale 3D
 */
function determineHitZoneFromLocal(localPoint: THREE.Vector3): HitZone {
  const { x, y, z } = localPoint

  // Zones verticales (en local space, Y est vertical)
  if (y > 0.15) {
    // Haut de la tête
    if (Math.abs(x) < 0.1 && z > 0.2) return 'forehead'
    return 'cranium'
  }

  if (y > -0.08) {
    // Niveau yeux/joues
    if (z > 0.2) {
      // Face avant
      if (x < -0.06) return 'leftEye'
      if (x > 0.06) return 'rightEye'
      return 'nose'
    }
    if (Math.abs(x) > 0.25) {
      return x < 0 ? 'leftEar' : 'rightEar'
    }
    return x < 0 ? 'leftCheek' : 'rightCheek'
  }

  // En dessous = mâchoire
  return 'jaw'
}

/**
 * Crâne principal - ellipsoïde déformable
 * Géométrie low-poly optimisée mobile (12 segments)
 *
 * Capture les clics/touches directement via R3F events
 * pour obtenir la position exacte de l'impact
 */
export function Cranium({ textureUrl, wobbleIntensity = 0, onHit }: CraniumProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const materialRef = useRef<CustomShaderMaterial | null>(null)

  // Stores
  const addImpact = useImpactStore((s) => s.addImpact)
  const impacts = useImpactStore((s) => s.impacts)
  const tick = useImpactStore((s) => s.tick)
  const textureSettings = useGameStore(
    useShallow((s) => ({ zoom: s.textureZoom, offsetX: s.textureOffsetX, offsetY: s.textureOffsetY }))
  )
  const processHit = useCartoonEffectsStore((s) => s.processHit)

  // Impacts locaux (en local space du mesh)
  const localImpactsRef = useRef<Array<{ point: THREE.Vector3; strength: number; time: number }>>([])

  /**
   * Gestionnaire de clic/touch - capture la position exacte
   */
  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()

    if (!meshRef.current) return

    // Position du point d'impact en world space
    const worldPoint = event.point.clone()

    // Convertir en local space du mesh
    const localPoint = meshRef.current.worldToLocal(worldPoint.clone())

    // Calculer l'intensité basée sur la vélocité du pointeur (si disponible)
    // ou utiliser une valeur par défaut
    const baseIntensity = 0.7 + Math.random() * 0.3 // 0.7-1.0

    // Déterminer la zone touchée
    const zone = determineHitZoneFromLocal(localPoint)

    console.log('[Cranium] Direct hit:', {
      worldPoint: worldPoint.toArray(),
      localPoint: localPoint.toArray(),
      zone,
      intensity: baseIntensity,
    })

    // Ajouter l'impact au store global (pour compatibilité)
    addImpact(localPoint.toArray() as [number, number, number], baseIntensity)

    // Stocker l'impact local pour le shader
    localImpactsRef.current.push({
      point: localPoint,
      strength: baseIntensity,
      time: performance.now(),
    })

    // Garder max 5 impacts locaux
    if (localImpactsRef.current.length > 5) {
      localImpactsRef.current.shift()
    }

    // Déclencher les effets cartoon
    processHit(zone, baseIntensity)

    // Callback optionnel vers le parent
    onHit?.(zone, baseIntensity, localPoint)
  }, [addImpact, processHit, onHit])

  // Charger texture
  const texture = useMemo(() => {
    if (!textureUrl) return null
    const tex = new THREE.TextureLoader().load(textureUrl)
    tex.flipY = false // Ne pas inverser pour projection sphérique
    return tex
  }, [textureUrl])

  // Arrays pour uniforms (réutilisés)
  const hitPointsArray = useMemo(
    () => [
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ],
    []
  )
  const strengthsArray = useMemo(() => new Float32Array(5), [])

  // Uniforms
  const uniforms = useMemo(
    () => ({
      uHitPoints: { value: hitPointsArray },
      uStrengths: { value: strengthsArray },
      uActiveImpacts: { value: 0 },
      uTime: { value: 0 },
      uWobbleIntensity: { value: wobbleIntensity },
      uWobbleSpeed: { value: 2.5 },
      uWobbleFrequency: { value: 4.0 },
      uTextureZoom: { value: textureSettings.zoom },
      uTextureOffsetX: { value: textureSettings.offsetX },
      uTextureOffsetY: { value: textureSettings.offsetY },
      uTextureMap: { value: texture },
      uHasTexture: { value: !!texture },
      uFlashIntensity: { value: 2.5 },
    }),
    [hitPointsArray, strengthsArray, textureSettings, texture, wobbleIntensity]
  )

  // Créer le material CSM
  const material = useMemo(() => {
    const mat = new CustomShaderMaterial({
      baseMaterial: THREE.MeshStandardMaterial,
      vertexShader,
      fragmentShader,
      uniforms: uniforms as unknown as { [key: string]: THREE.IUniform },
      flatShading: false,
      color: new THREE.Color('#ffccaa'), // Couleur peau
      roughness: 0.6,
      metalness: 0.05,
    })
    return mat
  }, [uniforms])

  useEffect(() => {
    materialRef.current = material
  }, [material])

  // Update texture
  useEffect(() => {
    uniforms.uTextureMap.value = texture
    uniforms.uHasTexture.value = !!texture
  }, [texture, uniforms])

  // Animation loop
  useFrame((_, delta) => {
    tick(delta)

    if (!materialRef.current) return

    uniforms.uTime.value = performance.now()
    uniforms.uWobbleIntensity.value = wobbleIntensity

    // Reset arrays
    for (let i = 0; i < 5; i++) {
      hitPointsArray[i]?.set(0, 0, 0)
      strengthsArray[i] = 0
    }

    // Decay et mise à jour des impacts locaux
    const now = performance.now()
    const DECAY_RATE = 1.5 // Décroissance par seconde
    const MIN_STRENGTH = 0.01

    localImpactsRef.current = localImpactsRef.current
      .map((impact) => ({
        ...impact,
        strength: impact.strength - DECAY_RATE * delta,
      }))
      .filter((impact) => impact.strength > MIN_STRENGTH)

    // Remplir les uniforms avec les impacts locaux (prioritaire)
    // puis compléter avec les impacts globaux si nécessaire
    let impactIndex = 0

    // D'abord les impacts locaux (en local space, précis)
    localImpactsRef.current.forEach((impact) => {
      if (impactIndex < 5) {
        hitPointsArray[impactIndex]?.copy(impact.point)
        strengthsArray[impactIndex] = impact.strength
        impactIndex++
      }
    })

    // Compléter avec les impacts globaux si on a de la place
    impacts.forEach((impact) => {
      if (impactIndex < 5) {
        hitPointsArray[impactIndex]?.set(...impact.hitPoint)
        strengthsArray[impactIndex] = impact.strength
        impactIndex++
      }
    })

    uniforms.uActiveImpacts.value = impactIndex
  })

  return (
    <mesh
      ref={meshRef}
      onPointerDown={handlePointerDown}
    >
      {/* Ellipsoïde : sphère étirée, 12 segments pour mobile */}
      <sphereGeometry args={[0.35, 12, 10]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
