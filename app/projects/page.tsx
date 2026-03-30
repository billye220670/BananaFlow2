'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { listProjects, createProject } from '@/lib/project-service'
import { ProjectMeta, User } from '@/lib/types'
import { Plus, LogOut, Loader2 } from 'lucide-react'
import Image from 'next/image'

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)
  
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`
  if (diffDay < 30) return `${diffDay} 天前`
  return date.toLocaleDateString()
}

export default function ProjectsPage() {
  const router = useRouter()
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)

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

  // Loading 状态
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    )
  }

  // 未登录 - 欢迎页
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
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
        <h1 className="text-4xl font-bold text-zinc-100 mb-3">Loveart</h1>
        
        {/* 简介 */}
        <p className="text-zinc-400 text-lg mb-8 text-center">
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
            className="px-8 py-3 border border-zinc-700 text-zinc-100 font-medium rounded-lg hover:bg-zinc-900 transition-colors"
          >
            注册
          </button>
        </div>
      </div>
    )
  }

  // 已登录 - 项目列表
  return (
    <div className="min-h-screen bg-zinc-950">
      {/* 顶栏 */}
      <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6">
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
          <span className="text-xl font-semibold text-zinc-100">Loveart</span>
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
            <span className="text-zinc-300 text-sm">
              {user?.nickname || user?.phone || '用户'}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            退出
          </button>
        </div>
      </header>

      {/* 主体区域 */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-semibold text-zinc-100 mb-6">我的项目</h2>
        
        {/* 项目网格 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* 新建项目卡片 */}
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="h-48 border-2 border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center gap-3 text-zinc-400 hover:border-violet-500 hover:text-violet-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? (
              <Loader2 className="w-10 h-10 animate-spin" />
            ) : (
              <Plus className="w-10 h-10" />
            )}
            <span className="font-medium">
              {isCreating ? '创建中...' : '新建项目'}
            </span>
          </button>

          {/* 项目卡片列表 */}
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => router.push(`/canvas?project=${project.id}`)}
              className="h-48 bg-zinc-900 rounded-xl cursor-pointer hover:bg-zinc-800 transition-colors overflow-hidden flex flex-col"
            >
              {/* 缩略图区域 */}
              <div className="flex-1 bg-zinc-800 flex items-center justify-center">
                {project.thumbnail_url ? (
                  <Image
                    src={project.thumbnail_url}
                    alt={project.name}
                    width={200}
                    height={120}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-zinc-600 text-4xl font-light">
                    {project.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              
              {/* 项目信息 */}
              <div className="p-3">
                <h3 className="text-zinc-100 font-medium truncate">
                  {project.name}
                </h3>
                <p className="text-zinc-500 text-sm mt-1">
                  {formatRelativeTime(project.updated_at)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* 空状态提示 */}
        {projects.length === 0 && (
          <p className="text-zinc-500 text-center mt-8">
            还没有项目，点击上方按钮创建你的第一个项目
          </p>
        )}
      </main>
    </div>
  )
}
