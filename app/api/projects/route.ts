import { NextRequest, NextResponse } from 'next/server'
import { getAuthToken, verifyJwt } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import type { ProjectMeta } from '@/lib/types'

/**
 * GET /api/projects - 获取当前用户的项目列表
 */
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

    // 查询用户的项目列表
    const supabaseAdmin = getSupabaseAdmin()
    const { data: projects, error } = await supabaseAdmin
      .from('projects')
      .select('id, name, thumbnail_url, preview_images, created_at, updated_at')
      .eq('user_id', payload.userId)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[Projects] List error:', error)
      return NextResponse.json(
        { success: false, message: '获取项目列表失败' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        projects: projects as ProjectMeta[],
      },
    })
  } catch (error) {
    console.error('[Projects] List error:', error)
    return NextResponse.json(
      { success: false, message: '服务器错误，请稍后重试' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/projects - 创建新项目
 */
export async function POST(request: NextRequest) {
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

    // 解析请求体
    let body: { name?: string }
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    // 验证并处理 name
    const name = body.name?.trim() || 'Untitled'
    if (name.length > 100) {
      return NextResponse.json(
        { success: false, message: '项目名称不能超过100个字符' },
        { status: 400 }
      )
    }

    // 创建项目
    const supabaseAdmin = getSupabaseAdmin()
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .insert({
        user_id: payload.userId,
        name,
      })
      .select('id, name, thumbnail_url, preview_images, created_at, updated_at')
      .single()

    if (error) {
      console.error('[Projects] Create error:', error)
      return NextResponse.json(
        { success: false, message: '创建项目失败' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        project: project as ProjectMeta,
      },
    })
  } catch (error) {
    console.error('[Projects] Create error:', error)
    return NextResponse.json(
      { success: false, message: '服务器错误，请稍后重试' },
      { status: 500 }
    )
  }
}
