import { ProjectMeta, ProjectDetail, ExtendedSnapshot, Message } from './types'
import { getSnapshot } from 'tldraw'
import type { Editor } from 'tldraw'
import { useAppStore } from './store'

// 获取项目列表
export async function listProjects(): Promise<ProjectMeta[]> {
  const res = await fetch('/api/projects')
  const data = await res.json()
  if (!data.success) throw new Error(data.message || 'Failed to list projects')
  return data.data.projects
}

// 创建新项目
export async function createProject(name: string = 'Untitled'): Promise<{ projectId: string }> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.message || 'Failed to create project')
  return { projectId: data.data.project.id }
}

// 加载项目详情（含 snapshot）
export async function loadProject(projectId: string): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${projectId}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.message || 'Failed to load project')
  return data.data.project
}

// 保存项目 snapshot
export async function saveProjectSnapshot(
  projectId: string, 
  snapshot: ExtendedSnapshot,
  name?: string
): Promise<void> {
  const body: Record<string, unknown> = { snapshot }
  if (name) body.name = name
  const res = await fetch(`/api/projects/${projectId}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.message || 'Failed to save project')
}

// 删除项目
export async function deleteProject(projectId: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
  const data = await res.json()
  if (!data.success) throw new Error(data.message || 'Failed to delete project')
}

// 轻量级更新项目名称（即时保存，不依赖 snapshot 防抖）
export async function updateProjectName(projectId: string, name: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    console.error('[ProjectService] Failed to update project name')
  }
}

/**
 * 上传图片资源到 Supabase Storage（通过后端 API 代理）
 * 用于在图片创建时即时上传，确保 tldraw 中始终存储 URL
 */
export async function uploadCanvasAsset(file: File | Blob, assetId: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('assetId', assetId)

  const res = await fetch('/api/upload-asset', {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to upload asset: ${error}`)
  }

  const data = await res.json()
  return data.url
}

// 自动保存设置
// editor 是 tldraw Editor 实例
// projectId 是当前项目 ID
// getState 是获取 zustand store 状态的函数
export function setupAutoSave(
  editor: Editor,
  projectId: string,
  getState: () => { chatHistory: Message[]; projectName: string }
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let isSaving = false
  let hasPendingChanges = false
  let savedStatusTimer: ReturnType<typeof setTimeout> | null = null

  const { setSaveStatus } = useAppStore.getState()

  const scheduleSave = (delay: number) => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(runSave, delay)
  }

  const runSave = async () => {
    // [修复] 双重保护：执行 save 前再次检查 isRestoringProject
    const { isRestoringProject } = useAppStore.getState()
    if (isRestoringProject) {
      console.log('[AutoSave] Skipping save during project restore (runSave)')
      return
    }
    
    if (isSaving) {
      hasPendingChanges = true
      return
    }

    // 防御性检查：确保 projectId 与 store 中一致
    const currentId = useAppStore.getState().currentProjectId
    if (!currentId || currentId !== projectId) {
      console.warn('[AutoSave] projectId mismatch, skipping save. closure:', projectId, 'store:', currentId)
      isSaving = false
      return
    }

    isSaving = true
    hasPendingChanges = false
    setSaveStatus('saving')
    
    // 清除之前的 "saved" 状态计时器
    if (savedStatusTimer) {
      clearTimeout(savedStatusTimer)
      savedStatusTimer = null
    }

    try {
      const snapshot = getSnapshot(editor.store)
      const shapes = editor.getCurrentPageShapes()
      const state = getState()
      const extendedSnapshot: ExtendedSnapshot = {
        tldraw: snapshot,
        lovart: {
          chatHistory: state.chatHistory,
          projectName: state.projectName,
        },
      }
      await saveProjectSnapshot(projectId, extendedSnapshot, state.projectName)
      console.log('[AutoSave] Project saved successfully')
      
      setSaveStatus('saved')
      // 3秒后自动变回 idle
      savedStatusTimer = setTimeout(() => {
        setSaveStatus('idle')
      }, 3000)
      
    } catch (err) {
      console.error('[AutoSave] Failed to save project:', err)
      setSaveStatus('error')
    } finally {
      isSaving = false
      if (hasPendingChanges) {
        scheduleSave(500)
      }
    }
  }

  const debouncedSave = () => {
    // [修复] 恢复期间不启动防抖，防止清空画布操作被保存
    const { isRestoringProject } = useAppStore.getState()
    if (isRestoringProject) {
      console.log('[AutoSave] Skipping save during project restore (debouncedSave)')
      return
    }
    
    hasPendingChanges = true
    scheduleSave(1500) // 防抖 1500ms
  }

  // 立即保存（用于 beforeunload）
  const forceSave = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (!isSaving && hasPendingChanges) {
      runSave()
    }
  }

  // beforeunload 处理
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (hasPendingChanges || isSaving) {
      // 尝试立即保存
      forceSave()
      // 显示确认对话框
      e.preventDefault()
      e.returnValue = '有未保存的修改，确定离开吗？'
      return e.returnValue
    }
  }

  // 监听 tldraw store 变化
  const unsubscribe = editor.store.listen(debouncedSave, {
    source: 'user',
    scope: 'document',
  })

  // 添加 beforeunload 监听
  window.addEventListener('beforeunload', handleBeforeUnload)

  // 返回清理函数
  return () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (savedStatusTimer) clearTimeout(savedStatusTimer)
    unsubscribe()
    window.removeEventListener('beforeunload', handleBeforeUnload)
  }
}
