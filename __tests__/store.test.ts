import { describe, it, expect, beforeEach } from "vitest"
import { useAppStore } from "@/lib/store"
import { act } from "@testing-library/react"

// Reset store between tests
beforeEach(() => {
  useAppStore.setState({
    canvasItems: [],
    chatHistory: [],
    isEditingMode: false,
    editingTarget: null,
    isLoading: false,
  })
})

describe("store — canvas actions", () => {
  it("addCanvasItem appends an item", () => {
    const item = { id: "1", url: "https://x.png", x: 0, y: 0, width: 400, height: 400, uploading: false }
    act(() => useAppStore.getState().addCanvasItem(item))
    expect(useAppStore.getState().canvasItems).toHaveLength(1)
  })

  it("removeCanvasItem removes by id", () => {
    act(() => {
      useAppStore.getState().addCanvasItem({ id: "1", url: "https://a.png", x: 0, y: 0, width: 0, height: 0, uploading: true })
      useAppStore.getState().addCanvasItem({ id: "2", url: "https://b.png", x: 0, y: 0, width: 0, height: 0, uploading: true })
      useAppStore.getState().removeCanvasItem("1")
    })
    expect(useAppStore.getState().canvasItems).toHaveLength(1)
    expect(useAppStore.getState().canvasItems[0].id).toBe("2")
  })

  it("clearCanvas resets editing state", () => {
    act(() => {
      useAppStore.getState().addCanvasItem({ id: "1", url: "https://x.png", x: 0, y: 0, width: 400, height: 400, uploading: false })
      useAppStore.getState().setEditingMode(true, { id: "1", localUrl: "blob:x", url: "https://x", name: "x.png", uploading: false })
      useAppStore.getState().clearCanvas()
    })
    const state = useAppStore.getState()
    expect(state.canvasItems).toHaveLength(0)
    expect(state.isEditingMode).toBe(false)
    expect(state.editingTarget).toBeNull()
  })
})

describe("store — per-item reference images", () => {
  it("addItemReference appends ref to item.referenceImages", () => {
    act(() => {
      useAppStore.getState().addCanvasItem({ id: "item1", url: "https://x.png", x: 0, y: 0, width: 400, height: 400, uploading: false })
      useAppStore.getState().addItemReference("item1", { id: "ref1", localUrl: "blob:x", url: null, name: "a.png", uploading: true })
    })
    const item = useAppStore.getState().canvasItems[0]
    expect(item.referenceImages).toHaveLength(1)
    expect(item.referenceImages![0].id).toBe("ref1")
  })

  it("removeItemReference removes ref by id", () => {
    act(() => {
      useAppStore.getState().addCanvasItem({ id: "item1", url: "https://x.png", x: 0, y: 0, width: 400, height: 400, uploading: false })
      useAppStore.getState().addItemReference("item1", { id: "ref1", localUrl: "blob:a", url: null, name: "a.png", uploading: true })
      useAppStore.getState().addItemReference("item1", { id: "ref2", localUrl: "blob:b", url: null, name: "b.png", uploading: true })
      useAppStore.getState().removeItemReference("item1", "ref1")
    })
    const item = useAppStore.getState().canvasItems[0]
    expect(item.referenceImages).toHaveLength(1)
    expect(item.referenceImages![0].id).toBe("ref2")
  })

  it("updateItemReference sets url and uploading=false", () => {
    act(() => {
      useAppStore.getState().addCanvasItem({ id: "item1", url: "https://x.png", x: 0, y: 0, width: 400, height: 400, uploading: false })
      useAppStore.getState().addItemReference("item1", { id: "ref1", localUrl: "blob:x", url: null, name: "a.png", uploading: true })
      useAppStore.getState().updateItemReference("item1", "ref1", { url: "https://storage.supabase.co/x.png", uploading: false })
    })
    const ref = useAppStore.getState().canvasItems[0].referenceImages![0]
    expect(ref.url).toBe("https://storage.supabase.co/x.png")
    expect(ref.uploading).toBe(false)
  })

  it("reorderItemReferences reorders refs by id", () => {
    act(() => {
      useAppStore.getState().addCanvasItem({ id: "item1", url: "https://x.png", x: 0, y: 0, width: 400, height: 400, uploading: false })
      useAppStore.getState().addItemReference("item1", { id: "ref1", localUrl: "blob:a", url: null, name: "a.png", uploading: false })
      useAppStore.getState().addItemReference("item1", { id: "ref2", localUrl: "blob:b", url: null, name: "b.png", uploading: false })
      useAppStore.getState().addItemReference("item1", { id: "ref3", localUrl: "blob:c", url: null, name: "c.png", uploading: false })
      useAppStore.getState().reorderItemReferences("item1", ["ref3", "ref1", "ref2"])
    })
    const refs = useAppStore.getState().canvasItems[0].referenceImages!
    expect(refs[0].id).toBe("ref3")
    expect(refs[1].id).toBe("ref1")
    expect(refs[2].id).toBe("ref2")
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
