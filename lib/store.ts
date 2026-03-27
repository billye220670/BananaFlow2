import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { CanvasItem, StoredRef, Message, Marker } from "@/lib/types"
import { nanoid } from "nanoid"
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
  updateMessage: (id: string, patch: Partial<Message>) => void
  setLoading: (loading: boolean) => void
  // tldraw integration
  setEditor: (editor: Editor | null) => void
  setSelectedShapeIds: (ids: string[]) => void
  // project name
  setProjectName: (name: string) => void
  // chat panel
  toggleChat: () => void
  openChat: () => void
  closeChat: () => void
  clearChatHistory: () => void
  setChatPanelWidth: (width: number) => void
  // marker actions
  setActiveTool: (toolId: string) => void
  addMarker: (itemId: string, relativeX: number, relativeY: number) => boolean
  removeMarker: (markerId: string) => void
  removeMarkersByItemId: (itemId: string) => void
  clearMarkers: () => void
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
  projectName: string
}

interface SessionSlice {
  canvasItems: CanvasItem[]
  isEditingMode: boolean
  editingTarget: StoredRef | null
  isLoading: boolean
  // tldraw integration
  editor: Editor | null
  selectedShapeIds: string[]
  // chat panel
  isChatOpen: boolean
  chatPanelWidth: number
  // marker tool
  markers: Marker[]
  activeTool: string
}

export const useAppStore = create<PersistedSlice & SessionSlice & Actions>()(
  persist(
    (set) => ({
      // persisted
      chatHistory: [],
      projectName: 'Untitled',

      // session-only
      canvasItems: [],
      isEditingMode: false,
      editingTarget: null,
      isLoading: false,
      // tldraw integration
      editor: null,
      selectedShapeIds: [],
      // chat panel
      isChatOpen: false,
      chatPanelWidth: 380,
      // marker tool
      markers: [],
      activeTool: 'select',

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
              if (ref.localUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(ref.localUrl)
              }
            })
          }
          // 删除 canvas item
          const nextCanvasItems = s.canvasItems.filter((i) => i.id !== id)
          // 同步清理该图片的 markers 并重新编号
          const filtered = s.markers.filter((m) => m.itemId !== id)
          const renumbered = filtered.map((m, i) => ({ ...m, number: i + 1 }))
          // 触发 editor meta 信号通知 MarkerOverlay 重渲染
          const editor = useAppStore.getState().editor
          if (editor) {
            try {
              editor.updateInstanceState({
                meta: {
                  ...editor.getInstanceState().meta,
                  markersVersion: Date.now(),
                },
              })
            } catch (e) {
              // editor 可能未就绪，静默忽略
            }
          }
          return {
            canvasItems: nextCanvasItems,
            markers: renumbered,
          }
        }),

      clearCanvas: () =>
        set((s) => {
          // Revoke Object URLs for all reference images in all canvas items
          s.canvasItems.forEach((item) => {
            if (item.referenceImages) {
              item.referenceImages.forEach((ref) => {
                if (ref.localUrl?.startsWith('blob:')) {
                  URL.revokeObjectURL(ref.localUrl)
                }
              })
            }
          })
          // 触发 editor meta 信号通知 MarkerOverlay 重渲染
          const editor = useAppStore.getState().editor
          if (editor) {
            try {
              editor.updateInstanceState({
                meta: {
                  ...editor.getInstanceState().meta,
                  markersVersion: Date.now(),
                },
              })
            } catch (e) {
              // editor 可能未就绪，静默忽略
            }
          }
          return { canvasItems: [], isEditingMode: false, editingTarget: null, markers: [] }
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

      updateMessage: (id, patch) =>
        set((s) => ({
          chatHistory: s.chatHistory.map((m) => m.id === id ? { ...m, ...patch } : m),
        })),

      setLoading: (loading) => set({ isLoading: loading }),
    
      // tldraw integration
      setEditor: (editor) => set({ editor }),
      setSelectedShapeIds: (ids) => set({ selectedShapeIds: ids }),
      
      // project name
      setProjectName: (name) => set({ projectName: name }),
      
      // chat panel
      toggleChat: () => set((s) => ({ isChatOpen: !s.isChatOpen })),
      openChat: () => set({ isChatOpen: true }),
      closeChat: () => set({ isChatOpen: false }),
      clearChatHistory: () => set({ chatHistory: [] }),
      setChatPanelWidth: (width) => set({ chatPanelWidth: Math.max(320, Math.min(600, width)) }),
      
      // marker actions
      setActiveTool: (toolId) => set({ activeTool: toolId }),
      
      addMarker: (itemId, relativeX, relativeY) => {
        const state = useAppStore.getState()
        if (state.markers.length >= 8) return false
        const newMarker: Marker = {
          id: nanoid(),
          itemId,
          number: state.markers.length + 1,
          relativeX,
          relativeY,
        }
        set({ markers: [...state.markers, newMarker] })
        // 触发 editor meta 信号通知 MarkerOverlay 重渲染
        const editor = state.editor
        if (editor) {
          try {
            editor.updateInstanceState({
              meta: {
                ...editor.getInstanceState().meta,
                markersVersion: Date.now(),
              },
            })
          } catch (e) {
            // editor 可能未就绪，静默忽略
          }
        }
        return true
      },
      
      removeMarker: (markerId) =>
        set((s) => {
          const filtered = s.markers.filter((m) => m.id !== markerId)
          // 重新编号
          const renumbered = filtered.map((m, i) => ({ ...m, number: i + 1 }))
          // 触发 editor meta 信号通知 MarkerOverlay 重渲染
          const editor = useAppStore.getState().editor
          if (editor) {
            try {
              editor.updateInstanceState({
                meta: {
                  ...editor.getInstanceState().meta,
                  markersVersion: Date.now(),
                },
              })
            } catch (e) {
              // editor 可能未就绪，静默忽略
            }
          }
          return { markers: renumbered }
        }),
      
      removeMarkersByItemId: (itemId) =>
        set((s) => {
          const filtered = s.markers.filter((m) => m.itemId !== itemId)
          // 重新编号
          const renumbered = filtered.map((m, i) => ({ ...m, number: i + 1 }))
          // 触发 editor meta 信号通知 MarkerOverlay 重渲染
          const editor = useAppStore.getState().editor
          if (editor) {
            try {
              editor.updateInstanceState({
                meta: {
                  ...editor.getInstanceState().meta,
                  markersVersion: Date.now(),
                },
              })
            } catch (e) {
              // editor 可能未就绪，静默忽略
            }
          }
          return { markers: renumbered }
        }),
      
      clearMarkers: () =>
        set(() => {
          // 触发 editor meta 信号通知 MarkerOverlay 重渲染
          const editor = useAppStore.getState().editor
          if (editor) {
            try {
              editor.updateInstanceState({
                meta: {
                  ...editor.getInstanceState().meta,
                  markersVersion: Date.now(),
                },
              })
            } catch (e) {
              // editor 可能未就绪，静默忽略
            }
          }
          return { markers: [] }
        }),
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
      partialize: (state) => ({ chatHistory: state.chatHistory, projectName: state.projectName }),
    }
  )
)
