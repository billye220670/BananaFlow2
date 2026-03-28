import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateImage, editImage } from "@/lib/fal"

// Mock the FAL client
vi.mock("@fal-ai/client", () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(),
    storage: { upload: vi.fn() },
  },
}))

import { fal } from "@fal-ai/client"

const mockResult = {
  data: {
    images: [{ url: "https://fal.media/result.png", width: 1024, height: 1024 }],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fal.subscribe).mockResolvedValue(mockResult as never)
})

describe("generateImage", () => {
  it("calls fal.subscribe with correct model and prompt", async () => {
    const result = await generateImage({ prompt: "a red cat", referenceUrls: [] })
    expect(fal.subscribe).toHaveBeenCalledWith(
      "fal-ai/nano-banana-2/edit",
      expect.objectContaining({ input: expect.objectContaining({ prompt: "a red cat" }) })
    )
    expect(result).toEqual({ url: "https://fal.media/result.png", width: 1024, height: 1024 })
  })

  it("omits image_urls when referenceUrls is empty", async () => {
    await generateImage({ prompt: "test", referenceUrls: [] })
    const call = vi.mocked(fal.subscribe).mock.calls[0][1] as { input: Record<string, unknown> }
    expect(call.input.image_urls).toBeUndefined()
  })

  it("includes image_urls when referenceUrls provided", async () => {
    await generateImage({ prompt: "test", referenceUrls: ["https://example.com/ref.jpg"] })
    const call = vi.mocked(fal.subscribe).mock.calls[0][1] as { input: Record<string, unknown> }
    expect(call.input.image_urls).toEqual(["https://example.com/ref.jpg"])
  })
})

describe("editImage", () => {
  it("puts targetUrl first in image_urls", async () => {
    const url = await editImage({
      prompt: "make it blue",
      targetUrl: "https://fal.media/target.png",
      referenceUrls: ["https://fal.media/ref.png"],
    })
    const call = vi.mocked(fal.subscribe).mock.calls[0][1] as { input: Record<string, unknown> }
    expect((call.input.image_urls as string[])[0]).toBe("https://fal.media/target.png")
    expect(url).toBe("https://fal.media/result.png")
  })
})
