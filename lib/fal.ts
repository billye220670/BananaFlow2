import { fal } from "@fal-ai/client"

fal.config({ proxyUrl: "/api/fal/proxy" })

interface FalResult {
  data: { images: Array<{ url: string; width: number; height: number }> }
}

const GENERATE_BASE_INPUT = {
  num_images: 1,
  output_format: "png" as const,
}

const EDIT_BASE_INPUT = {
  num_images: 1,
  aspect_ratio: "auto" as const,
  output_format: "png" as const,
  resolution: "1K" as const,
}

export async function generateImage({
  prompt,
  referenceUrls,
}: {
  prompt: string
  referenceUrls: string[]
}): Promise<string> {
  const input = {
    ...GENERATE_BASE_INPUT,
    prompt,
    ...(referenceUrls.length > 0 && { image_urls: referenceUrls }),
  }
  const result = (await fal.subscribe("fal-ai/nano-banana", {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: input as any,
  })) as FalResult
  return result.data.images[0].url
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
  const result = (await fal.subscribe("fal-ai/nano-banana/edit", {
    input: {
      ...EDIT_BASE_INPUT,
      prompt,
      image_urls: [targetUrl, ...referenceUrls],
    },
  })) as FalResult
  return result.data.images[0].url
}

export async function uploadFile(file: File): Promise<string> {
  return fal.storage.upload(file)
}
