'use client'

import { useState, useRef, useEffect } from 'react'
import type { CanvasItem } from '@/lib/types'

interface SelectionBadgeProps {
  item: CanvasItem       // 画布图片项
  isActive: boolean      // false=灰色未激活, true=实色已激活
  onRemove?: () => void  // 激活态时的删除回调
  markerNumber?: number  // 标记序号（1-8），存在时显示蓝色序号圆圈
}

export function SelectionBadge({ item, isActive, onRemove, markerNumber }: SelectionBadgeProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  
  // 获取显示名称：优先使用 fileName，否则使用 id
  const displayName = item.fileName || item.id
  
  // hover 时计算位置
  useEffect(() => {
    if (!isHovered || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    })
  }, [isHovered])
  
  return (
    <div 
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hover 预览图 - 使用 fixed 定位逃逸 overflow:hidden */}
      {isHovered && (
        <div 
          className="fixed z-50"
          style={{ left: position.x, top: position.y, transform: 'translate(-50%, -100%)' }}
        >
          <div className="rounded-lg overflow-hidden shadow-lg border border-zinc-200 bg-white p-1">
            {item.url ? (
              <img
                src={item.url}
                alt={displayName}
                className="w-[200px] h-[200px] object-cover rounded"
              />
            ) : (
              <div className="w-[200px] h-[200px] bg-zinc-200 rounded flex items-center justify-center">
                <span className="text-zinc-400 text-xs">No preview</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 徽章主体 */}
      <div
        className={`
          inline-flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer
          transition-colors duration-150 bg-white
          ${isActive 
            ? 'border border-gray-300 text-gray-700 opacity-100' 
            : 'border border-gray-200 text-gray-500 opacity-50'
          }
        `}
        onClick={isActive ? onRemove : undefined}
      >
        {/* 缩略图 */}
        {item.url ? (
          <img
            src={item.url}
            alt={displayName}
            className={`
              w-5 h-5 rounded object-cover shrink-0
              ${!isActive ? 'grayscale opacity-60' : ''}
            `}
          />
        ) : (
          <div className={`w-5 h-5 rounded bg-zinc-300 shrink-0 ${!isActive ? 'opacity-60' : ''}`} />
        )}
        
        {/* 标记序号圆圈 */}
        {markerNumber !== undefined && (
          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] font-bold shrink-0">
            {markerNumber}
          </span>
        )}
        
        {/* 文件名 */}
        <span 
          className="text-xs truncate max-w-[80px]"
          title={displayName}
        >
          {displayName}
        </span>
      </div>
    </div>
  )
}
