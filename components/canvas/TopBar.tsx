'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useEditor, track } from 'tldraw'
import { Zap, MessageCircle, User } from 'lucide-react'
import { CustomTooltip } from '@/components/ui/tooltip'
import { useAppStore } from '@/lib/store'

// ── Logo 图片组件 ────────────────────────────────────────────────────────────
function LogoIcon({ className }: { className?: string }) {
  return (
    <img 
      src="/logo.jpg" 
      alt="Lovart" 
      className={`rounded-full object-cover ${className || ''}`}
    />
  )
}

// ── 可编辑项目名称组件 ──────────────────────────────────────────────────────
function EditableProjectName() {
  const projectName = useAppStore(s => s.projectName)
  const setProjectName = useAppStore(s => s.setProjectName)
  
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(projectName)
  const inputRef = useRef<HTMLInputElement>(null)
  
  // 当 projectName 改变时同步 editValue
  useEffect(() => {
    if (!isEditing) {
      setEditValue(projectName)
    }
  }, [projectName, isEditing])
  
  const startEdit = useCallback(() => {
    setEditValue(projectName)
    setIsEditing(true)
  }, [projectName])
  
  const saveEdit = useCallback(() => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== projectName) {
      setProjectName(trimmed)
    } else if (!trimmed) {
      // 空值时恢复原名
      setEditValue(projectName)
    }
    setIsEditing(false)
  }, [editValue, projectName, setProjectName])
  
  const cancelEdit = useCallback(() => {
    setEditValue(projectName)
    setIsEditing(false)
  }, [projectName])
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }, [saveEdit, cancelEdit])
  
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])
  
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={saveEdit}
        onKeyDown={handleKeyDown}
        className="bg-transparent text-gray-800 text-sm font-medium outline-none border-b border-gray-400 focus:border-gray-600 px-0.5 min-w-[60px] max-w-[200px]"
        style={{ width: `${Math.max(60, editValue.length * 8)}px` }}
      />
    )
  }
  
  return (
    <span 
      onClick={startEdit}
      onDoubleClick={startEdit}
      className="text-gray-800 text-sm font-medium cursor-pointer hover:text-gray-600 transition-colors select-none"
    >
      {projectName}
    </span>
  )
}

// ── Logo 按钮 + 菜单 ─────────────────────────────────────────────────────────
// 优化：移除 track() 包装，因为菜单不需要响应缩放变化
// editor 只在事件回调中使用，不需要响应式更新
const LogoMenuButton = () => {
  const editor = useEditor()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  
  // 点击外部关闭菜单
  useEffect(() => {
    if (!isOpen) return
    
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])
  
  // 菜单项操作 - 使用 editor 的直接方法
  const menuItems = [
    { label: 'Undo', shortcut: '⌘Z', action: () => editor.undo() },
    { label: 'Redo', shortcut: '⌘⇧Z', action: () => editor.redo() },
    { type: 'separator' as const },
    { label: 'Select All', shortcut: '⌘A', action: () => editor.selectAll() },
    { label: 'Delete', shortcut: '⌫', action: () => editor.deleteShapes(editor.getSelectedShapeIds()) },
    { type: 'separator' as const },
    { label: 'Zoom to Fit', shortcut: '⇧1', action: () => editor.zoomToFit({ animation: { duration: 200 } }) },
    { label: 'Reset Zoom', shortcut: '⇧0', action: () => editor.resetZoom() },
  ]
    
  const handleMenuItemClick = (action: () => void) => {
    action()
    setIsOpen(false)
  }
  
  return (
    <div ref={menuRef} className="relative">
      <CustomTooltip content="Menu" side="bottom">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
        >
          <LogoIcon className="w-6 h-6" />
        </button>
      </CustomTooltip>
      
      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 rounded-lg bg-zinc-900 border border-zinc-700/50 shadow-2xl py-1 z-50">
          {menuItems.map((item, index) => 
            item.type === 'separator' ? (
              <div key={`sep-${index}`} className="border-t border-zinc-700/50 my-1" />
            ) : (
              <button
                key={item.label}
                onClick={() => handleMenuItemClick(item.action!)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <span>{item.label}</span>
                {item.shortcut && (
                  <span className="text-xs text-zinc-500">{item.shortcut}</span>
                )}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ── TopBar 主组件 ────────────────────────────────────────────────────────────
export const TopBar = track(() => {
  const isChatOpen = useAppStore(s => s.isChatOpen)
  const toggleChat = useAppStore(s => s.toggleChat)
  
  return (
    <div className="absolute top-1 left-0 right-0 h-12 z-[300] pointer-events-none">
      <div className="h-full flex items-center justify-between px-3">
        {/* 左侧：Logo + 项目名称 */}
        <div className="flex items-center gap-1 pointer-events-auto bg-white rounded-full pl-[4px] pr-[12px] py-[4px] shadow-sm">
          <LogoMenuButton />
          <EditableProjectName />
        </div>
        
        {/* 右侧：积分 + 头像 + Chat 按钮 */}
        <div className="flex items-center gap-1 pointer-events-auto bg-white rounded-full px-1.5 py-[4px] shadow-sm">
          {/* 积分显示 */}
          <CustomTooltip content="Credits" side="bottom">
            <div className="flex items-center gap-1.5 px-2 py-[6px] rounded-full text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer">
              <Zap className="w-4 h-4 text-yellow-500" />
              <span className="text-sm font-medium">80</span>
            </div>
          </CustomTooltip>
          
          {/* 用户头像 */}
          <CustomTooltip content="Profile" side="bottom">
            <button className="w-7 h-7 flex items-center justify-center rounded-full bg-indigo-500 hover:bg-indigo-600 transition-colors">
              <User className="w-4 h-4 text-white" />
            </button>
          </CustomTooltip>
          
          {/* Chat 按钮 - 聊天面板打开时隐藏 */}
          {!isChatOpen && (
            <CustomTooltip content="Open chat" side="bottom">
              <button 
                onClick={toggleChat}
                className="flex items-center gap-1.5 px-3 py-[2px] text-sm font-medium rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Chat</span>
              </button>
            </CustomTooltip>
          )}
        </div>
      </div>
    </div>
  )
})
