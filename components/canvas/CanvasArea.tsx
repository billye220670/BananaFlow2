"use client"

import { useEffect, useRef, useCallback } from "react"
import { Tldraw, Editor, AssetRecordType, TLShapeId, TLStoreEventInfo } from "tldraw"
import "tldraw/tldraw.css"
import { useAppStore, canvasItemIdToShapeId, shapeIdToCanvasItemId } from "@/lib/store"
import { validateFile } from "@/lib/validate"
import { uploadFile } from "@/lib/fal"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Download, X, ImageIcon } from "lucide-react"
import { nanoid } from "nanoid"
import type { CanvasItem } from "@/lib/types"
import { InlineEditPanel } from "./InlineEditPanel"

// Helper: Create tldraw asset + image shape from CanvasItem
function createTldrawImageFromItem(editor: Editor, item: CanvasItem) {
  if (item.placeholder) {
    // Create geo shape as placeholder
    const shapeId = canvasItemIdToShapeId(item.id)
    editor.createShape({
      id: shapeId,
      type: 'geo',
      x: item.x,
      y: item.y,
      props: {
        w: item.width || 400,
        h: item.height || 400,
        geo: 'rectangle',
        fill: 'solid',
        color: 'grey',
      }
    })
    return shapeId
  }

  // Create asset for image
  const assetId = AssetRecordType.createId()
  editor.createAssets([{
    id: assetId,
    type: 'image',
    typeName: 'asset',
    props: {
      name: `canvas-${item.id}.png`,
      src: item.url,
      w: item.width || 400,
      h: item.height || 400,
      mimeType: 'image/png',
      isAnimated: false,
    },
    meta: { canvasItemId: item.id },
  }])

  // Create image shape
  const shapeId = canvasItemIdToShapeId(item.id)
  editor.createShape({
    id: shapeId,
    type: 'image',
    x: item.x,
    y: item.y,
    props: {
      assetId,
      w: item.width || 400,
      h: item.height || 400,
    },
  })

  return shapeId
}

// ── Main canvas ─────────────────────────────────────────────────────────────

export function CanvasArea() {
  const {
    canvasItems,
    isEditingMode,
    editingTarget,
    setEditingMode,
    addCanvasItem,
    updateCanvasItem,
    removeCanvasItem,
    clearCanvas,
    editor,
    setEditor,
    selectedShapeIds,
    setSelectedShapeIds,
  } = useAppStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)  // Prevent infinite sync loops

  // Track processed items to avoid re-creating shapes
  const processedItemsRef = useRef<Set<string>>(new Set())

  // Handle editor mount
  const handleMount = useCallback((ed: Editor) => {
    setEditor(ed)

    // Initial sync: create shapes for existing canvasItems
    const currentItems = useAppStore.getState().canvasItems
    currentItems.forEach((item) => {
      if (!item.uploading || item.placeholder) {
        createTldrawImageFromItem(ed, item)
        processedItemsRef.current.add(item.id)
      }
    })

    // Listen for tldraw store changes
    const unsub = ed.store.listen((entry: TLStoreEventInfo) => {
      if (syncingRef.current) return

      const { changes } = entry

      // Handle shape updates (position/size changes)
      if (changes.updated) {
        Object.values(changes.updated).forEach(([, after]) => {
          if (after.typeName !== 'shape') return
          const shape = after as { id: TLShapeId; x: number; y: number; props?: { w?: number; h?: number } }
          const itemId = shapeIdToCanvasItemId(shape.id)
          const existingItem = useAppStore.getState().canvasItems.find(i => i.id === itemId)
          if (existingItem && !existingItem.placeholder) {
            syncingRef.current = true
            useAppStore.getState().updateCanvasItem(itemId, {
              x: shape.x,
              y: shape.y,
              width: shape.props?.w ?? existingItem.width,
              height: shape.props?.h ?? existingItem.height,
            })
            syncingRef.current = false
          }
        })
      }

      // Handle shape deletions
      if (changes.removed) {
        Object.values(changes.removed).forEach((removed) => {
          if (removed.typeName !== 'shape') return
          const itemId = shapeIdToCanvasItemId(removed.id as TLShapeId)
          const existingItem = useAppStore.getState().canvasItems.find(i => i.id === itemId)
          if (existingItem) {
            syncingRef.current = true
            useAppStore.getState().removeCanvasItem(itemId)
            processedItemsRef.current.delete(itemId)
            syncingRef.current = false
          }
        })
      }
    })

    // Listen for selection changes
    ed.store.listen(() => {
      const ids = ed.getSelectedShapeIds().map(id => shapeIdToCanvasItemId(id))
      setSelectedShapeIds(ids)
    }, { source: 'user', scope: 'session' })

    return () => {
      unsub()
    }
  }, [setEditor, setSelectedShapeIds])

  // Sync canvasItems changes to tldraw
  useEffect(() => {
    if (!editor || syncingRef.current) return

    canvasItems.forEach((item) => {
      const shapeId = canvasItemIdToShapeId(item.id)
      const existingShape = editor.getShape(shapeId)

      // Skip items that are still uploading (unless placeholder)
      if (item.uploading && !item.placeholder) {
        return
      }

      if (!existingShape && !processedItemsRef.current.has(item.id)) {
        // Create new shape
        syncingRef.current = true
        createTldrawImageFromItem(editor, item)
        processedItemsRef.current.add(item.id)
        syncingRef.current = false
      } else if (existingShape) {
        // Update existing shape position/size if needed
        const needsUpdate = 
          existingShape.x !== item.x ||
          existingShape.y !== item.y ||
          (existingShape.props as { w?: number; h?: number })?.w !== item.width ||
          (existingShape.props as { w?: number; h?: number })?.h !== item.height

        if (needsUpdate) {
          syncingRef.current = true
          if (existingShape.type === 'image') {
            editor.updateShape({
              id: shapeId,
              type: 'image',
              x: item.x,
              y: item.y,
              props: {
                w: item.width,
                h: item.height,
              }
            })
          } else if (existingShape.type === 'geo') {
            editor.updateShape({
              id: shapeId,
              type: 'geo',
              x: item.x,
              y: item.y,
              props: {
                w: item.width,
                h: item.height,
              }
            })
          }
          syncingRef.current = false
        }

        // Handle placeholder -> image conversion
        if (existingShape.type === 'geo' && !item.placeholder && item.url) {
          syncingRef.current = true
          editor.deleteShape(shapeId)
          processedItemsRef.current.delete(item.id)
          createTldrawImageFromItem(editor, item)
          processedItemsRef.current.add(item.id)
          syncingRef.current = false
        }
      }
    })

    // Remove shapes that no longer exist in canvasItems
    const currentItemIds = new Set(canvasItems.map(i => i.id))
    processedItemsRef.current.forEach((itemId) => {
      if (!currentItemIds.has(itemId)) {
        const shapeId = canvasItemIdToShapeId(itemId)
        if (editor.getShape(shapeId)) {
          syncingRef.current = true
          editor.deleteShape(shapeId)
          syncingRef.current = false
        }
        processedItemsRef.current.delete(itemId)
      }
    })
  }, [editor, canvasItems])

  // Handle selection for editing mode
  useEffect(() => {
    if (selectedShapeIds.length === 1) {
      const itemId = selectedShapeIds[0]
      const item = canvasItems.find(i => i.id === itemId)
      if (item && !item.uploading && !item.placeholder) {
        setEditingMode(true, {
          id: item.id,
          localUrl: item.url,
          falUrl: item.falUrl ?? item.url,
          name: `canvas-${item.id}.png`,
          uploading: false,
        })
      }
    } else if (selectedShapeIds.length === 0 && editingTarget) {
      setEditingMode(false, null)
    }
  }, [selectedShapeIds, canvasItems, setEditingMode, editingTarget])

  // File drop handler for external drops
  const handleExternalDrop = useCallback(
    async (e: React.DragEvent) => {
      // Only handle drops outside tldraw (tldraw handles its own drops)
      const file = e.dataTransfer.files[0]
      if (!file) return

      const err = validateFile(file)
      if (err) {
        toast.error(err)
        return
      }

      e.preventDefault()
      e.stopPropagation()

      // Get drop position in tldraw coordinates
      let dropX = 60, dropY = 60
      if (editor) {
        const point = editor.screenToPage({ x: e.clientX, y: e.clientY })
        dropX = point.x
        dropY = point.y
      }

      const id = nanoid()
      const localUrl = URL.createObjectURL(file)
      addCanvasItem({ 
        id, 
        url: localUrl, 
        falUrl: null, 
        x: dropX, 
        y: dropY, 
        width: 0, 
        height: 0, 
        uploading: true 
      })

      // Load image to get dimensions
      const img = new Image()
      img.onload = () => {
        const maxW = 480
        const scale = Math.min(maxW / img.naturalWidth, maxW / img.naturalHeight, 1)
        const width = Math.round(img.naturalWidth * scale)
        const height = Math.round(img.naturalHeight * scale)
        useAppStore.getState().updateCanvasItem(id, { width, height })
      }
      img.src = localUrl

      try {
        const falUrl = await uploadFile(file)
        useAppStore.getState().updateCanvasItem(id, { falUrl, uploading: false })
      } catch {
        toast.error("上传失败，请检查 FAL_KEY 并重启服务")
        useAppStore.getState().updateCanvasItem(id, { uploading: false })
      }
    },
    [editor, addCanvasItem]
  )

  const handleDownload = useCallback(() => {
    const selectedItemId = selectedShapeIds[0]
    const item = selectedItemId 
      ? canvasItems.find((i) => i.id === selectedItemId) 
      : canvasItems.filter((i) => !i.placeholder).at(-1)
    if (!item) return
    const a = document.createElement("a")
    a.href = item.falUrl ?? item.url
    a.download = `lovart-${Date.now()}.png`
    a.click()
  }, [selectedShapeIds, canvasItems])

  const handleClear = useCallback(() => {
    if (selectedShapeIds.length > 0 && editor) {
      selectedShapeIds.forEach((itemId) => {
        const shapeId = canvasItemIdToShapeId(itemId)
        editor.deleteShape(shapeId)
      })
      setSelectedShapeIds([])
      setEditingMode(false, null)
    } else {
      clearCanvas()
      processedItemsRef.current.clear()
      if (editor) {
        editor.selectAll()
        editor.deleteShapes(editor.getSelectedShapeIds())
      }
    }
  }, [selectedShapeIds, editor, clearCanvas, setSelectedShapeIds, setEditingMode])

  const hasImages = canvasItems.some((i) => !i.placeholder)

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full bg-zinc-950 border-r border-zinc-800"
      onDrop={handleExternalDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* tldraw canvas */}
      <div className="flex-1 min-h-0" style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <Tldraw
            onMount={handleMount}
            autoFocus
          />
        </div>

        {/* Empty state overlay */}
        {!hasImages && canvasItems.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-600 pointer-events-none z-10">
            <ImageIcon className="w-16 h-16" />
            <p className="text-sm">拖入图片开始创作</p>
          </div>
        )}

        {/* Inline edit panel - self-positioning */}
        <InlineEditPanel />
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
              <X className="w-4 h-4 mr-1" /> {selectedShapeIds.length > 0 ? "删除" : "清除"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
