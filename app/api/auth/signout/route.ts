import { NextResponse } from 'next/server'
import { clearAuthCookie } from '@/lib/auth'

export async function POST() {
  try {
    await clearAuthCookie()

    return NextResponse.json({
      success: true,
      message: '退出成功',
    })
  } catch (error) {
    console.error('[Auth] Signout error:', error)
    return NextResponse.json(
      { success: false, message: '服务器错误，请稍后重试' },
      { status: 500 }
    )
  }
}
