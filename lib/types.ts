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
  loading?: boolean      // skeleton loading state
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
  referenceImages?: StoredRef[] // per-item reference images
  naturalWidth?: number      // 原始图片宽度
  naturalHeight?: number     // 原始图片高度
  fileName?: string          // 原始文件名
}

export interface Marker {
  id: string            // nanoid 生成
  itemId: string        // 所属 CanvasItem 的 id
  number: number        // 全局序号 1-8
  relativeX: number     // 相对图片的 X 位置 (0-1)
  relativeY: number     // 相对图片的 Y 位置 (0-1)
}

export interface AppState {
  canvasItems: CanvasItem[]
  chatHistory: Message[]
  isEditingMode: boolean
  editingTarget: StoredRef | null
  isLoading: boolean
}

export interface User {
  id: string
  phone: string
  nickname: string | null
  avatar_url: string | null
  created_at: string
}
