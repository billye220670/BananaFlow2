'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { loadSnapshot, getSnapshot } from 'tldraw'
import { CanvasArea } from '@/components/canvas/CanvasArea'
import { LOADABLE_IMAGE_TYPE } from '@/components/canvas/LoadableImageShape'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { useAppStore } from '@/lib/store'
import type { Editor, TLShapeId } from 'tldraw'
import { loadProject, createProject, setupAutoSave, saveProjectSnapshot, updateProjectName, uploadCanvasAsset } from '@/lib/project-service'

/**
 * 异步迁移 fal.media URL 到 Supabase Storage
 * 后台执行，不阻塞项目恢复流程
 */
async function migrateFalMediaUrl(
  editor: Editor,
  shapeId: TLShapeId,
  itemId: string,
  falUrl: string,
  projectId: string
): Promise<void> {
  try {
    console.log('[Migration] Starting fal.media URL migration:', falUrl)
    
    // 下载 fal.media 图片
    const response = await fetch(falUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch fal.media image: ${response.status}`)
    }
    const blob = await response.blob()
    
    // 提取扩展名
    const ext = falUrl.split('.').pop()?.split('?')[0] || 'png'
    const file = new File([blob], `migrated.${ext}`, { type: blob.type })
    
    // 上传到 Supabase Storage
    const assetId = `${projectId}/${itemId}`
    const storageUrl = await uploadCanvasAsset(file, assetId)
    
    console.log('[Migration] Uploaded to Supabase:', storageUrl)
    
    // 检查 shape 是否仍然存在（用户可能已删除）
    const shape = editor.getShape(shapeId)
    if (!shape) {
      console.warn('[Migration] Shape no longer exists:', shapeId)
      return
    }
    
    // 更新 shape 的 props.url
    editor.updateShape({
      id: shapeId,
      type: 'loadable-image',
      props: { url: storageUrl },
    })
    
    // 更新 canvasItem 的 url
    useAppStore.getState().updateCanvasItem(itemId, { url: storageUrl })
    
    console.log('[Migration] Successfully migrated fal.media URL for shape:', shapeId)
  } catch (err) {
    console.error('[Migration] Failed to migrate fal.media URL:', falUrl, err)
  }
}

// 内部组件，处理 searchParams 和项目加载逻辑
function CanvasPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const projectId = searchParams.get('project')
  
  const editor = useAppStore(s => s.editor)
  const currentProjectId = useAppStore(s => s.currentProjectId)
  const isChatOpen = useAppStore(s => s.isChatOpen)
  const chatPanelWidth = useAppStore(s => s.chatPanelWidth)
  const projectName = useAppStore(s => s.projectName)
  
  // 用于跳过初始渲染的 ref
  const isInitialMount = useRef(true)
  
  // [修复] 防止 initProject 重复执行
  const initializingRef = useRef(false)
  const lastProjectIdRef = useRef<string | null>(null)
  
  // [修复] 跟踪最新的 editor 实例，解决闭包捕获旧 editor 的问题
  const editorRef = useRef<Editor | null>(null)
  const lastEditorRef = useRef<Editor | null>(null)
  
  // 始终保持 editorRef 指向最新的 editor（每次渲染时更新）
  editorRef.current = editor

  // 项目加载
  useEffect(() => {
    if (!editor || !projectId) return
    
    // 当 editor 实例变化时，允许重新初始化（即使 projectId 相同）
    if (lastEditorRef.current !== editor) {
      lastProjectIdRef.current = null  // 重置，允许 re-init
      lastEditorRef.current = editor
    }
    
    const initProject = async () => {
      // 防止重复初始化
      if (initializingRef.current) return
      if (lastProjectIdRef.current === projectId) return
      initializingRef.current = true
      lastProjectIdRef.current = projectId

      try {
        const { setCurrentProjectId, setIsRestoringProject, addCanvasItem, setChatHistory, setProjectName, clearMarkers } = useAppStore.getState()
        
        setIsRestoringProject(true)
        
        let actualPid = projectId
        
        if (projectId === 'new') {
          // 创建新项目
          const { projectId: newId } = await createProject('Untitled')
          actualPid = newId
          setCurrentProjectId(actualPid)
          router.replace(`/canvas?project=${actualPid}`)
          setIsRestoringProject(false)
          initializingRef.current = false
          return
        }
        
        // [修复] 先加载项目，验证存在后才设置 currentProjectId
        // 这避免了自动保存在无效 projectId 下启动
        let project
        try {
          project = await loadProject(actualPid)
        } catch (loadError) {
          // 项目不存在或加载失败 - 自动创建新项目恢复
          console.warn('[Project] Project not found or load failed, creating new project:', actualPid, loadError)
          try {
            const { projectId: newId } = await createProject('Untitled')
            setCurrentProjectId(newId)
            router.replace(`/canvas?project=${newId}`)
          } catch (createError) {
            console.error('[Project] Failed to create recovery project:', createError)
            router.replace('/projects')
          }
          return
        }
        
        if (!project) {
          console.error('[Project] Project data is empty:', actualPid)
          router.replace('/projects')
          return
        }
        
        // 项目验证通过，现在可以安全地设置 currentProjectId
        setCurrentProjectId(actualPid)
        
        // [修复] 重新获取最新的 editor（可能在 await 期间已变更）
        const currentEditor = editorRef.current
        if (!currentEditor) {
          console.warn('[Project] Editor became null during async init')
          return  // finally 块会清理 flags
        }
        
        // 清理旧的 canvasItems 和 markers
        const existingItems = useAppStore.getState().canvasItems
        existingItems.forEach(item => useAppStore.getState().removeCanvasItem(item.id))
        clearMarkers()
        
        // tldraw 原生恢复：loadSnapshot 替换所有内容
        if (project.snapshot?.tldraw) {
          loadSnapshot(currentEditor.store, project.snapshot.tldraw)
        }
        // 从 tldraw shapes 派生 canvasItems（单向读取，tldraw 是唯一数据源）
        const allShapes = currentEditor.getCurrentPageShapes()
        
        // === 处理新项目（loadable-image shapes） ===
        const loadableShapes = allShapes.filter(s => s.type === LOADABLE_IMAGE_TYPE)
        loadableShapes.forEach((shape, index) => {
          const props = shape.props as { w?: number; h?: number; url?: string; status?: string }
          const itemId = shape.id.replace('shape:', '')
          const src = props.url || ''
          const isLoading = props.status === 'loading'
          
          addCanvasItem({
            id: itemId,
            url: src,
            name: (shape.meta as { name?: string })?.name || `Image_${index + 1}`,
            width: props.w || 512,
            height: props.h || 512,
            x: shape.x,
            y: shape.y,
            uploading: isLoading,
            placeholder: isLoading,
            loading: isLoading,
          })
          
          // 异步迁移 fal.media URL 到 Supabase
          if (src.includes('fal.media')) {
            migrateFalMediaUrl(currentEditor, shape.id, itemId, src, actualPid)
          }
        })
        
        // === 处理旧项目（image shapes → 迁移为 loadable-image） ===
        const imageShapes = allShapes.filter((s): s is typeof s & { type: 'image' } => s.type === 'image')
        if (imageShapes.length > 0) {
          imageShapes.forEach((shape, index) => {
            const imgProps = shape.props as { w?: number; h?: number; assetId?: string }
            const itemId = shape.id.replace('shape:', '')
            const assetId = imgProps.assetId
            const asset = assetId ? currentEditor.getAsset(assetId as Parameters<typeof currentEditor.getAsset>[0]) : null
            const src = (asset?.props as { src?: string })?.src || ''
            
            // 删除旧 image shape
            currentEditor.deleteShape(shape.id)
            
            // 创建新 loadable-image shape（同位置同尺寸）
            currentEditor.createShape({
              id: shape.id,  // 保持相同 ID
              type: LOADABLE_IMAGE_TYPE,
              x: shape.x,
              y: shape.y,
              props: {
                w: imgProps.w || 512,
                h: imgProps.h || 512,
                status: 'ready',  // 旧项目的图片 URL 已在 asset 中，直接设为 ready
                url: src,
              },
            })
            
            // 创建 canvasItem
            addCanvasItem({
              id: itemId,
              url: src,
              name: (shape.meta as { name?: string })?.name || `Image_${index + 1}`,
              width: imgProps.w || 512,
              height: imgProps.h || 512,
              x: shape.x,
              y: shape.y,
              uploading: false,
              placeholder: false,
              loading: false,
            })
            
            // 异步迁移 fal.media URL 到 Supabase
            if (src.includes('fal.media')) {
              migrateFalMediaUrl(currentEditor, shape.id, itemId, src, actualPid)
            }
          })
        }
        
        // 恢复 lovart 自定义数据
        if (project.snapshot?.lovart) {
          if (project.snapshot.lovart.chatHistory) {
            setChatHistory(project.snapshot.lovart.chatHistory)
          }
        }
        // 优先使用 API 返回的项目名称（来自 DB.name），其次是 snapshot 中的名称
        setProjectName(project.name || project.snapshot?.lovart?.projectName || 'Untitled')
        
      } catch (err) {
        console.error('[Project] Failed to init project:', err)
      } finally {
        useAppStore.getState().setIsRestoringProject(false)
        initializingRef.current = false

      }
    }

    initProject()
  }, [projectId, editor, router])

  // 自动保存 - 在 editor 和 projectId 都就绪后启动
  useEffect(() => {
    if (!editor || !currentProjectId) return
    
    const cleanup = setupAutoSave(
      editor, 
      currentProjectId, 
      () => useAppStore.getState()
    )
    
    return cleanup
  }, [editor, currentProjectId])

  // 监听 projectName 变化触发自动保存
  useEffect(() => {
    // 跳过初始渲染
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    
    if (!editor || !currentProjectId) return
    
    // 即时保存名称到数据库（不等防抖，轻量级更新）
    updateProjectName(currentProjectId, projectName)
    
    // 同时防抖保存完整 snapshot
    const timer = setTimeout(async () => {
      try {
        const snapshot = getSnapshot(editor.store)
        const state = useAppStore.getState()
        const extendedSnapshot = {
          tldraw: snapshot,
          lovart: {
            chatHistory: state.chatHistory,
            projectName: state.projectName,
          },
        }
        await saveProjectSnapshot(currentProjectId, extendedSnapshot, state.projectName)
        console.log('[AutoSave] Project name saved:', state.projectName)
      } catch (err) {
        console.error('[AutoSave] Failed to save after name change:', err)
      }
    }, 1500)
    
    return () => clearTimeout(timer)
  }, [projectName, editor, currentProjectId])

  return (
    <div className="h-screen w-screen overflow-hidden flex">
      {/* Canvas area - flex-1 allows it to shrink/grow, min-w-0 ensures it can shrink below content size */}
      <div className="flex-1 min-w-0 transition-all duration-300 ease-in-out">
        <CanvasArea />
      </div>
      
      {/* Chat panel - slides in from right */}
      <div 
        data-chat-panel-container
        className={`h-full bg-white transition-all duration-300 ease-in-out overflow-hidden`}
        style={{ width: isChatOpen ? chatPanelWidth : 0 }}
      >
        <div style={{ width: chatPanelWidth }} className="h-full">
          <ChatPanel />
        </div>
      </div>
    </div>
  )
}

// 主页面组件 - 使用 Suspense 包裹（Next.js App Router 中 useSearchParams 需要）
export default function CanvasPage() {
  return (
    <Suspense fallback={
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
        <div className="text-zinc-400">Loading...</div>
      </div>
    }>
      <CanvasPageContent />
    </Suspense>
  )
}
