'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  MousePointer2, Hand, Target, Upload, Image, Video,
  Hash, Square, Minus, ArrowUpRight, Circle, Triangle, Star,
  Pencil, Type, Sparkles, Film
} from 'lucide-react'
import { CustomTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { GeoShapeGeoStyle } from '@tldraw/tlschema'
import { toast } from 'sonner'
import { nanoid } from 'nanoid'
import { validateFile } from '@/lib/validate'
import { uploadCanvasAsset } from '@/lib/project-service'

// ── 类型定义 ─────────────────────────────────────────────────────────────────

type ToolId = 'select' | 'marker' | 'upload' | 'frame' | 'shape' | 'pen' | 'text' | 'image-gen' | 'video-gen'

interface MenuItem {
  id: string
  icon: React.ReactNode
  label: string
  shortcut?: string
}

// ── 菜单项配置 ────────────────────────────────────────────────────────────────

const selectMenuItems: MenuItem[] = [
  { id: 'select', icon: <MousePointer2 className="w-4 h-4" />, label: 'Select', shortcut: 'V' },
  { id: 'hand', icon: <Hand className="w-4 h-4" />, label: 'Hand Tool', shortcut: 'H' },
]

const uploadMenuItems: MenuItem[] = [
  { id: 'upload-image', icon: <Image className="w-4 h-4" />, label: 'Upload Image' },
  { id: 'upload-video', icon: <Video className="w-4 h-4" />, label: 'Upload Video' },
]

const shapeMenuItems: MenuItem[] = [
  { id: 'rectangle', icon: <Square className="w-4 h-4" />, label: 'Rectangle', shortcut: 'R' },
  { id: 'line', icon: <Minus className="w-4 h-4" />, label: 'Line', shortcut: 'L' },
  { id: 'arrow', icon: <ArrowUpRight className="w-4 h-4" />, label: 'Arrow', shortcut: 'L' },
  { id: 'ellipse', icon: <Circle className="w-4 h-4" />, label: 'Ellipse', shortcut: 'O' },
  { id: 'polygon', icon: <Triangle className="w-4 h-4" />, label: 'Polygon' },
  { id: 'star', icon: <Star className="w-4 h-4" />, label: 'Star' },
]

// ── Hover 弹出菜单组件 ────────────────────────────────────────────────────────

interface HoverMenuProps {
  items: MenuItem[]
  visible: boolean
  onSelect?: (id: string) => void
  selectedId?: string
}

function HoverMenu({ items, visible, onSelect, selectedId }: HoverMenuProps) {
  return (
    <div
      className={cn(
        "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50",
        "transition-all duration-150 ease-out",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none"
      )}
    >
      <div className="bg-white rounded-lg shadow-lg border border-zinc-100 py-1.5 min-w-[160px]">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect?.(item.id)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors whitespace-nowrap",
              selectedId === item.id 
                ? "bg-zinc-100 text-zinc-900" 
                : "text-zinc-700 hover:bg-zinc-50"
            )}
          >
            <div className="flex items-center gap-2.5 text-left">
              <span className="text-zinc-500 shrink-0">{item.icon}</span>
              <span className="whitespace-nowrap">{item.label}</span>
            </div>
            {item.shortcut && (
              <span className="text-xs text-zinc-400 ml-4 shrink-0">{item.shortcut}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 画笔设置弹出面板 ──────────────────────────────────────────────────────────

interface PenMenuProps {
  visible: boolean
}

function PenMenu({ visible }: PenMenuProps) {
  const [brushSize, setBrushSize] = useState(10)

  return (
    <div
      className={cn(
        "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50",
        "transition-all duration-150 ease-out",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none"
      )}
    >
      <div className="bg-white rounded-lg shadow-lg border border-zinc-100 px-3 py-2.5 flex items-center gap-3">
        {/* 颜色选择圆点 */}
        <button className="w-5 h-5 rounded-full bg-zinc-900 border border-zinc-300 hover:ring-2 hover:ring-zinc-400 transition-all" />
        
        {/* 线条样式选择 */}
        <button className="flex items-center gap-1 text-zinc-600 hover:text-zinc-900 transition-colors">
          <Minus className="w-4 h-4" />
          <svg className="w-2 h-2" viewBox="0 0 8 8" fill="currentColor">
            <path d="M4 0L8 8H0L4 0Z" />
          </svg>
        </button>
        
        {/* 大小数值输入 */}
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-10 text-sm text-zinc-700 bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-sm text-zinc-500">Px</span>
        </div>
      </div>
    </div>
  )
}

// ── 工具栏按钮组件 ────────────────────────────────────────────────────────────

interface ToolButtonProps {
  id: ToolId
  icon: React.ReactNode
  tooltip: string
  isActive?: boolean
  hasMenu?: boolean
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  children?: React.ReactNode
}

function ToolButton({
  id,
  icon,
  tooltip,
  isActive,
  hasMenu,
  onClick,
  onMouseEnter,
  onMouseLeave,
  children
}: ToolButtonProps) {
  const buttonContent = (
    <div className="relative" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <button
        onClick={onClick}
        className={cn(
          "w-9 h-9 flex items-center justify-center rounded-lg transition-colors",
          isActive
            ? "bg-zinc-800 text-white"
            : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
        )}
      >
        {icon}
      </button>
      {children}
    </div>
  )

  // 有弹出菜单的按钮不需要 tooltip
  if (hasMenu) {
    return buttonContent
  }

  return (
    <CustomTooltip content={tooltip} side="top">
      {buttonContent}
    </CustomTooltip>
  )
}

// ── 主工具栏组件 ──────────────────────────────────────────────────────────────

export function Toolbar() {
  // 从 store 中读取 activeTool 状态
  const activeTool = useAppStore(s => s.activeTool) as ToolId
  const setActiveTool = useAppStore(s => s.setActiveTool)
  const [hoveredTool, setHoveredTool] = useState<ToolId | null>(null)
  const [activeSubTool, setActiveSubTool] = useState<Record<string, string>>({
    select: 'select',
    shape: 'rectangle',
    pen: 'pen',
    upload: 'upload-image',
  })

  const editor = useAppStore(s => s.editor)
  const addCanvasItem = useAppStore(s => s.addCanvasItem)

  // 用于延迟关闭菜单
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingUploadType = useRef<'image' | 'video'>('image')

  // 将 UI 工具/子工具切换同步到 tldraw editor
  const syncToolToEditor = useCallback((toolId: ToolId, subToolId?: string) => {
    if (!editor) return
    
    switch (toolId) {
      case 'select':
        editor.setCurrentTool(subToolId === 'hand' ? 'hand' : 'select')
        break
      case 'marker':
        // marker 工具激活时，tldraw 保持 'select' 模式
        editor.setCurrentTool('select')
        // 清空当前选择，避免用户误操作选中的图片
        editor.selectNone()
        break
      case 'shape': {
        const sub = subToolId || activeSubTool.shape
        if (sub === 'line') {
          editor.setCurrentTool('line')
        } else if (sub === 'arrow') {
          editor.setCurrentTool('arrow')
        } else {
          editor.setCurrentTool('geo')
          const geoMap: Record<string, string> = {
            rectangle: 'rectangle',
            ellipse: 'ellipse',
            polygon: 'pentagon',
            star: 'star',
          }
          if (geoMap[sub]) {
            editor.setStyleForNextShapes(GeoShapeGeoStyle, geoMap[sub] as any)
          }
        }
        break
      }
      case 'pen':
        editor.setCurrentTool('draw')
        break
      case 'text':
        editor.setCurrentTool('text')
        break
      case 'frame':
        editor.setCurrentTool('frame')
        break
      // upload, image-gen, video-gen 不需要切换 tldraw 工具
    }
  }, [editor, activeSubTool.shape])

  // 计算新元素位置的辅助函数
  const getNewItemPosition = useCallback(() => {
    if (!editor) return { x: 100, y: 100 }
    
    const selectedIds = editor.getSelectedShapeIds()
    if (selectedIds.length > 0) {
      // 放到选中元素右侧
      const lastId = selectedIds[selectedIds.length - 1]
      const bounds = editor.getShapePageBounds(lastId)
      if (bounds) {
        return { x: bounds.maxX + 40, y: bounds.y }
      }
    }
    
    // 放到视口中心
    const viewportBounds = editor.getViewportScreenBounds()
    const center = editor.screenToPage({
      x: viewportBounds.x + viewportBounds.w / 2,
      y: viewportBounds.y + viewportBounds.h / 2,
    })
    return { x: center.x - 200, y: center.y - 200 }
  }, [editor])

  // 处理文件选择的回调
  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // 重置 input 以便同文件可重复选择
    e.target.value = ''
    
    if (pendingUploadType.current === 'video') {
      toast('视频上传暂未开放', { description: '该功能将在后续版本中提供' })
      return
    }
    
    // 图片验证
    const err = validateFile(file)
    if (err) {
      toast.error(err)
      return
    }
    
    const { x, y } = getNewItemPosition()
    const id = nanoid()
    const localUrl = URL.createObjectURL(file)
    
    // 创建 canvasItem，走统一的 loadable-image 流程
    addCanvasItem({
      id,
      url: '',              // 不传 blob URL，由 shape 内部管理
      x,
      y,
      width: 0,             // 初始为 0，sync effect 会用默认值 400
      height: 0,
      uploading: true,
      placeholder: true,    // 走 loadable-image 的 loading 状态
    })
    
    // 加载图片获取尺寸（使用 blob URL）
    const img = document.createElement('img')
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
      // 获取到尺寸后释放 blob URL
      URL.revokeObjectURL(localUrl)
    }
    img.onerror = () => {
      URL.revokeObjectURL(localUrl)
    }
    img.src = localUrl
    
    try {
      const assetId = `toolbar-upload-${id}`
      const storageUrl = await uploadCanvasAsset(file, assetId)
      // 上传完成，触发 loading → ready 过渡
      useAppStore.getState().updateCanvasItem(id, { 
        url: storageUrl,
        uploading: false, 
        placeholder: false,
      })
    } catch {
      toast.error('上传失败，请检查网络连接')
      useAppStore.getState().updateCanvasItem(id, { uploading: false })
    }
  }, [addCanvasItem, getNewItemPosition])

  // 触发上传的函数
  const triggerUpload = useCallback((type: 'image' | 'video') => {
    pendingUploadType.current = type
    if (type === 'video') {
      toast('视频上传暂未开放', { description: '该功能将在后续版本中提供' })
      return
    }
    if (fileInputRef.current) {
      fileInputRef.current.accept = 'image/jpeg,image/png,image/webp'
      fileInputRef.current.click()
    }
  }, [])

  const handleToolClick = useCallback((toolId: ToolId, hasSelectState: boolean) => {
    if (hasSelectState) {
      setActiveTool(toolId)
      syncToolToEditor(toolId)
    }
  }, [setActiveTool, syncToolToEditor])

  const handleMouseEnter = useCallback((toolId: ToolId) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setHoveredTool(toolId)
  }, [])

  const handleMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredTool(null)
    }, 100)
  }, [])

  const handleSubToolSelect = useCallback((toolId: ToolId, subToolId: string) => {
    setActiveSubTool(prev => ({ ...prev, [toolId]: subToolId }))
    setActiveTool(toolId)
    
    if (toolId === 'upload') {
      triggerUpload(subToolId === 'upload-video' ? 'video' : 'image')
      return
    }
    
    syncToolToEditor(toolId, subToolId)
  }, [syncToolToEditor, triggerUpload])

  // 获取子工具图标的辅助函数
  const getSubToolIcon = useCallback((toolId: string, subToolId: string): React.ReactNode => {
    const iconMap: Record<string, Record<string, React.ReactNode>> = {
      select: {
        select: <MousePointer2 className="w-5 h-5" />,
        hand: <Hand className="w-5 h-5" />,
      },
      upload: {
        'upload-image': <Image className="w-5 h-5" />,
        'upload-video': <Video className="w-5 h-5" />,
      },
      shape: {
        rectangle: <Square className="w-5 h-5" />,
        line: <Minus className="w-5 h-5" />,
        arrow: <ArrowUpRight className="w-5 h-5" />,
        ellipse: <Circle className="w-5 h-5" />,
        polygon: <Triangle className="w-5 h-5" />,
        star: <Star className="w-5 h-5" />,
      },
    }
    return iconMap[toolId]?.[subToolId] ?? null
  }, [])

  // 快捷键与工具栏状态联动
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      const key = e.key.toLowerCase()
      const ed = useAppStore.getState().editor

      switch (key) {
        case 'v':
          setActiveTool('select')
          setActiveSubTool(prev => ({ ...prev, select: 'select' }))
          ed?.setCurrentTool('select')
          break
        case 'h':
          setActiveTool('select')
          setActiveSubTool(prev => ({ ...prev, select: 'hand' }))
          ed?.setCurrentTool('hand')
          break
        case 'r':
          setActiveTool('shape')
          setActiveSubTool(prev => ({ ...prev, shape: 'rectangle' }))
          ed?.setCurrentTool('geo')
          if (ed) ed.setStyleForNextShapes(GeoShapeGeoStyle, 'rectangle' as any)
          break
        case 'l':
          setActiveTool('shape')
          setActiveSubTool(prev => ({ ...prev, shape: 'line' }))
          ed?.setCurrentTool('line')
          break
        case 'o':
          setActiveTool('shape')
          setActiveSubTool(prev => ({ ...prev, shape: 'ellipse' }))
          ed?.setCurrentTool('geo')
          if (ed) ed.setStyleForNextShapes(GeoShapeGeoStyle, 'ellipse' as any)
          break
        case 'p':
          setActiveTool('pen')
          ed?.setCurrentTool('draw')
          break
        case 't':
          setActiveTool('text')
          ed?.setCurrentTool('text')
          break
        case 'f':
          setActiveTool('frame')
          ed?.setCurrentTool('frame')
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 反向同步：监听 tldraw 工具变化更新 Toolbar UI
  // 优化：使用 store.listen 事件驱动替代 setInterval 轮询
  useEffect(() => {
    if (!editor) return
    
    // 工具同步函数
    const syncToolFromEditor = () => {
      const currentToolId = editor.getCurrentToolId()
      const currentActiveTool = useAppStore.getState().activeTool
      
      // 如果当前是 marker 模式，不因为 tldraw 是 select 模式就改回 select
      if (currentActiveTool === 'marker' && (currentToolId === 'select' || currentToolId === 'hand')) {
        return
      }
      
      // 映射 tldraw tool ID 回 Toolbar UI 状态
      switch (currentToolId) {
        case 'select':
          setActiveTool('select')
          setActiveSubTool(prev => prev.select === 'select' ? prev : { ...prev, select: 'select' })
          break
        case 'hand':
          setActiveTool('select')
          setActiveSubTool(prev => prev.select === 'hand' ? prev : { ...prev, select: 'hand' })
          break
        case 'geo':
          setActiveTool('shape')
          break
        case 'draw':
          setActiveTool('pen')
          break
        case 'text':
          setActiveTool('text')
          break
        case 'frame':
          setActiveTool('frame')
          break
        case 'line':
          setActiveTool('shape')
          setActiveSubTool(prev => prev.shape === 'line' ? prev : { ...prev, shape: 'line' })
          break
        case 'arrow':
          setActiveTool('shape')
          setActiveSubTool(prev => prev.shape === 'arrow' ? prev : { ...prev, shape: 'arrow' })
          break
      }
    }
    
    // 初始同步
    syncToolFromEditor()
    
    // 监听 store 变化（用户操作触发的工具切换）
    const unsub = editor.store.listen(() => {
      syncToolFromEditor()
    }, { source: 'user', scope: 'session' })
    
    return () => unsub()
  }, [editor])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])

  // 有选中状态的工具列表
  const selectableTools: ToolId[] = ['select', 'marker', 'frame', 'shape', 'pen', 'text']

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelected}
      />
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-white rounded-xl shadow-lg border border-zinc-100">
        
        {/* 1. Select工具组 */}
        <ToolButton
          id="select"
          icon={getSubToolIcon('select', activeSubTool.select)}
          tooltip="Select"
          isActive={activeTool === 'select'}
          hasMenu
          onClick={() => handleToolClick('select', true)}
          onMouseEnter={() => handleMouseEnter('select')}
          onMouseLeave={handleMouseLeave}
        >
          <HoverMenu
            items={selectMenuItems}
            visible={hoveredTool === 'select'}
            selectedId={activeSubTool.select}
            onSelect={(id) => handleSubToolSelect('select', id)}
          />
        </ToolButton>

        {/* 2. Marker标记工具 */}
        <ToolButton
          id="marker"
          icon={<Target className="w-5 h-5" />}
          tooltip="Marker"
          isActive={activeTool === 'marker'}
          onClick={() => handleToolClick('marker', true)}
        />

        {/* 3. Upload上传 */}
        <ToolButton
          id="upload"
          icon={getSubToolIcon('upload', activeSubTool.upload)}
          tooltip="Upload"
          hasMenu
          onMouseEnter={() => handleMouseEnter('upload')}
          onMouseLeave={handleMouseLeave}
        >
          <HoverMenu
            items={uploadMenuItems}
            visible={hoveredTool === 'upload'}
            selectedId={activeSubTool.upload}
            onSelect={(id) => handleSubToolSelect('upload', id)}
          />
        </ToolButton>

        {/* 4. Frame工具 */}
        <ToolButton
          id="frame"
          icon={<Hash className="w-5 h-5" />}
          tooltip="Frame"
          isActive={activeTool === 'frame'}
          onClick={() => handleToolClick('frame', true)}
        />

        {/* 5. Shape形状工具组 */}
        <ToolButton
          id="shape"
          icon={getSubToolIcon('shape', activeSubTool.shape)}
          tooltip="Shape"
          isActive={activeTool === 'shape'}
          hasMenu
          onClick={() => handleToolClick('shape', true)}
          onMouseEnter={() => handleMouseEnter('shape')}
          onMouseLeave={handleMouseLeave}
        >
          <HoverMenu
            items={shapeMenuItems}
            visible={hoveredTool === 'shape'}
            selectedId={activeSubTool.shape}
            onSelect={(id) => handleSubToolSelect('shape', id)}
          />
        </ToolButton>

        {/* 6. 画笔工具组 */}
        <ToolButton
          id="pen"
          icon={<Pencil className="w-5 h-5" />}
          tooltip="Pen"
          isActive={activeTool === 'pen'}
          hasMenu
          onClick={() => handleToolClick('pen', true)}
          onMouseEnter={() => handleMouseEnter('pen')}
          onMouseLeave={handleMouseLeave}
        >
          <PenMenu visible={hoveredTool === 'pen'} />
        </ToolButton>

        {/* 7. Text文本工具 */}
        <ToolButton
          id="text"
          icon={<Type className="w-5 h-5" />}
          tooltip="Text"
          isActive={activeTool === 'text'}
          onClick={() => handleToolClick('text', true)}
        />

        {/* 分隔线 */}
        <div className="w-px h-6 bg-zinc-200 mx-1" />

        {/* 8. Image Generator */}
        <ToolButton
          id="image-gen"
          icon={<Sparkles className="w-5 h-5" />}
          tooltip="Image Generator"
          onClick={() => {}}
        />

        {/* 9. Video Generator */}
        <ToolButton
          id="video-gen"
          icon={<Film className="w-5 h-5" />}
          tooltip="Video Generator"
          onClick={() => {}}
        />
      </div>
    </div>
  )
}
