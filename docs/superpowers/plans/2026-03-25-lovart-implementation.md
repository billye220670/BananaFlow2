# Lovart.ai Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js 15 dual-panel web app where users generate and edit images via a chat interface powered by FAL.ai Nano Banana, deployable on Vercel.

**Architecture:** Left panel (70%) is a canvas that displays the current image and accepts drag-and-drop; right panel (30%) is a chat interface with message history, reference image uploads, and a smart text input. State is managed by Zustand with localStorage persistence for chat history.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS, shadcn/ui, Zustand, @fal-ai/client, @fal-ai/server-proxy, Vitest, React Testing Library

---

## File Map

| File | Responsibility |
|------|----------------|
| `app/layout.tsx` | Root layout: dark theme, Geist font, Toaster provider |
| `app/globals.css` | Tailwind base + CSS custom properties |
| `app/page.tsx` | Dual-panel layout (desktop/tablet/mobile) |
| `app/api/fal/proxy/route.ts` | FAL.ai key proxy — server-side only |
| `lib/types.ts` | Shared TypeScript interfaces |
| `lib/validate.ts` | File type/size validation — pure functions |
| `lib/fal.ts` | FAL.ai client config + generateImage/editImage helpers |
| `lib/store.ts` | Zustand store with localStorage persistence |
| `components/canvas/CanvasArea.tsx` | Left panel: image display, drop zone, loading overlay, controls |
| `components/chat/ChatPanel.tsx` | Right panel shell — composes chat sub-components |
| `components/chat/MessageBubble.tsx` | Single chat message (user or AI) |
| `components/chat/MessageHistory.tsx` | Scrollable list of MessageBubbles |
| `components/chat/ReferenceUploader.tsx` | Thumbnail strip + upload button |
| `components/chat/TextInput.tsx` | Mode-aware textarea with send button |
| `__tests__/validate.test.ts` | Unit tests for validation utilities |
| `__tests__/store.test.ts` | Unit tests for Zustand store actions |
| `__tests__/fal.test.ts` | Unit tests for API helpers (mocked FAL client) |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `vitest.config.ts`, `components.json`

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd C:/Users/Tintt/Desktop/Loveart
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```

When prompted: yes to all defaults.

- [ ] **Step 2: Install dependencies**

```bash
npm install @fal-ai/client @fal-ai/server-proxy zustand sonner
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Initialize shadcn/ui**

```bash
npx shadcn@latest init
```

When prompted: Style = Default, Base color = Zinc, CSS variables = yes.

- [ ] **Step 4: Add shadcn components we need**

```bash
npx shadcn@latest add button textarea badge tooltip scroll-area
```

- [ ] **Step 5: Configure Vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["__tests__/setup.ts"],
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
})
```

Create `__tests__/setup.ts`:

```typescript
import "@testing-library/jest-dom"
```

- [ ] **Step 6: Set dark background in globals.css**

In `app/globals.css`, ensure the root variables use zinc-950 for background. Replace the `:root` and `.dark` blocks so the body starts dark:

```css
@layer base {
  :root {
    --background: 0 0% 3.9%;        /* zinc-950 */
    --foreground: 0 0% 98%;
    --card: 0 0% 9%;                 /* zinc-900 */
    --card-foreground: 0 0% 98%;
    --border: 0 0% 27.1%;           /* zinc-700 */
    --input: 0 0% 27.1%;
    --primary: 263.4 70% 50.4%;     /* violet-500 */
    --primary-foreground: 0 0% 98%;
    --muted: 0 0% 14.9%;            /* zinc-800 */
    --muted-foreground: 0 0% 63.9%; /* zinc-400 */
    --radius: 0.5rem;
  }
}
```

Add `class="dark"` to `<html>` in `app/layout.tsx` (done in Task 6).

- [ ] **Step 7: Verify setup compiles**

```bash
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Next.js 15 project with shadcn/ui, Zustand, FAL.ai deps"
```

---

## Task 2: Shared Types

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Write types**

Create `lib/types.ts`:

```typescript
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
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: File Validation Utility (TDD)

**Files:**
- Create: `lib/validate.ts`
- Test: `__tests__/validate.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/validate.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { validateFile, ValidationError } from "@/lib/validate"

const makeFile = (name: string, type: string, sizeBytes: number): File =>
  new File(["x".repeat(sizeBytes)], name, { type })

describe("validateFile", () => {
  it("accepts valid JPG under 10MB", () => {
    const file = makeFile("photo.jpg", "image/jpeg", 1024 * 1024)
    expect(validateFile(file)).toBeNull()
  })

  it("accepts valid PNG", () => {
    const file = makeFile("art.png", "image/png", 500)
    expect(validateFile(file)).toBeNull()
  })

  it("accepts valid WebP", () => {
    const file = makeFile("img.webp", "image/webp", 500)
    expect(validateFile(file)).toBeNull()
  })

  it("rejects unsupported file type", () => {
    const file = makeFile("doc.pdf", "application/pdf", 500)
    expect(validateFile(file)).toBe(ValidationError.InvalidType)
  })

  it("rejects file over 10MB", () => {
    const file = makeFile("big.png", "image/png", 11 * 1024 * 1024)
    expect(validateFile(file)).toBe(ValidationError.TooLarge)
  })

  it("rejects exactly at 10MB boundary (exclusive)", () => {
    const file = makeFile("exact.png", "image/png", 10 * 1024 * 1024 + 1)
    expect(validateFile(file)).toBe(ValidationError.TooLarge)
  })

  it("accepts exactly 10MB (inclusive)", () => {
    const file = makeFile("exact.png", "image/png", 10 * 1024 * 1024)
    expect(validateFile(file)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run __tests__/validate.test.ts
```

Expected: FAIL — "validateFile is not defined"

- [ ] **Step 3: Implement validate.ts**

Create `lib/validate.ts`:

```typescript
export enum ValidationError {
  InvalidType = "仅支持 JPG/PNG/WebP 格式",
  TooLarge = "文件大小不能超过 10MB",
}

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const MAX_SIZE_BYTES = 10 * 1024 * 1024

export function validateFile(file: File): ValidationError | null {
  if (!ALLOWED_TYPES.has(file.type)) return ValidationError.InvalidType
  if (file.size > MAX_SIZE_BYTES) return ValidationError.TooLarge
  return null
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run __tests__/validate.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/validate.ts __tests__/validate.test.ts __tests__/setup.ts vitest.config.ts
git commit -m "feat: add file validation utility with tests"
```

---

## Task 4: FAL.ai Proxy Route + API Helpers (TDD)

**Files:**
- Create: `app/api/fal/proxy/route.ts`
- Create: `lib/fal.ts`
- Create: `.env.local` (gitignored)
- Test: `__tests__/fal.test.ts`

- [ ] **Step 1: Create FAL proxy route**

Create `app/api/fal/proxy/route.ts`:

```typescript
import { route } from "@fal-ai/server-proxy/nextjs"

export const { GET, POST, PUT } = route({
  credentials: process.env.FAL_KEY!,
})
```

- [ ] **Step 2: Create .env.local**

Create `.env.local` (already in .gitignore from create-next-app):

```
FAL_KEY=your_fal_api_key_here
```

Replace `your_fal_api_key_here` with your actual FAL.ai key from https://fal.ai/dashboard/keys

- [ ] **Step 3: Write failing tests for fal.ts**

Create `__tests__/fal.test.ts`:

```typescript
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
    const url = await generateImage({ prompt: "a red cat", referenceUrls: [] })
    expect(fal.subscribe).toHaveBeenCalledWith(
      "fal-ai/nano-banana",
      expect.objectContaining({ input: expect.objectContaining({ prompt: "a red cat" }) })
    )
    expect(url).toBe("https://fal.media/result.png")
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
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
npx vitest run __tests__/fal.test.ts
```

Expected: FAIL — "generateImage is not defined"

- [ ] **Step 5: Implement lib/fal.ts**

> **IMPORTANT:** Before writing this file, verify the actual FAL.ai Nano Banana API field names at https://fal.ai/models/fal-ai/nano-banana/api. The field names below (`image_urls`, `aspect_ratio`, `output_format`, `resolution`) come from the requirements doc — update them if the live API schema differs.
>
> **Also confirm the correct client config key**: `@fal-ai/client` uses `proxyUrl` for proxy mode (not `credentials`). If the installed version differs, check `node_modules/@fal-ai/client/README.md` and update the `fal.config()` call accordingly. The expected key is `proxyUrl: "/api/fal/proxy"`.

Create `lib/fal.ts`:

```typescript
import { fal } from "@fal-ai/client"

fal.config({ proxyUrl: "/api/fal/proxy" })

interface FalResult {
  data: { images: Array<{ url: string; width: number; height: number }> }
}

const BASE_INPUT = {
  num_images: 1,
  aspect_ratio: "auto",
  output_format: "png",
  resolution: "1K",
} as const

export async function generateImage({
  prompt,
  referenceUrls,
}: {
  prompt: string
  referenceUrls: string[]
}): Promise<string> {
  const result = (await fal.subscribe("fal-ai/nano-banana", {
    input: {
      ...BASE_INPUT,
      prompt,
      ...(referenceUrls.length > 0 && { image_urls: referenceUrls }),
    },
  })) as FalResult
  return result.data.images[0].url
}

export async function editImage({
  prompt,
  targetUrl,
  referenceUrls,
}: {
  prompt: string
  targetUrl: string
  referenceUrls: string[]
}): Promise<string> {
  const result = (await fal.subscribe("fal-ai/nano-banana", {
    input: {
      ...BASE_INPUT,
      prompt,
      image_urls: [targetUrl, ...referenceUrls],
    },
  })) as FalResult
  return result.data.images[0].url
}

export async function uploadFile(file: File): Promise<string> {
  return fal.storage.upload(file)
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
npx vitest run __tests__/fal.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/api/fal/proxy/route.ts lib/fal.ts __tests__/fal.test.ts
git commit -m "feat: add FAL.ai proxy route and API helpers with tests"
```

---

## Task 5: Zustand Store (TDD)

**Files:**
- Create: `lib/store.ts`
- Test: `__tests__/store.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `__tests__/store.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run __tests__/store.test.ts
```

Expected: FAIL — "useAppStore is not defined"

- [ ] **Step 3: Implement lib/store.ts**

Create `lib/store.ts`:

```typescript
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { StoredRef, Message } from "@/lib/types"

const MAX_HISTORY = 50

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
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ chatHistory: state.chatHistory }),
    }
  )
)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run __tests__/store.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/store.ts __tests__/store.test.ts
git commit -m "feat: add Zustand store with localStorage persistence and tests"
```

---

## Task 6: Root Layout & Theme

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Update app/layout.tsx**

Replace the contents of `app/layout.tsx`:

```typescript
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Toaster } from "sonner"
import "./globals.css"

export const metadata: Metadata = {
  title: "Lovart.ai",
  description: "AI-powered creative design platform",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-background text-foreground antialiased">
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Install Geist font**

```bash
npm install geist
```

- [ ] **Step 3: Verify the app renders**

```bash
npm run dev
```

Open http://localhost:3000 — should show a dark background page with no errors in the console.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat: configure dark theme root layout with Geist fonts and Sonner toaster"
```

---

## Task 7: CanvasArea Component

**Files:**
- Create: `components/canvas/CanvasArea.tsx`

- [ ] **Step 1: Implement CanvasArea**

Create `components/canvas/CanvasArea.tsx`:

```typescript
"use client"

import { useRef, useCallback } from "react"
import { useAppStore } from "@/lib/store"
import { validateFile } from "@/lib/validate"
import { uploadFile } from "@/lib/fal"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Download, X, ImageIcon } from "lucide-react"
import { nanoid } from "nanoid"

export function CanvasArea() {
  const { canvasImage, isEditingMode, isLoading, setEditingMode, updateEditingTarget, clearCanvas } =
    useAppStore()
  const dragCounterRef = useRef(0)
  const isDraggingRef = useRef(false)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mobile long-press: re-edit the current canvas image (already a FAL URL, no re-upload)
  const handleTouchStart = useCallback(() => {
    if (!canvasImage) return
    longPressRef.current = setTimeout(() => {
      setEditingMode(true, {
        id: nanoid(),
        localUrl: canvasImage,
        falUrl: canvasImage,
        name: "canvas-image.png",
        uploading: false,
      })
    }, 600)
  }, [canvasImage, setEditingMode])

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    isDraggingRef.current = true
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) isDraggingRef.current = false
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      dragCounterRef.current = 0
      isDraggingRef.current = false

      const file = e.dataTransfer.files[0]
      if (!file) return

      const error = validateFile(file)
      if (error) { toast.error(error); return }

      const localUrl = URL.createObjectURL(file)
      const ref = { id: nanoid(), localUrl, falUrl: null, name: file.name, uploading: true }
      setEditingMode(true, ref)

      try {
        const falUrl = await uploadFile(file)
        updateEditingTarget({ falUrl, uploading: false })
      } catch {
        toast.error("上传失败，请重试")
        setEditingMode(false, null)
        URL.revokeObjectURL(localUrl)
      }
    },
    [setEditingMode, updateEditingTarget]
  )

  const handleDownload = useCallback(() => {
    if (!canvasImage) return
    const a = document.createElement("a")
    a.href = canvasImage
    a.download = `lovart-${Date.now()}.png`
    a.click()
  }, [canvasImage])

  return (
    <div
      className="relative flex flex-col h-full bg-zinc-950 border-r border-zinc-800"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Main image area */}
      <div className="flex-1 flex items-center justify-center p-6 min-h-0">
        {canvasImage ? (
          <img
            src={canvasImage}
            alt="Canvas result"
            className="max-w-full max-h-full object-contain rounded-lg select-none"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-zinc-600">
            <ImageIcon className="w-16 h-16" />
            <p className="text-sm">拖入图片开始编辑，或在右侧输入创作指令</p>
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-zinc-950/80 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">AI 正在思考...</p>
        </div>
      )}

      {/* Bottom controls */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
        <span className="text-xs font-medium px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">
          {isEditingMode ? "编辑模式" : "创建模式"}
        </span>
        <div className="flex gap-2">
          {canvasImage && (
            <Button size="sm" variant="ghost" onClick={handleDownload} className="text-zinc-400 hover:text-zinc-100">
              <Download className="w-4 h-4 mr-1" /> 下载
            </Button>
          )}
          {(canvasImage || isEditingMode) && (
            <Button size="sm" variant="ghost" onClick={clearCanvas} className="text-zinc-400 hover:text-zinc-100">
              <X className="w-4 h-4 mr-1" /> 清除
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Install nanoid**

```bash
npm install nanoid
```

- [ ] **Step 3: Install lucide-react**

```bash
npm install lucide-react
```

- [ ] **Step 4: Verify component has no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/canvas/CanvasArea.tsx
git commit -m "feat: add CanvasArea component with drag-drop and loading overlay"
```

---

## Task 8: Chat Message Components

**Files:**
- Create: `components/chat/MessageBubble.tsx`
- Create: `components/chat/MessageHistory.tsx`

- [ ] **Step 1: Implement MessageBubble**

Create `components/chat/MessageBubble.tsx`:

```typescript
import type { Message } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Props {
  message: Message
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
          isUser
            ? "bg-zinc-800 text-zinc-100 rounded-br-sm"
            : "border border-violet-500/30 bg-zinc-900 text-zinc-100 rounded-bl-sm"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {message.imageUrl && (
          <img
            src={message.imageUrl}
            alt="Generated result"
            className="mt-2 rounded-lg max-w-full"
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement MessageHistory**

Create `components/chat/MessageHistory.tsx`:

```typescript
"use client"

import { useEffect, useRef } from "react"
import { useAppStore } from "@/lib/store"
import { MessageBubble } from "./MessageBubble"
import { ScrollArea } from "@/components/ui/scroll-area"

export function MessageHistory() {
  const chatHistory = useAppStore((s) => s.chatHistory)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatHistory])

  if (chatHistory.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-600 text-sm text-center px-4">
          输入创作指令开始创作，<br />或拖入图片进行编辑
        </p>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-3 p-4">
        {chatHistory.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/chat/MessageBubble.tsx components/chat/MessageHistory.tsx
git commit -m "feat: add MessageBubble and MessageHistory components"
```

---

## Task 9: ReferenceUploader Component

**Files:**
- Create: `components/chat/ReferenceUploader.tsx`

- [ ] **Step 1: Implement ReferenceUploader**

Create `components/chat/ReferenceUploader.tsx`:

```typescript
"use client"

import { useRef, useCallback } from "react"
import { useAppStore } from "@/lib/store"
import { validateFile } from "@/lib/validate"
import { uploadFile } from "@/lib/fal"
import { toast } from "sonner"
import { X, Plus, Loader2 } from "lucide-react"
import { nanoid } from "nanoid"

const MAX_REFS = 6

export function ReferenceUploader() {
  const { referenceImages, addReferenceImage, removeReferenceImage, updateReferenceImage } =
    useAppStore()
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(
    async (file: File) => {
      if (referenceImages.length >= MAX_REFS) {
        toast.error("最多 6 张参考图")
        return
      }
      const error = validateFile(file)
      if (error) { toast.error(error); return }

      const id = nanoid()
      const localUrl = URL.createObjectURL(file)
      addReferenceImage({ id, localUrl, falUrl: null, name: file.name, uploading: true })

      try {
        const falUrl = await uploadFile(file)
        updateReferenceImage(id, { falUrl, uploading: false })
      } catch {
        toast.error("上传失败")
        removeReferenceImage(id)
        URL.revokeObjectURL(localUrl)
      }
    },
    [referenceImages.length, addReferenceImage, removeReferenceImage, updateReferenceImage]
  )

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return
      Array.from(files).forEach(processFile)
    },
    [processFile]
  )

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800 overflow-x-auto">
      <span className="text-xs text-zinc-500 shrink-0">
        {referenceImages.length > 0 ? `参考图 ${referenceImages.length}/${MAX_REFS}` : "参考图"}
      </span>
      <div className="flex gap-2">
        {referenceImages.map((ref) => (
          <div key={ref.id} className="relative w-12 h-12 shrink-0">
            <img
              src={ref.localUrl}
              alt={ref.name}
              className="w-full h-full object-cover rounded-md border border-zinc-700"
            />
            {ref.uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/70 rounded-md">
                <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
              </div>
            )}
            <button
              onClick={() => {
                removeReferenceImage(ref.id)
                URL.revokeObjectURL(ref.localUrl)
              }}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center hover:bg-zinc-600"
            >
              <X className="w-2.5 h-2.5 text-zinc-300" />
            </button>
          </div>
        ))}
        {referenceImages.length < MAX_REFS && (
          <button
            onClick={() => inputRef.current?.click()}
            className="w-12 h-12 shrink-0 rounded-md border border-dashed border-zinc-700 flex items-center justify-center hover:border-violet-500 transition-colors"
          >
            <Plus className="w-4 h-4 text-zinc-500" />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/chat/ReferenceUploader.tsx
git commit -m "feat: add ReferenceUploader component with FAL upload and thumbnails"
```

---

## Task 10: TextInput Component

**Files:**
- Create: `components/chat/TextInput.tsx`

- [ ] **Step 1: Implement TextInput**

Create `components/chat/TextInput.tsx`:

```typescript
"use client"

import { useState, useCallback, useRef } from "react"
import { useAppStore } from "@/lib/store"
import { generateImage, editImage } from "@/lib/fal"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ArrowUp, Loader2 } from "lucide-react"
import { nanoid } from "nanoid"

export function TextInput({ onFocus }: { onFocus?: () => void }) {
  const [value, setValue] = useState("")
  const {
    isLoading,
    isEditingMode,
    editingTarget,
    referenceImages,
    setLoading,
    setCanvasImage,
    appendMessage,
  } = useAppStore()

  const hasPendingUploads =
    editingTarget?.uploading ||
    referenceImages.some((r) => r.uploading)

  const isBlocked = isLoading || !!hasPendingUploads
  const placeholder = isEditingMode ? "描述你想如何编辑..." : "描述你想创作的..."

  const handleSend = useCallback(async () => {
    const prompt = value.trim()
    if (!prompt || isBlocked) return
    setValue("")

    const userMsg = { id: nanoid(), role: "user" as const, content: prompt, timestamp: Date.now() }
    appendMessage(userMsg)
    setLoading(true)

    try {
      const refUrls = referenceImages.map((r) => r.falUrl!).filter(Boolean)
      let resultUrl: string

      if (isEditingMode && editingTarget?.falUrl) {
        resultUrl = await editImage({ prompt, targetUrl: editingTarget.falUrl, referenceUrls: refUrls })
      } else {
        resultUrl = await generateImage({ prompt, referenceUrls: refUrls })
      }

      setCanvasImage(resultUrl)
      appendMessage({
        id: nanoid(),
        role: "assistant",
        content: "已生成",
        imageUrl: resultUrl,
        timestamp: Date.now(),
      })
    } catch (err) {
      const isNetwork = err instanceof TypeError && err.message.includes("fetch")
      toast.error(isNetwork ? "网络连接失败，请检查网络" : "生成失败，请重试")
    } finally {
      setLoading(false)
    }
  }, [value, isBlocked, isEditingMode, editingTarget, referenceImages, appendMessage, setLoading, setCanvasImage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  return (
    <div className="flex items-end gap-2 p-3 border-t border-zinc-800">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        className="flex-1 resize-none bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 disabled:opacity-50 min-h-[42px] max-h-32"
        style={{ height: "auto" }}
        onInput={(e) => {
          const t = e.currentTarget
          t.style.height = "auto"
          t.style.height = Math.min(t.scrollHeight, 128) + "px"
        }}
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={isBlocked || !value.trim()}
        className="shrink-0 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ArrowUp className="w-4 h-4" />
        )}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/chat/TextInput.tsx
git commit -m "feat: add TextInput component with send gating and mode-aware placeholder"
```

---

## Task 11: ChatPanel + Main Page Assembly

**Files:**
- Create: `components/chat/ChatPanel.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Implement ChatPanel**

Create `components/chat/ChatPanel.tsx`:

```typescript
import { MessageHistory } from "./MessageHistory"
import { ReferenceUploader } from "./ReferenceUploader"
import { TextInput } from "./TextInput"

interface Props {
  onInputFocus?: () => void
}

export function ChatPanel({ onInputFocus }: Props) {
  return (
    <div className="flex flex-col h-full bg-zinc-900">
      <div className="px-4 py-3 border-b border-zinc-800 shrink-0">
        <h1 className="text-sm font-semibold text-zinc-100">Lovart.ai</h1>
        <p className="text-xs text-zinc-500">AI 创意设计平台</p>
      </div>
      <MessageHistory />
      <ReferenceUploader />
      <TextInput onFocus={onInputFocus} />
    </div>
  )
}
```

- [ ] **Step 2: Implement main page**

Replace `app/page.tsx`:

```typescript
"use client"

import { useState } from "react"
import { CanvasArea } from "@/components/canvas/CanvasArea"
import { ChatPanel } from "@/components/chat/ChatPanel"
import { ChevronUp, ChevronDown } from "lucide-react"

export default function Home() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Tablet (md) + Desktop (lg): side-by-side */}
      {/* md = 768–1023px → 60/40 split  |  lg = ≥1024px → 70/30 split */}
      <div className="hidden md:flex w-full h-screen">
        <div className="w-[60%] lg:w-[70%] h-full">
          <CanvasArea />
        </div>
        <div className="flex-1 h-full">
          <ChatPanel />
        </div>
      </div>

      {/* Mobile (<768px): canvas + bottom drawer */}
      <div className="flex md:hidden flex-col w-full h-screen relative overflow-hidden">
        {/* Canvas — fills space above drawer */}
        <div className="flex-1 min-h-0">
          <CanvasArea />
        </div>

        {/* Bottom drawer */}
        <div
          className="absolute bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 transition-[height] duration-300 ease-in-out flex flex-col"
          style={{ height: drawerOpen ? "60vh" : "72px" }}
        >
          {/* Drawer handle / toggle */}
          <button
            onClick={() => setDrawerOpen((v) => !v)}
            className="flex items-center justify-center py-2 shrink-0"
            aria-label={drawerOpen ? "收起聊天" : "展开聊天"}
          >
            <div className="w-8 h-1 rounded-full bg-zinc-700 mr-2" />
            {drawerOpen ? (
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            ) : (
              <ChevronUp className="w-4 h-4 text-zinc-500" />
            )}
          </button>

          {/* Chat content — only visible when open */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ChatPanel onInputFocus={() => setDrawerOpen(true)} />
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Start dev server and verify the UI renders**

```bash
npm run dev
```

Open http://localhost:3000. Expected:
- Dark background
- Left panel shows drop zone icon
- Right panel shows chat header, empty state, and input box
- No console errors

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/chat/ChatPanel.tsx app/page.tsx
git commit -m "feat: assemble ChatPanel and main dual-panel layout"
```

---

## Task 12: End-to-End Smoke Test & Deploy

**Files:**
- No new files

- [ ] **Step 1: Manual smoke test — create mode**

With dev server running (`npm run dev`):
1. Type "一只橙色的猫在草地上" in the chat input
2. Press Enter
3. Verify: spinner appears, "AI 正在思考..." shows on canvas
4. Wait for result (up to 30s)
5. Verify: image appears on canvas, chat shows user message + AI response with thumbnail
6. Verify: mode badge still shows "创建模式"

- [ ] **Step 2: Manual smoke test — edit mode**

1. Drag a PNG/JPG from your desktop onto the canvas
2. Verify: mode badge changes to "编辑模式", image appears on canvas, textarea placeholder shows "正在上传图片..." and send button is disabled while the upload is in-flight
3. Once the upload completes (placeholder returns to "描述你想如何编辑..."), type "把背景改成宇宙星空" and press Enter
4. Verify: image is replaced with the edited version

**Mobile edit mode test (requires a touch device or Chrome DevTools mobile simulation):**
5. Generate or drop an image onto the canvas so `canvasImage` is set
6. Long-press (hold 600ms) on the canvas image
7. Verify: mode badge changes to "编辑模式" immediately (no upload spinner — the existing FAL URL is reused)
8. Type an edit prompt and send; verify the image updates

- [ ] **Step 3: Manual smoke test — reference images**

1. In the chat panel, look for the "参考图" label and the `+` button in the reference strip (always visible)
2. Click `+` and select a JPG/PNG from your device
3. Verify: thumbnail appears with spinner overlay, then resolves to the image
4. Type a prompt and press Enter
5. Verify: generation completes and visually references the uploaded image

- [ ] **Step 4: Manual smoke test — error states**

1. Try dragging a PDF onto the canvas — verify toast "仅支持 JPG/PNG/WebP 格式"
2. Verify that after API success, refreshing the page shows chat history (localStorage working)

- [ ] **Step 5: Deploy to Vercel**

```bash
npm install -g vercel
vercel
```

When prompted:
- Link to existing project or create new: create new
- Project name: `lovart-ai`
- Framework: Next.js (auto-detected)

Add the environment variable in the Vercel dashboard:
- `FAL_KEY` = your FAL.ai API key

Then deploy to production:

```bash
vercel --prod
```

- [ ] **Step 6: Verify production deployment**

Open the production URL. Repeat the smoke test steps 1-4 on the live deployment.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: Lovart.ai v1.0 — AI image creation and editing platform"
```

---

## Appendix: Known Gaps & Phase 2 Notes

### FAL.ai API Field Names
The field names in `lib/fal.ts` (`image_urls`, `aspect_ratio`, `output_format`, `resolution`) must be verified against the live API at https://fal.ai/models/fal-ai/nano-banana/api before running Task 4. If any field names differ, update the `BASE_INPUT` object and both call shapes in `lib/fal.ts`.

### Phase 2: User Accounts + DB Persistence
To add user accounts and cross-device history:
1. Install Clerk: `vercel integration add clerk` (user must accept terms in terminal)
2. Add Neon Postgres: `vercel integration add neon`
3. Create a Zustand custom storage adapter in `lib/storage-adapter.ts` that reads/writes to `/api/history` (a DB-backed route handler)
4. Replace the `createJSONStorage(() => localStorage)` call in `lib/store.ts` with the new adapter
5. The store interface (`AppStore`) stays unchanged — only the persistence target changes
6. Phase 1 localStorage history does not migrate to the DB; users start fresh after login
