import { NextRequest, NextResponse } from 'next/server'
import { getAuthToken, verifyJwt } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase-server'

export async function PATCH(request: NextRequest) {
  try {
    // 验证登录状态
    const token = await getAuthToken()
    if (!token) {
      return NextResponse.json(
        { success: false, message: '未登录' },
        { status: 401 }
      )
    }

    const payload = await verifyJwt(token)
    if (!payload) {
      return NextResponse.json(
        { success: false, message: '登录已过期' },
        { status: 401 }
      )
    }

    // 解析请求体
    const body = await request.json()
    const { nickname } = body

    // 验证昵称
    if (!nickname || typeof nickname !== 'string') {
      return NextResponse.json(
        { success: false, message: '请输入昵称' },
        { status: 400 }
      )
    }

    const trimmed = nickname.trim()
    if (trimmed.length < 2 || trimmed.length > 20) {
      return NextResponse.json(
        { success: false, message: '昵称长度应在2-20个字符之间' },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdmin()

    // 更新用户昵称
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ nickname: trimmed })
      .eq('id', payload.userId)

    if (updateError) {
      console.error('[Profile] Update error:', updateError)
      return NextResponse.json(
        { success: false, message: '保存失败，请重试' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '保存成功',
      data: {
        nickname: trimmed,
      },
    })
  } catch (error) {
    console.error('[Profile] Error:', error)
    return NextResponse.json(
      { success: false, message: '服务器错误' },
      { status: 500 }
    )
  }
}
