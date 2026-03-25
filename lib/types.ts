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

export interface AppState {
  canvasImage: string | null
  chatHistory: Message[]
  referenceImages: StoredRef[]
  isEditingMode: boolean
  editingTarget: StoredRef | null
  isLoading: boolean
}
