'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Camera, User, Loader2 } from 'lucide-react'
import { useAppStore } from '@/lib/store'

export default function ProfilePage() {
  const router = useRouter()
  const user = useAppStore(s => s.user)
  const setUser = useAppStore(s => s.setUser)
  
  const [nickname, setNickname] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // 加载用户信息
  useEffect(() => {
    if (user) {
      setNickname(user.nickname || '')
      if (user.avatar_url) {
        setAvatarPreview(user.avatar_url)
      }
    } else {
      // 未登录时获取用户信息
      fetch('/api/auth/me')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data?.user) {
            setUser(data.data.user)
            setNickname(data.data.user.nickname || '')
            if (data.data.user.avatar_url) {
              setAvatarPreview(data.data.user.avatar_url)
            }
          } else {
            router.push('/login')
          }
        })
        .catch(() => {
          router.push('/login')
        })
    }
  }, [user, setUser, router])
  
  // 获取头像显示内容
  const getAvatarDisplay = () => {
    if (avatarPreview) {
      return { type: 'image' as const, content: avatarPreview }
    }
    if (nickname) {
      return { type: 'text' as const, content: nickname.charAt(0).toUpperCase() }
    }
    return { type: 'icon' as const, content: null }
  }
  
  // 点击头像上传
  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }
  
  // 处理文件选择
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    
    // 验证文件大小（最大 5MB）
    if (file.size > 5 * 1024 * 1024) {
      toast.error('图片大小不能超过 5MB')
      return
    }
    
    setIsUploading(true)
    
    try {
      const formData = new FormData()
      formData.append('avatar', file)
      
      const res = await fetch('/api/user/avatar', {
        method: 'POST',
        body: formData,
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        toast.error(data.message || '上传失败')
        return
      }
      
      // 更新本地状态
      setAvatarPreview(data.data.avatar_url)
      if (user) {
        setUser({ ...user, avatar_url: data.data.avatar_url })
      }
      
      toast.success('头像上传成功')
    } catch {
      toast.error('上传失败，请重试')
    } finally {
      setIsUploading(false)
      // 清空 input 以便可以再次选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }
  
  // 保存昵称
  const handleSaveNickname = async () => {
    const trimmed = nickname.trim()
    
    if (!trimmed) {
      toast.error('请输入昵称')
      return
    }
    
    if (trimmed.length < 2 || trimmed.length > 20) {
      toast.error('昵称长度应在2-20个字符之间')
      return
    }
    
    setIsLoading(true)
    
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: trimmed }),
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        toast.error(data.message || '保存失败')
        return
      }
      
      // 更新本地状态
      if (user) {
        setUser({ ...user, nickname: trimmed })
      }
      
      toast.success('昵称已更新')
    } catch {
      toast.error('保存失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }
  
  const avatarDisplay = getAvatarDisplay()
  
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">返回</span>
          </button>
          <h1 className="ml-4 text-lg font-semibold text-zinc-900">个人资料</h1>
        </div>
      </div>
      
      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
          {/* 头像上传 */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative">
              <button
                onClick={handleAvatarClick}
                disabled={isUploading}
                className="w-24 h-24 rounded-full bg-indigo-500 flex items-center justify-center overflow-hidden hover:ring-4 hover:ring-indigo-100 transition-all disabled:opacity-70"
              >
                {avatarDisplay.type === 'image' ? (
                  <img
                    src={avatarDisplay.content}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : avatarDisplay.type === 'text' ? (
                  <span className="text-3xl font-bold text-white">{avatarDisplay.content}</span>
                ) : (
                  <User className="w-10 h-10 text-white" />
                )}
                
                {/* 上传遮罩 */}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  {isUploading ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </div>
              </button>
              
              {/* 上传按钮 */}
              <button
                onClick={handleAvatarClick}
                disabled={isUploading}
                className="absolute -bottom-1 -right-1 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-zinc-50 transition-colors disabled:opacity-50"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 text-zinc-600 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 text-zinc-600" />
                )}
              </button>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            
            <p className="mt-3 text-sm text-zinc-500">点击更换头像</p>
            <p className="text-xs text-zinc-400">支持 JPG、PNG 格式，最大 5MB</p>
          </div>
          
          {/* 昵称编辑 */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                昵称
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="请输入昵称"
                maxLength={20}
                className="w-full px-4 py-3 rounded-lg border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
              <p className="mt-1 text-xs text-zinc-500">
                {nickname.length}/20 个字符
              </p>
            </div>
            
            {/* 手机号（只读） */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                手机号
              </label>
              <input
                type="text"
                value={user?.phone || ''}
                disabled
                className="w-full px-4 py-3 rounded-lg border border-zinc-200 bg-zinc-50 text-sm text-zinc-500 cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-zinc-500">手机号不可修改</p>
            </div>
            
            {/* 保存按钮 */}
            <button
              onClick={handleSaveNickname}
              disabled={isLoading || !nickname.trim()}
              className="w-full py-3 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? '保存中...' : '保存修改'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
