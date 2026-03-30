import { NextRequest, NextResponse } from 'next/server'
import { getAuthToken, verifyJwt } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase-server'

// 文件大小限制：10MB
const MAX_SIZE = 10 * 1024 * 1024

// 支持的 MIME 类型映射
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
}

// Storage bucket 名称
const ASSETS_BUCKET = 'canvas-assets'

/**
 * 清理 assetId 中的特殊字符，使其适合作为文件路径
 * 例如：asset:abc123 -> asset_abc123
 */
function sanitizeAssetId(assetId: string): string {
  return assetId.replace(/:/g, '_')
}

export async function POST(request: NextRequest) {
  try {
    // 1. 身份验证
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

    const userId = payload.userId

    // 2. 解析 FormData
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const assetId = formData.get('assetId') as string | null

    if (!file) {
      return NextResponse.json(
        { success: false, message: '请选择图片文件' },
        { status: 400 }
      )
    }

    if (!assetId) {
      return NextResponse.json(
        { success: false, message: '缺少 assetId 参数' },
        { status: 400 }
      )
    }

    // 3. 验证 MIME type（仅允许 image/*）
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, message: '仅支持图片文件' },
        { status: 400 }
      )
    }

    // 4. 验证文件大小
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, message: '图片大小不能超过 10MB' },
        { status: 400 }
      )
    }

    // 5. 获取文件扩展名
    const ext = MIME_TO_EXT[file.type] || 'png'

    // 6. 读取文件内容
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // 7. 构建存储路径（处理 assetId 中的特殊字符）
    const sanitizedAssetId = sanitizeAssetId(assetId)
    const filePath = `${userId}/${sanitizedAssetId}.${ext}`

    console.log('[UploadAsset] Uploading:', { 
      userId, 
      assetId, 
      sanitizedAssetId,
      filePath, 
      mimeType: file.type, 
      size: file.size 
    })

    // 8. 上传到 Supabase Storage
    const supabaseAdmin = getSupabaseAdmin()
    const { error: uploadError } = await supabaseAdmin.storage
      .from(ASSETS_BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true, // 允许覆盖同名文件
      })

    if (uploadError) {
      console.error('[UploadAsset] Upload error:', uploadError)
      return NextResponse.json(
        { success: false, message: `上传失败: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // 9. 获取公开 URL
    const { data: urlData } = supabaseAdmin.storage
      .from(ASSETS_BUCKET)
      .getPublicUrl(filePath)

    console.log('[UploadAsset] Success:', { filePath, url: urlData.publicUrl })

    // 10. 返回响应
    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
    })

  } catch (error) {
    console.error('[UploadAsset] Error:', error)
    return NextResponse.json(
      { success: false, message: '服务器错误' },
      { status: 500 }
    )
  }
}
