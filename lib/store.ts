import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { CanvasItem, StoredRef, Message } from "@/lib/types"

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
  addReferenceImage: (ref: StoredRef) => void
  removeReferenceImage: (id: string) => void
  updateReferenceImage: (id: string, patch: Partial<StoredRef>) => void
  appendMessage: (msg: Message) => void
  setLoading: (loading: boolean) => void
}

interface PersistedSlice {
  chatHistory: Message[]
}

interface SessionSlice {
  canvasItems: CanvasItem[]
  referenceImages: StoredRef[]
  isEditingMode: boolean
  editingTarget: StoredRef | null
  isLoading: boolean
}

export const useAppStore = create<PersistedSlice & SessionSlice & Actions>()(
  persist(
    (set) => ({
      // persisted
      chatHistory: [],

      // session-only
      canvasItems: [],
      referenceImages: [],
      isEditingMode: false,
      editingTarget: null,
      isLoading: false,

      // canvas actions
      addCanvasItem: (item) =>
        set((s) => ({ canvasItems: [...s.canvasItems, item] })),

      updateCanvasItem: (id, patch) =>
        set((s) => ({
          canvasItems: s.canvasItems.map((i) => i.id === id ? { ...i, ...patch } : i),
        })),

      removeCanvasItem: (id) =>
        set((s) => ({ canvasItems: s.canvasItems.filter((i) => i.id !== id) })),

      clearCanvas: () =>
        set({ canvasItems: [], isEditingMode: false, editingTarget: null }),

      setEditingMode: (active, target) =>
        set({ isEditingMode: active, editingTarget: target }),

      updateEditingTarget: (patch) =>
        set((s) =>
          s.editingTarget ? { editingTarget: { ...s.editingTarget, ...patch } } : {}
        ),

      addReferenceImage: (ref) =>
        set((s) => ({ referenceImages: [...s.referenceImages, ref] })),

      removeReferenceImage: (id) =>
        set((s) => ({ referenceImages: s.referenceImages.filter((r) => r.id !== id) })),

      updateReferenceImage: (id, patch) =>
        set((s) => ({
          referenceImages: s.referenceImages.map((r) =>
            r.id === id ? { ...r, ...patch } : r
          ),
        })),

      appendMessage: (msg) =>
        set((s) => {
          const next = [...s.chatHistory, msg]
          return { chatHistory: next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next }
        }),

      setLoading: (loading) => set({ isLoading: loading }),
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
