/**
 * Supabase Storage Service
 * 
 * 用于管理 canvas 相关的存储操作，包括图片资源和快照文件。
 * 
 * ## 需要在 Supabase Dashboard 创建以下 Storage Buckets:
 * 
 * 1. `canvas-assets` - 存储用户上传的图片资源
 *    - Public bucket: 是（允许公开访问图片 URL）
 *    - File size limit: 10MB
 *    - Allowed MIME types: image/*
 * 
 * 2. `canvas-snapshots` - 存储项目快照 JSON 文件
 *    - Public bucket: 否（通过 service role key 访问）
 *    - File size limit: 50MB
 *    - Allowed MIME types: application/json
 */

import { getSupabaseAdmin } from './supabase-server'

// Bucket 名称常量
const ASSETS_BUCKET = 'canvas-assets'
const SNAPSHOTS_BUCKET = 'canvas-snapshots'

/**
 * 从 MIME type 获取文件扩展名
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
  }
  return mimeToExt[mimeType] || 'png'
}

/**
 * 解析 data URL，提取 MIME type 和 base64 数据
 * @param dataUrl 完整的 data URL（如 "data:image/png;base64,..."）
 * @returns { mimeType, base64Data } 或 null（如果格式无效）
 */
function parseDataUrl(dataUrl: string): { mimeType: string; base64Data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    return null
  }
  return {
    mimeType: match[1],
    base64Data: match[2],
  }
}

/**
 * 将 base64 图片上传到 Supabase Storage
 * @param userId 用户 ID
 * @param assetId tldraw asset ID
 * @param base64Data 完整的 data URL（如 "data:image/png;base64,..."）
 * @returns 图片的公开访问 URL
 */
export async function uploadAsset(
  userId: string,
  assetId: string,
  base64Data: string
): Promise<string> {
  console.log('[Storage] uploadAsset start:', { userId, assetId, dataLength: base64Data.length })

  // 解析 data URL
  const parsed = parseDataUrl(base64Data)
  if (!parsed) {
    console.error('[Storage] Invalid data URL format')
    throw new Error('Invalid data URL format. Expected format: data:{mimeType};base64,{data}')
  }

  const { mimeType, base64Data: rawBase64 } = parsed
  const ext = getExtensionFromMimeType(mimeType)
  
  // 将 base64 转换为 Buffer
  const buffer = Buffer.from(rawBase64, 'base64')
  
  // 构建存储路径
  const filePath = `${userId}/${assetId}.${ext}`
  
  console.log('[Storage] Uploading asset:', { filePath, mimeType, size: buffer.length })

  const supabaseAdmin = getSupabaseAdmin()

  // 上传到 Storage
  const { error: uploadError } = await supabaseAdmin.storage
    .from(ASSETS_BUCKET)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: true, // 允许覆盖同名文件
    })

  if (uploadError) {
    console.error('[Storage] uploadAsset error:', uploadError)
    throw new Error(`Failed to upload asset: ${uploadError.message}`)
  }

  // 获取公开 URL
  const { data: urlData } = supabaseAdmin.storage
    .from(ASSETS_BUCKET)
    .getPublicUrl(filePath)

  console.log('[Storage] uploadAsset success:', { filePath, publicUrl: urlData.publicUrl })

  return urlData.publicUrl
}

/**
 * 将快照 JSON 上传到 Supabase Storage
 * @param userId 用户 ID
 * @param projectId 项目 ID
 * @param snapshot ExtendedSnapshot 对象
 * @returns 快照文件的存储路径（格式：{userId}/{projectId}.json）
 */
export async function uploadSnapshot(
  userId: string,
  projectId: string,
  snapshot: object
): Promise<string> {
  console.log('[Storage] uploadSnapshot start:', { userId, projectId })

  // 将 snapshot 对象转换为 JSON 字符串，再转为 Buffer
  const jsonString = JSON.stringify(snapshot)
  const buffer = Buffer.from(jsonString, 'utf-8')

  // 构建存储路径
  const filePath = `${userId}/${projectId}.json`

  console.log('[Storage] Uploading snapshot:', { filePath, size: buffer.length })

  const supabaseAdmin = getSupabaseAdmin()

  // 上传到 Storage
  const { error: uploadError } = await supabaseAdmin.storage
    .from(SNAPSHOTS_BUCKET)
    .upload(filePath, buffer, {
      contentType: 'application/json',
      upsert: true, // 允许覆盖同名文件
    })

  if (uploadError) {
    console.error('[Storage] uploadSnapshot error:', uploadError)
    throw new Error(`Failed to upload snapshot: ${uploadError.message}`)
  }

  console.log('[Storage] uploadSnapshot success:', { filePath })

  // 返回存储路径（不是完整 URL）
  return filePath
}

/**
 * 从 Supabase Storage 下载快照 JSON
 * @param snapshotPath Storage 中的文件路径（格式：{userId}/{projectId}.json）
 * @returns 解析后的 ExtendedSnapshot 对象
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchSnapshot(snapshotPath: string): Promise<any> {
  console.log('[Storage] fetchSnapshot start:', { snapshotPath })

  const supabaseAdmin = getSupabaseAdmin()

  // 下载文件
  const { data, error: downloadError } = await supabaseAdmin.storage
    .from(SNAPSHOTS_BUCKET)
    .download(snapshotPath)

  if (downloadError) {
    console.error('[Storage] fetchSnapshot error:', downloadError)
    throw new Error(`Failed to fetch snapshot: ${downloadError.message}`)
  }

  if (!data) {
    console.error('[Storage] fetchSnapshot: No data returned')
    throw new Error('Snapshot file not found')
  }

  // 将 Blob 转换为文本，再解析为 JSON
  const text = await data.text()
  const snapshot = JSON.parse(text)

  console.log('[Storage] fetchSnapshot success:', { 
    snapshotPath, 
    snapshotKeys: Object.keys(snapshot) 
  })

  return snapshot
}

/**
 * 从 snapshot 中提取所有 asset ID（sanitized 格式）
 * 遍历 snapshot.tldraw.document.store，收集所有以 "asset:" 开头的 key
 * 返回 sanitized 后的 ID 列表（将 ":" 替换为 "_"）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAssetIdsFromSnapshot(snapshot: any): string[] {
  const store = snapshot?.tldraw?.document?.store
  if (!store || typeof store !== 'object') {
    return []
  }

  const assetIds: string[] = []
  for (const key of Object.keys(store)) {
    if (key.startsWith('asset:')) {
      // 将 ":" 替换为 "_"，与上传时 assetId 的 sanitize 逻辑一致
      const sanitizedId = key.replace(/:/g, '_')
      assetIds.push(sanitizedId)
    }
  }

  return assetIds
}

/**
 * 清理项目关联的所有存储资源
 * @param userId 用户 ID
 * @param projectId 项目 ID
 */
export async function deleteProjectStorage(
  userId: string,
  projectId: string
): Promise<void> {
  console.log('[Storage] deleteProjectStorage start:', { userId, projectId })

  const supabaseAdmin = getSupabaseAdmin()
  const warnings: string[] = []

  // 1. 构建快照路径并尝试下载
  const snapshotPath = `${userId}/${projectId}.json`
  let assetIds: string[] = []

  try {
    const snapshot = await fetchSnapshot(snapshotPath)
    assetIds = extractAssetIdsFromSnapshot(snapshot)
    console.log('[Storage] Extracted asset IDs from snapshot:', { count: assetIds.length })
  } catch (error) {
    console.warn('[Storage] Failed to fetch snapshot for asset extraction:', error)
    warnings.push(`Fetch snapshot: ${error instanceof Error ? error.message : String(error)}`)
    // 优雅降级：继续删除快照文件
  }

  // 2. 删除资产文件
  if (assetIds.length > 0) {
    try {
      await deleteAssets(userId, assetIds)
      console.log('[Storage] Project assets deleted:', { count: assetIds.length })
    } catch (error) {
      console.warn('[Storage] Failed to delete assets:', error)
      warnings.push(`Delete assets: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 3. 删除快照文件
  const { error: snapshotError } = await supabaseAdmin.storage
    .from(SNAPSHOTS_BUCKET)
    .remove([snapshotPath])

  if (snapshotError) {
    console.warn('[Storage] Failed to delete snapshot:', snapshotError)
    warnings.push(`Delete snapshot: ${snapshotError.message}`)
  } else {
    console.log('[Storage] Snapshot deleted:', snapshotPath)
  }

  // 4. 汇总警告信息
  if (warnings.length > 0) {
    console.warn('[Storage] deleteProjectStorage completed with warnings:', warnings)
  } else {
    console.log('[Storage] deleteProjectStorage success:', { userId, projectId })
  }
}

/**
 * 删除指定的资源文件列表
 * @param userId 用户 ID
 * @param assetIds 要删除的 asset ID 列表
 */
export async function deleteAssets(
  userId: string,
  assetIds: string[]
): Promise<void> {
  if (assetIds.length === 0) {
    return
  }

  console.log('[Storage] deleteAssets start:', { userId, count: assetIds.length })

  const supabaseAdmin = getSupabaseAdmin()

  // 首先列出用户目录下的所有文件，找出匹配的文件路径
  const { data: files, error: listError } = await supabaseAdmin.storage
    .from(ASSETS_BUCKET)
    .list(userId, { limit: 1000 })

  if (listError) {
    console.error('[Storage] Failed to list assets for deletion:', listError)
    throw new Error(`Failed to list assets: ${listError.message}`)
  }

  if (!files || files.length === 0) {
    console.log('[Storage] No files found in user directory')
    return
  }

  // 构建要删除的文件路径列表
  // assetId 对应的文件名格式为 {assetId}.{ext}
  const filesToDelete = files
    .filter(file => {
      const fileNameWithoutExt = file.name.replace(/\.[^.]+$/, '')
      return assetIds.includes(fileNameWithoutExt)
    })
    .map(file => `${userId}/${file.name}`)

  if (filesToDelete.length === 0) {
    console.log('[Storage] No matching files found to delete')
    return
  }

  const { error: removeError } = await supabaseAdmin.storage
    .from(ASSETS_BUCKET)
    .remove(filesToDelete)

  if (removeError) {
    console.error('[Storage] deleteAssets error:', removeError)
    throw new Error(`Failed to delete assets: ${removeError.message}`)
  }

  console.log('[Storage] deleteAssets success:', { deleted: filesToDelete.length })
}
