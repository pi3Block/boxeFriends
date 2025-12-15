import { useRef, useState, useEffect, useCallback } from 'react'

interface FaceCropperProps {
  imageUrl: string
  onConfirm: (croppedImageUrl: string) => void
  onCancel: () => void
}

/**
 * Composant pour cropper/positionner une photo de visage
 * L'utilisateur peut drag & zoom pour cadrer le visage dans l'ovale guide
 */
export function FaceCropper({ imageUrl, onConfirm, onCancel }: FaceCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // État de l'image
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  // État de la transformation (position et zoom)
  const [transform, setTransform] = useState({
    x: 0,      // Décalage X
    y: 0,      // Décalage Y
    scale: 1,  // Zoom
  })

  // État du drag
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Taille du canvas de sortie
  const OUTPUT_SIZE = 512
  const CANVAS_DISPLAY_SIZE = 300

  // Charger l'image
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImage(img)
      setImageLoaded(true)

      // Calculer le scale initial pour que l'image remplisse le canvas
      const minScale = Math.max(
        CANVAS_DISPLAY_SIZE / img.width,
        CANVAS_DISPLAY_SIZE / img.height
      )
      setTransform({
        x: 0,
        y: 0,
        scale: minScale * 1.2, // Un peu plus grand pour permettre l'ajustement
      })
    }
    img.src = imageUrl
  }, [imageUrl])

  // Dessiner le canvas
  useEffect(() => {
    if (!canvasRef.current || !image || !imageLoaded) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!

    // Clear
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, CANVAS_DISPLAY_SIZE, CANVAS_DISPLAY_SIZE)

    // Dessiner l'image transformée
    ctx.save()
    ctx.translate(CANVAS_DISPLAY_SIZE / 2 + transform.x, CANVAS_DISPLAY_SIZE / 2 + transform.y)
    ctx.scale(transform.scale, transform.scale)
    ctx.drawImage(
      image,
      -image.width / 2,
      -image.height / 2,
      image.width,
      image.height
    )
    ctx.restore()

    // Dessiner l'overlay semi-transparent
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(0, 0, CANVAS_DISPLAY_SIZE, CANVAS_DISPLAY_SIZE)

    // Découper l'ovale du visage (zone visible)
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.ellipse(
      CANVAS_DISPLAY_SIZE / 2,
      CANVAS_DISPLAY_SIZE / 2,
      CANVAS_DISPLAY_SIZE * 0.35,  // Largeur de l'ovale
      CANVAS_DISPLAY_SIZE * 0.45,  // Hauteur de l'ovale
      0, 0, Math.PI * 2
    )
    ctx.fill()
    ctx.restore()

    // Dessiner le contour de l'ovale guide
    ctx.strokeStyle = '#4ade80'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.ellipse(
      CANVAS_DISPLAY_SIZE / 2,
      CANVAS_DISPLAY_SIZE / 2,
      CANVAS_DISPLAY_SIZE * 0.35,
      CANVAS_DISPLAY_SIZE * 0.45,
      0, 0, Math.PI * 2
    )
    ctx.stroke()
    ctx.setLineDash([])

    // Dessiner les guides pour les yeux
    const eyeY = CANVAS_DISPLAY_SIZE * 0.38
    const eyeSpacing = CANVAS_DISPLAY_SIZE * 0.15
    ctx.fillStyle = 'rgba(74, 222, 128, 0.5)'
    ctx.beginPath()
    ctx.arc(CANVAS_DISPLAY_SIZE / 2 - eyeSpacing, eyeY, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(CANVAS_DISPLAY_SIZE / 2 + eyeSpacing, eyeY, 8, 0, Math.PI * 2)
    ctx.fill()

    // Texte guide
    ctx.fillStyle = '#ffffff'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Alignez les yeux avec les cercles', CANVAS_DISPLAY_SIZE / 2, CANVAS_DISPLAY_SIZE - 15)

  }, [image, imageLoaded, transform])

  // Gestionnaires de drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y })
  }, [transform])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setTransform(prev => ({
      ...prev,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    }))
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Gestionnaire de zoom (molette)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.95 : 1.05
    setTransform(prev => ({
      ...prev,
      scale: Math.max(0.1, Math.min(5, prev.scale * delta)),
    }))
  }, [])

  // Touch events pour mobile
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true)
      setDragStart({
        x: e.touches[0].clientX - transform.x,
        y: e.touches[0].clientY - transform.y,
      })
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      setLastTouchDistance(dist)
    }
  }, [transform])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      setTransform(prev => ({
        ...prev,
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      }))
    } else if (e.touches.length === 2 && lastTouchDistance !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const scale = dist / lastTouchDistance
      setTransform(prev => ({
        ...prev,
        scale: Math.max(0.1, Math.min(5, prev.scale * scale)),
      }))
      setLastTouchDistance(dist)
    }
  }, [isDragging, dragStart, lastTouchDistance])

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
    setLastTouchDistance(null)
  }, [])

  // Exporter l'image croppée
  const handleConfirm = useCallback(() => {
    if (!image) return

    // Créer un canvas de sortie
    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = OUTPUT_SIZE
    outputCanvas.height = OUTPUT_SIZE
    const ctx = outputCanvas.getContext('2d')!

    // Calculer le ratio entre l'affichage et la sortie
    const ratio = OUTPUT_SIZE / CANVAS_DISPLAY_SIZE

    // Fond
    ctx.fillStyle = '#f5deb3' // Couleur peau pour les zones vides
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

    // Dessiner l'image avec la même transformation, mise à l'échelle
    ctx.save()
    ctx.translate(OUTPUT_SIZE / 2 + transform.x * ratio, OUTPUT_SIZE / 2 + transform.y * ratio)
    ctx.scale(transform.scale * ratio, transform.scale * ratio)
    ctx.drawImage(
      image,
      -image.width / 2,
      -image.height / 2,
      image.width,
      image.height
    )
    ctx.restore()

    // Exporter en blob URL
    outputCanvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob)
        onConfirm(url)
      }
    }, 'image/png')
  }, [image, transform, onConfirm])

  // Zoom buttons
  const handleZoomIn = () => {
    setTransform(prev => ({ ...prev, scale: Math.min(5, prev.scale * 1.2) }))
  }

  const handleZoomOut = () => {
    setTransform(prev => ({ ...prev, scale: Math.max(0.1, prev.scale / 1.2) }))
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-xl bg-gray-900 p-6">
        <h2 className="text-xl font-bold text-white">Positionner le visage</h2>
        <p className="text-center text-sm text-gray-400">
          Glissez et zoomez pour aligner le visage avec le guide
        </p>

        {/* Canvas de preview */}
        <div
          ref={containerRef}
          className="cursor-move overflow-hidden rounded-lg border-2 border-gray-700"
          style={{ width: CANVAS_DISPLAY_SIZE, height: CANVAS_DISPLAY_SIZE }}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_DISPLAY_SIZE}
            height={CANVAS_DISPLAY_SIZE}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="touch-none"
          />
        </div>

        {/* Contrôles de zoom */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleZoomOut}
            className="rounded-full bg-gray-700 px-4 py-2 text-white hover:bg-gray-600"
          >
            −
          </button>
          <span className="text-sm text-gray-400">
            Zoom: {Math.round(transform.scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="rounded-full bg-gray-700 px-4 py-2 text-white hover:bg-gray-600"
          >
            +
          </button>
        </div>

        {/* Boutons d'action */}
        <div className="flex w-full gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg bg-gray-700 px-4 py-3 font-bold text-white hover:bg-gray-600"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={!imageLoaded}
            className="flex-1 rounded-lg bg-green-600 px-4 py-3 font-bold text-white hover:bg-green-500 disabled:bg-gray-600"
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}

export default FaceCropper
