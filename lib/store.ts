import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { StoredRef, Message } from "@/lib/types"

const MAX_HISTORY = 50

/** Lazily-evaluated JSON storage so localStorage is accessed at call-time,
 *  not at module-init time.  This makes the store safe in SSR and test
 *  environments where localStorage may not be ready when the module loads. */
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
  setCanvasImage: (url: string | null) => void
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
  canvasImage: string | null
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

      // session-only (excluded from persist below)
      canvasImage: null,
      referenceImages: [],
      isEditingMode: false,
      editingTarget: null,
      isLoading: false,

      // actions
      setCanvasImage: (url) => set({ canvasImage: url }),

      clearCanvas: () =>
        set({ canvasImage: null, isEditingMode: false, editingTarget: null }),

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
