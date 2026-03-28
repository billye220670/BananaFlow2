import { getSupabaseAdmin } from './supabase-server'

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// 检查是否配置了阿里云短信（未配置则进入 dev mode）
function isDevMode(): boolean {
  return !process.env.ALIYUN_SMS_ACCESS_KEY_ID
}

async function sendSmsViaAliyun(phone: string, code: string): Promise<void> {
  // 动态导入阿里云 SDK（仅在实际发送时加载）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Dysmsapi = await import('@alicloud/dysmsapi20170525') as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const OpenApi = await import('@alicloud/openapi-client') as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Util = await import('@alicloud/tea-util') as any

  const config = new OpenApi.Config({
    accessKeyId: process.env.ALIYUN_SMS_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_SMS_ACCESS_KEY_SECRET,
  })
  config.endpoint = 'dysmsapi.aliyuncs.com'

  const client = new Dysmsapi.default(config)
  const request = new Dysmsapi.SendSmsRequest({
    phoneNumbers: phone,
    signName: process.env.ALIYUN_SMS_SIGN_NAME,
    templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE,
    templateParam: JSON.stringify({ code }),
  })

  const runtime = new Util.RuntimeOptions({})
  const response = await client.sendSmsWithOptions(request, runtime)

  if (response.body?.code !== 'OK') {
    throw new Error(`SMS send failed: ${response.body?.message || 'Unknown error'}`)
  }
}

export async function sendVerificationCode(phone: string): Promise<{ success: boolean; message: string }> {
  // 频率限制：60 秒内只能发一次
  const supabaseAdmin = getSupabaseAdmin()
  const { data: recentCode } = await supabaseAdmin
    .from('verification_codes')
    .select('created_at')
    .eq('phone', phone)
    .eq('used', false)
    .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (recentCode) {
    return { success: false, message: '请求过于频繁，请60秒后再试' }
  }

  const code = generateCode()

  // 存入数据库
  const { error: dbError } = await supabaseAdmin
    .from('verification_codes')
    .insert({
      phone,
      code,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      used: false,
    })

  if (dbError) {
    console.error('[SMS] Failed to store verification code:', dbError)
    return { success: false, message: '系统错误，请稍后重试' }
  }

  // 发送短信
  if (isDevMode()) {
    console.log(`[DEV SMS] 手机号: ${phone}, 验证码: ${code}`)
    return { success: true, message: `开发模式验证码：${code}` }
  }

  try {
    await sendSmsViaAliyun(phone, code)
    return { success: true, message: '验证码已发送' }
  } catch (error) {
    console.error('[SMS] Send failed:', error)
    return { success: false, message: '短信发送失败，请稍后重试' }
  }
}

export async function verifyCode(phone: string, code: string): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('verification_codes')
    .select('id')
    .eq('phone', phone)
    .eq('code', code)
    .eq('used', false)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return false

  // 标记为已使用
  await supabaseAdmin
    .from('verification_codes')
    .update({ used: true })
    .eq('id', data.id)

  return true
}
