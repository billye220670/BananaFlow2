import { createRouteHandler } from "@fal-ai/server-proxy/nextjs"
import { NextRequest, NextResponse } from "next/server"

const handler = createRouteHandler({
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

// Wrapper function to add logging and error handling
function wrapHandler(method: string, fn: (req: NextRequest) => Promise<Response>) {
  return async (req: NextRequest) => {
    const timestamp = new Date().toISOString()
    console.log(`[FAL Proxy] ${method} request received - url: ${req.url}, timestamp: ${timestamp}`)
    
    try {
      const response = await fn(req)
      return response
    } catch (error) {
      const errorTimestamp = new Date().toISOString()
      console.error(`[FAL Proxy] ${method} request failed - timestamp: ${errorTimestamp}`)
      console.error(`[FAL Proxy] Error message: ${error instanceof Error ? error.message : String(error)}`)
      console.error(`[FAL Proxy] Error stack: ${error instanceof Error ? error.stack : 'N/A'}`)
      console.error(`[FAL Proxy] Full error object:`, error)
      
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : String(error),
          timestamp: errorTimestamp,
        },
        { status: 500 }
      )
    }
  }
}

export const GET = wrapHandler('GET', handler.GET)
export const POST = wrapHandler('POST', handler.POST)
export const PUT = wrapHandler('PUT', handler.PUT)
