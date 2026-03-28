import { createRouteHandler } from "@fal-ai/server-proxy/nextjs"

export const { GET, POST, PUT } = createRouteHandler({
  resolveFalAuth: async (behavior) => {
    // 优先使用请求头中的自定义 API Key
    const customKeyHeader = behavior.getHeader('x-fal-key')
    const customKey = Array.isArray(customKeyHeader) ? customKeyHeader[0] : customKeyHeader
    if (customKey && customKey.trim()) {
      return `Key ${customKey.trim()}`
    }
    // 否则使用环境变量中的 key
    const envKey = process.env.FAL_KEY
    if (envKey) {
      return `Key ${envKey}`
    }
    return undefined
  }
})
