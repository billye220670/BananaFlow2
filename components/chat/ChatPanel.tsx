'use client'

import { useState, useRef, useEffect, useMemo, useCallback, type KeyboardEvent } from 'react'
import { 
  SquarePen, 
  PanelRightClose, 
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Zap,
  Sparkles,
  LayoutGrid,
  Hash,
  Clapperboard,
  Building2,
  Package
} from 'lucide-react'
import { nanoid } from 'nanoid'
import { CustomTooltip } from '@/components/ui/tooltip'
import { useAppStore } from '@/lib/store'
import { generateImage, getImageDimensions } from '@/lib/fal'
import { uploadCanvasAsset } from '@/lib/project-service'
import type { CanvasItem } from '@/lib/types'
import { MessageHistory } from './MessageHistory'

// ============ 空位查找辅助函数 ============

/** 检查矩形是否与现有 canvasItems 重叠 */
function hasOverlap(
  items: CanvasItem[],
  x: number,
  y: number,
  w: number,
  h: number
): boolean {
  return items.some(item => {
    return (
      x < item.x + item.width &&
      x + w > item.x &&
      y < item.y + item.height &&
      y + h > item.y
    )
  })
}

/** 为新占位图查找空位，避免与现有图片重叠 */
function findEmptyPosition(
  existingItems: CanvasItem[],
  newW: number,
  newH: number,
  fallbackX: number,
  fallbackY: number,
  gap: number = 40
): { x: number; y: number } {
  // 画布为空时，使用 fallback 位置（视口中心）
  if (existingItems.length === 0) {
    return { x: fallbackX, y: fallbackY }
  }

  // 找到最右侧的图片
  const rightmostItem = existingItems.reduce((max, item) =>
    (item.x + item.width) > (max.x + max.width) ? item : max
  )

  // 尝试方向：右 → 下 → 左 → 上
  const directions = [
    // 右侧：紧贴最右侧图片的右边
    { x: rightmostItem.x + rightmostItem.width + gap, y: rightmostItem.y },
    // 下方：紧贴最右侧图片的下边
    { x: rightmostItem.x, y: rightmostItem.y + rightmostItem.height + gap },
    // 左侧：在最右侧图片的左边
    { x: rightmostItem.x - newW - gap, y: rightmostItem.y },
    // 上方：在最右侧图片的上边
    { x: rightmostItem.x, y: rightmostItem.y - newH - gap },
  ]

  for (const pos of directions) {
    if (!hasOverlap(existingItems, pos.x, pos.y, newW, newH)) {
      return pos
    }
  }

  // 所有方向都被占，找到整体边界框的最右侧外面
  const overallRight = existingItems.reduce(
    (max, item) => Math.max(max, item.x + item.width),
    -Infinity
  )
  const overallTop = existingItems.reduce(
    (min, item) => Math.min(min, item.y),
    Infinity
  )

  return { x: overallRight + gap, y: overallTop }
}
import { SelectionBadge } from './SelectionBadge'

// Resolution options
const RESOLUTIONS = ['1K', '2K', '4K'] as const
type Resolution = typeof RESOLUTIONS[number]

// Size/ratio options
const SIZES = [
  'auto', '21:9', '16:9', '3:2', '4:3',
  '5:4', '1:1', '4:5', '3:4',
  '2:3', '9:16'
] as const
type Size = typeof SIZES[number]

// Skills data
const SKILLS = [
  { id: 'carousel', label: 'Carousel', icon: LayoutGrid, color: 'text-red-500' },
  { id: 'social-media', label: 'Social Media', icon: Sparkles, color: 'text-purple-500' },
  { id: 'logo-branding', label: 'Logo & Branding', icon: Hash, color: 'text-blue-500' },
  { id: 'storyboard', label: 'Storyboard', icon: Clapperboard, color: 'text-green-500' },
  { id: 'brochures', label: 'Brochures', icon: Building2, color: 'text-orange-500' },
  { id: 'amazon', label: 'Amazon Product Listing', icon: Package, color: 'text-amber-500' },
]

export function ChatPanel() {
  const chatHistory = useAppStore(s => s.chatHistory)
  const closeChat = useAppStore(s => s.closeChat)
  const clearChatHistory = useAppStore(s => s.clearChatHistory)
  const selectedShapeIds = useAppStore(s => s.selectedShapeIds)
  const canvasItems = useAppStore(s => s.canvasItems)
  const isLoading = useAppStore(s => s.isLoading)
  const addCanvasItem = useAppStore(s => s.addCanvasItem)
  const appendMessage = useAppStore(s => s.appendMessage)
  const updateMessage = useAppStore(s => s.updateMessage)
  const updateCanvasItem = useAppStore(s => s.updateCanvasItem)
  const removeCanvasItem = useAppStore(s => s.removeCanvasItem)
  const setLoading = useAppStore(s => s.setLoading)
  const setChatPanelWidth = useAppStore(s => s.setChatPanelWidth)
  
  // Marker badge 订阅
  const markers = useAppStore(s => s.markers)
  const removeMarker = useAppStore(s => s.removeMarker)
  
  // Resize handle drag state
  const isDragging = useRef(false)
  
  const [inputValue, setInputValue] = useState('')
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [lockedItems, setLockedItems] = useState<CanvasItem[]>([])
  
  // 根据selectedShapeIds映射到对应的canvasItems
  // 注意：selectedShapeIds 中已经是纯 itemId（CanvasArea 在 store.listen 中已转换）
  const selectedItems = useMemo(() => {
    console.log('[ChatPanel] selectedShapeIds:', selectedShapeIds)
    console.log('[ChatPanel] canvasItems ids:', canvasItems.map(ci => ci.id))
    
    const mapped = selectedShapeIds
      .map(sid => canvasItems.find(ci => ci.id === sid))
    
    // 详细打印每个匹配项的过滤相关属性
    mapped.forEach((item, idx) => {
      if (item) {
        console.log(`[ChatPanel] item[${idx}]:`, {
          id: item.id,
          fileName: item.fileName,
          url: item.url ? item.url.substring(0, 50) + '...' : '(empty)',
          uploading: item.uploading,
          placeholder: item.placeholder,
          urlTruthy: !!item.url,
        })
      } else {
        console.log(`[ChatPanel] item[${idx}]: not found`)
      }
    })
    
    const result = mapped
      .filter((item): item is CanvasItem => !!item && !item.placeholder && !item.uploading)
    
    console.log('[ChatPanel] selectedItems result:', result.map(i => ({ id: i.id, fileName: i.fileName })))
    return result
  }, [selectedShapeIds, canvasItems])
  
  // 决定当前显示的徽章列表和激活状态
  // 如果有锁定项则优先显示锁定项（实色），否则显示选中项（灰色）
  const displayBadges = lockedItems.length > 0 ? lockedItems : selectedItems
  const badgesActive = lockedItems.length > 0
  
  // 将 markers 映射为可显示的 badge 数据
  const markerBadges = useMemo(() => {
    return markers
      .map(m => {
        const item = canvasItems.find(i => i.id === m.itemId)
        return { marker: m, item }
      })
      .filter((x): x is { marker: typeof markers[0]; item: CanvasItem } => !!x.item)
  }, [markers, canvasItems])
  const [selectedResolution, setSelectedResolution] = useState<Resolution>('1K')
  const [selectedSize, setSelectedSize] = useState<Size>('auto')
  const [isSizePopoverOpen, setIsSizePopoverOpen] = useState(false)
  
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [popoverPosition, setPopoverPosition] = useState<{ bottom: number; right: number } | null>(null)
  
  // Update popover position when opened
  useEffect(() => {
    if (isSizePopoverOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPopoverPosition({
        bottom: window.innerHeight - rect.top + 8, // 8px gap above button
        right: window.innerWidth - rect.right,
      })
    }
  }, [isSizePopoverOpen])
  
  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        buttonRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsSizePopoverOpen(false)
      }
    }
    
    if (isSizePopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isSizePopoverOpen])
  
  const hasMessages = chatHistory.length > 0
  
  const handleNewChat = () => {
    clearChatHistory()
    setInputValue('')
  }
  
  const handleSend = async () => {
    const prompt = inputValue.trim()
    if (!prompt) return

    // 构建发送给 API 的最终 prompt（可能包含 marker 描述前缀）
    let finalPrompt = prompt
    const { markers: currentMarkers, canvasItems: currentCanvasItems } = useAppStore.getState()
    
    if (currentMarkers.length > 0) {
      const markerDescriptions = currentMarkers
        .sort((a, b) => a.number - b.number)
        .map(m => {
          const item = currentCanvasItems.find(i => i.id === m.itemId)
          const name = item?.fileName || '未命名图片'
          return `${m.number}表示图片"${name}"的(${m.relativeX.toFixed(2)}, ${m.relativeY.toFixed(2)})位置`
        })
        .join('；')
      
      const markerPrefix = `在下方用户的描述中：${markerDescriptions}。\n\n`
      finalPrompt = markerPrefix + prompt
    }

    // 1. 收集参考图 URL
    // blob/data URL 需要先上传到 Supabase Storage 获取公开 URL，因为 FAL API 只接受公开可访问的 HTTPS URL
    const referenceUrls: string[] = []
    for (const badge of displayBadges) {
      // 优先使用 store 中最新的 CanvasItem
      const item = currentCanvasItems.find(i => i.id === badge.id) ?? badge
      
      const url = item.url
      if (!url) continue
      
      // 如果已是公开 URL，直接使用
      if (url.startsWith('https://') || url.startsWith('http://')) {
        referenceUrls.push(url)
        continue
      }
      
      // 如果是 blob URL，需要上传到 Supabase Storage
      if (url.startsWith('blob:')) {
        try {
          console.log('[handleSend] Uploading blob URL to Supabase Storage:', url.substring(0, 50))
          const response = await fetch(url)
          const blob = await response.blob()
          const file = new File([blob], item.fileName || 'image.png', { type: blob.type || 'image/png' })
          const assetId = `chat-ref-${item.id}`
          const storageUrl = await uploadCanvasAsset(file, assetId)
          
          // 更新 item 的 url，避免下次重复上传
          updateCanvasItem(item.id, { url: storageUrl })
          referenceUrls.push(storageUrl)
          console.log('[handleSend] Blob uploaded successfully:', storageUrl.substring(0, 80))
        } catch (error) {
          console.error('[handleSend] Failed to upload blob URL:', url.substring(0, 50), error)
          // 跳过该项，不阻断整个流程
        }
      } else if (url.startsWith('data:')) {
        // data: URL（如 tldraw asset）需要转换为 Blob 再上传
        try {
          console.log('[handleSend] Converting data URL to blob and uploading...')
          const response = await fetch(url)
          const blob = await response.blob()
          const file = new File([blob], item.fileName || 'image.png', { type: blob.type || 'image/png' })
          const assetId = `chat-ref-${item.id}`
          const storageUrl = await uploadCanvasAsset(file, assetId)
          
          // 更新 item 的 url，避免下次重复上传
          updateCanvasItem(item.id, { url: storageUrl })
          referenceUrls.push(storageUrl)
          console.log('[handleSend] Data URL uploaded successfully:', storageUrl.substring(0, 80))
        } catch (error) {
          console.error('[handleSend] Failed to upload data URL:', error)
        }
      }
    }
    
    // 收集 marker 对应的 CanvasItem 图片 URL
    // marker 标记的是画布上的主图片，这些图片的 URL 也需要传给 FAL API
    if (currentMarkers.length > 0) {
      // 已添加的 item id 集合，避免重复添加
      const addedItemIds = new Set(displayBadges.map(b => b.id))
      
      for (const marker of currentMarkers) {
        const item = currentCanvasItems.find(i => i.id === marker.itemId)
        if (!item) continue
        
        // 避免重复添加（如果 displayBadges 已包含该 item）
        if (addedItemIds.has(item.id)) continue
        addedItemIds.add(item.id)
        
        // 优先使用已上传的 URL
        const url = item.url
        if (!url) continue
        
        if (url.startsWith('https://') || url.startsWith('http://')) {
          referenceUrls.push(url)
          continue
        }
        
        // 如果是 blob URL，需要上传到 Supabase Storage
        if (url.startsWith('blob:')) {
          try {
            console.log('[handleSend] Uploading marker image blob URL to Supabase Storage:', url.substring(0, 50))
            const response = await fetch(url)
            const blob = await response.blob()
            const file = new File([blob], item.fileName || 'image.png', { type: blob.type || 'image/png' })
            const assetId = `chat-marker-${item.id}`
            const storageUrl = await uploadCanvasAsset(file, assetId)
            
            // 更新 item 的 url，避免下次重复上传
            updateCanvasItem(item.id, { url: storageUrl })
            referenceUrls.push(storageUrl)
            console.log('[handleSend] Marker image blob uploaded successfully:', storageUrl.substring(0, 80))
          } catch (error) {
            console.error('[handleSend] Failed to upload marker image blob URL:', url.substring(0, 50), error)
          }
        } else if (url.startsWith('data:')) {
          // data: URL（如 tldraw asset）需要转换为 Blob 再上传
          try {
            console.log('[handleSend] Converting marker image data URL to blob and uploading...')
            const response = await fetch(url)
            const blob = await response.blob()
            const file = new File([blob], item.fileName || 'image.png', { type: blob.type || 'image/png' })
            const assetId = `chat-marker-${item.id}`
            const storageUrl = await uploadCanvasAsset(file, assetId)
            
            // 更新 item 的 url，避免下次重复上传
            updateCanvasItem(item.id, { url: storageUrl })
            referenceUrls.push(storageUrl)
            console.log('[handleSend] Marker image data URL uploaded successfully:', storageUrl.substring(0, 80))
          } catch (error) {
            console.error('[handleSend] Failed to upload marker image data URL:', error)
          }
        }
      }
    }
    
    console.log('[handleSend] Collected referenceUrls:', referenceUrls.map(u => u.substring(0, 80)))
    
    // 直接使用选中的比例，包括 'auto'
    const aspectRatio = selectedSize
    const resolution = selectedResolution  // 如 '1K'

    // 调试日志：发送参数
    console.log('[handleSend] === 发送参数 ===')
    console.log('[handleSend] prompt (原始):', prompt)
    console.log('[handleSend] finalPrompt (发送给API):', finalPrompt)
    console.log('[handleSend] displayBadges:', displayBadges.map(item => ({
      id: item.id,
      url: item.url?.substring(0, 80),
      fileName: item.fileName,
    })))
    console.log('[handleSend] referenceUrls:', referenceUrls)
    console.log('[handleSend] aspectRatio:', aspectRatio)
    console.log('[handleSend] resolution:', resolution)

    // 2. 计算占位图画布显示尺寸
    const maxDisplay = 480
    let displayW = maxDisplay, displayH = maxDisplay // 默认正方形

    // 占位图尺寸确定规则：
    // 1. 有参考图：直接使用参考图在画布上的实际显示尺寸（与参考图一样大）
    // 2. 无参考图 + 用户指定比例（非 auto）：按指定比例计算
    // 3. 无参考图 + auto：正方形占位

    if (referenceUrls.length > 0) {
      // 有参考图：优先使用参考图在画布上的实际显示尺寸
      const firstRef = displayBadges[0]
      
      if (firstRef?.width && firstRef?.height) {
        // 直接使用参考图的画布显示尺寸，保持占位图与参考图一样大
        displayW = firstRef.width
        displayH = firstRef.height
        console.log('[handleSend] 使用参考图画布尺寸:', { displayW, displayH })
      } else {
        // fallback：如果没有画布尺寸，尝试用 naturalWidth/naturalHeight 缩放到 480px
        let refWidth = firstRef?.naturalWidth
        let refHeight = firstRef?.naturalHeight

        // 如果 CanvasItem 中没有 naturalWidth/naturalHeight，尝试加载图片获取
        if (!refWidth || !refHeight) {
          try {
            const dims = await getImageDimensions(referenceUrls[0])
            refWidth = dims.width
            refHeight = dims.height
          } catch (e) {
            console.warn('[handleSend] Failed to get reference image dimensions:', e)
            // 加载失败，使用默认正方形
          }
        }

        if (refWidth && refHeight) {
          const ratio = refWidth / refHeight
          if (ratio >= 1) {
            displayW = maxDisplay
            displayH = Math.round(maxDisplay / ratio)
          } else {
            displayH = maxDisplay
            displayW = Math.round(maxDisplay * ratio)
          }
        }
        console.log('[handleSend] 使用 fallback 缩放尺寸:', { displayW, displayH })
      }
    } else if (aspectRatio !== 'auto' && aspectRatio.includes(':')) {
      // 无参考图 + 用户指定比例
      const [wRatio, hRatio] = aspectRatio.split(':').map(Number)
      const ratio = wRatio / hRatio
      if (ratio >= 1) {
        displayW = maxDisplay
        displayH = Math.round(maxDisplay / ratio)
      } else {
        displayH = maxDisplay
        displayW = Math.round(maxDisplay * ratio)
      }
    }
    // else: auto + 无参考图 → 保持 480x480 正方形

    // 3. 生成唯一ID
    const msgId = nanoid()
    const itemId = nanoid()

    // 4. 添加用户消息（调试：使用 finalPrompt 显示完整提示词）
    appendMessage({
      id: nanoid(),
      role: 'user',
      content: finalPrompt,
      timestamp: Date.now(),
    })

    // 5. 添加骨架加载消息（assistant）
    appendMessage({
      id: msgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      loading: true,
    })

    // 6. 在画布上创建占位 CanvasItem
    // 计算放置位置：自动查找空位，避免与现有图片重叠
    const editor = useAppStore.getState().editor
    const currentItems = useAppStore.getState().canvasItems
    
    // 计算 fallback 位置（视口中心）
    let fallbackX = 100, fallbackY = 100
    if (editor) {
      const vp = editor.getViewportScreenBounds()
      const pageCenter = editor.screenToPage({ x: vp.midX, y: vp.midY })
      fallbackX = pageCenter.x - displayW / 2
      fallbackY = pageCenter.y - displayH / 2
    }
    
    // 查找空位（优先右侧，避免重叠）
    const { x: cx, y: cy } = findEmptyPosition(
      currentItems,
      displayW,
      displayH,
      fallbackX,
      fallbackY,
      40 // gap
    )

    addCanvasItem({
      id: itemId,
      url: '',
      x: cx,
      y: cy,
      width: displayW,
      height: displayH,
      uploading: false,
      placeholder: true,
    })

    // 7. 清空输入框，设置loading
    setInputValue('')
    setLoading(true)

    // 8. 调用 FAL API（使用 finalPrompt，包含 marker 描述前缀）
    try {
      const result = await generateImage({
        prompt: finalPrompt,
        referenceUrls,
        aspectRatio,
        resolution,
      })
      const resultUrl = result.url

      // 防御性处理：如果 FAL 返回的宽高仍为 0 或 falsy，使用占位图尺寸作为 fallback
      const finalWidth = result.width || displayW
      const finalHeight = result.height || displayH

      // 下载 AI 生成的图片并上传到 Supabase
      let storageUrl = resultUrl
      try {
        const response = await fetch(resultUrl)
        if (response.ok) {
          const blob = await response.blob()
          const ext = resultUrl.split('.').pop()?.split('?')[0] || 'png'
          const file = new File([blob], `ai-generated.${ext}`, { type: blob.type || 'image/png' })
          const assetId = `chat-ai-${itemId}`
          storageUrl = await uploadCanvasAsset(file, assetId)
          console.log('[ChatPanel] AI image uploaded to Supabase:', storageUrl.substring(0, 80))
        }
      } catch (err) {
        console.error('[ChatPanel] Failed to upload AI image to Supabase:', err)
        // Fallback: 使用原始 fal.media URL
      }

      // 成功：更新画布项和消息
      // 保持占位图的原始显示尺寸（displayW/displayH），FAL返回的实际尺寸只存入naturalWidth/naturalHeight
      updateCanvasItem(itemId, {
        url: storageUrl,
        placeholder: false,
        width: displayW,
        height: displayH,
        naturalWidth: finalWidth,
        naturalHeight: finalHeight,
      })

      updateMessage(msgId, {
        imageUrl: resultUrl,
        loading: false,
        content: '图片已生成',
      })
    } catch (error) {
      // 失败：移除画布占位项，更新消息为错误
      console.error('[ChatPanel] generateImage 失败:', error)
      console.error('[ChatPanel] 错误详情:', JSON.stringify(error, Object.getOwnPropertyNames(error as object), 2))
      removeCanvasItem(itemId)
      updateMessage(msgId, {
        loading: false,
        content: `生成失败: ${error instanceof Error ? error.message : String(error)}`,
      })
    } finally {
      setLoading(false)
    }
  }
  
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    
    // 处理 Backspace/Delete 删除徽章
    // 优先级: 如果存在 marker badges，优先删除 marker badges 的最后一个
    if ((e.key === 'Backspace' || e.key === 'Delete') && isInputFocused) {
      const textarea = e.currentTarget
      const isAtStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0
      const isEmpty = textarea.value === ''
      
      if (isAtStart || isEmpty) {
        // 优先删除 marker badges
        if (markerBadges.length > 0) {
          const lastMarker = markerBadges[markerBadges.length - 1].marker
          removeMarker(lastMarker.id)
        } else if (lockedItems.length > 0) {
          // 其次删除 lockedItems
          setLockedItems(prev => prev.slice(0, -1))
        }
      }
    }
  }
  
  const handleInputFocus = () => {
    setIsInputFocused(true)
    // 如果已经有 lockedItems，不要覆盖（用户可能已经手动删除了一些）
    if (lockedItems.length === 0) {
      setLockedItems([...selectedItems])
    }
  }
  
  const handleInputBlur = () => {
    setIsInputFocused(false)
    // 不再清空 lockedItems，让锁定的 badge 持续存在
    // 只能由用户通过 Backspace/Delete 键逐个删除
  }
  
 // Resize handle mouse down handler
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    
    // 拖拽时禁用外层容器的 CSS transition，避免"不跟手"
    const container = document.querySelector('[data-chat-panel-container]') as HTMLElement | null
    if (container) {
      container.style.transition = 'none'
    }
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const newWidth = window.innerWidth - e.clientX
      setChatPanelWidth(newWidth)
    }
    
    const handleMouseUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      
      // 拖拽结束后恢复 transition（让打开/关闭动画正常工作）
      if (container) {
        container.style.transition = ''
      }
      
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [setChatPanelWidth])
  
  return (
    <div className="relative flex flex-col h-full bg-white">
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-blue-500/40 transition-colors"
        onMouseDown={handleResizeMouseDown}
      />
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">New chat</h1>
        <div className="flex items-center gap-1">
          <CustomTooltip content="New chat" side="bottom">
            <button 
              onClick={handleNewChat}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <SquarePen className="w-4 h-4 text-gray-500" />
            </button>
          </CustomTooltip>
          <CustomTooltip content="Close panel" side="bottom">
            <button 
              onClick={closeChat}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <PanelRightClose className="w-4 h-4 text-gray-500" />
            </button>
          </CustomTooltip>
        </div>
      </div>
      
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {hasMessages ? (
          <MessageHistory />
        ) : (
          <EmptyState />
        )}
      </div>
      
      {/* Input Area */}
      <div className="p-3 shrink-0">
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {/* Upper part - Image upload + Badges + Text input */}
          <div className="p-3">
            {/* 徽章 + textarea 容器 - 标签输入框效果 */}
            <div className="flex flex-wrap items-center gap-1.5">
                {/* Selection badges */}
                {displayBadges.map(item => (
                  <SelectionBadge
                    key={item.id}
                    item={item}
                    isActive={badgesActive}
                    onRemove={() => {
                      setLockedItems(prev => prev.filter(li => li.id !== item.id))
                    }}
                  />
                ))}
                {/* Marker badges */}
                {markerBadges.map(({ marker, item }) => (
                  <SelectionBadge
                    key={marker.id}
                    item={item}
                    isActive={true}
                    markerNumber={marker.number}
                    onRemove={() => removeMarker(marker.id)}
                  />
                ))}
                {/* Text input */}
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  placeholder="What are we creating today"
                  rows={1}
                  className="flex-1 min-w-[100px] resize-none outline-none text-sm text-gray-700 placeholder:text-gray-400 leading-[28px]"
                />
            </div>
          </div>
          
          {/* Lower part - Action bar */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
            {/* Left side */}
            <div className="flex items-center gap-2">
              {/* Image Gen button */}
              <button className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 text-blue-600 text-xs font-medium rounded-full hover:bg-blue-50 transition-colors">
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Image Gen</span>
              </button>
              
              {/* Resolution selector */}
              <div className="relative">
                <button 
                  ref={buttonRef}
                  onClick={() => setIsSizePopoverOpen(!isSizePopoverOpen)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full hover:bg-gray-200 transition-colors"
                >
                  <span>{selectedResolution} · {selectedSize === 'auto' ? 'Auto' : selectedSize}</span>
                  {isSizePopoverOpen ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
                
                {/* Size Popover - using fixed positioning to escape overflow:hidden */}
                {isSizePopoverOpen && popoverPosition && (
                  <div 
                    ref={popoverRef}
                    className="fixed bg-white rounded-xl shadow-lg p-4 z-50 w-[280px]"
                    style={{
                      bottom: popoverPosition.bottom,
                      right: popoverPosition.right,
                    }}
                  >
                    {/* Resolution Section */}
                    <div className="mb-4">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Resolution</h3>
                      <div className="flex gap-2">
                        {RESOLUTIONS.map((res) => (
                          <button
                            key={res}
                            onClick={() => setSelectedResolution(res)}
                            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                              selectedResolution === res
                                ? 'bg-gray-900 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {res}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {/* Size Section */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Aspect Ratio</h3>
                      <div className="grid grid-cols-4 gap-2">
                        {SIZES.map((size) => {
                          const isSelected = selectedSize === size
                          return (
                            <button
                              key={size}
                              onClick={() => setSelectedSize(size)}
                              className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${
                                isSelected
                                  ? 'bg-blue-50 border-2 border-blue-500'
                                  : 'border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <RatioIcon size={size} isSelected={isSelected} />
                              <span className={`text-xs mt-1 ${
                                isSelected ? 'text-blue-600 font-medium' : 'text-gray-600'
                              }`}>
                                {size === 'auto' ? 'Auto' : size}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Right side */}
            <div className="flex items-center gap-2">
              {/* Agent button */}
              <CustomTooltip content="Select agent" side="top">
                <button className="flex items-center gap-1 px-2 py-1.5 border border-blue-200 text-blue-600 text-xs font-medium rounded-full hover:bg-blue-50 transition-colors">
                  <Sparkles className="w-3 h-3" />
                  <span>Agent</span>
                </button>
              </CustomTooltip>
              
              {/* Send button */}
              <CustomTooltip content="Send message" side="top">
                <button 
                  onClick={handleSend}
                  disabled={isLoading}
                  className={`flex items-center gap-1 w-9 h-9 text-white rounded-full justify-center transition-colors ${
                    isLoading 
                      ? 'bg-blue-300 cursor-not-allowed' 
                      : 'bg-blue-500 hover:bg-blue-600'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                </button>
              </CustomTooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Ratio icon component - displays a rectangle representing the aspect ratio
function RatioIcon({ size, isSelected }: { size: Size; isSelected: boolean }) {
  // Special handling for 'auto'
  if (size === 'auto') {
    return (
      <div className="flex items-center justify-center w-8 h-8">
        <span className={`text-xs font-medium ${
          isSelected ? 'text-blue-600' : 'text-gray-500'
        }`}>
          Auto
        </span>
      </div>
    )
  }
  
  // Parse ratio to get width and height multipliers
  const [w, h] = size.split(':').map(Number)
  
  // Calculate dimensions with max size of 24px
  const maxSize = 24
  const aspectRatio = w / h
  
  let width: number
  let height: number
  
  if (aspectRatio >= 1) {
    // Wider than tall
    width = maxSize
    height = maxSize / aspectRatio
  } else {
    // Taller than wide
    height = maxSize
    width = maxSize * aspectRatio
  }
  
  return (
    <div className="flex items-center justify-center w-8 h-8">
      <div
        style={{ width: `${width}px`, height: `${height}px` }}
        className={`border-2 rounded-sm ${
          isSelected ? 'border-blue-500' : 'border-gray-400'
        }`}
      />
    </div>
  )
}

// Empty state component
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8">
      <h2 className="text-sm font-medium text-gray-700 mb-4">Try these Lovart Skills</h2>
      <div className="grid grid-cols-2 gap-2 w-full max-w-[320px]">
        {SKILLS.map((skill) => {
          const Icon = skill.icon
          return (
            <button
              key={skill.id}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors text-left"
            >
              <Icon className={`w-4 h-4 ${skill.color}`} />
              <span className="text-xs text-gray-700">{skill.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
