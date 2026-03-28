import { NextResponse } from 'next/server'
import { getAuthToken, verifyJwt } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase-server'

export async function GET() {
  try {
    // 获取 token
    const token = await getAuthToken()
    if (!token) {
      return NextResponse.json(
        { success: false, message: '未登录' },
        { status: 401 }
      )
    }

    // 验证 JWT
    const payload = await verifyJwt(token)
    if (!payload) {
      return NextResponse.json(
        { success: false, message: '登录已过期，请重新登录' },
        { status: 401 }
      )
    }

    // 查询用户信息
    const supabaseAdmin = getSupabaseAdmin()
    const { data: user, error: queryError } = await supabaseAdmin
      .from('users')
      .select('id, phone, nickname, created_at')
      .eq('id', payload.userId)
      .single()

    if (queryError || !user) {
      return NextResponse.json(
        { success: false, message: '用户不存在' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        user,
      },
    })
  } catch (error) {
    console.error('[Auth] Me error:', error)
    return NextResponse.json(
      { success: false, message: '服务器错误，请稍后重试' },
      { status: 500 }
    )
  }
}
