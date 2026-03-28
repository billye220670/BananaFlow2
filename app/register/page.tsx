'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

export default function RegisterPage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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

  const validateForm = () => {
    if (!validatePhone()) return false

    if (!password) {
      toast.error('请输入密码')
      return false
    }
    if (password.length < 6) {
      toast.error('密码至少6位')
      return false
    }
    if (!confirmPassword) {
      toast.error('请确认密码')
      return false
    }
    if (password !== confirmPassword) {
      toast.error('两次输入的密码不一致')
      return false
    }
    if (!code) {
      toast.error('请输入验证码')
      return false
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password, code }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || '注册失败')
        return
      }

      toast.success('注册成功')
      router.push('/')
    } catch {
      toast.error('注册失败，请重试')
    } finally {
      setIsLoading(false)
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

        {/* Title */}
        <h2 className="text-xl font-semibold text-zinc-900 mb-6">注册账号</h2>

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

          {/* Password Input */}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请设置密码，至少6位"
            className="w-full px-4 py-3 rounded-lg border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition"
          />

          {/* Confirm Password Input */}
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="请确认密码"
            className="w-full px-4 py-3 rounded-lg border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition"
          />

          {/* Code Input with Send Button */}
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

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isLoading ? '注册中...' : '注册'}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-zinc-500 mt-6">
          已有账号？{' '}
          <Link href="/login" className="text-zinc-900 font-medium hover:underline">
            立即登录
          </Link>
        </p>
      </div>
    </div>
  )
}
