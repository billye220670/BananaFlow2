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
import { generateImage } from '@/lib/fal'
import type { CanvasItem } from '@/lib/types'
import { MessageHistory } from './MessageHistory'
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

    // 1. 收集参考图 URL（FAL 客户端可以直接处理 blob URL，无需手动上传）
    const referenceUrls = displayBadges
      .map(item => item.falUrl || item.url)  // 优先用 falUrl，没有则用 url（blob URL 也行）
      .filter((url): url is string => !!url)
    
    console.log('[handleSend] Collected referenceUrls:', referenceUrls.map(u => u.substring(0, 80)))
    
    // 处理 'auto' 情况：默认使用 1:1 比例
    const aspectRatio = selectedSize === 'auto' ? '1:1' : selectedSize
    const resolution = selectedResolution  // 如 '1K'

    // 调试日志：发送参数
    console.log('[handleSend] === 发送参数 ===')
    console.log('[handleSend] prompt (原始):', prompt)
    console.log('[handleSend] finalPrompt (发送给API):', finalPrompt)
    console.log('[handleSend] displayBadges:', displayBadges.map(item => ({
      id: item.id,
      url: item.url?.substring(0, 80),
      falUrl: item.falUrl?.substring(0, 80),
      fileName: item.fileName,
    })))
    console.log('[handleSend] referenceUrls:', referenceUrls)
    console.log('[handleSend] aspectRatio:', aspectRatio)
    console.log('[handleSend] resolution:', resolution)

    // 2. 计算占位图画布显示尺寸
    const basePixels: Record<string, number> = { '1K': 1024, '2K': 2048, '4K': 4096 }
    const base = basePixels[resolution] || 1024
    const [wRatio, hRatio] = aspectRatio.split(':').map(Number)
    const ratio = wRatio / hRatio

    let genW: number, genH: number
    if (ratio >= 1) {
      genW = base
      genH = Math.round(base / ratio)
    } else {
      genH = base
      genW = Math.round(base * ratio)
    }

    // 缩放到画布显示尺寸 (max 480px)
    const maxDisplay = 480
    const scale = Math.min(maxDisplay / genW, maxDisplay / genH, 1)
    const displayW = Math.round(genW * scale)
    const displayH = Math.round(genH * scale)

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
    // 计算放置位置：使用画布视口中心
    // 尝试从 store 获取 editor 来计算视口中心
    const editor = useAppStore.getState().editor
    let cx = 100, cy = 100
    if (editor) {
      const vp = editor.getViewportScreenBounds()
      const pageCenter = editor.screenToPage({ x: vp.midX, y: vp.midY })
      cx = pageCenter.x - displayW / 2
      cy = pageCenter.y - displayH / 2
    }

    addCanvasItem({
      id: itemId,
      url: '',
      falUrl: null,
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
      const resultUrl = await generateImage({
        prompt: finalPrompt,
        referenceUrls,
        aspectRatio,
        resolution,
      })

      // 成功：更新画布项和消息
      updateCanvasItem(itemId, {
        url: resultUrl,
        falUrl: resultUrl,
        placeholder: false,
      })

      updateMessage(msgId, {
        imageUrl: resultUrl,
        loading: false,
        content: '图片已生成',
      })
    } catch (error) {
      // 失败：移除画布占位项，更新消息为错误
      removeCanvasItem(itemId)
      updateMessage(msgId, {
        loading: false,
        content: `生成失败: ${error instanceof Error ? error.message : '未知错误'}`,
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
