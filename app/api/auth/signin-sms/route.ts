import { NextRequest, NextResponse } from 'next/server'
import { verifyCode } from '@/lib/sms'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { signJwt, setAuthCookie } from '@/lib/auth'

const PHONE_REGEX = /^1[3-9]\d{9}$/

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, code } = body

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

    // 查询用户
    const supabaseAdmin = getSupabaseAdmin()
    let user = await supabaseAdmin
      .from('users')
      .select('id, phone, nickname, created_at')
      .eq('phone', phone)
      .single()
      .then(({ data }) => data)

    // 如果用户不存在，自动创建
    if (!user) {
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('users')
        .insert({ phone })
        .select('id, phone, nickname, created_at')
        .single()

      if (insertError || !newUser) {
        console.error('[Auth] Auto signup error:', insertError)
        return NextResponse.json(
          { success: false, message: '登录失败，请稍后重试' },
          { status: 500 }
        )
      }

      user = newUser
    }

    // 签发 JWT
    const token = await signJwt({ userId: user.id, phone: user.phone })

    // 写入 cookie
    await setAuthCookie(token)

    return NextResponse.json({
      success: true,
      message: '登录成功',
      data: {
        user,
      },
    })
  } catch (error) {
    console.error('[Auth] Signin SMS error:', error)
    return NextResponse.json(
      { success: false, message: '服务器错误，请稍后重试' },
      { status: 500 }
    )
  }
}
