import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

/**
 * Landmarks clés pour l'alignement du visage
 * Basé sur le mesh 468 points de MediaPipe
 */
const LANDMARKS = {
  // Centres des yeux (moyenne de plusieurs points)
  LEFT_EYE: [33, 133, 159, 145, 153, 144],
  RIGHT_EYE: [362, 263, 386, 374, 380, 373],
  // Nez
  NOSE_TIP: 1,
  NOSE_BRIDGE: 6,
  // Bouche
  MOUTH_TOP: 13,
  MOUTH_BOTTOM: 14,
  MOUTH_LEFT: 61,
  MOUTH_RIGHT: 291,
  // Contour du visage
  FACE_OVAL: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
}

/**
 * Configuration pour l'alignement
 */
interface AlignmentConfig {
  outputSize: number      // Taille de sortie (carré)
  eyeLineY: number        // Position Y des yeux (0-1, 0.35 = 35% du haut)
  faceWidthRatio: number  // Ratio largeur visage / largeur image
  padding: number         // Padding autour du visage
}

const DEFAULT_CONFIG: AlignmentConfig = {
  outputSize: 512,
  eyeLineY: 0.38,         // Yeux à 38% du haut
  faceWidthRatio: 0.65,   // Visage occupe 65% de la largeur
  padding: 0.1,
}

/**
 * Résultat de la détection faciale
 */
interface FaceDetectionResult {
  success: boolean
  landmarks?: { x: number; y: number; z: number }[]
  leftEyeCenter?: { x: number; y: number }
  rightEyeCenter?: { x: number; y: number }
  noseTip?: { x: number; y: number }
  mouthCenter?: { x: number; y: number }
  eyeDistance?: number
  faceAngle?: number
  error?: string
}

/**
 * Résultat de l'alignement
 */
interface AlignmentResult {
  success: boolean
  alignedImageUrl?: string  // Blob URL de l'image alignée
  canvas?: HTMLCanvasElement
  detection?: FaceDetectionResult
  error?: string
}

// Singleton pour le FaceLandmarker
let faceLandmarker: FaceLandmarker | null = null
let isInitializing = false

/**
 * Initialise le FaceLandmarker de MediaPipe
 */
async function initFaceLandmarker(): Promise<FaceLandmarker> {
  if (faceLandmarker) return faceLandmarker

  if (isInitializing) {
    // Attendre que l'initialisation en cours se termine
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (faceLandmarker) return faceLandmarker
  }

  isInitializing = true

  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    )

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    })

    console.log('[FaceAligner] FaceLandmarker initialisé')
    return faceLandmarker
  } finally {
    isInitializing = false
  }
}

/**
 * Calcule le centre d'un ensemble de landmarks
 */
function getLandmarkCenter(
  landmarks: { x: number; y: number; z: number }[],
  indices: number[]
): { x: number; y: number } {
  let sumX = 0, sumY = 0
  let count = 0
  for (const idx of indices) {
    const lm = landmarks[idx]
    if (lm) {
      sumX += lm.x
      sumY += lm.y
      count++
    }
  }
  if (count === 0) {
    return { x: 0.5, y: 0.5 } // Fallback au centre
  }
  return {
    x: sumX / count,
    y: sumY / count,
  }
}

/**
 * Détecte le visage et extrait les landmarks clés
 */
async function detectFace(imageElement: HTMLImageElement): Promise<FaceDetectionResult> {
  try {
    const landmarker = await initFaceLandmarker()
    const result = landmarker.detect(imageElement)

    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      return { success: false, error: 'Aucun visage détecté' }
    }

    const faceLandmarks = result.faceLandmarks[0]
    if (!faceLandmarks || faceLandmarks.length === 0) {
      return { success: false, error: 'Landmarks invalides' }
    }

    // Convertir en tableau typé
    const landmarks = faceLandmarks as { x: number; y: number; z: number }[]

    // Calculer les centres des yeux
    const leftEyeCenter = getLandmarkCenter(landmarks, LANDMARKS.LEFT_EYE)
    const rightEyeCenter = getLandmarkCenter(landmarks, LANDMARKS.RIGHT_EYE)

    // Nez et bouche
    const noseLandmark = landmarks[LANDMARKS.NOSE_TIP]
    const mouthLeftLandmark = landmarks[LANDMARKS.MOUTH_LEFT]
    const mouthRightLandmark = landmarks[LANDMARKS.MOUTH_RIGHT]
    const mouthTopLandmark = landmarks[LANDMARKS.MOUTH_TOP]
    const mouthBottomLandmark = landmarks[LANDMARKS.MOUTH_BOTTOM]

    if (!noseLandmark || !mouthLeftLandmark || !mouthRightLandmark || !mouthTopLandmark || !mouthBottomLandmark) {
      return { success: false, error: 'Landmarks du visage incomplets' }
    }

    const noseTip = {
      x: noseLandmark.x,
      y: noseLandmark.y,
    }

    const mouthCenter = {
      x: (mouthLeftLandmark.x + mouthRightLandmark.x) / 2,
      y: (mouthTopLandmark.y + mouthBottomLandmark.y) / 2,
    }

    // Distance entre les yeux
    const eyeDistance = Math.sqrt(
      Math.pow(rightEyeCenter.x - leftEyeCenter.x, 2) +
      Math.pow(rightEyeCenter.y - leftEyeCenter.y, 2)
    )

    // Angle du visage (basé sur la ligne des yeux)
    const faceAngle = Math.atan2(
      rightEyeCenter.y - leftEyeCenter.y,
      rightEyeCenter.x - leftEyeCenter.x
    )

    return {
      success: true,
      landmarks,
      leftEyeCenter,
      rightEyeCenter,
      noseTip,
      mouthCenter,
      eyeDistance,
      faceAngle,
    }
  } catch (error) {
    console.error('[FaceAligner] Erreur détection:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Aligne et normalise une image de visage
 * Retourne une image carrée avec le visage centré et redressé
 */
export async function alignFace(
  imageSource: string | HTMLImageElement | File,
  config: Partial<AlignmentConfig> = {}
): Promise<AlignmentResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  try {
    // Charger l'image
    let img: HTMLImageElement

    if (imageSource instanceof HTMLImageElement) {
      img = imageSource
    } else {
      img = new Image()
      img.crossOrigin = 'anonymous'

      const src = imageSource instanceof File
        ? URL.createObjectURL(imageSource)
        : imageSource

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Impossible de charger l\'image'))
        img.src = src
      })

      // Nettoyer le blob URL si créé
      if (imageSource instanceof File) {
        URL.revokeObjectURL(src)
      }
    }

    // Détecter le visage
    const detection = await detectFace(img)

    if (!detection.success || !detection.leftEyeCenter || !detection.rightEyeCenter) {
      return { success: false, error: detection.error || 'Détection échouée', detection }
    }

    // Créer le canvas de sortie
    const canvas = document.createElement('canvas')
    canvas.width = cfg.outputSize
    canvas.height = cfg.outputSize
    const ctx = canvas.getContext('2d')!

    // Calculer la transformation
    const { leftEyeCenter, rightEyeCenter, faceAngle, eyeDistance } = detection

    // Position des yeux en pixels dans l'image source
    const srcLeftEye = {
      x: leftEyeCenter.x * img.width,
      y: leftEyeCenter.y * img.height,
    }
    const srcRightEye = {
      x: rightEyeCenter.x * img.width,
      y: rightEyeCenter.y * img.height,
    }

    // Centre entre les deux yeux
    const eyesCenterX = (srcLeftEye.x + srcRightEye.x) / 2
    const eyesCenterY = (srcLeftEye.y + srcRightEye.y) / 2

    // Distance des yeux en pixels
    const eyeDistPx = eyeDistance! * img.width

    // Échelle pour que la distance des yeux corresponde au ratio souhaité
    // On veut que les yeux occupent environ 40% de la largeur de sortie
    const targetEyeDist = cfg.outputSize * 0.4
    const scale = targetEyeDist / eyeDistPx

    // Position cible du centre des yeux
    const targetEyesCenterX = cfg.outputSize / 2
    const targetEyesCenterY = cfg.outputSize * cfg.eyeLineY

    // Appliquer la transformation
    ctx.fillStyle = '#f5deb3' // Couleur de fond (peau)
    ctx.fillRect(0, 0, cfg.outputSize, cfg.outputSize)

    // Transformer: translate au centre cible, rotate, scale, translate depuis le centre source
    ctx.translate(targetEyesCenterX, targetEyesCenterY)
    ctx.rotate(-faceAngle!) // Annuler l'angle du visage
    ctx.scale(scale, scale)
    ctx.translate(-eyesCenterX, -eyesCenterY)

    // Dessiner l'image transformée
    ctx.drawImage(img, 0, 0)

    // Générer le blob URL
    const alignedImageUrl = await new Promise<string>((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob))
        } else {
          resolve(canvas.toDataURL('image/png'))
        }
      }, 'image/png')
    })

    console.log('[FaceAligner] Alignement réussi', {
      angle: (faceAngle! * 180 / Math.PI).toFixed(1) + '°',
      scale: scale.toFixed(2),
    })

    return {
      success: true,
      alignedImageUrl,
      canvas,
      detection,
    }

  } catch (error) {
    console.error('[FaceAligner] Erreur alignement:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Dessine les landmarks sur un canvas (pour debug)
 */
export function drawLandmarks(
  canvas: HTMLCanvasElement,
  detection: FaceDetectionResult,
  imageElement: HTMLImageElement
): void {
  const ctx = canvas.getContext('2d')!
  canvas.width = imageElement.width
  canvas.height = imageElement.height

  ctx.drawImage(imageElement, 0, 0)

  if (!detection.landmarks) return

  // Dessiner tous les landmarks
  ctx.fillStyle = '#00ff00'
  for (const lm of detection.landmarks) {
    ctx.beginPath()
    ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Dessiner les centres des yeux
  if (detection.leftEyeCenter && detection.rightEyeCenter) {
    ctx.fillStyle = '#ff0000'
    ctx.beginPath()
    ctx.arc(
      detection.leftEyeCenter.x * canvas.width,
      detection.leftEyeCenter.y * canvas.height,
      5, 0, Math.PI * 2
    )
    ctx.fill()
    ctx.beginPath()
    ctx.arc(
      detection.rightEyeCenter.x * canvas.width,
      detection.rightEyeCenter.y * canvas.height,
      5, 0, Math.PI * 2
    )
    ctx.fill()

    // Ligne entre les yeux
    ctx.strokeStyle = '#ff0000'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(detection.leftEyeCenter.x * canvas.width, detection.leftEyeCenter.y * canvas.height)
    ctx.lineTo(detection.rightEyeCenter.x * canvas.width, detection.rightEyeCenter.y * canvas.height)
    ctx.stroke()
  }
}

export default alignFace
