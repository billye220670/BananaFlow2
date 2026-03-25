"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useAppStore } from "@/lib/store"
import { validateFile } from "@/lib/validate"
import { uploadFile, editImage, generateImage } from "@/lib/fal"
import { toast } from "sonner"
import { ImagePlus, X, Loader2 } from "lucide-react"
import { nanoid } from "nanoid"
import type { CanvasItem, StoredRef } from "@/lib/types"

const MAX_REFS = 6

interface InlineEditPanelProps {
  item: CanvasItem
  visible: boolean
}

export function InlineEditPanel({
  item,
  visible,
}: InlineEditPanelProps) {
  const {
    addItemReference,
    removeItemReference,
    updateItemReference,
    reorderItemReferences,
    addCanvasItem,
    updateCanvasItem,
    removeCanvasItem,
    appendMessage,
    setLoading,
    isLoading,
  } = useAppStore()

  const [value, setValue] = useState("")
  const [dragRefId, setDragRefId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const refs = item.referenceImages || []

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "36px"
      const scrollHeight = textarea.scrollHeight
      textarea.style.height = Math.min(Math.max(36, scrollHeight), 96) + "px"
    }
  }, [value])

  // Process file upload
  const processFile = useCallback(
    async (file: File) => {
      if (refs.length >= MAX_REFS) {
        toast.error("最多 6 张参考图")
        return
      }
      const error = validateFile(file)
      if (error) {
        toast.error(error)
        return
      }

      const id = nanoid()
      const localUrl = URL.createObjectURL(file)
      addItemReference(item.id, {
        id,
        localUrl,
        falUrl: null,
        name: file.name,
        uploading: true,
      })

      try {
        const falUrl = await uploadFile(file)
        updateItemReference(item.id, id, { falUrl, uploading: false })
      } catch {
        toast.error("上传失败")
        removeItemReference(item.id, id)
        URL.revokeObjectURL(localUrl)
      }
    },
    [refs.length, item.id, addItemReference, updateItemReference, removeItemReference]
  )

  // Handle file input change
  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return
      Array.from(files).forEach(processFile)
    },
    [processFile]
  )

  // Handle send
  const handleSend = async () => {
    const prompt = value.trim()
    if (!prompt || isLoading) return

    // Check if any reference is still uploading
    if (refs.some((r) => r.uploading)) {
      toast.error("参考图正在上传中，请稍候")
      return
    }

    setValue("")
    appendMessage({
      id: nanoid(),
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    })
    setLoading(true)

    // Placeholder position: to the right of current image
    const phW = item.width || 400
    const phH = item.height || 400
    const phX = item.x + (item.width || 400) + 24
    const phY = item.y
    const phId = nanoid()

    addCanvasItem({
      id: phId,
      url: "",
      falUrl: null,
      x: phX,
      y: phY,
      width: phW,
      height: phH,
      uploading: false,
      placeholder: true,
    })

    try {
      // Image order: main image + reference images (in thumbnail order)
      const refUrls = refs.map((r) => r.falUrl!).filter(Boolean)
      const targetUrl = item.falUrl ?? item.url

      let resultUrl: string
      if (targetUrl) {
        resultUrl = await editImage({ prompt, targetUrl, referenceUrls: refUrls })
      } else {
        resultUrl = await generateImage({ prompt, referenceUrls: refUrls })
      }

      updateCanvasItem(phId, { url: resultUrl, falUrl: resultUrl, placeholder: false })
      appendMessage({
        id: nanoid(),
        role: "assistant",
        content: "已生成",
        imageUrl: resultUrl,
        timestamp: Date.now(),
      })
    } catch (err) {
      removeCanvasItem(phId)
      const isNetwork = err instanceof TypeError && err.message.includes("fetch")
      toast.error(isNetwork ? "网络连接失败，请检查网络" : "生成失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Drag and drop for reordering
  const handleRefDragStart = (
    e: React.DragEvent,
    ref: StoredRef,
    index: number
  ) => {
    setDragRefId(ref.id)
    e.dataTransfer.setData("text/plain", `图${index + 1}`)
    e.dataTransfer.setData("application/x-ref-id", ref.id)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleRefDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  const handleRefDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    const sourceId = e.dataTransfer.getData("application/x-ref-id")
    if (!sourceId || sourceId === refs[targetIndex]?.id) {
      setDragRefId(null)
      return
    }

    const currentOrder = refs.map((r) => r.id)
    const sourceIndex = currentOrder.indexOf(sourceId)
    if (sourceIndex === -1) {
      setDragRefId(null)
      return
    }

    // Move element
    const newOrder = [...currentOrder]
    newOrder.splice(sourceIndex, 1)
    newOrder.splice(targetIndex, 0, sourceId)
    reorderItemReferences(item.id, newOrder)
    setDragRefId(null)
  }

  // Drag thumbnail to textarea
  const handleTextareaDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const text = e.dataTransfer.getData("text/plain")
    if (text && text.startsWith("图")) {
      const textarea = textareaRef.current
      if (textarea) {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newValue = value.substring(0, start) + text + value.substring(end)
        setValue(newValue)
      }
    }
  }

  const handleTextareaDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-ref-id")) {
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
    }
  }

  return (
    <div
      className={`transition-all duration-200 ease-out ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-2 pointer-events-none"
      }`}
    >
      <div className="bg-zinc-800/90 backdrop-blur-sm rounded-xl p-2.5 border border-zinc-700/50 shadow-xl shadow-black/30">
        {/* Input row */}
        <div className="flex items-start gap-2">
          {/* Upload button (only when no refs) */}
          {refs.length === 0 && (
            <button
              onClick={() => inputRef.current?.click()}
              className="w-9 h-9 shrink-0 rounded-lg bg-zinc-700/60 hover:bg-zinc-600 border border-zinc-600/50 flex items-center justify-center transition-colors"
            >
              <ImagePlus className="w-4 h-4 text-zinc-400" />
            </button>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onDrop={handleTextareaDrop}
            onDragOver={handleTextareaDragOver}
            placeholder="描述你想如何编辑..."
            className="flex-1 min-w-0 bg-zinc-700/50 border border-zinc-600/50 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/70 resize-none"
            style={{ height: "36px" }}
            disabled={isLoading}
          />
        </div>

        {/* Reference thumbnails row */}
        {refs.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            {refs.map((ref, index) => (
              <div
                key={ref.id}
                className={`relative group w-10 h-10 shrink-0 ${
                  dragRefId === ref.id ? "opacity-50" : ""
                }`}
                draggable
                onDragStart={(e) => handleRefDragStart(e, ref, index)}
                onDragOver={handleRefDragOver}
                onDrop={(e) => handleRefDrop(e, index)}
              >
                <img
                  src={ref.localUrl}
                  alt={ref.name}
                  className="w-full h-full object-cover rounded-md border border-zinc-600/50"
                />
                {/* Uploading overlay */}
                {ref.uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/70 rounded-md">
                    <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                  </div>
                )}
                {/* Hover delete button */}
                <button
                  onClick={() => removeItemReference(item.id, ref.id)}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-700 items-center justify-center hover:bg-red-600 transition-colors hidden group-hover:flex"
                >
                  <X className="w-2.5 h-2.5 text-zinc-300" />
                </button>
              </div>
            ))}
            {/* Add button always at the end of thumbnails */}
            {refs.length < MAX_REFS && (
              <button
                onClick={() => inputRef.current?.click()}
                className="w-10 h-10 shrink-0 rounded-md border border-dashed border-zinc-600/50 flex items-center justify-center hover:border-violet-500/70 transition-colors"
              >
                <ImagePlus className="w-4 h-4 text-zinc-500" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ""
        }}
      />
    </div>
  )
}
