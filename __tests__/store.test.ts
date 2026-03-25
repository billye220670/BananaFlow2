import { describe, it, expect, beforeEach } from "vitest"
import { useAppStore } from "@/lib/store"
import { act } from "@testing-library/react"

// Reset store between tests
beforeEach(() => {
  useAppStore.setState({
    canvasImage: null,
    chatHistory: [],
    referenceImages: [],
    isEditingMode: false,
    editingTarget: null,
    isLoading: false,
  })
})

describe("store — canvas actions", () => {
  it("setCanvasImage updates canvasImage", () => {
    act(() => useAppStore.getState().setCanvasImage("https://example.com/img.png"))
    expect(useAppStore.getState().canvasImage).toBe("https://example.com/img.png")
  })

  it("clearCanvas resets editing state", () => {
    act(() => {
      useAppStore.getState().setCanvasImage("https://example.com/img.png")
      useAppStore.getState().setEditingMode(true, { id: "1", localUrl: "blob:x", falUrl: "https://x", name: "x.png", uploading: false })
      useAppStore.getState().clearCanvas()
    })
    const state = useAppStore.getState()
    expect(state.canvasImage).toBeNull()
    expect(state.isEditingMode).toBe(false)
    expect(state.editingTarget).toBeNull()
  })
})

describe("store — reference images", () => {
  it("addReferenceImage appends to referenceImages", () => {
    const ref = { id: "1", localUrl: "blob:x", falUrl: null, name: "a.png", uploading: true }
    act(() => useAppStore.getState().addReferenceImage(ref))
    expect(useAppStore.getState().referenceImages).toHaveLength(1)
  })

  it("removeReferenceImage removes by id", () => {
    act(() => {
      useAppStore.getState().addReferenceImage({ id: "1", localUrl: "blob:x", falUrl: null, name: "a.png", uploading: true })
      useAppStore.getState().addReferenceImage({ id: "2", localUrl: "blob:y", falUrl: null, name: "b.png", uploading: true })
      useAppStore.getState().removeReferenceImage("1")
    })
    expect(useAppStore.getState().referenceImages).toHaveLength(1)
    expect(useAppStore.getState().referenceImages[0].id).toBe("2")
  })

  it("updateReferenceImage sets falUrl and uploading=false", () => {
    act(() => {
      useAppStore.getState().addReferenceImage({ id: "1", localUrl: "blob:x", falUrl: null, name: "a.png", uploading: true })
      useAppStore.getState().updateReferenceImage("1", { falUrl: "https://fal.media/x.png", uploading: false })
    })
    const ref = useAppStore.getState().referenceImages[0]
    expect(ref.falUrl).toBe("https://fal.media/x.png")
    expect(ref.uploading).toBe(false)
  })
})

describe("store — chat history", () => {
  it("appendMessage adds message and trims to 50", () => {
    act(() => {
      for (let i = 0; i < 55; i++) {
        useAppStore.getState().appendMessage({
          id: String(i),
          role: "user",
          content: `msg ${i}`,
          timestamp: Date.now(),
        })
      }
    })
    expect(useAppStore.getState().chatHistory).toHaveLength(50)
    // oldest messages dropped
    expect(useAppStore.getState().chatHistory[0].id).toBe("5")
  })
})
