import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { verifyCode } from '@/lib/sms'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { signJwt, setAuthCookie } from '@/lib/auth'

const PHONE_REGEX = /^1[3-9]\d{9}$/

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, password, code, nickname } = body

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

    // 校验昵称
    if (!nickname || typeof nickname !== 'string') {
      return NextResponse.json(
        { success: false, message: '请输入昵称' },
        { status: 400 }
      )
    }

    if (nickname.trim().length < 2 || nickname.trim().length > 20) {
      return NextResponse.json(
        { success: false, message: '昵称长度应在2-20个字符之间' },
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

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, message: '密码至少6位' },
        { status: 400 }
      )
    }

    // 校验验证码
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { success: false, message: '请输入验证码' },
        { status: 400 }
      )
    }

    // 验证短信码
    const isCodeValid = await verifyCode(phone, code)
    if (!isCodeValid) {
      return NextResponse.json(
        { success: false, message: '验证码错误或已过期' },
        { status: 400 }
      )
    }

    // 检查手机号是否已注册
    const supabaseAdmin = getSupabaseAdmin()
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('phone', phone)
      .single()

    if (existingUser) {
      return NextResponse.json(
        { success: false, message: '该手机号已注册' },
        { status: 409 }
      )
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 10)

    // 插入用户
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        phone,
        password_hash: passwordHash,
        nickname: nickname.trim(),
      })
      .select('id, phone, nickname, avatar_url, created_at')
      .single()

    if (insertError || !newUser) {
      console.error('[Auth] Signup insert error:', insertError)
      return NextResponse.json(
        { success: false, message: '注册失败，请稍后重试' },
        { status: 500 }
      )
    }

    // 签发 JWT
    const token = await signJwt({ userId: newUser.id, phone: newUser.phone })

    // 写入 cookie
    await setAuthCookie(token)

    return NextResponse.json({
      success: true,
      message: '注册成功',
      data: {
        user: newUser,
      },
    })
  } catch (error) {
    console.error('[Auth] Signup error:', error)
    return NextResponse.json(
      { success: false, message: '服务器错误，请稍后重试' },
      { status: 500 }
    )
  }
}
