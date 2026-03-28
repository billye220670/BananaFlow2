import { NextRequest, NextResponse } from 'next/server'
import { sendVerificationCode } from '@/lib/sms'

const PHONE_REGEX = /^1[3-9]\d{9}$/

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone } = body

    // 校验手机号格式
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

    // 发送验证码
    const result = await sendVerificationCode(phone)

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    })
  } catch (error) {
    console.error('[Auth] Send code error:', error)
    return NextResponse.json(
      { success: false, message: '服务器错误，请稍后重试' },
      { status: 500 }
    )
  }
}
