'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { listProjects, createProject, deleteProject } from '@/lib/project-service'
import { ProjectMeta, User } from '@/lib/types'
import { Plus, LogOut, Loader2, Trash2 } from 'lucide-react'
import Image from 'next/image'

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const month = months[date.getMonth()]
  const day = date.getDate()
  const year = date.getFullYear()
  return `Last refined on ${month} ${day}, ${year}`
}

// 预览图缩略图组件 - 根据图片数量渲染不同布局
function PreviewThumbnail({ images, projectName }: { images: string[]; projectName: string }) {
  const count = images.length

  // 0张图：灰色背景 + 首字母占位符
  if (count === 0) {
    return (
      <div className="w-full h-full bg-gray-100 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
        <span className="text-gray-300 text-4xl font-light">
          {projectName.charAt(0).toUpperCase()}
        </span>
      </div>
    )
  }

  // 1张图：单图铺满
  if (count === 1) {
    return (
      <div className="w-full h-full relative transition-transform duration-300 group-hover:scale-110">
        <Image
          src={images[0]}
          alt={projectName}
          fill
          className="object-cover"
        />
      </div>
    )
  }

  // 2张图：左右各50%，中间2px间隙
  if (count === 2) {
    return (
      <div className="w-full h-full flex gap-[2px] transition-transform duration-300 group-hover:scale-110">
        <div className="flex-1 relative overflow-hidden">
          <Image
            src={images[0]}
            alt={`${projectName} preview 1`}
            fill
            className="object-cover"
          />
        </div>
        <div className="flex-1 relative overflow-hidden">
          <Image
            src={images[1]}
            alt={`${projectName} preview 2`}
            fill
            className="object-cover"
          />
        </div>
      </div>
    )
  }

  // 3张图：2x2田字格，第4格灰色
  if (count === 3) {
    return (
      <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-[2px] transition-transform duration-300 group-hover:scale-110">
        <div className="relative overflow-hidden">
          <Image
            src={images[0]}
            alt={`${projectName} preview 1`}
            fill
            className="object-cover"
          />
        </div>
        <div className="relative overflow-hidden">
          <Image
            src={images[1]}
            alt={`${projectName} preview 2`}
            fill
            className="object-cover"
          />
        </div>
        <div className="relative overflow-hidden">
          <Image
            src={images[2]}
            alt={`${projectName} preview 3`}
            fill
            className="object-cover"
          />
        </div>
        <div className="bg-gray-100" />
      </div>
    )
  }

  // 4张及以上：2x2田字格，使用前4张
  return (
    <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-[2px] transition-transform duration-300 group-hover:scale-110">
      {images.slice(0, 4).map((src, index) => (
        <div key={index} className="relative overflow-hidden">
          <Image
            src={src}
            alt={`${projectName} preview ${index + 1}`}
            fill
            className="object-cover"
          />
        </div>
      ))}
    </div>
  )
}

export default function ProjectsPage() {
  const router = useRouter()
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<string>('')

  // 获取项目列表（仅当已登录时调用）
  const loadProjects = async () => {
    if (!isLoggedIn) return
    try {
      const projectList = await listProjects()
      setProjects(projectList)
    } catch (err) {
      console.error('Failed to load projects:', err)
    }
  }

  // 初始加载：检查登录状态并加载项目
  useEffect(() => {
    checkAuthAndLoadProjects()
  }, [])

  // 页面可见时重新加载项目列表（解决 SPA 导航后数据不更新的问题）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isLoggedIn) {
        loadProjects()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // 如果已登录，每次组件渲染时也重新加载（处理 SPA 导航回来的情况）
    if (isLoggedIn) {
      loadProjects()
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isLoggedIn])

  const checkAuthAndLoadProjects = async () => {
    try {
      const res = await fetch('/api/auth/me')
      const data = await res.json()
      
      if (data.success && data.data.user) {
        setIsLoggedIn(true)
        setUser(data.data.user)
        // 加载项目列表
        const projectList = await listProjects()
        setProjects(projectList)
      } else {
        setIsLoggedIn(false)
      }
    } catch {
      setIsLoggedIn(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async () => {
    if (isCreating) return
    setIsCreating(true)
    try {
      const { projectId } = await createProject('Untitled')
      router.push(`/canvas?project=${projectId}`)
    } catch (err) {
      console.error('Failed to create project:', err)
      setIsCreating(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/signout', { method: 'POST' })
    setIsLoggedIn(false)
    setUser(null)
    setProjects([])
  }

  const handleDeleteClick = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation() // 防止触发卡片的 onClick 导航
    if (deletingId) return // 正在删除中，忽略
    setDeleteConfirmId(projectId)
  }

  const handleConfirmDelete = async (projectId: string) => {
    setDeletingId(projectId)
    setDeleteConfirmId(null)
    try {
      await deleteProject(projectId)
      // 从列表中移除（乐观更新）
      setProjects(prev => prev.filter(p => p.id !== projectId))
    } catch (err) {
      console.error('Failed to delete project:', err)
      // 可选：显示错误提示
    } finally {
      setDeletingId(null)
    }
  }

  const handleRename = async (projectId: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) {
      setEditingId(null)
      return // 空名称不保存
    }
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      })
      const data = await res.json()
      if (data.success) {
        setProjects(prev => prev.map(p => p.id === projectId ? { ...p, name: trimmed } : p))
      }
    } catch (err) {
      console.error('Failed to rename:', err)
    }
    setEditingId(null)
  }

  const handleTitleClick = (e: React.MouseEvent, project: ProjectMeta) => {
    e.stopPropagation()
    setEditingId(project.id)
    setEditingName(project.name)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, projectId: string) => {
    if (e.key === 'Enter') {
      handleRename(projectId, editingName)
    } else if (e.key === 'Escape') {
      setEditingId(null)
    }
  }

  const handleCardClick = (projectId: string) => {
    if (deletingId === projectId) return // 删除中的卡片禁止导航
    if (editingId) return // 编辑标题时禁止导航
    router.push(`/canvas?project=${projectId}`)
  }

  // Loading 状态
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    )
  }

  // 未登录 - 欢迎页
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
        {/* Logo */}
        <div className="w-24 h-24 rounded-full overflow-hidden mb-6">
          <Image
            src="/logo.jpg"
            alt="Loveart Logo"
            width={96}
            height={96}
            className="w-full h-full object-cover"
          />
        </div>
        
        {/* 产品名称 */}
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Loveart</h1>
        
        {/* 简介 */}
        <p className="text-gray-500 text-lg mb-8 text-center">
          AI-powered creative canvas for designers
        </p>
        
        {/* 按钮组 */}
        <div className="flex gap-4">
          <button
            onClick={() => router.push('/login')}
            className="px-8 py-3 bg-violet-500 text-white font-medium rounded-lg hover:bg-violet-600 transition-colors"
          >
            登录
          </button>
          <button
            onClick={() => router.push('/register')}
            className="px-8 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            注册
          </button>
        </div>
      </div>
    )
  }

  // 已登录 - 项目列表
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white">
      {/* 顶栏 */}
      <header className="h-16 flex items-center justify-between px-6 bg-white">
        {/* 左侧：Logo + 产品名 */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full overflow-hidden">
            <Image
              src="/logo.jpg"
              alt="Loveart"
              width={36}
              height={36}
              className="w-full h-full object-cover"
            />
          </div>
          <span className="text-xl font-semibold text-gray-900">Loveart</span>
        </div>
        
        {/* 右侧：用户信息 + 退出 */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {user?.avatar_url ? (
              <Image
                src={user.avatar_url}
                alt="Avatar"
                width={32}
                height={32}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center text-white text-sm font-medium">
                {user?.nickname?.charAt(0) || user?.phone?.slice(-2) || 'U'}
              </div>
            )}
            <span className="text-gray-700 text-sm">
              {user?.nickname || user?.phone || '用户'}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            退出
          </button>
        </div>
      </header>

      {/* 主体区域 */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-[1800px] mx-auto px-8 py-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Projects</h2>
        
        {/* 项目网格 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {/* 新建项目卡片 */}
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="relative bg-white rounded-xl p-4 cursor-pointer hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
          >
            {/* 灰色背景区域 - 填满卡片内部 */}
            <div className="w-full h-full rounded-lg bg-gray-100" />
            {/* 图标和文字居中覆盖整个卡片 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              {isCreating ? (
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
              ) : (
                <Plus className="w-8 h-8 text-gray-700" />
              )}
              <span className="font-semibold text-gray-700 text-lg">
                {isCreating ? '创建中...' : 'New Project'}
              </span>
            </div>
          </button>

          {/* 项目卡片列表 */}
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => handleCardClick(project.id)}
              className="group relative bg-white rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden cursor-pointer hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-shadow p-4"
            >
              {/* 缩略图区域 */}
              <div className="aspect-[16/10] rounded-xl overflow-hidden relative">
                {/* 删除按钮 - 位于缩略图区域右上角 */}
                <button
                  onClick={(e) => handleDeleteClick(e, project.id)}
                  disabled={deletingId === project.id}
                  className="absolute top-2 right-2 z-10 w-8 h-8 rounded-lg bg-gray-800/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-gray-900/80 transition-all disabled:opacity-100 disabled:cursor-not-allowed"
                >
                  {deletingId === project.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
                <PreviewThumbnail 
                  images={project.preview_images || []} 
                  projectName={project.name} 
                />
              </div>
              
              {/* 项目信息（卡片内部） */}
              <div className="px-3 py-3">
                {editingId === project.id ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => handleRename(project.id, editingName)}
                    onKeyDown={(e) => handleEditKeyDown(e, project.id)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    className="w-full text-gray-700 font-medium text-lg bg-white border border-gray-300 rounded outline-none px-1.5 py-0.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                ) : (
                  <h3
                    onClick={(e) => handleTitleClick(e, project)}
                    className="text-gray-700 font-medium text-lg truncate cursor-pointer"
                  >
                    {project.name}
                  </h3>
                )}
                <p className="text-gray-400 text-xs mt-1">
                  {formatDate(project.updated_at)}
                </p>
              </div>
            </div>
          ))}
        </div>

          {/* 空状态提示 */}
          {projects.length === 0 && (
            <p className="text-gray-400 text-center mt-8">
              还没有项目，点击上方按钮创建你的第一个项目
            </p>
          )}
        </div>
      </main>
      {/* 删除确认弹窗 */}
      {deleteConfirmId && (
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div 
            className="bg-white rounded-2xl p-6 max-w-md mx-4 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-gray-900 text-lg py-4 mb-6">
              Delete this project? This action can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                className="px-5 py-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleConfirmDelete(deleteConfirmId)}
                disabled={!!deletingId}
                className="px-5 py-2 rounded-full bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deletingId === deleteConfirmId ? 'Deleting...' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
