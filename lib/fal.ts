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
  data: { images: Array<{ url: string; width: number; height: number }> }
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

  // 调试日志：FAL API 完整请求入参
  console.log('[generateImage] === FAL API 完整请求入参 ===')
  console.log('[generateImage] model:', 'fal-ai/nano-banana-2/edit')
  console.log('[generateImage] input:', JSON.stringify(input, null, 2))

  const result = (await fal.subscribe("fal-ai/nano-banana-2/edit", {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS") {
        update.logs?.map((log) => log.message).forEach(console.log)
      }
    },
  })) as FalResult
  
  const image = result.data.images[0]
  return { url: image.url, width: image.width, height: image.height }
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
}

export async function uploadFile(file: File): Promise<string> {
  return fal.storage.upload(file)
}
