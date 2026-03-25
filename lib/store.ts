import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { CanvasItem, StoredRef, Message } from "@/lib/types"
import type { Editor, TLShapeId } from "tldraw"

const MAX_HISTORY = 50

const safeStorage = {
  getItem: (key: string): string | null => {
    try { return localStorage.getItem(key) } catch { return null }
  },
  setItem: (key: string, value: string): void => {
    try { localStorage.setItem(key, value) } catch { /* noop */ }
  },
  removeItem: (key: string): void => {
    try { localStorage.removeItem(key) } catch { /* noop */ }
  },
}

interface Actions {
  addCanvasItem: (item: CanvasItem) => void
  updateCanvasItem: (id: string, patch: Partial<CanvasItem>) => void
  removeCanvasItem: (id: string) => void
  clearCanvas: () => void
  setEditingMode: (active: boolean, target: StoredRef | null) => void
  updateEditingTarget: (patch: Partial<StoredRef>) => void
  // per-item reference image actions
  addItemReference: (itemId: string, ref: StoredRef) => void
  removeItemReference: (itemId: string, refId: string) => void
  updateItemReference: (itemId: string, refId: string, patch: Partial<StoredRef>) => void
  reorderItemReferences: (itemId: string, newOrder: string[]) => void
  appendMessage: (msg: Message) => void
  setLoading: (loading: boolean) => void
  // tldraw integration
  setEditor: (editor: Editor | null) => void
  setSelectedShapeIds: (ids: string[]) => void
}

// ID mapping helpers
export function canvasItemIdToShapeId(itemId: string): TLShapeId {
  return `shape:${itemId}` as TLShapeId
}

export function shapeIdToCanvasItemId(shapeId: TLShapeId): string {
  return shapeId.replace('shape:', '')
}

interface PersistedSlice {
  chatHistory: Message[]
}

interface SessionSlice {
  canvasItems: CanvasItem[]
  isEditingMode: boolean
  editingTarget: StoredRef | null
  isLoading: boolean
  // tldraw integration
  editor: Editor | null
  selectedShapeIds: string[]
}

export const useAppStore = create<PersistedSlice & SessionSlice & Actions>()(
  persist(
    (set) => ({
      // persisted
      chatHistory: [],

      // session-only
      canvasItems: [],
      isEditingMode: false,
      editingTarget: null,
      isLoading: false,
      // tldraw integration
      editor: null,
      selectedShapeIds: [],

      // canvas actions
      addCanvasItem: (item) =>
        set((s) => ({ canvasItems: [...s.canvasItems, item] })),

      updateCanvasItem: (id, patch) =>
        set((s) => ({
          canvasItems: s.canvasItems.map((i) => i.id === id ? { ...i, ...patch } : i),
        })),

      removeCanvasItem: (id) =>
        set((s) => {
          const item = s.canvasItems.find((i) => i.id === id)
          // Revoke Object URLs for all reference images before removing
          if (item?.referenceImages) {
            item.referenceImages.forEach((ref) => {
              URL.revokeObjectURL(ref.localUrl)
            })
          }
          return { canvasItems: s.canvasItems.filter((i) => i.id !== id) }
        }),

      clearCanvas: () =>
        set((s) => {
          // Revoke Object URLs for all reference images in all canvas items
          s.canvasItems.forEach((item) => {
            if (item.referenceImages) {
              item.referenceImages.forEach((ref) => {
                URL.revokeObjectURL(ref.localUrl)
              })
            }
          })
          return { canvasItems: [], isEditingMode: false, editingTarget: null }
        }),

      setEditingMode: (active, target) =>
        set({ isEditingMode: active, editingTarget: target }),

      updateEditingTarget: (patch) =>
        set((s) =>
          s.editingTarget ? { editingTarget: { ...s.editingTarget, ...patch } } : {}
        ),

      // per-item reference image actions
      addItemReference: (itemId, ref) =>
        set((s) => ({
          canvasItems: s.canvasItems.map((item) =>
            item.id === itemId
              ? { ...item, referenceImages: [...(item.referenceImages || []), ref] }
              : item
          ),
        })),

      removeItemReference: (itemId, refId) =>
        set((s) => ({
          canvasItems: s.canvasItems.map((item) => {
            if (item.id !== itemId) return item
            const refToRemove = item.referenceImages?.find((r) => r.id === refId)
            if (refToRemove) {
              URL.revokeObjectURL(refToRemove.localUrl)
            }
            return {
              ...item,
              referenceImages: item.referenceImages?.filter((r) => r.id !== refId) || [],
            }
          }),
        })),

      updateItemReference: (itemId, refId, patch) =>
        set((s) => ({
          canvasItems: s.canvasItems.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  referenceImages: item.referenceImages?.map((r) =>
                    r.id === refId ? { ...r, ...patch } : r
                  ),
                }
              : item
          ),
        })),

      reorderItemReferences: (itemId, newOrder) =>
        set((s) => ({
          canvasItems: s.canvasItems.map((item) => {
            if (item.id !== itemId || !item.referenceImages) return item
            const refMap = new Map(item.referenceImages.map((r) => [r.id, r]))
            const reordered = newOrder
              .map((id) => refMap.get(id))
              .filter((r): r is StoredRef => r !== undefined)
            return { ...item, referenceImages: reordered }
          }),
        })),

      appendMessage: (msg) =>
        set((s) => {
          const next = [...s.chatHistory, msg]
          return { chatHistory: next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next }
        }),

      setLoading: (loading) => set({ isLoading: loading }),
    
      // tldraw integration
      setEditor: (editor) => set({ editor }),
      setSelectedShapeIds: (ids) => set({ selectedShapeIds: ids }),
    }),
    {
      name: "lovart-storage",
      storage: {
        getItem: (name: string) => {
          const str = safeStorage.getItem(name)
          if (str === null) return null
          try { return JSON.parse(str) } catch { return null }
        },
        setItem: (name: string, value: unknown) => {
          safeStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: (name: string) => safeStorage.removeItem(name),
      },
      partialize: (state) => ({ chatHistory: state.chatHistory }),
    }
  )
)
