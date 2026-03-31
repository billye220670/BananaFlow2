import { NextRequest, NextResponse } from 'next/server'
import { getAuthToken, verifyJwt } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { uploadSnapshot } from '@/lib/storage-service'
import type { ExtendedSnapshot } from '@/lib/types'

type RouteContext = { params: Promise<{ id: string }> }

interface SaveRequestBody {
  snapshot: ExtendedSnapshot
  name?: string
}

/**
 * 提取预览图 URL（按画布面积降序，取前4张）
 */
function extractPreviewImages(snapshot: ExtendedSnapshot): string[] {
  try {
    const store = snapshot?.tldraw?.document?.store
    if (!store) return []

    // 1. 找到所有 image shapes 及其对应的 asset URL
    const imageShapes: { url: string; area: number }[] = []
    
    for (const [, value] of Object.entries(store)) {
      const record = value as { typeName?: string; type?: string; props?: { assetId?: string; w?: number; h?: number } }
      if (record?.typeName === 'shape' && record?.type === 'image') {
        const assetId = record?.props?.assetId
        const w = record?.props?.w ?? 0
        const h = record?.props?.h ?? 0
        const area = w * h
        
        if (assetId) {
          // 查找对应的 asset
          // assetId 可能是 "asset:xxx" 格式或纯 "xxx" 格式
          const assetKey = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`
          const asset = store[assetKey] as { props?: { src?: string } } | undefined
          const src = asset?.props?.src
          
          // 仅保留 http/https URL
          if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
            imageShapes.push({ url: src, area })
          }
        }
      }
    }

    // 2. 按面积降序排序
    imageShapes.sort((a, b) => b.area - a.area)

    // 3. 去重（同一 URL 只保留面积最大的）
    const seen = new Set<string>()
    const unique: string[] = []
    for (const item of imageShapes) {
      if (!seen.has(item.url)) {
        seen.add(item.url)
        unique.push(item.url)
      }
    }

    // 4. 取前4个
    return unique.slice(0, 4)
  } catch (e) {
    console.error('Failed to extract preview images:', e)
    return []
  }
}

/**
 * 防御性检查：正常情况下所有 asset 已是 URL（Task 7 即时上传）
 * 仅作为 fallback：如果发现残留的 base64，仍然上传
 */
async function processAndUploadAssets(
  snapshot: ExtendedSnapshot,
  userId: string
): Promise<ExtendedSnapshot> {
  // 深拷贝 snapshot 以避免修改原对象
  const processedSnapshot: ExtendedSnapshot = JSON.parse(JSON.stringify(snapshot))
  
  // 快速遍历检查
  const store = processedSnapshot.tldraw?.document?.store
  if (!store || typeof store !== 'object') {
    return processedSnapshot
  }

  for (const [key, record] of Object.entries(store)) {
    if (!key.startsWith('asset:')) continue
    
    const asset = record as { type?: string; props?: { src?: string } }
    if (asset.type !== 'image' || !asset.props?.src) continue
    
    const src = asset.props.src
    if (src.startsWith('data:image')) {
      // 防御性处理：不应该出现，但如果有就上传
      console.warn(`[Save] Found unexpected base64 asset: ${key}, uploading as fallback`)
      try {
        const { uploadAsset } = await import('@/lib/storage-service')
        const url = await uploadAsset(userId, key.replace('asset:', ''), src)
        asset.props.src = url
      } catch (err) {
        console.error(`[Save] Fallback upload failed for ${key}:`, err)
        // 保留 base64，不阻断保存
      }
    }
  }
  
  return processedSnapshot
}

/**
 * POST /api/projects/[id]/save - 保存项目 snapshot
 * 
 * 新流程：
 * 1. 提取 snapshot 中的 base64 图片，上传到 Storage
 * 2. 将处理后的 snapshot JSON 上传到 Storage
 * 3. 更新 projects 表的 snapshot_url 字段
 */
export async function POST(
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

    // 解析请求体
    let body: SaveRequestBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, message: '请求格式错误' },
        { status: 400 }
      )
    }

    // 验证 snapshot 必填
    if (!body.snapshot) {
      return NextResponse.json(
        { success: false, message: 'snapshot 不能为空' },
        { status: 400 }
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
        { success: false, message: '无权修改此项目' },
        { status: 403 }
      )
    }

    console.log('[Save] Starting save process for project:', { projectId: id, userId: payload.userId })

    // Step 1: 防御性检查（正常情况下所有 asset 已是 URL）
    const processedSnapshot = await processAndUploadAssets(
      body.snapshot,
      payload.userId
    )

    // Step 2: 上传处理后的 snapshot JSON 到 Storage
    let snapshotPath: string
    try {
      snapshotPath = await uploadSnapshot(payload.userId, id, processedSnapshot)
      console.log('[Save] Snapshot uploaded:', { snapshotPath })
    } catch (error) {
      console.error('[Save] Failed to upload snapshot:', error)
      return NextResponse.json(
        { success: false, message: '保存快照失败' },
        { status: 500 }
      )
    }

    // Step 3: 更新 projects 表
    const updateFields: Record<string, unknown> = {
      snapshot_url: snapshotPath,
      preview_images: extractPreviewImages(processedSnapshot),
      updated_at: new Date().toISOString(),
    }
    
    // 如果提供了 name，同时更新
    if (body.name !== undefined) {
      const trimmedName = body.name.trim()
      if (trimmedName.length > 100) {
        return NextResponse.json(
          { success: false, message: '项目名称不能超过100个字符' },
          { status: 400 }
        )
      }
      updateFields.name = trimmedName || 'Untitled'
    }

    const { error: projectUpdateError } = await supabaseAdmin
      .from('projects')
      .update(updateFields)
      .eq('id', id)

    if (projectUpdateError) {
      console.error('[Save] Project update error:', projectUpdateError)
      return NextResponse.json(
        { success: false, message: '更新项目信息失败' },
        { status: 500 }
      )
    }

    console.log('[Save] Project saved successfully:', { projectId: id, snapshotPath })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Save] Unexpected error:', error)
    return NextResponse.json(
      { success: false, message: '服务器错误，请稍后重试' },
      { status: 500 }
    )
  }
}
