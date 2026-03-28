'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

type LoginTab = 'password' | 'sms'

export default function LoginPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<LoginTab>('password')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const phoneRegex = /^1[3-9]\d{9}$/

  const validatePhone = () => {
    if (!phone) {
      toast.error('请输入手机号')
      return false
    }
    if (!phoneRegex.test(phone)) {
      toast.error('请输入正确的手机号格式')
      return false
    }
    return true
  }

  const handleSendCode = async () => {
    if (!validatePhone()) return
    if (countdown > 0) return

    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || '发送验证码失败')
        return
      }

      toast.success('验证码已发送')
      setCountdown(60)
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch {
      toast.error('发送验证码失败，请重试')
    }
  }

  const handlePasswordLogin = async () => {
    if (!validatePhone()) return
    if (!password) {
      toast.error('请输入密码')
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || '登录失败')
        return
      }

      toast.success('登录成功')
      router.push('/')
    } catch {
      toast.error('登录失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSmsLogin = async () => {
    if (!validatePhone()) return
    if (!code) {
      toast.error('请输入验证码')
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/signin-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || '登录失败')
        return
      }

      toast.success('登录成功')
      router.push('/')
    } catch {
      toast.error('登录失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (activeTab === 'password') {
      handlePasswordLogin()
    } else {
      handleSmsLogin()
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-900">Lovart.ai</h1>
          <p className="text-zinc-500 mt-2">AI 创意设计平台</p>
        </div>

        {/* Tab Switch */}
        <div className="flex mb-6 border-b border-zinc-200">
          <button
            type="button"
            onClick={() => setActiveTab('password')}
            className={`flex-1 py-3 text-sm font-medium transition ${
              activeTab === 'password'
                ? 'text-zinc-900 border-b-2 border-zinc-900'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            密码登录
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sms')}
            className={`flex-1 py-3 text-sm font-medium transition ${
              activeTab === 'sms'
                ? 'text-zinc-900 border-b-2 border-zinc-900'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            验证码登录
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Phone Input */}
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="请输入手机号"
            className="w-full px-4 py-3 rounded-lg border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition"
          />

          {activeTab === 'password' ? (
            /* Password Input */
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="w-full px-4 py-3 rounded-lg border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition"
            />
          ) : (
            /* Code Input with Send Button */
            <div className="flex gap-3">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="请输入验证码"
                maxLength={6}
                className="flex-1 px-4 py-3 rounded-lg border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition"
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={countdown > 0}
                className="px-4 py-3 rounded-lg bg-zinc-100 text-zinc-700 text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
              >
                {countdown > 0 ? `${countdown}s 后重试` : '获取验证码'}
              </button>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-zinc-500 mt-6">
          没有账号？{' '}
          <Link href="/register" className="text-zinc-900 font-medium hover:underline">
            立即注册
          </Link>
        </p>
      </div>
    </div>
  )
}
