"use client"

import { useRef, useCallback } from "react"
import { useAppStore } from "@/lib/store"
import { validateFile } from "@/lib/validate"
import { uploadFile } from "@/lib/fal"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Download, X, ImageIcon } from "lucide-react"
import { nanoid } from "nanoid"

export function CanvasArea() {
  const { canvasImage, isEditingMode, isLoading, setEditingMode, updateEditingTarget, clearCanvas } =
    useAppStore()
  const dragCounterRef = useRef(0)
  const isDraggingRef = useRef(false)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mobile long-press: re-edit the current canvas image (already a FAL URL, no re-upload)
  const handleTouchStart = useCallback(() => {
    if (!canvasImage) return
    longPressRef.current = setTimeout(() => {
      setEditingMode(true, {
        id: nanoid(),
        localUrl: canvasImage,
        falUrl: canvasImage,
        name: "canvas-image.png",
        uploading: false,
      })
    }, 600)
  }, [canvasImage, setEditingMode])

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    isDraggingRef.current = true
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) isDraggingRef.current = false
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      dragCounterRef.current = 0
      isDraggingRef.current = false

      const file = e.dataTransfer.files[0]
      if (!file) return

      const error = validateFile(file)
      if (error) { toast.error(error); return }

      const localUrl = URL.createObjectURL(file)
      const ref = { id: nanoid(), localUrl, falUrl: null, name: file.name, uploading: true }
      setEditingMode(true, ref)

      try {
        const falUrl = await uploadFile(file)
        updateEditingTarget({ falUrl, uploading: false })
      } catch {
        toast.error("上传失败，请重试")
        setEditingMode(false, null)
        URL.revokeObjectURL(localUrl)
      }
    },
    [setEditingMode, updateEditingTarget]
  )

  const handleDownload = useCallback(() => {
    if (!canvasImage) return
    const a = document.createElement("a")
    a.href = canvasImage
    a.download = `lovart-${Date.now()}.png`
    a.click()
  }, [canvasImage])

  return (
    <div
      className="relative flex flex-col h-full bg-zinc-950 border-r border-zinc-800"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Main image area */}
      <div className="flex-1 flex items-center justify-center p-6 min-h-0">
        {canvasImage ? (
          <img
            src={canvasImage}
            alt="Canvas result"
            className="max-w-full max-h-full object-contain rounded-lg select-none"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-zinc-600">
            <ImageIcon className="w-16 h-16" />
            <p className="text-sm">拖入图片开始编辑，或在右侧输入创作指令</p>
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-zinc-950/80 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">AI 正在思考...</p>
        </div>
      )}

      {/* Bottom controls */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
        <span className="text-xs font-medium px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">
          {isEditingMode ? "编辑模式" : "创建模式"}
        </span>
        <div className="flex gap-2">
          {canvasImage && (
            <Button size="sm" variant="ghost" onClick={handleDownload} className="text-zinc-400 hover:text-zinc-100">
              <Download className="w-4 h-4 mr-1" /> 下载
            </Button>
          )}
          {(canvasImage || isEditingMode) && (
            <Button size="sm" variant="ghost" onClick={clearCanvas} className="text-zinc-400 hover:text-zinc-100">
              <X className="w-4 h-4 mr-1" /> 清除
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
