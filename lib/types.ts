export interface StoredRef {
  id: string
  localUrl: string       // object URL for display (revoked on cleanup)
  falUrl: string | null  // FAL storage URL; null until upload completes
  name: string
  uploading: boolean
}

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  imageUrl?: string      // result image URL for assistant messages
  timestamp: number
}

export interface CanvasItem {
  id: string
  url: string           // display URL (blob or FAL CDN)
  falUrl: string | null // FAL CDN URL; null until upload completes
  x: number
  y: number
  width: number         // 0 = auto-size on first image load
  height: number
  uploading: boolean
  placeholder?: boolean // true while AI is generating
}

export interface AppState {
  canvasItems: CanvasItem[]
  chatHistory: Message[]
  referenceImages: StoredRef[]
  isEditingMode: boolean
  editingTarget: StoredRef | null
  isLoading: boolean
}
