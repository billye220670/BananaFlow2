import { NextRequest, NextResponse } from 'next/server'
import { getAuthToken, verifyJwt } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { fetchSnapshot, deleteProjectStorage } from '@/lib/storage-service'
import type { ProjectDetail, ExtendedSnapshot } from '@/lib/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/projects/[id] - 获取项目详情 + 最新 snapshot
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

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

    const supabaseAdmin = getSupabaseAdmin()

    // 查询项目基本信息（包含 snapshot_url 新字段）
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, name, thumbnail_url, snapshot_url, created_at, updated_at, user_id')
      .eq('id', id)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { success: false, message: '项目不存在' },
        { status: 404 }
      )
    }

    // 验证项目属于当前用户
    if (project.user_id !== payload.userId) {
      return NextResponse.json(
        { success: false, message: '无权访问此项目' },
        { status: 403 }
      )
    }

    // 加载快照数据（支持新旧两种格式）
    let snapshot: ExtendedSnapshot | null = null

    // 情况 A: 新格式 - 从 Storage 加载
    if (project.snapshot_url) {
      console.log('[Projects] Loading snapshot from Storage:', project.snapshot_url)
      try {
        snapshot = await fetchSnapshot(project.snapshot_url)
        console.log('[Projects] Snapshot loaded from Storage successfully')
      } catch (storageError) {
        console.error('[Projects] Failed to load snapshot from Storage:', storageError)
        // Storage 加载失败，尝试降级到 JSONB
        console.log('[Projects] Falling back to JSONB snapshot')
      }
    }

    // 情况 B: 旧格式 - 从 project_snapshots 表加载（向后兼容）
    // 当 snapshot_url 为空，或者 Storage 加载失败时
    if (!snapshot) {
      const { data: snapshotRow, error: snapshotError } = await supabaseAdmin
        .from('project_snapshots')
        .select('snapshot, version')
        .eq('project_id', id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (snapshotError) {
        console.error('[Projects] Snapshot query error:', snapshotError)
      }

      if (snapshotRow?.snapshot) {
        snapshot = snapshotRow.snapshot as ExtendedSnapshot
        console.log('[Projects] Snapshot loaded from JSONB')
      }
    }

    // 情况 C: 无快照 - snapshot 保持为 null

    // 构建响应
    const projectDetail: ProjectDetail & { snapshot_url?: string | null } = {
      id: project.id,
      name: project.name,
      thumbnail_url: project.thumbnail_url,
      snapshot_url: project.snapshot_url,
      created_at: project.created_at,
      updated_at: project.updated_at,
      snapshot,
    }

    return NextResponse.json({
      success: true,
      data: {
        project: projectDetail,
      },
    })
  } catch (error) {
    console.error('[Projects] Get detail error:', error)
    return NextResponse.json(
      { success: false, message: '服务器错误，请稍后重试' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/projects/[id] - 删除项目
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

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

    const supabaseAdmin = getSupabaseAdmin()

    // 查询项目，验证归属
    const { data: project, error: queryError } = await supabaseAdmin
      .from('projects')
      .select('id, user_id')
      .eq('id', id)
      .single()

    if (queryError || !project) {
      return NextResponse.json(
        { success: false, message: '项目不存在' },
        { status: 404 }
      )
    }

    // 验证项目属于当前用户
    if (project.user_id !== payload.userId) {
      return NextResponse.json(
        { success: false, message: '无权删除此项目' },
        { status: 403 }
      )
    }

    // 先清理 Storage 中的文件（快照和资源）
    try {
      await deleteProjectStorage(payload.userId, id)
      console.log('[Projects] Storage files cleaned up for project:', id)
    } catch (storageError) {
      // Storage 清理失败不阻止项目删除，仅记录警告
      console.warn('[Projects] Failed to clean up storage files:', storageError)
    }

    // 删除项目（级联删除 snapshots 由数据库外键处理）
    const { error: deleteError } = await supabaseAdmin
      .from('projects')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('[Projects] Delete error:', deleteError)
      return NextResponse.json(
        { success: false, message: '删除项目失败' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Project deleted',
    })
  } catch (error) {
    console.error('[Projects] Delete error:', error)
    return NextResponse.json(
      { success: false, message: '服务器错误，请稍后重试' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/projects/[id] - 轻量级更新项目名称
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

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

    const { name } = await request.json()
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { success: false, message: '项目名称不能为空' },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdmin()

    const { error } = await supabaseAdmin
      .from('projects')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', payload.userId)

    if (error) {
      console.error('[Projects] Update name error:', error)
      return NextResponse.json(
        { success: false, message: '更新项目名称失败' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Projects] PATCH error:', error)
    return NextResponse.json(
      { success: false, message: '服务器错误，请稍后重试' },
      { status: 500 }
    )
  }
}
