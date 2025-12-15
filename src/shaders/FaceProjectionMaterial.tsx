import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'
import * as THREE from 'three'
import { useImpactStore } from '../stores'

/**
 * Vertex shader avec projection frontale de texture
 * Calcule les UVs basés sur la position locale du mesh, pas ses UVs originaux
 */
const vertexShader = /* glsl */ `
  // Uniforms pour la projection
  uniform vec3 uBoundsMin;
  uniform vec3 uBoundsMax;
  uniform float uTextureZoom;
  uniform float uTextureOffsetX;
  uniform float uTextureOffsetY;

  // Uniforms pour multi-impact
  uniform vec3 uHitPoints[5];
  uniform float uStrengths[5];
  uniform int uActiveImpacts;
  uniform float uTime;
  uniform float uRadius;
  uniform float uMaxDeform;

  // Varyings
  varying vec2 vProjectedUv;
  varying float vDeformAmount;

  void main() {
    vec3 pos = csm_Position;
    float totalDeform = 0.0;
    float time = uTime * 0.001;

    // ============================================
    // 1. Projection frontale UV basée sur position
    // ============================================
    // Normalise la position dans l'espace du bounding box (0-1)
    vec3 normalizedPos = (pos - uBoundsMin) / (uBoundsMax - uBoundsMin);

    // Utilise X et Y pour les UVs (projection frontale)
    vec2 projectedUv = vec2(normalizedPos.x, normalizedPos.y);

    // Applique zoom et offset
    projectedUv = (projectedUv - 0.5) / uTextureZoom + 0.5;
    projectedUv += vec2(uTextureOffsetX, uTextureOffsetY);

    vProjectedUv = projectedUv;

    // ============================================
    // 2. Déformation par impact
    // ============================================
    for (int i = 0; i < 5; i++) {
      if (i >= uActiveImpacts) break;

      vec3 hitPoint = uHitPoints[i];
      float strength = uStrengths[i];
      float dist = distance(pos, hitPoint);

      if (dist < uRadius) {
        float falloff = 1.0 - (dist / uRadius);
        falloff = falloff * falloff;

        float bounce = 1.0 + sin(time * 15.0) * exp(-time * 4.0) * 0.3;
        float deform = strength * falloff * uMaxDeform * bounce;
        pos -= csm_Normal * deform;
        totalDeform += deform;
      }
    }

    vDeformAmount = clamp(totalDeform, 0.0, 1.0);
    csm_Position = pos;
  }
`

/**
 * Fragment shader avec texture projetée
 */
const fragmentShader = /* glsl */ `
  varying vec2 vProjectedUv;
  varying float vDeformAmount;

  uniform sampler2D uTextureMap;
  uniform bool uHasTexture;
  uniform float uFlashIntensity;

  void main() {
    // Applique la texture projetée
    if (uHasTexture) {
      // Clamp UVs pour éviter les artefacts aux bords
      vec2 clampedUv = clamp(vProjectedUv, 0.0, 1.0);
      vec4 texColor = texture2D(uTextureMap, clampedUv);

      // Masque doux aux bords (fade out si hors de 0-1)
      float edgeFade = 1.0;
      float fadeWidth = 0.05;
      edgeFade *= smoothstep(0.0, fadeWidth, vProjectedUv.x);
      edgeFade *= smoothstep(0.0, fadeWidth, vProjectedUv.y);
      edgeFade *= smoothstep(0.0, fadeWidth, 1.0 - vProjectedUv.x);
      edgeFade *= smoothstep(0.0, fadeWidth, 1.0 - vProjectedUv.y);

      csm_DiffuseColor.rgb = mix(csm_DiffuseColor.rgb, texColor.rgb, edgeFade);
    }

    // Teinte rouge sur impact
    vec3 impactTint = vec3(1.0, 0.2, 0.2) * vDeformAmount * uFlashIntensity;
    csm_DiffuseColor.rgb = mix(csm_DiffuseColor.rgb, impactTint + csm_DiffuseColor.rgb, vDeformAmount * 0.5);
  }
`

interface FaceProjectionMaterialProps {
  map?: THREE.Texture | null
  color?: string
  boundsMin?: THREE.Vector3
  boundsMax?: THREE.Vector3
  textureZoom?: number
  textureOffsetX?: number
  textureOffsetY?: number
}

/**
 * Matériau avec projection frontale de texture
 * Projette la texture sur le mesh basé sur sa position locale (X, Y)
 * Idéal pour appliquer une photo sur un visage 3D
 */
export function FaceProjectionMaterial({
  map,
  color = '#ffdbac',
  boundsMin = new THREE.Vector3(-1, -1, -1),
  boundsMax = new THREE.Vector3(1, 1, 1),
  textureZoom = 1.0,
  textureOffsetX = 0,
  textureOffsetY = 0,
}: FaceProjectionMaterialProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const materialRef = useRef<any>(null)
  const impacts = useImpactStore((state) => state.impacts)
  const tick = useImpactStore((state) => state.tick)

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
      // Projection uniforms
      uBoundsMin: { value: boundsMin.clone() },
      uBoundsMax: { value: boundsMax.clone() },
      uTextureZoom: { value: textureZoom },
      uTextureOffsetX: { value: textureOffsetX },
      uTextureOffsetY: { value: textureOffsetY },
      // Texture uniforms
      uTextureMap: { value: null as THREE.Texture | null },
      uHasTexture: { value: false },
      // Impact uniforms
      uHitPoints: { value: hitPointsArray },
      uStrengths: { value: strengthsArray },
      uActiveImpacts: { value: 0 },
      uRadius: { value: 0.5 },
      uMaxDeform: { value: 0.3 },
      uFlashIntensity: { value: 1.5 },
      uTime: { value: 0 },
    }),
    [hitPointsArray, strengthsArray, boundsMin, boundsMax, textureZoom, textureOffsetX, textureOffsetY]
  )

  // Mise à jour des uniforms chaque frame
  useFrame((_, delta) => {
    tick(delta)

    if (!materialRef.current) return

    uniforms.uTime.value = performance.now()

    // Reset arrays
    for (let i = 0; i < 5; i++) {
      hitPointsArray[i]?.set(0, 0, 0)
      strengthsArray[i] = 0
    }

    // Remplir avec impacts actifs
    impacts.forEach((impact, i) => {
      if (i < 5) {
        hitPointsArray[i]?.set(...impact.hitPoint)
        strengthsArray[i] = impact.strength
      }
    })

    uniforms.uActiveImpacts.value = Math.min(impacts.length, 5)
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
      roughness: 0.6,
      metalness: 0.1,
    })
    return mat
  }, [color, uniforms])

  // Mise à jour texture
  useEffect(() => {
    if (material) {
      uniforms.uTextureMap.value = map || null
      uniforms.uHasTexture.value = !!map
      material.needsUpdate = true
    }
  }, [material, map, uniforms])

  // Mise à jour des bounds
  useEffect(() => {
    uniforms.uBoundsMin.value.copy(boundsMin)
    uniforms.uBoundsMax.value.copy(boundsMax)
  }, [boundsMin, boundsMax, uniforms])

  // Mise à jour des paramètres de texture
  useEffect(() => {
    uniforms.uTextureZoom.value = textureZoom
    uniforms.uTextureOffsetX.value = textureOffsetX
    uniforms.uTextureOffsetY.value = textureOffsetY
  }, [textureZoom, textureOffsetX, textureOffsetY, uniforms])

  useEffect(() => {
    materialRef.current = material
  }, [material])

  return <primitive object={material} attach="material" />
}

export default FaceProjectionMaterial
