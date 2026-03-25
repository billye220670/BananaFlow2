"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from "react-konva"
import Konva from "konva"
import { useAppStore } from "@/lib/store"
import { validateFile } from "@/lib/validate"
import { uploadFile } from "@/lib/fal"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Download, X, ImageIcon } from "lucide-react"
import { nanoid } from "nanoid"
import type { CanvasItem } from "@/lib/types"

// ── Shimmer placeholder ─────────────────────────────────────────────────────

function PlaceholderNode({ item }: { item: CanvasItem }) {
  const rectRef = useRef<Konva.Rect>(null)
  const w = item.width || 400
  const h = item.height || 400

  useEffect(() => {
    const rect = rectRef.current
    if (!rect) return

    // Gradient spans 3× rect width; its bright centre sweeps from -0.5w → 1.5w
    // so the band enters from the left and exits to the right over one full cycle.
    const gradW = w * 3
    let progress = 0
    let rafId: number

    const tick = () => {
      progress = (progress + 0.01) % 1          // ~1.7 s per sweep at 60 fps
      const cx = -0.5 * w + progress * 2 * w    // bright centre in canvas coords
      rect.fillLinearGradientStartPoint({ x: cx - gradW / 2, y: 0 })
      rect.fillLinearGradientEndPoint({   x: cx + gradW / 2, y: 0 })
      rect.fillLinearGradientColorStops([
        0,    "#27272a",
        0.40, "#27272a",
        0.45, "#3f3f46",
        0.50, "#71717a",
        0.55, "#3f3f46",
        0.60, "#27272a",
        1,    "#27272a",
      ])
      rect.getLayer()?.batchDraw()
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w])

  return (
    <Rect
      ref={rectRef}
      x={item.x}
      y={item.y}
      width={w}
      height={h}
      fill="#27272a"
      cornerRadius={8}
      listening={false}
    />
  )
}

// ── Image node with transformer ─────────────────────────────────────────────

function CanvasItemNode({
  item,
  isSelected,
  onSelect,
}: {
  item: CanvasItem
  isSelected: boolean
  onSelect: () => void
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const { updateCanvasItem } = useAppStore()
  const imgRef = useRef<Konva.Image>(null)
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    const image = new window.Image()
    image.crossOrigin = "anonymous"
    image.onload = () => {
      setImg(image)
      if (item.width === 0) {
        const maxW = 480
        const scale = Math.min(maxW / image.naturalWidth, maxW / image.naturalHeight, 1)
        updateCanvasItem(item.id, {
          width: Math.round(image.naturalWidth * scale),
          height: Math.round(image.naturalHeight * scale),
        })
      }
    }
    image.src = item.url
    return () => { image.onload = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.url])

  useEffect(() => {
    if (isSelected && imgRef.current && trRef.current) {
      trRef.current.nodes([imgRef.current])
      trRef.current.getLayer()?.batchDraw()
    }
  }, [isSelected, img])

  if (!img || item.width === 0) return null

  return (
    <>
      <KonvaImage
        ref={imgRef}
        image={img}
        x={item.x}
        y={item.y}
        width={item.width}
        height={item.height}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) =>
          updateCanvasItem(item.id, { x: e.target.x(), y: e.target.y() })
        }
        stroke={isSelected ? "#8b5cf6" : undefined}
        strokeWidth={isSelected ? 2 : 0}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          borderStroke="#8b5cf6"
          borderStrokeWidth={1.5}
          anchorStroke="#8b5cf6"
          anchorFill="#1c1917"
          anchorSize={8}
          rotateEnabled={false}
          keepRatio
          onTransformEnd={() => {
            const node = imgRef.current
            if (!node) return
            const scaleX = node.scaleX()
            const scaleY = node.scaleY()
            node.scaleX(1)
            node.scaleY(1)
            updateCanvasItem(item.id, {
              x: node.x(),
              y: node.y(),
              width: Math.max(40, node.width() * scaleX),
              height: Math.max(40, node.height() * scaleY),
            })
          }}
        />
      )}
    </>
  )
}

// ── Main canvas ─────────────────────────────────────────────────────────────

export function CanvasArea() {
  const {
    canvasItems,
    isEditingMode,
    editingTarget,
    setEditingMode,
    addCanvasItem,
    removeCanvasItem,
    clearCanvas,
  } = useAppStore()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const dragCounterRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  // Middle-mouse pan state
  const midPanRef = useRef(false)
  const midLastRef = useRef({ x: 0, y: 0 })

  // Sync selection when editing target cleared externally
  useEffect(() => {
    if (!editingTarget) setSelectedId(null)
  }, [editingTarget])

  // Responsive Stage size
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ width: Math.round(width), height: Math.round(height) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Middle-mouse pan via native events (bypasses Konva entirely)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onDown = (e: MouseEvent) => {
      if (e.button !== 1) return
      e.preventDefault()
      midPanRef.current = true
      midLastRef.current = { x: e.clientX, y: e.clientY }
    }
    const onMove = (e: MouseEvent) => {
      if (!midPanRef.current) return
      const stage = stageRef.current
      if (!stage) return
      stage.position({
        x: stage.x() + (e.clientX - midLastRef.current.x),
        y: stage.y() + (e.clientY - midLastRef.current.y),
      })
      stage.batchDraw()
      midLastRef.current = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: MouseEvent) => {
      if (e.button === 1) midPanRef.current = false
    }

    el.addEventListener("mousedown", onDown)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      el.removeEventListener("mousedown", onDown)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  // Wheel zoom toward cursor
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const BY = 1.08
    const old = stage.scaleX()
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const to = { x: (pointer.x - stage.x()) / old, y: (pointer.y - stage.y()) / old }
    const next = e.evt.deltaY < 0 ? Math.min(old * BY, 10) : Math.max(old / BY, 0.05)
    stage.scale({ x: next, y: next })
    stage.position({ x: pointer.x - to.x * next, y: pointer.y - to.y * next })
  }, [])

  // Block Konva drag when middle button is held
  const handleDragStart = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (midPanRef.current) e.target.stopDrag()
  }, [])

  // Click on empty Stage → deselect
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target === stageRef.current) {
        setSelectedId(null)
        setEditingMode(false, null)
      }
    },
    [setEditingMode]
  )

  const handleStageTap = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      if (e.target === stageRef.current) {
        setSelectedId(null)
        setEditingMode(false, null)
      }
    },
    [setEditingMode]
  )

  const handleItemSelect = useCallback(
    (item: CanvasItem) => {
      if (item.uploading || item.placeholder) return
      setSelectedId(item.id)
      setEditingMode(true, {
        id: item.id,
        localUrl: item.url,
        falUrl: item.falUrl ?? item.url,
        name: `canvas-${item.id}.png`,
        uploading: false,
      })
    },
    [setEditingMode]
  )

  // File drag-and-drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    setIsDraggingFile(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (--dragCounterRef.current === 0) setIsDraggingFile(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      dragCounterRef.current = 0
      setIsDraggingFile(false)

      const file = e.dataTransfer.files[0]
      if (!file) return
      const err = validateFile(file)
      if (err) { toast.error(err); return }

      const stage = stageRef.current
      const rect = containerRef.current?.getBoundingClientRect()
      let dropX = 60, dropY = 60
      if (stage && rect) {
        const p = stage.getAbsoluteTransform().copy().invert()
          .point({ x: e.clientX - rect.left, y: e.clientY - rect.top })
        dropX = p.x
        dropY = p.y
      }

      const id = nanoid()
      const localUrl = URL.createObjectURL(file)
      addCanvasItem({ id, url: localUrl, falUrl: null, x: dropX, y: dropY, width: 0, height: 0, uploading: true })

      try {
        const falUrl = await uploadFile(file)
        useAppStore.getState().updateCanvasItem(id, { falUrl, uploading: false })
      } catch {
        toast.error("上传失败，请检查 FAL_KEY 并重启服务")
        useAppStore.getState().updateCanvasItem(id, { uploading: false })
      }
    },
    [addCanvasItem]
  )

  const handleDownload = useCallback(() => {
    const item = canvasItems.find((i) => i.id === selectedId) ?? canvasItems.filter((i) => !i.placeholder).at(-1)
    if (!item) return
    const a = document.createElement("a")
    a.href = item.falUrl ?? item.url
    a.download = `lovart-${Date.now()}.png`
    a.click()
  }, [selectedId, canvasItems])

  const handleClear = useCallback(() => {
    if (selectedId) {
      removeCanvasItem(selectedId)
      setSelectedId(null)
      setEditingMode(false, null)
    } else {
      clearCanvas()
    }
  }, [selectedId, removeCanvasItem, clearCanvas, setEditingMode])

  const hasImages = canvasItems.some((i) => !i.placeholder)

  return (
    <div className="relative flex flex-col h-full bg-zinc-950 border-r border-zinc-800">
      <div
        ref={containerRef}
        className={`flex-1 min-h-0 transition-shadow ${isDraggingFile ? "ring-2 ring-violet-500 ring-inset" : ""}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {size.width > 0 && size.height > 0 && (
          <Stage
            ref={stageRef}
            width={size.width}
            height={size.height}
            draggable
            onDragStart={handleDragStart}
            onWheel={handleWheel}
            onClick={handleStageClick}
            onTap={handleStageTap}
            style={{ cursor: "grab" }}
          >
            <Layer>
              {canvasItems.map((item) =>
                item.placeholder ? (
                  <PlaceholderNode key={item.id} item={item} />
                ) : (
                  <CanvasItemNode
                    key={item.id}
                    item={item}
                    isSelected={selectedId === item.id}
                    onSelect={() => handleItemSelect(item)}
                  />
                )
              )}
            </Layer>
          </Stage>
        )}

        {!hasImages && canvasItems.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-600 pointer-events-none">
            <ImageIcon className="w-16 h-16" />
            <p className="text-sm">拖入图片开始编辑，或在右侧输入创作指令</p>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
        <span className="text-xs font-medium px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">
          {isEditingMode ? "编辑模式" : "创建模式"}
        </span>
        <div className="flex gap-2">
          {hasImages && (
            <Button size="sm" variant="ghost" onClick={handleDownload} className="text-zinc-400 hover:text-zinc-100">
              <Download className="w-4 h-4 mr-1" /> 下载
            </Button>
          )}
          {(canvasItems.length > 0 || isEditingMode) && (
            <Button size="sm" variant="ghost" onClick={handleClear} className="text-zinc-400 hover:text-zinc-100">
              <X className="w-4 h-4 mr-1" /> {selectedId ? "删除" : "清除"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
