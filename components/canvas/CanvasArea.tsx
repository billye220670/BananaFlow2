"use client"

import { useEffect, useRef, useCallback, useState, useMemo } from "react"
import { Tldraw, Editor, AssetRecordType, TLShapeId, TLStoreEventInfo, TLAssetId, useEditor, track } from "tldraw"
import type { TLComponents } from "tldraw"
import "tldraw/tldraw.css"
import { useAppStore, canvasItemIdToShapeId, shapeIdToCanvasItemId } from "@/lib/store"
import { validateFile } from "@/lib/validate"
import { uploadFile } from "@/lib/fal"
import { uploadCanvasAsset } from "@/lib/project-service"
import { toast } from "sonner"
import { X, Minus, Plus } from "lucide-react"
import { CustomTooltip } from "@/components/ui/tooltip"
import { nanoid } from "nanoid"
import type { CanvasItem } from "@/lib/types"
import { InlineEditPanel } from "./InlineEditPanel"
import { Toolbar } from "./Toolbar"
import { TopBar } from "./TopBar"

// ── Color conversion utilities ──────────────────────────────────────────────

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  // h: 0-360, s: 0-100, v: 0-100, returns [r, g, b] each 0-255
  s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function hexToHsv(hex: string): [number, number, number] {
  // hex to h(0-360), s(0-100), v(0-100)
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return [h, s, v];
}

// ── Helper: Convert blob URL to data URL ───────────────────────────────────
async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl)
  const blob = await response.blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ── Helper: Preload image URL to ensure it's accessible ───────────────────────
async function preloadImageUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    // 不设置 crossOrigin，避免 CORS 问题
    // 预加载只是为了验证 URL 可访问性，不需要读取像素数据
    img.src = url
    // Timeout after 10 seconds
    setTimeout(() => resolve(false), 10000)
  })
}

// ── Helper: Create tldraw asset + image shape from CanvasItem ───────────────
// Returns shapeId on success, or null if image creation failed
// 主路径：URL 应该已经是 https URL（来自 Storage）
// Fallback：如果仍然是 blob URL，转换为 data URL
async function createTldrawImageFromItem(editor: Editor, item: CanvasItem): Promise<TLShapeId | null> {
  if (item.placeholder) {
    // Create geo shape as placeholder
    const shapeId = canvasItemIdToShapeId(item.id)
    try {
      editor.createShape({
        id: shapeId,
        type: 'geo',
        x: item.x,
        y: item.y,
        opacity: 0,
        props: {
          w: item.width || 400,
          h: item.height || 400,
          geo: 'rectangle',
          fill: 'solid',
          color: 'grey',
        }
      })
      return shapeId
    } catch (err) {
      console.error('Failed to create placeholder shape:', err)
      return null
    }
  }

  // 主路径：URL 应该已经是 https URL（来自 Storage 即时上传）
  // Fallback：如果仍然是 blob URL，转换为 data URL（兼容旧逻辑）
  let imageSrc = item.url
  if (imageSrc.startsWith('blob:')) {
    console.log('[createTldrawImageFromItem] Fallback: converting blob URL to data URL for item:', item.id)
    try {
      imageSrc = await blobUrlToDataUrl(imageSrc)
    } catch (err) {
      console.error('Failed to convert blob URL to data URL:', err)
      return null
    }
  }

  // For HTTPS URLs (like Storage/FAL CDN), preload to ensure accessibility
  if (imageSrc.startsWith('https://')) {
    const preloadSuccess = await preloadImageUrl(imageSrc)
    if (!preloadSuccess) {
      console.error('Failed to preload image URL:', imageSrc.substring(0, 100) + '...')
      return null  // Keep placeholder, don't replace with broken image
    }
  }

  try {
    // Create asset for image
    const assetId = AssetRecordType.createId()
    
    editor.createAssets([{
      id: assetId,
      type: 'image',
      typeName: 'asset',
      props: {
        name: item.fileName || `canvas-${item.id}.png`,
        src: imageSrc,
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
  } catch (err) {
    console.error('Failed to create tldraw image shape:', err)
    return null
  }
}

// ── Helper: Generate default name for empty input ───────────────────────────
function generateDefaultName(editor: Editor, excludeAssetId?: string): string {
  const assets = editor.getAssets()
  const existingNames = new Set(
    assets
      .filter(a => !excludeAssetId || a.id !== excludeAssetId)
      .map(a => (a.props as { name?: string }).name?.toLowerCase())
  )
  let i = 1
  while (existingNames.has(`image_${i}`)) i++
  return `Image_${i}`
}

// ── AnnotationOverlay: 统一处理 frame 和 image 的标注 ──
// 使用 OnTheCanvas + track()，所有数据只从 tldraw editor API 获取
// 注意：track() 内禁止依赖 zustand，否则 React.memo 会阻断更新
// 缓存 frame 标注数据的类型
interface FrameAnnotationData {
  bounds: { x: number; y: number; w: number; h: number }
  size: string
}

// ── MarkerOverlay: 渲染画布上的标记圆圈 ──
// 使用 track() 响应 tldraw editor 状态变化（相机移动、shape 移动等）
const MarkerOverlay = track(() => {
  const editor = useEditor()
  
  // 读取 markersVersion 建立 track 依赖（即使值不直接使用）
  // 这样当 store 中的 marker actions 更新 meta 时，track() 能感知到变化
  const _markersVersion = (editor.getInstanceState().meta as { markersVersion?: number })?.markersVersion
  void _markersVersion // 避免 unused variable 警告
  
  // 获取相机状态以建立 track 依赖，确保相机移动时重新渲染
  const camera = editor.getCamera()
  void camera // 避免 unused variable 警告
  
  // 从 zustand store 获取 markers（在 track() 内使用 getState 避免冲突）
  const markers = useAppStore.getState().markers
  
  if (markers.length === 0) return null
  
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      {markers.map((marker) => {
        // 通过 canvasItemIdToShapeId 获取 tldraw shapeId
        const shapeId = canvasItemIdToShapeId(marker.itemId)
        const bounds = editor.getShapePageBounds(shapeId)
        
        // 如果 bounds 不存在（shape 已删除），跳过
        if (!bounds) return null
        
        // 计算标记在页面上的位置
        const pageX = bounds.x + marker.relativeX * bounds.w
        const pageY = bounds.y + marker.relativeY * bounds.h
        
        // 转换为屏幕坐标（视口坐标）
        const screenPoint = editor.pageToViewport({ x: pageX, y: pageY })
        
        return (
          <div
            key={marker.id}
            style={{
              position: 'absolute',
              left: screenPoint.x,
              top: screenPoint.y,
              transform: 'translate(-50%, -50%)',
              width: 26,
              height: 26,
              borderRadius: '50%',
              backgroundColor: '#3B82F6',
              border: '2px solid white',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 12,
              fontWeight: 700,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            {marker.number}
          </div>
        )
      })}
    </div>
  )
})

const AnnotationOverlay = track(() => {
  const editor = useEditor()

  // ── 编辑状态（仅用于 image 重命名） ──
  const [isEditing, setIsEditing] = useState(false)
  const [editingName, setEditingName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  
  // ── Frame 标注数据缓存（优化：缩放时不重新计算 bounds） ──
  const frameDataCacheRef = useRef<Map<string, FrameAnnotationData>>(new Map())
  const prevFrameKeyRef = useRef<string>('')
  
  // ── 修复3: 缓存选中状态和 shapes 过滤结果 ──
  const prevSelectedIdsRef = useRef<string>('')
  const selectedImageDataCacheRef = useRef<{
    shapeId: string | null
    shape: ReturnType<typeof editor.getShape> | null
    bounds: ReturnType<typeof editor.getShapePageBounds> | null
    isImage: boolean
    isInsideFrame: boolean
    assetId: string | null
    displayName: string
    imageSize: string
  } | null>(null)
  const prevShapeCountRef = useRef<number>(0)
  const imageShapesCacheRef = useRef<ReturnType<typeof editor.getCurrentPageShapes>>([])  // image shapes 缓存
  const frameShapesCacheRef = useRef<ReturnType<typeof editor.getCurrentPageShapes>>([])  // frame shapes 缓存

  // ── 统一缩放参数 ──
  const zoomLevel = editor.getZoomLevel()
  const fontSize = 12 / zoomLevel
  const labelHeight = 22 / zoomLevel
  const hGap = 8 / zoomLevel
  const padding = 6 / zoomLevel

  // ── 修复3: 缓存 shapes 过滤结果 ──
  const allShapes = editor.getCurrentPageShapes()
  if (allShapes.length !== prevShapeCountRef.current) {
    prevShapeCountRef.current = allShapes.length
    frameShapesCacheRef.current = allShapes.filter(s => s.type === 'frame')
    imageShapesCacheRef.current = allShapes.filter(s => s.type === 'image')
  }
  const frameShapes = frameShapesCacheRef.current
  
  // 生成缓存 key：ID + x + y + w + h（当 frame 移动或调整大小时失效）
  const frameKey = frameShapes.map(s => {
    const props = s.props as { w: number; h: number }
    return `${s.id}:${s.x}:${s.y}:${props.w}:${props.h}`
  }).sort().join('|')
  
  // 只在 frame shapes 变化时重新计算 bounds
  if (frameKey !== prevFrameKeyRef.current) {
    prevFrameKeyRef.current = frameKey
    const newCache = new Map<string, FrameAnnotationData>()
    frameShapes.forEach(frameShape => {
      const frameBounds = editor.getShapePageBounds(frameShape.id)
      if (frameBounds) {
        const fw = Math.round((frameShape.props as { w: number }).w)
        const fh = Math.round((frameShape.props as { h: number }).h)
        newCache.set(frameShape.id, {
          bounds: { x: frameBounds.x, y: frameBounds.y, w: frameBounds.w, h: frameBounds.h },
          size: `${fw} × ${fh}`
        })
      }
    })
    frameDataCacheRef.current = newCache
  }

  // ── 修复3: 选中图片标注数据（缓存选中状态相关计算） ──
  const selectedIds = editor.getSelectedShapeIds()
  const selectedIdsKey = selectedIds.join(',')
  
  // 只在选中状态实际变化时重新计算选中相关的数据
  if (selectedIdsKey !== prevSelectedIdsRef.current) {
    prevSelectedIdsRef.current = selectedIdsKey
    const selectedShapeId = selectedIds.length === 1 ? selectedIds[0] : null
    const selectedShape = selectedShapeId ? editor.getShape(selectedShapeId) : null
    const selectedBounds = selectedShapeId ? editor.getShapePageBounds(selectedShapeId) : null
    const isSelectedImage = selectedShape?.type === 'image'
    
    if (isSelectedImage && selectedShape && selectedBounds) {
      const assetId = (selectedShape.props as { assetId?: string }).assetId || null
      const asset = assetId ? editor.getAsset(assetId as TLAssetId) : null
      const displayName = (asset?.props as { name?: string })?.name || 'Image'
      const imageSize = `${Math.round(selectedBounds.w)} × ${Math.round(selectedBounds.h)}`
      const isInsideFrame = (() => {
        const parent = editor.getShape(selectedShape.parentId)
        return parent?.type === 'frame'
      })()
      
      selectedImageDataCacheRef.current = {
        shapeId: selectedShapeId,
        shape: selectedShape,
        bounds: selectedBounds,
        isImage: true,
        isInsideFrame,
        assetId,
        displayName,
        imageSize,
      }
    } else {
      selectedImageDataCacheRef.current = {
        shapeId: selectedShapeId,
        shape: selectedShape,
        bounds: selectedBounds,
        isImage: false,
        isInsideFrame: false,
        assetId: null,
        displayName: '',
        imageSize: '',
      }
    }
  }
  
  // 从缓存读取选中图片数据（拖拽时位置变化需要实时读取 bounds）
  const cachedSelectedData = selectedImageDataCacheRef.current
  const selectedShapeId = cachedSelectedData?.shapeId || null
  const selectedShape = cachedSelectedData?.shape
  // 拖拽时 bounds 会变化，需要实时获取（需要转换为 TLShapeId 类型）
  const selectedBounds = selectedShapeId ? editor.getShapePageBounds(selectedShapeId as TLShapeId) : null

  const isSelectedImage = selectedShape?.type === 'image'

  // 修复3: 从缓存读取图片名称、尺寸等数据（这些在拖拽时不变）
  const assetId = cachedSelectedData?.assetId || null
  const asset = assetId ? editor.getAsset(assetId as TLAssetId) : null
  const displayName = cachedSelectedData?.displayName || 'Image'
  const truncatedName = displayName.length > 25 ? displayName.slice(0, 25) + '...' : displayName
  // 尺寸需要实时计算（拖拽时变化）
  const imageSize = selectedBounds ? `${Math.round(selectedBounds.w)} × ${Math.round(selectedBounds.h)}` : ''

  // 父容器检测使用缓存
  const isImageInsideFrame = cachedSelectedData?.isInsideFrame ?? false

  // ── 编辑相关回调 ──
  const handleDoubleClick = useCallback(() => {
    setIsEditing(true)
    setEditingName(displayName)
    if (selectedShapeId) editor.select(selectedShapeId as TLShapeId)
  }, [displayName, selectedShapeId, editor])

  const saveName = useCallback(() => {
    const trimmedName = editingName.trim()
    if (assetId) {
      let finalName = trimmedName
      if (!finalName) {
        finalName = generateDefaultName(editor, assetId)
      }
      if (finalName !== displayName && asset) {
        // 使用类型断言处理自定义 name 属性
        editor.updateAssets([{
          ...asset,
          props: { ...asset.props, name: finalName } as typeof asset.props
        }])
      }
    }
    setIsEditing(false)
    setEditingName('')
  }, [editingName, displayName, assetId, asset, editor])

  const cancelEdit = useCallback(() => {
    setIsEditing(false)
    setEditingName('')
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') saveName()
    else if (e.key === 'Escape') cancelEdit()
  }, [saveName, cancelEdit])

  useEffect(() => {
    setIsEditing(false)
    setEditingName('')
  }, [selectedShapeId])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // ── 统一标注栏渲染 ──
  // 渲染一个标注栏：定位在 shape 上方，左侧可选内容，右侧可选内容
  // insideFrame: 如果 shape 在 frame 内，向上多偏移一个标签高度避开 frame heading
  const renderAnnotationBar = (
    key: string,
    bounds: { x: number; y: number; w: number; h: number },
    options: {
      leftContent?: React.ReactNode
      rightContent?: React.ReactNode
      insideFrame?: boolean
    }
  ) => {
    const extraOffset = options.insideFrame ? labelHeight : 0
    return (
      <div
        key={key}
        style={{
          position: 'absolute',
          left: bounds.x,
          top: bounds.y - labelHeight - extraOffset,
          width: bounds.w,
          height: `${labelHeight}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: `${fontSize}px`,
          lineHeight: `${labelHeight}px`,
          color: '#3B82F6',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {options.leftContent && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{options.leftContent}</span>}
        {!options.leftContent && <span />}
        {options.rightContent && (
          <span style={{ marginLeft: `${hGap}px`, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {options.rightContent}
          </span>
        )}
      </div>
    )
  }

  return (
    <>
      {/* ── 所有 frame 的尺寸标注（使用缓存的 bounds） ── */}
      {frameShapes.map(frameShape => {
        const cachedData = frameDataCacheRef.current.get(frameShape.id)
        if (!cachedData) return null
        return renderAnnotationBar(
          `frame-${frameShape.id}`,
          cachedData.bounds,
          { rightContent: cachedData.size }
        )
      })}

      {/* ── 选中图片的标注（名称 + 尺寸） ── */}
      {isSelectedImage && selectedBounds && (
        isEditing ? (
          // 编辑模式：显示输入框
          <div
            key="image-annotation"
            style={{
              position: 'absolute',
              left: selectedBounds.x,
              top: selectedBounds.y - labelHeight - (isImageInsideFrame ? labelHeight : 0),
              width: selectedBounds.w,
              height: `${labelHeight}px`,
              display: 'flex',
              alignItems: 'center',
              fontSize: `${fontSize}px`,
              lineHeight: `${labelHeight}px`,
              pointerEvents: 'none',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={saveName}
              onKeyDown={handleKeyDown}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              size={Math.max(1, editingName.length)}
              style={{
                minWidth: `${60 / zoomLevel}px`,
                maxWidth: `${200 / zoomLevel}px`,
                width: 'auto',
                background: '#ffffff',
                border: `${1.5 / zoomLevel}px solid #3B82F6`,
                borderRadius: `${4 / zoomLevel}px`,
                padding: `${1 / zoomLevel}px ${padding}px`,
                fontSize: `${fontSize}px`,
                color: '#3B82F6',
                fontWeight: 500,
                outline: 'none',
                pointerEvents: 'auto',
                boxShadow: `0 0 0 ${2 / zoomLevel}px rgba(59, 130, 246, 0.2)`,
                height: `${labelHeight}px`,
              }}
            />
          </div>
        ) : (
          // 显示模式：名称 + 尺寸
          renderAnnotationBar(
            'image-annotation',
            selectedBounds,
            {
              leftContent: (
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'auto', cursor: 'pointer' }}
                  onDoubleClick={handleDoubleClick}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {truncatedName}
                </span>
              ),
              rightContent: imageSize,
              insideFrame: isImageInsideFrame,
            }
          )
        )
      )}
    </>
  )
})

// ── PlaceholderShimmerOverlay: 在占位图上显示 shimmer 加载动画 ──
// 渲染在 InFrontOfTheCanvas 层，坐标需要从页面坐标转换为视口坐标
const PlaceholderShimmerOverlay = track(function PlaceholderShimmerOverlay() {
  const editor = useEditor()
  
  // 建立响应式依赖 - shapes 变化和相机变化都需要重渲染
  editor.getCurrentPageShapes()
  const camera = editor.getCamera()
  const zoom = camera.z
  
  const canvasItems = useAppStore.getState().canvasItems
  const placeholderItems = canvasItems.filter(item => item.placeholder || item.uploading)
  
  if (placeholderItems.length === 0) return null
  
  return (
    <>
      {placeholderItems.map(item => {
        const shapeId = canvasItemIdToShapeId(item.id)
        if (!editor.getShape(shapeId)) return null
        
        const bounds = editor.getShapePageBounds(shapeId)
        if (!bounds) return null
        
        // 页面坐标 → 视口坐标
        const screenX = (bounds.x + camera.x) * zoom
        const screenY = (bounds.y + camera.y) * zoom
        const screenW = bounds.w * zoom
        const screenH = bounds.h * zoom
        
        return (
          <div
            key={item.id}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY,
              width: screenW,
              height: screenH,
              backgroundColor: '#e5e5e5',
              border: `${1 * zoom}px solid #ccc`,
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 1 * zoom,
                top: 1 * zoom,
                right: 1 * zoom,
                bottom: 1 * zoom,
                background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0) 100%)',
                backgroundSize: '600px 100%',
                animation: 'shimmer 1.5s infinite linear',
              }}
            />
          </div>
        )
      })}
    </>
  )
})

// ── Main canvas ─────────────────────────────────────────────────────────────

export function CanvasArea() {
  const {
    canvasItems,
    setEditingMode,
    addCanvasItem,
    editor,
    setEditor,
    selectedShapeIds,
    setSelectedShapeIds,
  } = useAppStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)  // Prevent infinite sync loops
  const bgPickerRef = useRef<HTMLDivElement>(null)
  const zoomMenuRef = useRef<HTMLDivElement>(null)
  const svPanelRef = useRef<HTMLDivElement>(null)

  // === 修复1: RAF 节流状态同步 ===
  // 收集待同步到 zustand 的 shape 位置/尺寸更新，每帧只批量同步一次
  const pendingUpdatesRef = useRef<Map<string, Partial<CanvasItem>>>(new Map())
  const syncRafRef = useRef<number | null>(null)
  // 标记这次 canvasItems 变化来自 tldraw store listener（用于修复2）
  const fromTldrawSyncRef = useRef(false)

  // Background color state - using HSV internally for the picker
  const [showBgPicker, setShowBgPicker] = useState(false)
  const [bgColor, setBgColor] = useState('#F2F2F2') // 默认 95% 白色
  const [hue, setHue] = useState(0)
  const [saturation, setSaturation] = useState(0)
  const [brightness, setBrightness] = useState(95) // 默认 #F2F2F2 对应的 HSV

  // Zoom level state
  const [zoomLevel, setZoomLevel] = useState(1)
  const [showZoomMenu, setShowZoomMenu] = useState(false)

  // Track if tldraw has any shapes (for empty state hint)
  const [hasShapes, setHasShapes] = useState(false)

  // Track processed items to avoid re-creating shapes
  const processedItemsRef = useRef<Set<string>>(new Set())

  // Track which items are currently in placeholder state (for detecting placeholder -> image transition)
  const placeholderIdsRef = useRef<Set<string>>(new Set())

  // 保护机制：记录刚完成 placeholder → image 过渡的 item，防止 tldraw store listener 覆盖尺寸
  // 这些 item 在短时间内不会被 tldraw 同步覆盖尺寸
  const recentlyTransitionedRef = useRef<Set<string>>(new Set())

  // [ProjectRestore] 追踪 isRestoringProject 状态变化，用于清空追踪数据
  const isRestoringRef = useRef(false)

  // Hide tldraw UI panels and register AnnotationOverlay
  const tldrawComponents = useMemo<Partial<TLComponents>>(() => ({
    StylePanel: null,
    NavigationPanel: null,
    Minimap: null,
    Toolbar: null,
    MenuPanel: null,    // 隐藏默认的左上角菜单面板
    TopPanel: null,     // 隐藏默认的顶部面板
    OnTheCanvas: () => (
          <>
            <AnnotationOverlay />
          </>
        ),  // 使用 OnTheCanvas，在相机变换层内
    InFrontOfTheCanvas: () => (
      <>
        <TopBar />
        <MarkerOverlay />
        <PlaceholderShimmerOverlay />
      </>
    ),  // 在画布前方渲染 TopBar、MarkerOverlay 和 PlaceholderShimmerOverlay
  }), [])

  // Handle background color change
  const handleBgColorChange = useCallback((color: string) => {
    setBgColor(color)
    const container = document.querySelector('.tl-background') as HTMLElement
    if (container) {
      container.style.backgroundColor = color
    }
  }, [])

  // Update color when HSV values change
  useEffect(() => {
    const [r, g, b] = hsvToRgb(hue, saturation, brightness)
    const hex = rgbToHex(r, g, b)
    if (hex !== bgColor) {
      handleBgColorChange(hex)
    }
  }, [hue, saturation, brightness, bgColor, handleBgColorChange])

  // Handle hex input change - sync to HSV
  const handleHexInput = useCallback((hex: string) => {
    if (hex.length === 7) {
      const [h, s, v] = hexToHsv(hex)
      setHue(h)
      setSaturation(s)
      setBrightness(v)
    }
  }, [])

  // Handle preset color click
  const handlePresetColor = useCallback((color: string | null) => {
    if (color === null) {
      // "No fill" - use transparent or very light color
      handleBgColorChange('#ffffff')
      setHue(0)
      setSaturation(0)
      setBrightness(100)
    } else {
      handleHexInput(color)
    }
  }, [handleHexInput, handleBgColorChange])

  // SV panel interaction
  const handleSVInteraction = useCallback((e: React.MouseEvent | MouseEvent) => {
    const panel = svPanelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    setSaturation(x * 100)
    setBrightness((1 - y) * 100)
  }, [])

  const handleSVMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    handleSVInteraction(e)
    const handleMove = (ev: MouseEvent) => handleSVInteraction(ev)
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [handleSVInteraction])

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    const ed = useAppStore.getState().editor
    if (ed) ed.zoomIn()
  }, [])

  const handleZoomOut = useCallback(() => {
    const ed = useAppStore.getState().editor
    if (ed) ed.zoomOut()
  }, [])

  const handleZoomToFit = useCallback(() => {
    const ed = useAppStore.getState().editor
    if (ed) ed.zoomToFit({ animation: { duration: 200 } })
    setShowZoomMenu(false)
  }, [])

  const handleZoomTo = useCallback((level: number) => {
    const ed = useAppStore.getState().editor
    if (ed) {
      const center = ed.getViewportScreenCenter()
      if (level === 1) {
        ed.resetZoom(center, { animation: { duration: 200 } })
      } else {
        // Get current camera position and set new zoom level
        const camera = ed.getCamera()
        ed.setCamera({ x: camera.x, y: camera.y, z: level }, { animation: { duration: 200 } })
      }
    }
    setShowZoomMenu(false)
  }, [])

  // === RAF 节流批量同步函数（修复1）===
  const flushPendingUpdates = useCallback(() => {
    const updates = pendingUpdatesRef.current
    if (updates.size === 0) {
      syncRafRef.current = null
      return
    }
    
    fromTldrawSyncRef.current = true
    const store = useAppStore.getState()
    updates.forEach((patch, id) => {
      store.updateCanvasItem(id, patch)
    })
    updates.clear()
    syncRafRef.current = null
    // 延迟重置标记
    queueMicrotask(() => { fromTldrawSyncRef.current = false })
  }, [])

  // RAF 节流调度函数
  const scheduleSync = useCallback((id: string, patch: Partial<CanvasItem>) => {
    pendingUpdatesRef.current.set(id, {
      ...pendingUpdatesRef.current.get(id),
      ...patch,
    })
    if (syncRafRef.current === null) {
      syncRafRef.current = requestAnimationFrame(flushPendingUpdates)
    }
  }, [flushPendingUpdates])

  // Handle editor mount
  const handleMount = useCallback((ed: Editor) => {
    // 新编辑器挂载，清空旧的追踪数据
    processedItemsRef.current.clear()
    if (placeholderIdsRef.current) placeholderIdsRef.current.clear()
    if (recentlyTransitionedRef.current) recentlyTransitionedRef.current.clear()

    setEditor(ed)

    // 设置 tldraw UI 为亮色主题
    ed.user.updateUserPreferences({ colorScheme: 'light' })

    // 默认启用网格显示
    ed.updateInstanceState({ isGridMode: true })

    // ── 覆盖 tldraw 默认的 files handler ──
    // 拦截拖拽/粘贴的文件，使用我们的 placeholder + upload 流程
    ed.registerExternalContentHandler('files', async ({ files, point }) => {
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue
        
        const err = validateFile(file)
        if (err) {
          toast.error(err)
          continue
        }
        
        const id = nanoid()
        const localUrl = URL.createObjectURL(file)
        
        // 获取拖放位置
        const dropX = point?.x ?? 60
        const dropY = point?.y ?? 60
        
        // 创建占位 canvasItem（触发 geo shape + shimmer）
        useAppStore.getState().addCanvasItem({
          id,
          url: '',
          falUrl: null,
          x: dropX,
          y: dropY,
          width: 0,
          height: 0,
          uploading: true,
          placeholder: true,
        })
        
        // 异步获取尺寸
        const img = new Image()
        img.onload = () => {
          const maxW = 480
          const scale = Math.min(maxW / img.naturalWidth, maxW / img.naturalHeight, 1)
          const width = Math.round(img.naturalWidth * scale)
          const height = Math.round(img.naturalHeight * scale)
          useAppStore.getState().updateCanvasItem(id, {
            width,
            height,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            fileName: file.name,
          })
        }
        img.src = localUrl
        
        // 上传到 Storage 和 FAL（并行执行）
        const assetId = `user-upload-${id}`
        
        try {
          const [storageUrl, falUrl] = await Promise.all([
            uploadCanvasAsset(file, assetId).catch(err => {
              console.error('[CanvasArea] files handler: Storage upload failed:', err)
              return null
            }),
            uploadFile(file).catch(err => {
              console.error('[CanvasArea] files handler: FAL upload failed:', err)
              return null
            }),
          ])
          
          const finalUrl = storageUrl || falUrl || localUrl
          const finalFalUrl = falUrl || storageUrl || null
          
          console.log('[CanvasArea] files handler: Upload complete - storageUrl:', storageUrl?.substring(0, 60), 'falUrl:', falUrl?.substring(0, 60))
          
          useAppStore.getState().updateCanvasItem(id, {
            url: finalUrl,
            falUrl: finalFalUrl,
            uploading: false,
            placeholder: false,
          })
          
          if (!storageUrl && !falUrl) {
            toast.error('上传失败，使用本地预览')
          }
        } catch (error) {
          console.error('[CanvasArea] files handler: Upload failed:', error)
          toast.error(`上传失败: ${error instanceof Error ? error.message : '请检查网络连接'}`)
          useAppStore.getState().updateCanvasItem(id, {
            url: localUrl,
            uploading: false,
            placeholder: false,
          })
        }
        
        // 注意：不要在这里 revokeObjectURL，因为如果上传失败我们还需要用它
        // URL 会在 canvasItem 被删除或 url 被替换时自动回收
      }
    })

    // 默认设置画布背景色为 95% 白色 (#F2F2F2)
    requestAnimationFrame(() => {
      const bgElement = document.querySelector('.tl-background') as HTMLElement
      if (bgElement) {
        bgElement.style.backgroundColor = '#F2F2F2'
      }
    })

    // ── 监听 pointer 事件用于 marker 工具 ──
    // 使用 DOM pointerup 事件监听，比 sideEffects.registerAfterChangeHandler 更可靠
    const container = ed.getContainer()
    
    // 在 pointerdown 阶段拦截左键，阻止 tldraw 的默认 select/drag 行为
    const handleMarkerPointerDown = (e: PointerEvent) => {
      const { activeTool } = useAppStore.getState()
      if (activeTool !== 'marker') return
      if (e.button !== 0) return  // 只拦截左键，中键/右键正常传递给 tldraw
      
      // 阻止 tldraw 的默认 select/drag 行为
      e.stopPropagation()
    }
    
    const handleMarkerClick = (e: PointerEvent) => {
      // 只响应左键点击（button === 0）
      if (e.button !== 0) return
      
      const { activeTool, addMarker, markers } = useAppStore.getState()
      if (activeTool !== 'marker') return
      
      if (markers.length >= 8) {
        toast.warning('最多添加 8 个标记')
        return
      }
      
      // 获取当前页面坐标点
      const point = ed.inputs.currentPagePoint
      if (!point) return
      
      // 检测点击位置下的 shape，传入 hitInside: true 确保命中 shape 内部区域
      const shapeAtPoint = ed.getShapeAtPoint(point, {
        hitInside: true,
      })
      
      if (!shapeAtPoint || shapeAtPoint.type !== 'image') return
      
      const bounds = ed.getShapePageBounds(shapeAtPoint.id)
      if (!bounds || bounds.w === 0 || bounds.h === 0) return
      
      const itemId = shapeIdToCanvasItemId(shapeAtPoint.id)
      
      // 计算相对坐标，并 clamp 到 0-1 范围
      const relativeX = Math.max(0, Math.min(1, (point.x - bounds.x) / bounds.w))
      const relativeY = Math.max(0, Math.min(1, (point.y - bounds.y) / bounds.h))
      
      addMarker(itemId, relativeX, relativeY)
    }
    
    // 用 capture 模式注册，在 tldraw 处理之前拦截
    container.addEventListener('pointerdown', handleMarkerPointerDown, true)  // capture: true
    container.addEventListener('pointerup', handleMarkerClick, true)  // capture: true

    // Initial sync: create shapes for existing canvasItems
    // [修复A] 只在非恢复场景下执行初始同步，避免覆盖 loadSnapshot 已恢复的 shapes/assets
    const isRestoring = useAppStore.getState().isRestoringProject
    // 检查 URL 中是否有要恢复的项目（非 new）
    const searchParams = new URLSearchParams(window.location.search)
    const projectParam = searchParams.get('project')
    const hasPendingRestore = projectParam && projectParam !== 'new'

    if (hasPendingRestore) {
      // 有项目要恢复，跳过初始同步，让 initProject 通过 loadSnapshot 处理
      console.log('[CanvasArea] Project restore pending, skipping initial sync')
    } else if (!isRestoring) {
      // 没有项目要恢复的全新画布，执行初始同步
      const currentItems = useAppStore.getState().canvasItems
      const itemsToProcess = currentItems.filter(item => !item.uploading || item.placeholder)
      Promise.all(itemsToProcess.map(async (item) => {
        const shapeId = await createTldrawImageFromItem(ed, item)
        if (shapeId) {
          processedItemsRef.current.add(item.id)
          if (item.placeholder) {
            placeholderIdsRef.current.add(item.id)
          }
        }
      }))
    } else {
      console.log('[CanvasArea] Skipping initial sync during project restore')
    }

    // Listen for tldraw store changes
    const unsub = ed.store.listen((entry: TLStoreEventInfo) => {
      if (syncingRef.current) return

      const { changes } = entry

      // Handle newly added shapes (tldraw native image drops, paste, loadSnapshot restore, etc.)
      // These bypass handleExternalDrop so we must sync them into canvasItems here
      if (changes.added) {
        // First pass: process image shapes
        Object.values(changes.added).forEach((added) => {
          if (added.typeName !== 'shape') return
          const shape = added as { id: TLShapeId; type: string; x: number; y: number; props?: { assetId?: TLAssetId; w?: number; h?: number } }
          if (shape.type !== 'image') return
          const itemId = shapeIdToCanvasItemId(shape.id)
          if (processedItemsRef.current.has(itemId)) return
          if (useAppStore.getState().canvasItems.find(i => i.id === itemId)) return
          const assetId = shape.props?.assetId
          const asset = assetId ? ed.getAsset(assetId) : null
          const url = (asset?.props as { src?: string })?.src ?? ''
          const fileName = (asset?.props as { name?: string })?.name
          
          // 检测是否是 data URL（tldraw 原生拖拽/粘贴创建的）
          const isDataUrl = url.startsWith('data:')
          console.log('[CanvasArea] shape added:', itemId, 'url:', url ? url.substring(0, 50) + '...' : '(empty)', 'isDataUrl:', isDataUrl)
          
          // [ProjectRestore] 使用 fromTldrawSyncRef 包裹，防止 canvasItems sync effect 反向同步
          fromTldrawSyncRef.current = true
          useAppStore.getState().addCanvasItem({
            id: itemId,
            url,
            falUrl: url.startsWith('https://') ? url : null,
            x: shape.x,
            y: shape.y,
            width: shape.props?.w ?? 400,
            height: shape.props?.h ?? 400,
            // data URL 表示绕过了我们的 files handler，需要上传，设置 uploading=true 触发 shimmer
            uploading: isDataUrl,
            fileName,
          })
          processedItemsRef.current.add(itemId)
          fromTldrawSyncRef.current = false
          
          // 如果是 data URL，立即隐藏原生图片，让 shimmer 可见
          if (isDataUrl) {
            try {
              ed.updateShape({ id: shape.id, type: 'image', opacity: 0 })
              console.log('[CanvasArea] Hide data URL image for shimmer:', shape.id)
            } catch(e) {
              console.error('[CanvasArea] Failed to hide image:', e)
            }
          }

          // Fallback: if URL is empty and we have assetId, use polling retry mechanism
          // This handles cases where asset is added asynchronously (max 5 attempts, 200ms interval)
          if (!url && assetId) {
            const retryGetUrl = (attempt: number) => {
              setTimeout(() => {
                if (syncingRef.current) {
                  if (attempt < 5) retryGetUrl(attempt + 1)
                  return
                }
                const delayedAsset = ed.getAsset(assetId)
                const delayedSrc = (delayedAsset?.props as { src?: string })?.src
                const delayedName = (delayedAsset?.props as { name?: string })?.name
                if (delayedSrc) {
                  syncingRef.current = true
                  try {
                    useAppStore.getState().updateCanvasItem(itemId, { 
                      url: delayedSrc,
                      ...(delayedName ? { fileName: delayedName } : {})
                    })
                    console.log('[CanvasArea] url recovered for', itemId, 'on attempt', attempt + 1)
                  } finally {
                    syncingRef.current = false
                  }
                } else if (attempt < 5) {
                  retryGetUrl(attempt + 1)
                } else {
                  console.warn('[CanvasArea] failed to recover url for', itemId, 'after 5 attempts')
                }
              }, 200)
            }
            retryGetUrl(0)
          }
        })

        // Second pass: process newly added assets
        // 检测 data URL assets（来自 tldraw 原生拖拽/粘贴）并上传到 Storage
        Object.values(changes.added).forEach((added) => {
          if (added.typeName !== 'asset') return
          
          // [修复3] 恢复期间不触发即时上传，shapes 中的 URL 已经是 Storage URL
          const isRestoring = useAppStore.getState().isRestoringProject
          if (isRestoring) {
            console.log('[CanvasArea] Skipping asset upload during project restore')
            return
          }
          
          const assetRecord = added as { id: TLAssetId; type?: string; props?: { src?: string; name?: string } }
          const assetSrc = assetRecord.props?.src
          const assetName = assetRecord.props?.name
          if (!assetSrc) return
          console.log('[CanvasArea] new asset added:', assetRecord.id, 'src:', assetSrc.substring(0, 50) + '...')

          // 检测 data URL asset 并上传到 Storage（避免无限循环：只处理 data: 开头的）
          if (assetSrc.startsWith('data:image')) {
            console.log('[CanvasArea] Detected data URL asset, uploading to Storage:', assetRecord.id)
            
            // 在上传前设置 uploading 状态，让 shimmer 显示
            const shapes = ed.getCurrentPageShapes()
            let targetShapeId: TLShapeId | null = null
            for (const shape of shapes) {
              if (shape.type === 'image') {
                const shapeAssetId = (shape.props as { assetId?: TLAssetId })?.assetId
                if (shapeAssetId === assetRecord.id) {
                  targetShapeId = shape.id
                  const itemId = shapeIdToCanvasItemId(shape.id)
                  const item = useAppStore.getState().canvasItems.find(i => i.id === itemId)
                  if (item) {
                    useAppStore.getState().updateCanvasItem(itemId, { uploading: true })
                    console.log('[CanvasArea] Set uploading=true for canvasItem:', itemId)
                  }
                  // 上传期间隐藏图片，显示 shimmer
                  try {
                    ed.updateShape({ id: shape.id, type: 'image', opacity: 0 })
                    console.log('[CanvasArea] Hide image during upload:', shape.id)
                  } catch(e) {
                    console.error('[CanvasArea] Failed to hide image:', e)
                  }
                  break
                }
              }
            }
            
            // Fire-and-forget async upload
            ;(async () => {
              try {
                // 将 data URL 转换为 Blob
                const response = await fetch(assetSrc)
                const blob = await response.blob()
                
                // 上传到 Storage
                const storageUrl = await uploadCanvasAsset(blob, assetRecord.id)
                console.log('[CanvasArea] Asset uploaded to Storage:', assetRecord.id, '->', storageUrl.substring(0, 60) + '...')
                
                // 使用 editor.store.put 更新 asset src 为 Storage URL
                const currentAsset = ed.getAsset(assetRecord.id)
                if (currentAsset && currentAsset.type === 'image') {
                  ed.store.put([{
                    ...currentAsset,
                    props: {
                      ...currentAsset.props,
                      src: storageUrl,
                    },
                  }])
                  console.log('[CanvasArea] Asset src updated to Storage URL:', assetRecord.id)
                  
                  // 上传完成，恢复图片显示
                  if (targetShapeId) {
                    try {
                      const finalShape = ed.getShape(targetShapeId)
                      if (finalShape) {
                        ed.updateShape({ id: targetShapeId, type: 'image', opacity: 1 })
                        console.log('[CanvasArea] Restore image after upload:', targetShapeId)
                      }
                    } catch(e) {
                      console.error('[CanvasArea] Failed to restore image:', e)
                    }
                  }
                  
                  // 同时更新对应的 canvasItem 的 url
                  // 找到使用该 asset 的 shape，然后找到对应的 canvasItem
                  const shapes = ed.getCurrentPageShapes()
                  for (const shape of shapes) {
                    if (shape.type === 'image') {
                      const shapeAssetId = (shape.props as { assetId?: TLAssetId })?.assetId
                      if (shapeAssetId === assetRecord.id) {
                        const itemId = shapeIdToCanvasItemId(shape.id)
                        const item = useAppStore.getState().canvasItems.find(i => i.id === itemId)
                        if (item) {
                          syncingRef.current = true
                          try {
                            useAppStore.getState().updateCanvasItem(itemId, {
                              url: storageUrl,
                              falUrl: storageUrl, // Storage URL 可以直接用作 FAL URL
                              uploading: false, // 上传完成，清除 uploading 状态
                            })
                            console.log('[CanvasArea] canvasItem url updated:', itemId)
                          } finally {
                            syncingRef.current = false
                          }
                        }
                        break
                      }
                    }
                  }
                }
              } catch (err) {
                console.error('[CanvasArea] Failed to upload data URL asset to Storage:', err)
                // 上传失败不阻止用户操作，data URL 仍然可用
                // 恢复图片显示，避免图片永远隐藏
                if (targetShapeId) {
                  try {
                    const finalShape = ed.getShape(targetShapeId)
                    if (finalShape) {
                      ed.updateShape({ id: targetShapeId, type: 'image', opacity: 1 })
                      console.log('[CanvasArea] Restore image after failure:', targetShapeId)
                    }
                  } catch(e) {
                    console.error('[CanvasArea] Failed to restore image:', e)
                  }
                }
                // 清除 uploading 状态，防止 shimmer 永远显示
                const shapes = ed.getCurrentPageShapes()
                for (const shape of shapes) {
                  if (shape.type === 'image') {
                    const shapeAssetId = (shape.props as { assetId?: TLAssetId })?.assetId
                    if (shapeAssetId === assetRecord.id) {
                      const itemId = shapeIdToCanvasItemId(shape.id)
                      useAppStore.getState().updateCanvasItem(itemId, { uploading: false })
                      console.log('[CanvasArea] Cleared uploading state after failure:', itemId)
                      break
                    }
                  }
                }
              }
            })()
          } else {
            // 非 data URL asset（如 https URL），更新 canvasItems with empty URLs
            // Use queueMicrotask to avoid modifying zustand during tldraw store listener
            queueMicrotask(() => {
              if (syncingRef.current) return
              const items = useAppStore.getState().canvasItems
              items.forEach(item => {
                if (item.url) return // Already has URL
                const shapeId = canvasItemIdToShapeId(item.id)
                const shape = ed.getShape(shapeId)
                if (!shape || shape.type !== 'image') return
                const shapeAssetId = (shape.props as { assetId?: TLAssetId })?.assetId
                if (shapeAssetId === assetRecord.id) {
                  console.log('[CanvasArea] asset match found, updating canvasItem', item.id, 'with url:', assetSrc.substring(0, 50) + '...')
                  syncingRef.current = true
                  try {
                    useAppStore.getState().updateCanvasItem(item.id, { 
                      url: assetSrc,
                      ...(assetName ? { fileName: assetName } : {})
                    })
                  } finally {
                    syncingRef.current = false
                  }
                }
              })
            })
          }
        })
      }

      // Handle shape updates (position/size changes)
      // 修复1: 使用 RAF 节流批量同步位置/尺寸更新，避免每帧多次 zustand setState
      if (changes.updated) {
        Object.values(changes.updated).forEach(([, after]) => {
          if (after.typeName !== 'shape') return
          const shape = after as { id: TLShapeId; type?: string; x: number; y: number; props?: { assetId?: TLAssetId; w?: number; h?: number } }
          const itemId = shapeIdToCanvasItemId(shape.id)
          const existingItem = useAppStore.getState().canvasItems.find(i => i.id === itemId)
          if (existingItem && !existingItem.placeholder) {
            // 保护机制：刚完成 placeholder → image 过渡的 item 不同步尺寸，只同步位置
            const isRecentlyTransitioned = recentlyTransitionedRef.current.has(itemId)
            
            // Check if url is empty and try to fetch from asset (for native drops where asset wasn't ready initially)
            let newUrl: string | undefined
            if (!existingItem.url && shape.type === 'image' && shape.props?.assetId) {
              const asset = ed.getAsset(shape.props.assetId)
              const assetSrc = (asset?.props as { src?: string })?.src
              if (assetSrc) {
                console.log('[CanvasArea] update: recovered url from asset for', itemId, 'url:', assetSrc.substring(0, 50) + '...')
                newUrl = assetSrc
              }
            }
            // 修复1: 使用 RAF 节流调度同步，每帧最多同步一次
            // 如果是刚过渡的 item，只同步位置，不同步尺寸（防止 tldraw 覆盖正确的比例尺寸）
            if (isRecentlyTransitioned) {
              scheduleSync(itemId, {
                x: shape.x,
                y: shape.y,
                ...(newUrl ? { url: newUrl } : {}),
              })
            } else {
              scheduleSync(itemId, {
                x: shape.x,
                y: shape.y,
                width: shape.props?.w ?? existingItem.width,
                height: shape.props?.h ?? existingItem.height,
                ...(newUrl ? { url: newUrl } : {}),
              })
            }
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
    // 修复4: 添加值比较，只在选中状态实际变化时才更新
    let prevSelectionKey = ''
    const unsubSelection = ed.store.listen(() => {
      const ids = ed.getSelectedShapeIds().map(id => shapeIdToCanvasItemId(id))
      const newKey = ids.join(',')
      if (prevSelectionKey === newKey) return
      prevSelectionKey = newKey
      console.log('[CanvasArea] selection changed:', ids)
      // 同时打印对应的 canvasItems 信息
      const items = useAppStore.getState().canvasItems
      const matched = ids.map(id => items.find(ci => ci.id === id))
      console.log('[CanvasArea] matched canvasItems:', matched?.map(i => i ? { id: i.id, fileName: i.fileName, uploading: i.uploading, placeholder: i.placeholder } : null))
      setSelectedShapeIds(ids)
    }, { source: 'user', scope: 'all' })

    return () => {
      unsub()
      unsubSelection()
      container.removeEventListener('pointerdown', handleMarkerPointerDown, true)  // capture
      container.removeEventListener('pointerup', handleMarkerClick, true)  // capture
      // 修复1: 清理 RAF
      if (syncRafRef.current !== null) {
        cancelAnimationFrame(syncRafRef.current)
        syncRafRef.current = null
      }
      pendingUpdatesRef.current.clear()
    }
  }, [setEditor, setSelectedShapeIds, scheduleSync])

  // Sync canvasItems changes to tldraw
  // 修复2: 如果这次 canvasItems 变化来自 tldraw store listener，跳过反向同步
  useEffect(() => {
    // [ProjectRestore] 如果正在恢复项目，跳过 sync effect
    const isRestoring = useAppStore.getState().isRestoringProject
    if (isRestoring) {
      console.log('[CanvasArea] skipping sync effect - isRestoringProject')
      isRestoringRef.current = true
      return
    }
    
    // [ProjectRestore] 项目恢复刚完成时，清空追踪数据，防止旧数据导致误删
    if (!isRestoring && isRestoringRef.current) {
      console.log('[CanvasArea] project restore completed - clearing tracking refs')
      processedItemsRef.current.clear()
      placeholderIdsRef.current.clear()
      recentlyTransitionedRef.current.clear()
      isRestoringRef.current = false
      return // 跳过本轮 sync，让下一轮正常处理
    }
    
    if (!editor || syncingRef.current || fromTldrawSyncRef.current) return

    // 修复：isMounted 标志防止组件卸载后执行状态更新
    let isMounted = true

    // 检测 placeholder 状态变化：从 true 变为 false 的 items
    const prevPlaceholderIds = placeholderIdsRef.current
    const currentPlaceholderIds = new Set<string>()
    const transitionItems: CanvasItem[] = []

    canvasItems.forEach((item) => {
      // 更新当前 placeholder 状态追踪
      if (item.placeholder) {
        currentPlaceholderIds.add(item.id)
      }

      // 检测 placeholder -> image 过渡
      // 条件：之前是 placeholder，现在不是，且有有效的 url
      if (prevPlaceholderIds.has(item.id) && !item.placeholder && item.url) {
        transitionItems.push(item)
      }
      
      const shapeId = canvasItemIdToShapeId(item.id)
      const existingShape = editor.getShape(shapeId)

      if (existingShape && existingShape.type === 'geo') {
        // 记住旧 shape 的位置（使用 tldraw 中的实际位置，而非 store 中的）
        const oldX = existingShape.x
        const oldY = existingShape.y
        // 尺寸使用 item 的最新值（store 中已更新为 FAL API 返回的实际比例尺寸）
        // 不从旧的 geo shape 读取，因为那是正方形占位符尺寸
        const newW = item.width
        const newH = item.height

        console.log('[CanvasArea] placeholder -> image transition for:', item.id, 'at position:', { x: oldX, y: oldY, w: newW, h: newH })

        // 【修复】在调用 createTldrawImageFromItem 之前就设置保护机制！
        // 因为 editor.createShape() 会同步触发 store listener，
        // 如果保护机制在 .then() 中设置就太晚了
        recentlyTransitionedRef.current.add(item.id)
        console.log('[CanvasArea] protection added BEFORE shape creation for:', item.id)

        syncingRef.current = true

        // 先删除旧的 geo 矩形（释放 shapeId）
        editor.deleteShape(shapeId)

        // 创建新的 image shape，使用保存的位置和更新后的尺寸
        const itemWithUpdatedSize = {
          ...item,
          x: oldX,
          y: oldY,
          width: newW,
          height: newH,
        }

        // G: createTldrawImageFromItem 调用前（保留此日志用于调试）
        // 尺寸使用 item 的最新值（store 中已更新为 FAL API 返回的实际比例尺寸）

        createTldrawImageFromItem(editor, itemWithUpdatedSize).then((newShapeId) => {
          if (!isMounted) return

          if (newShapeId) {
            processedItemsRef.current.add(item.id)
            console.log('[CanvasArea] placeholder -> image transition successful for:', item.id, 'with size:', { w: newW, h: newH })
            
            // 1000ms 后移除保护，允许正常的尺寸同步（如用户手动调整）
            // 延长保护时间以确保 tldraw 内部的异步更新完成
            setTimeout(() => {
              recentlyTransitionedRef.current.delete(item.id)
              console.log('[CanvasArea] protection removed for:', item.id)
            }, 1000)
          } else {
            console.warn('[CanvasArea] placeholder -> image transition failed for:', item.id)
            // 失败时移除保护
            recentlyTransitionedRef.current.delete(item.id)
          }

          queueMicrotask(() => {
            if (!isMounted) return
            syncingRef.current = false
          })
        }).catch((err) => {
          console.error('[CanvasArea] Failed to transition placeholder to image:', err)
          // 失败时移除保护
          recentlyTransitionedRef.current.delete(item.id)
          if (!isMounted) return
          syncingRef.current = false
        })
      }
    })

    canvasItems.forEach((item) => {
      // 跳过已经在过渡处理中处理过的 items
      if (transitionItems.some(t => t.id === item.id)) {
        return
      }

      const shapeId = canvasItemIdToShapeId(item.id)
      const existingShape = editor.getShape(shapeId)

      // Skip items that are still uploading (unless placeholder)
      if (item.uploading && !item.placeholder) {
        return
      }

      if (!existingShape && !processedItemsRef.current.has(item.id)) {
        // Create new shape
        syncingRef.current = true
        createTldrawImageFromItem(editor, item).then((newShapeId) => {
          if (!isMounted) return  // 组件已卸载，不执行后续操作
          if (newShapeId) {
            processedItemsRef.current.add(item.id)
            // 如果是 placeholder，记录到追踪 ref 中
            if (item.placeholder) {
              placeholderIdsRef.current.add(item.id)
            }
          } else {
            console.warn('[CanvasArea] Failed to create shape for item:', item.id)
          }
          // 延迟重置以避免 store listener 微任务中 syncingRef 已变 false
          queueMicrotask(() => {
            if (!isMounted) return
            syncingRef.current = false
          })
        }).catch((err) => {
          console.error('[CanvasArea] Error creating shape:', err)
          if (!isMounted) return
          syncingRef.current = false
        })
      } else if (existingShape) {
        // Shape 已存在（可能是通过 loadSnapshot 恢复的）
        // 确保将其添加到 processedItemsRef
        if (!processedItemsRef.current.has(item.id)) {
          processedItemsRef.current.add(item.id)
        }
        
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
          // 延迟重置以避免 store listener 微任务中 syncingRef 已变 false
          queueMicrotask(() => {
            if (!isMounted) return
            syncingRef.current = false
          })
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
          // 延迟重置以避免 store listener 微任务中 syncingRef 已变 false
          queueMicrotask(() => {
            if (!isMounted) return
            syncingRef.current = false
          })
        }
        processedItemsRef.current.delete(itemId)
        // 同时从 placeholder 追踪中移除
        placeholderIdsRef.current.delete(itemId)
      }
    })

    // 清理函数：标记组件已卸载
    return () => {
      isMounted = false
    }
  }, [editor, canvasItems])

  // Handle selection for editing mode
  useEffect(() => {
    if (selectedShapeIds.length === 1) {
      const itemId = selectedShapeIds[0]
      const item = canvasItems.find(i => i.id === itemId)
      if (item && !item.uploading && !item.placeholder) {
        // Only call setEditingMode if the target ID actually changed
        const currentTarget = useAppStore.getState().editingTarget
        if (currentTarget?.id !== item.id) {
          console.log('[CanvasArea] setEditingMode for item:', item.id)
          setEditingMode(true, {
            id: item.id,
            localUrl: item.url,
            falUrl: item.falUrl ?? item.url,
            name: `canvas-${item.id}.png`,
            uploading: false,
          })
        }
      }
    } else if (selectedShapeIds.length === 0) {
      // Only clear editing mode if currently active
      const currentTarget = useAppStore.getState().editingTarget
      if (currentTarget) {
        console.log('[CanvasArea] clearing editingMode')
        setEditingMode(false, null)
      }
    }
  }, [selectedShapeIds, canvasItems, setEditingMode])

  // File drop handler for external drops
  // 改进流程：先上传到 Storage 获取 https URL，再创建 canvasItem
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
      
      // 先添加 canvasItem 作为占位（单一事实来源：不使用本地 URL，等待云端 URL）
      addCanvasItem({ 
        id, 
        url: '', 
        falUrl: null, 
        x: dropX, 
        y: dropY, 
        width: 0, 
        height: 0, 
        uploading: true,
        placeholder: true
      })

      // Load image to get dimensions
      const img = new Image()
      img.onload = () => {
        const maxW = 480
        const scale = Math.min(maxW / img.naturalWidth, maxW / img.naturalHeight, 1)
        const width = Math.round(img.naturalWidth * scale)
        const height = Math.round(img.naturalHeight * scale)
        useAppStore.getState().updateCanvasItem(id, { 
          width, 
          height,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          fileName: file.name,
        })
      }
      img.src = localUrl

      // 上传到 Storage 和 FAL（并行执行）
      const assetId = `user-upload-${id}`
      
      try {
        // 并行上传到 Storage 和 FAL
        const [storageUrl, falUrl] = await Promise.all([
          uploadCanvasAsset(file, assetId).catch(err => {
            console.error('[CanvasArea] Storage 上传失败:', err)
            return null
          }),
          uploadFile(file).catch(err => {
            console.error('[CanvasArea] FAL 上传失败:', err)
            return null
          }),
        ])

        // 优先使用 Storage URL，fallback 到 FAL URL，最后 fallback 到 blob URL
        const finalUrl = storageUrl || falUrl || localUrl
        const finalFalUrl = falUrl || storageUrl || null

        console.log('[CanvasArea] Upload complete - storageUrl:', storageUrl?.substring(0, 60), 'falUrl:', falUrl?.substring(0, 60))

        useAppStore.getState().updateCanvasItem(id, { 
          url: finalUrl,
          falUrl: finalFalUrl, 
          uploading: false,
          placeholder: false
        })

        // 如果 Storage 上传失败但 FAL 成功，显示警告
        if (!storageUrl && falUrl) {
          console.warn('[CanvasArea] Storage 上传失败，使用 FAL URL')
        }
        // 如果两者都失败，显示错误
        if (!storageUrl && !falUrl) {
          toast.error('上传失败，使用本地预览')
        }
      } catch (error) {
        console.error('[CanvasArea] 文件上传失败:', error)
        console.error('[CanvasArea] 错误详情:', JSON.stringify(error, Object.getOwnPropertyNames(error as object), 2))
        toast.error(`上传失败: ${error instanceof Error ? error.message : '请检查网络连接'}`)
        useAppStore.getState().updateCanvasItem(id, { uploading: false, placeholder: false })
      }
    },
    [editor, addCanvasItem]
  )

  // Click outside to close background picker
  useEffect(() => {
    if (!showBgPicker) return
    const handleClickOutside = (e: MouseEvent) => {
      if (bgPickerRef.current && !bgPickerRef.current.contains(e.target as Node)) {
        setShowBgPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showBgPicker])

  // Click outside to close zoom menu
  useEffect(() => {
    if (!showZoomMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) {
        setShowZoomMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showZoomMenu])

  // Listen to zoom level changes
  useEffect(() => {
    if (!editor) return
    
    // Set initial zoom level
    setZoomLevel(editor.getZoomLevel())
    
    // Listen for camera changes to update zoom display
    // 使用 requestAnimationFrame 节流，确保每帧最多更新一次
    let rafId: number | null = null
    
    const unsub = editor.store.listen(() => {
      if (rafId !== null) return  // 已有待执行的 RAF，跳过
      rafId = requestAnimationFrame(() => {
        const zoom = editor.getZoomLevel()
        setZoomLevel(prev => prev === zoom ? prev : zoom)
        rafId = null
      })
    }, { source: 'all', scope: 'session' })
    
    return () => {
      unsub()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [editor])

  // Listen to shape changes for empty state hint
  useEffect(() => {
    if (!editor) return

    const checkShapes = () => {
      const shapes = editor.getCurrentPageShapes()
      setHasShapes(shapes.length > 0)
    }

    // Initial check
    checkShapes()

    // Listen for document changes (shape add/remove)
    // 使用 source: 'user' 避免程序化修改也触发检查
    const unsub = editor.store.listen(checkShapes, { source: 'user', scope: 'document' })

    return unsub
  }, [editor])

  return (
    <>
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
              licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
              onMount={handleMount}
              autoFocus
              components={tldrawComponents}
            />
          </div>

          {/* Empty state overlay */}
          {!hasShapes && canvasItems.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <p className="text-sm text-zinc-500">Get started by typing your idea, or drop image here.</p>
            </div>
          )}

          {/* Inline edit panel - self-positioning */}
          <InlineEditPanel />

          {/* Custom bottom toolbar */}
          <Toolbar />
        </div>

      {/* 左下角自定义导航栏 */}
      <div ref={bgPickerRef} className="absolute bottom-4 left-4 z-50 flex items-center">
        {/* 统一容器 */}
        <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg">
          {/* Canvas Background 按钮 */}
          <CustomTooltip content="Canvas background" side="top">
            <button
              onClick={() => setShowBgPicker(!showBgPicker)}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-700/60 transition-colors"
            >
              <div
                className="w-4 h-4 rounded-full border border-zinc-500"
                style={{ backgroundColor: bgColor }}
              />
            </button>
          </CustomTooltip>
          
          {/* 分隔线 */}
          <div className="w-px h-4 bg-zinc-600 mx-1" />
          
          {/* 缩放控制 - 整组 hover 显示胶囊背景 */}
          <CustomTooltip content="Zoom" side="top">
            <div className="flex items-center rounded-full hover:bg-black/[0.06] transition-colors">
            <button
              onClick={handleZoomOut}
              className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            
            {/* 缩放百分比按钮和菜单 */}
            <div ref={zoomMenuRef} className="relative">
              <button
                onClick={() => setShowZoomMenu(!showZoomMenu)}
                className="text-xs text-zinc-400 hover:text-zinc-200 min-w-[3rem] text-center font-mono select-none transition-colors"
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              
              {/* 缩放菜单 */}
              {showZoomMenu && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 w-48 rounded-lg bg-zinc-900 border border-zinc-700/50 shadow-2xl py-1 overflow-hidden">
                  <button
                    onClick={() => { handleZoomIn(); setShowZoomMenu(false) }}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    <span>Zoom In</span>
                    <span className="text-xs text-zinc-500">⌘ +</span>
                  </button>
                  <button
                    onClick={() => { handleZoomOut(); setShowZoomMenu(false) }}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    <span>Zoom Out</span>
                    <span className="text-xs text-zinc-500">⌘ -</span>
                  </button>
                  <button
                    onClick={handleZoomToFit}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    <span>Fit to Screen</span>
                    <span className="text-xs text-zinc-500">⌘ 1</span>
                  </button>
                  
                  <div className="border-t border-zinc-700/50 my-1" />
                  
                  <button
                    onClick={() => handleZoomTo(0.5)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    <span>Zoom to 50%</span>
                  </button>
                  <button
                    onClick={() => handleZoomTo(1)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    <span>Zoom to 100%</span>
                  </button>
                  <button
                    onClick={() => handleZoomTo(2)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    <span>Zoom to 200%</span>
                  </button>
                </div>
              )}
            </div>
            
            <button
              onClick={handleZoomIn}
              className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            </div>
          </CustomTooltip>
        </div>
        
        {/* Canvas Background 弹出面板 - 白色主题 */}
        {showBgPicker && (
          <div className="absolute bottom-12 left-0 w-64 rounded-xl bg-white shadow-2xl p-4 overflow-hidden">
            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-zinc-800">Canvas Background</span>
              <button
                onClick={() => setShowBgPicker(false)}
                className="text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SV 色域面板 */}
            <div
              ref={svPanelRef}
              className="relative w-full h-36 rounded-lg cursor-crosshair overflow-hidden mb-3"
              style={{ backgroundColor: `hsl(${hue}, 100%, 50%)` }}
              onMouseDown={handleSVMouseDown}
            >
              {/* 白色水平渐变 */}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, white, transparent)' }} />
              {/* 黑色垂直渐变 */}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent, black)' }} />
              {/* 选择器指示器 */}
              <div
                className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none"
                style={{
                  left: `${saturation}%`,
                  top: `${100 - brightness}%`,
                  transform: 'translate(-50%, -50%)',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)'
                }}
              />
            </div>

            {/* 色相滑条 */}
            <div className="mb-3">
              <input
                type="range"
                min="0"
                max="360"
                value={hue}
                onChange={(e) => setHue(Number(e.target.value))}
                className="hue-slider w-full h-3 rounded-full appearance-none cursor-pointer"
                style={{
                  background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                }}
              />
            </div>

            {/* 预设颜色 */}
            <div className="flex items-center gap-2 mb-4">
              {/* 无填充按钮 */}
              <button
                onClick={() => handlePresetColor(null)}
                className="relative w-6 h-6 rounded-full border border-zinc-300 bg-white overflow-hidden hover:scale-110 transition-transform"
                title="No fill"
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full h-0.5 bg-red-500 rotate-45 origin-center" />
                </div>
              </button>
              {/* 预设颜色 */}
              {['#000000', '#00ff00', '#7C3AED', '#C4B5FD', '#0a0a0a', '#1a1a2e'].map((color) => (
                <button
                  key={color}
                  onClick={() => handlePresetColor(color)}
                  className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${
                    bgColor.toLowerCase() === color.toLowerCase() ? 'border-zinc-800 ring-2 ring-zinc-400' : 'border-zinc-300'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            {/* HEX 输入和不透明度 */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <span className="text-xs text-zinc-500 font-medium shrink-0">#</span>
                <input
                  type="text"
                  value={bgColor.replace('#', '').toUpperCase()}
                  onChange={(e) => {
                    const hex = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
                    if (hex.length === 6) {
                      handleHexInput('#' + hex)
                    }
                  }}
                  className="flex-1 min-w-0 bg-zinc-100 text-zinc-800 text-xs px-2 py-1.5 rounded border border-zinc-200 font-mono"
                  maxLength={6}
                />
              </div>
              <span className="text-xs text-zinc-600 font-medium shrink-0 whitespace-nowrap">100%</span>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  )
}
