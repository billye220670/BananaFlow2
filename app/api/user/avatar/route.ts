import { NextRequest, NextResponse } from 'next/server'
import { getAuthToken, verifyJwt } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase-server'

// 允许的图片类型
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export async function POST(request: NextRequest) {
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

    // 解析表单数据
    const formData = await request.formData()
    const file = formData.get('avatar') as File

    if (!file) {
      return NextResponse.json(
        { success: false, message: '请选择图片文件' },
        { status: 400 }
      )
    }

    // 验证文件类型
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, message: '仅支持 JPG、PNG、WebP、GIF 格式' },
        { status: 400 }
      )
    }

    // 验证文件大小
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, message: '图片大小不能超过 5MB' },
        { status: 400 }
      )
    }

    // 读取文件内容
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // 生成文件名
    const ext = file.type.split('/')[1] || 'png'
    const fileName = `${payload.userId}_${Date.now()}.${ext}`
    const filePath = `avatars/${fileName}`

    const supabaseAdmin = getSupabaseAdmin()

    // 上传文件到 Supabase Storage
    const { error: uploadError } = await supabaseAdmin
      .storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('[Avatar] Upload error:', uploadError)
      return NextResponse.json(
        { success: false, message: '上传失败，请重试' },
        { status: 500 }
      )
    }

    // 获取公开 URL
    const { data: urlData } = supabaseAdmin
      .storage
      .from('avatars')
      .getPublicUrl(filePath)

    const avatarUrl = urlData.publicUrl

    // 更新用户表的 avatar_url 字段
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ avatar_url: avatarUrl })
      .eq('id', payload.userId)

    if (updateError) {
      console.error('[Avatar] Update user error:', updateError)
      // 尝试删除已上传的文件
      await supabaseAdmin.storage.from('avatars').remove([filePath])
      return NextResponse.json(
        { success: false, message: '保存头像失败' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '上传成功',
      data: {
        avatar_url: avatarUrl,
      },
    })
  } catch (error) {
    console.error('[Avatar] Error:', error)
    return NextResponse.json(
      { success: false, message: '服务器错误' },
      { status: 500 }
    )
  }
}
