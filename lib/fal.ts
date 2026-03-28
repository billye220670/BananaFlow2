import { fal } from "@fal-ai/client"
import { useAppStore } from "@/lib/store"

fal.config({ 
  proxyUrl: "/api/fal/proxy",
  requestMiddleware: async (request) => {
    // 从 store 中获取用户自定义的 API Key
    const falApiKey = useAppStore.getState().falApiKey
    if (falApiKey && falApiKey.trim()) {
      return {
        ...request,
        headers: {
          ...request.headers,
          'x-fal-key': falApiKey.trim(),
        },
      }
    }
    return request
  },
})

interface FalResult {
  data: { images: Array<{ url: string; width?: number; height?: number }> }
}

// 辅助函数：通过加载图片获取实际尺寸（导出供其他模块使用）
export function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Failed to load image for dimensions'))
    img.crossOrigin = 'anonymous'
    img.src = url
  })
}

// 统一使用 fal-ai/nano-banana-2/edit 模型的基础配置
const BASE_INPUT = {
  num_images: 1,
  output_format: "png" as const,
  safety_tolerance: "4",
  limit_generations: true,
}

export async function generateImage({
  prompt,
  referenceUrls,
  aspectRatio,
  resolution,
}: {
  prompt: string
  referenceUrls: string[]
  aspectRatio?: string
  resolution?: string
}): Promise<{ url: string; width: number; height: number }> {
  const input: Record<string, unknown> = {
    ...BASE_INPUT,
    prompt,
    aspect_ratio: aspectRatio || "auto",
    ...(resolution && { resolution }),
    ...(referenceUrls.length > 0 && { image_urls: referenceUrls }),
  }

  // 动态选择端点：有参考图时用 edit 模式，无参考图时用纯文本生成模式
  const endpoint = referenceUrls.length > 0 
    ? "fal-ai/nano-banana-2/edit" 
    : "fal-ai/nano-banana-2"

  // 调试日志：FAL API 完整请求入参
  console.log('[generateImage] === FAL API 完整请求入参 ===')
  console.log('[generateImage] endpoint:', endpoint)
  console.log('[generateImage] mode:', referenceUrls.length > 0 ? '图片编辑模式' : '纯文本生成模式')
  console.log('[generateImage] input:', JSON.stringify(input, null, 2))

  try {
    const result = (await fal.subscribe(endpoint, {
      input,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs?.map((log) => log.message).forEach(console.log)
        }
      },
    })) as FalResult
    
    const imageData = result.data.images[0]
    const url = imageData.url

    let width = imageData.width
    let height = imageData.height

    // 如果 FAL API 没返回宽高，通过加载图片获取
    if (!width || !height) {
      const dimensions = await getImageDimensions(url)
      width = dimensions.width
      height = dimensions.height
    }

    return { url, width, height }
  } catch (error) {
    const timestamp = new Date().toISOString()
    console.error(`[generateImage] === FAL API 调用失败 === timestamp: ${timestamp}`)
    console.error(`[generateImage] 错误类型: ${error instanceof Error ? error.name : 'Unknown'}`)
    console.error(`[generateImage] 错误消息: ${error instanceof Error ? error.message : String(error)}`)
    console.error(`[generateImage] 完整错误对象:`, error)
    console.error(`[generateImage] 请求参数摘要: prompt=${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}, referenceUrls数量=${referenceUrls.length}, aspectRatio=${aspectRatio}, resolution=${resolution}`)
    throw error
  }
}

export async function editImage({
  prompt,
  targetUrl,
  referenceUrls,
}: {
  prompt: string
  targetUrl: string
  referenceUrls: string[]
}): Promise<string> {
  const input: Record<string, unknown> = {
    ...BASE_INPUT,
    prompt,
    aspect_ratio: "auto",
    resolution: "1K",
    image_urls: [targetUrl, ...referenceUrls],
  }

  // 调试日志：FAL API 完整请求入参
  console.log('[editImage] === FAL API 完整请求入参 ===')
  console.log('[editImage] model:', 'fal-ai/nano-banana-2/edit')
  console.log('[editImage] input:', JSON.stringify(input, null, 2))

  try {
    const result = (await fal.subscribe("fal-ai/nano-banana-2/edit", {
      input,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs?.map((log) => log.message).forEach(console.log)
        }
      },
    })) as FalResult
    return result.data.images[0].url
  } catch (error) {
    const timestamp = new Date().toISOString()
    console.error(`[editImage] === FAL API 调用失败 === timestamp: ${timestamp}`)
    console.error(`[editImage] 错误类型: ${error instanceof Error ? error.name : 'Unknown'}`)
    console.error(`[editImage] 错误消息: ${error instanceof Error ? error.message : String(error)}`)
    console.error(`[editImage] 完整错误对象:`, error)
    console.error(`[editImage] 请求参数摘要: prompt=${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}, targetUrl=${targetUrl.substring(0, 80)}..., referenceUrls数量=${referenceUrls.length}`)
    throw error
  }
}

export async function uploadFile(file: File): Promise<string> {
  try {
    const result = await fal.storage.upload(file)
    console.log(`[uploadFile] 上传成功: fileName=${file.name}, size=${file.size}, type=${file.type}`)
    return result
  } catch (error) {
    const timestamp = new Date().toISOString()
    console.error(`[uploadFile] === 文件上传失败 === timestamp: ${timestamp}`)
    console.error(`[uploadFile] 错误类型: ${error instanceof Error ? error.name : 'Unknown'}`)
    console.error(`[uploadFile] 错误消息: ${error instanceof Error ? error.message : String(error)}`)
    console.error(`[uploadFile] 完整错误对象:`, error)
    console.error(`[uploadFile] 文件信息: name=${file.name}, size=${file.size}, type=${file.type}`)
    throw error
  }
}
