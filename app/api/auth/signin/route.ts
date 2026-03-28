import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { signJwt, setAuthCookie } from '@/lib/auth'

const PHONE_REGEX = /^1[3-9]\d{9}$/

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, password } = body

    // 校验手机号
    if (!phone || typeof phone !== 'string') {
      return NextResponse.json(
        { success: false, message: '请输入手机号' },
        { status: 400 }
      )
    }

    if (!PHONE_REGEX.test(phone)) {
      return NextResponse.json(
        { success: false, message: '手机号格式不正确' },
        { status: 400 }
      )
    }

    // 校验密码
    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { success: false, message: '请输入密码' },
        { status: 400 }
      )
    }

    // 查询用户
    const supabaseAdmin = getSupabaseAdmin()
    const { data: user, error: queryError } = await supabaseAdmin
      .from('users')
      .select('id, phone, nickname, password_hash, created_at')
      .eq('phone', phone)
      .single()

    if (queryError || !user) {
      return NextResponse.json(
        { success: false, message: '手机号未注册' },
        { status: 400 }
      )
    }

    // 检查是否有密码（验证码注册的用户可能没有密码）
    if (!user.password_hash) {
      return NextResponse.json(
        { success: false, message: '该账号未设置密码，请使用验证码登录' },
        { status: 400 }
      )
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password_hash)
    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, message: '密码错误' },
        { status: 400 }
      )
    }

    // 签发 JWT
    const token = await signJwt({ userId: user.id, phone: user.phone })

    // 写入 cookie
    await setAuthCookie(token)

    // 返回用户信息（不含 password_hash）
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userWithoutPassword } = user

    return NextResponse.json({
      success: true,
      message: '登录成功',
      data: {
        user: userWithoutPassword,
      },
    })
  } catch (error) {
    console.error('[Auth] Signin error:', error)
    return NextResponse.json(
      { success: false, message: '服务器错误，请稍后重试' },
      { status: 500 }
    )
  }
}
