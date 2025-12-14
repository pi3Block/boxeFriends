import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'
import * as THREE from 'three'
import { useImpactStore } from '../stores'

/**
 * Vertex shader GLSL avec effet wobble/jelly + déformation multi-impact
 * Simule un comportement de gélatine/flubber organique
 */
const vertexShader = /* glsl */ `
  // Uniforms pour multi-impact (max 5)
  uniform vec3 uHitPoints[5];
  uniform float uStrengths[5];
  uniform int uActiveImpacts;
  uniform float uTime;

  // Paramètres de déformation d'impact
  uniform float uRadius;
  uniform float uMaxDeform;

  // Paramètres wobble/jelly
  uniform float uWobbleSpeed;      // Vitesse d'oscillation (default: 2.0)
  uniform float uWobbleAmplitude;  // Amplitude du wobble (default: 0.05)
  uniform float uWobbleFrequency;  // Fréquence spatiale (default: 3.0)
  uniform float uJellyDamping;     // Amortissement après impact (default: 3.0)
  uniform float uMassGradient;     // Gradient de masse vertical (default: 0.5)

  // Paramètres de transformation UV
  uniform float uTextureZoom;
  uniform float uTextureOffsetX;
  uniform float uTextureOffsetY;

  // Varying pour le fragment shader
  varying float vDeformAmount;
  varying float vWobbleIntensity;
  varying vec2 vTransformedUv;

  // ============================================
  // Simplex 3D Noise (optimisé pour GPU)
  // ============================================
  vec4 permute(vec4 x) {
    return mod(((x * 34.0) + 1.0) * x, 289.0);
  }

  vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
  }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    // First corner
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    // Permutations
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    // Gradients
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

    // Normalise gradients
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    // Mix final noise value
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  // ============================================
  // Fonction d'onde secondaire (ripple)
  // ============================================
  float secondaryWave(vec3 pos, vec3 hitPoint, float strength, float time) {
    float dist = distance(pos, hitPoint);
    float waveSpeed = 4.0;
    float waveLength = 0.3;
    float phase = dist / waveLength - time * waveSpeed;
    float envelope = exp(-dist * 2.0) * exp(-time * uJellyDamping);
    return sin(phase * 6.28318) * envelope * strength * 0.3;
  }

  void main() {
    vec3 pos = csm_Position;
    float totalDeform = 0.0;
    float totalWobble = 0.0;
    float time = uTime * 0.001;

    // ============================================
    // 1. Wobble idle (mouvement continu organique)
    // ============================================

    // Gradient de masse : plus de wobble en haut, moins en bas
    float massWeight = 1.0 - (pos.y * uMassGradient * 0.5 + 0.5);
    massWeight = clamp(massWeight, 0.3, 1.0);

    // Noise 3D pour mouvement organique
    vec3 noiseCoord = pos * uWobbleFrequency + vec3(time * uWobbleSpeed);
    float noise1 = snoise(noiseCoord);
    float noise2 = snoise(noiseCoord * 1.5 + vec3(100.0));
    float noise3 = snoise(noiseCoord * 0.7 + vec3(200.0));

    // Déplacement wobble dans toutes les directions
    vec3 wobbleOffset = vec3(noise1, noise2, noise3) * uWobbleAmplitude * massWeight;

    // Ajouter des oscillations sinusoïdales pour effet jelly
    float jellyOsc1 = sin(time * uWobbleSpeed * 3.0 + pos.y * 5.0) * 0.02;
    float jellyOsc2 = cos(time * uWobbleSpeed * 2.5 + pos.x * 4.0) * 0.015;
    wobbleOffset.x += jellyOsc1 * massWeight;
    wobbleOffset.z += jellyOsc2 * massWeight;

    pos += wobbleOffset;
    totalWobble = length(wobbleOffset);

    // ============================================
    // 2. Déformation par impact + onde secondaire
    // ============================================
    for (int i = 0; i < 5; i++) {
      if (i >= uActiveImpacts) break;

      vec3 hitPoint = uHitPoints[i];
      float strength = uStrengths[i];
      float dist = distance(pos, hitPoint);

      // Déformation principale (enfoncement) - appliquée globalement
      float globalFalloff = exp(-dist * 1.5); // Falloff exponentiel global

      // Déformation locale intense au point d'impact
      if (dist < uRadius) {
        float falloff = 1.0 - (dist / uRadius);
        falloff = falloff * falloff * falloff; // Cubique pour effet plus concentré

        // Rebond élastique amorti plus prononcé
        float bounce = 1.0 + sin(time * 20.0) * exp(-time * 3.0) * 0.5;
        float deform = strength * falloff * uMaxDeform * bounce;
        pos -= csm_Normal * deform;
        totalDeform += deform;
      }

      // Wobble d'impact GLOBAL (toute la surface tremble)
      float impactWobble = strength * globalFalloff * 0.25; // Augmenté de 0.1 à 0.25
      float wobbleDecay = exp(-time * uJellyDamping * 0.5); // Decay plus lent
      pos += vec3(
        sin(time * 25.0 + pos.y * 8.0) * cos(time * 12.0),
        cos(time * 22.0 + pos.x * 6.0) * sin(time * 15.0),
        sin(time * 28.0 + pos.z * 10.0) * cos(time * 10.0)
      ) * impactWobble * wobbleDecay;
      totalWobble += impactWobble * wobbleDecay;

      // Onde secondaire (ripple qui se propage) - amplifiée
      float ripple = secondaryWave(pos, hitPoint, strength, time * 0.3);
      pos += csm_Normal * ripple * 1.5; // Amplifié x1.5
      totalWobble += abs(ripple) * 1.5;
    }

    // ============================================
    // 3. Effet de "squash and stretch" global
    // ============================================
    float squashStretch = 1.0 + totalDeform * 0.2;
    // Quand enfoncé, s'élargit sur les côtés (conservation du volume)
    pos.x *= 1.0 + totalDeform * 0.1;
    pos.z *= 1.0 + totalDeform * 0.1;
    pos.y *= 1.0 - totalDeform * 0.05;

    vDeformAmount = clamp(totalDeform, 0.0, 1.0);
    vWobbleIntensity = clamp(totalWobble * 5.0, 0.0, 1.0);
    csm_Position = pos;

    // ============================================
    // 4. Transformation UV pour la texture
    // ============================================
    // Centre les UVs autour de 0.5, applique zoom et offset, puis recentre
    vec2 centeredUv = uv - 0.5;
    centeredUv = centeredUv / uTextureZoom;  // Zoom (division = zoom in)
    centeredUv += vec2(uTextureOffsetX, uTextureOffsetY);  // Offset
    vTransformedUv = centeredUv + 0.5;
  }
`

/**
 * Fragment shader GLSL pour l'effet visuel d'impact + jelly
 */
const fragmentShader = /* glsl */ `
  varying float vDeformAmount;
  varying float vWobbleIntensity;
  varying vec2 vTransformedUv;
  uniform float uFlashIntensity;
  uniform float uJellySheen;  // Brillance jelly (default: 0.3)
  uniform sampler2D uTextureMap;
  uniform bool uHasTexture;

  void main() {
    // Appliquer la texture avec UVs transformés si disponible
    if (uHasTexture) {
      vec4 texColor = texture2D(uTextureMap, vTransformedUv);
      csm_DiffuseColor.rgb = texColor.rgb;
    }

    // Teinte rouge proportionnelle à la déformation d'impact
    vec3 impactTint = vec3(1.0, 0.2, 0.2) * vDeformAmount * uFlashIntensity;

    // Effet de brillance jelly (subsurface scattering simplifié)
    // Le wobble crée des reflets dynamiques
    float sheenAmount = vWobbleIntensity * uJellySheen;
    vec3 sheenColor = vec3(1.0, 0.95, 0.9) * sheenAmount;

    // Combiner les effets
    vec3 finalColor = csm_DiffuseColor.rgb;
    finalColor = mix(finalColor, impactTint + finalColor, vDeformAmount * 0.5);
    finalColor += sheenColor;

    csm_DiffuseColor.rgb = finalColor;

    // Légère variation de roughness pour effet gélatine (plus brillant au wobble)
    // Note: csm_Roughness disponible si on veut aller plus loin
  }
`

interface DeformableFaceMaterialProps {
  map?: THREE.Texture | null
  color?: string
  // Paramètres wobble/jelly
  wobbleSpeed?: number      // Vitesse d'oscillation (default: 2.0)
  wobbleAmplitude?: number  // Amplitude du wobble (default: 0.05)
  wobbleFrequency?: number  // Fréquence spatiale (default: 3.0)
  jellyDamping?: number     // Amortissement après impact (default: 3.0)
  massGradient?: number     // Gradient de masse vertical (default: 0.5)
  jellySheen?: number       // Brillance jelly (default: 0.3)
  // Paramètres de transformation de texture
  textureZoom?: number      // Zoom (1 = normal, >1 = zoom in)
  textureOffsetX?: number   // Décalage horizontal
  textureOffsetY?: number   // Décalage vertical
}

/**
 * Composant Material custom avec déformation par impact + effet wobble/jelly
 * Utilise three-custom-shader-material pour étendre MeshStandardMaterial
 *
 * L'effet jelly simule un comportement de gélatine organique avec :
 * - Wobble idle continu basé sur du bruit Simplex 3D
 * - Ondes secondaires (ripples) lors des impacts
 * - Gradient de masse (plus de mouvement en haut)
 * - Squash & stretch pour conservation du volume
 */
export function DeformableFaceMaterial({
  map,
  color = '#ffdbac',
  // Paramètres jelly avec valeurs par défaut
  wobbleSpeed = 2.0,
  wobbleAmplitude = 0.05,
  wobbleFrequency = 3.0,
  jellyDamping = 3.0,
  massGradient = 0.5,
  jellySheen = 0.3,
  // Paramètres texture avec valeurs par défaut
  textureZoom = 1.5,
  textureOffsetX = 0,
  textureOffsetY = 0,
}: DeformableFaceMaterialProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const materialRef = useRef<any>(null)
  const impacts = useImpactStore((state) => state.impacts)
  const tick = useImpactStore((state) => state.tick)

  // Créer les uniforms une seule fois
  const hitPointsArray = useMemo(() => [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ], [])

  const strengthsArray = useMemo(() => new Float32Array(5), [])

  const uniforms = useMemo(
    () => ({
      // Impact uniforms
      uHitPoints: { value: hitPointsArray },
      uStrengths: { value: strengthsArray },
      uActiveImpacts: { value: 0 },
      uRadius: { value: 0.8 },
      uMaxDeform: { value: 0.4 },
      uFlashIntensity: { value: 1.5 },
      uTime: { value: 0 },
      // Wobble/Jelly uniforms
      uWobbleSpeed: { value: wobbleSpeed },
      uWobbleAmplitude: { value: wobbleAmplitude },
      uWobbleFrequency: { value: wobbleFrequency },
      uJellyDamping: { value: jellyDamping },
      uMassGradient: { value: massGradient },
      uJellySheen: { value: jellySheen },
      // Texture transform uniforms
      uTextureZoom: { value: textureZoom },
      uTextureOffsetX: { value: textureOffsetX },
      uTextureOffsetY: { value: textureOffsetY },
      uTextureMap: { value: null as THREE.Texture | null },
      uHasTexture: { value: false },
    }),
    [hitPointsArray, strengthsArray, wobbleSpeed, wobbleAmplitude, wobbleFrequency, jellyDamping, massGradient, jellySheen, textureZoom, textureOffsetX, textureOffsetY]
  )

  // Mettre à jour les uniforms à chaque frame
  useFrame((_, delta) => {
    // Mettre à jour le decay des impacts
    tick(delta)

    if (!materialRef.current) return

    // Mettre à jour le temps
    uniforms.uTime.value = performance.now()

    // Reset arrays
    for (let i = 0; i < 5; i++) {
      hitPointsArray[i]?.set(0, 0, 0)
      strengthsArray[i] = 0
    }

    // Remplir avec les impacts actifs
    impacts.forEach((impact, i) => {
      if (i < 5) {
        hitPointsArray[i]?.set(...impact.hitPoint)
        strengthsArray[i] = impact.strength
      }
    })

    uniforms.uActiveImpacts.value = Math.min(impacts.length, 5)

    // Forcer la mise à jour du material
    materialRef.current.needsUpdate = true
  })

  // Créer le material CSM
  const material = useMemo(() => {
    const mat = new CustomShaderMaterial({
      baseMaterial: THREE.MeshStandardMaterial,
      vertexShader,
      fragmentShader,
      uniforms: uniforms as unknown as { [key: string]: THREE.IUniform },
      flatShading: false,
      color: new THREE.Color(color),
      roughness: 0.7,
      metalness: 0.1,
    })

    return mat
  }, [color, uniforms])

  // Mettre à jour la texture et ses uniforms
  useEffect(() => {
    if (material) {
      uniforms.uTextureMap.value = map || null
      uniforms.uHasTexture.value = !!map
      material.needsUpdate = true
    }
  }, [material, map, uniforms])

  // Stocker la ref
  useEffect(() => {
    materialRef.current = material
  }, [material])

  return <primitive object={material} attach="material" />
}

export default DeformableFaceMaterial
