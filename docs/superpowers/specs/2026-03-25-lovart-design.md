# Lovart.ai — Design Specification

**Date:** 2026-03-25
**Status:** Approved
**Version:** 1.1

---

## 1. Product Overview

Lovart.ai is a dark-themed, AI-powered creative design platform built on Next.js and deployed on Vercel. Users interact through natural language in a chat panel to generate and edit images via the FAL.ai Nano Banana API. The interface uses a dual-panel layout: a main canvas on the left and a chat panel on the right.

**Core value:** Zero-friction image creation and editing through conversation.

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 15 (App Router) | Vercel-native, API routes for proxy |
| Styling | Tailwind CSS + shadcn/ui | Dark theme, consistent components |
| State | Zustand + `persist` middleware | Simple, localStorage-backed, upgradeable |
| AI API | FAL.ai Nano Banana (`@fal-ai/client`) | Purpose-built proxy pattern |
| Deployment | Vercel | Zero-config, single env var |

---

## 3. Architecture

### 3.1 File Structure

```
app/
  page.tsx                    ← dual-panel layout root
  layout.tsx                  ← dark theme, fonts
  api/fal/proxy/route.ts      ← FAL.ai key proxy
components/
  canvas/CanvasArea.tsx        ← left panel: image display + drag-drop
  chat/ChatPanel.tsx           ← right panel shell
  chat/MessageHistory.tsx      ← scrollable chat bubbles
  chat/ReferenceUploader.tsx   ← thumbnail strip + upload controls
  chat/TextInput.tsx           ← smart input with mode-aware placeholder
lib/
  store.ts                    ← Zustand store with localStorage persistence
  fal.ts                      ← generateImage / editImage API helpers
  validate.ts                 ← file type/size validation utilities
```

### 3.2 Layout

**Desktop (≥ 1024px):** Horizontal split — `CanvasArea` 70% left, `ChatPanel` 30% right.

**Tablet (768–1023px):** Same horizontal split at **60% / 40%** — chat panel needs more width on smaller screens.

**Mobile (< 768px):** Vertical layout — canvas fills the top portion; chat panel is a bottom drawer (see Section 8).

---

## 4. State Management

### 4.1 Zustand Store Shape

```typescript
interface AppStore {
  canvasImage: string | null        // URL of currently displayed image
  chatHistory: Message[]            // { role, content, imageUrl?, timestamp }
  referenceImages: StoredRef[]      // { id, localUrl, falUrl | null, name, uploading: boolean }
  isEditingMode: boolean
  editingTarget: StoredRef | null   // image dragged onto canvas
  isLoading: boolean                // API call in-flight (NOT persisted)
}

interface Message {
  role: "user" | "assistant"
  content: string
  imageUrl?: string
  timestamp: number
}

interface StoredRef {
  id: string
  localUrl: string      // object URL for display
  falUrl: string | null // FAL storage URL; null until upload completes
  name: string
  uploading: boolean    // true while fal.storage.upload is in-flight
}
```

### 4.2 Persistence Scope

**Persisted to localStorage:** `chatHistory` only.

**Not persisted:** `canvasImage` (FAL URLs expire in 24h — persisting produces silent 404s on reload), `referenceImages`, `editingTarget`, `isLoading`.

**Chat history size limit:** Maximum 50 messages retained. When the 51st message is added, drop the oldest. `imageUrl` fields in persisted messages store only the FAL result URL (already a string), not blob data, so size remains bounded. Estimated worst case: 50 messages × ~500 chars = ~25KB, well within the 5MB localStorage quota.

**`isLoading` non-persistence:** `isLoading` is excluded from the persisted slice. On app boot it is always `false`. Any in-flight FAL call interrupted by navigation or tab close is simply lost — the user must re-submit.

### 4.3 State Transitions

| Trigger | State Change |
|---------|-------------|
| Drop image on canvas | `isEditingMode = true`, `editingTarget = { localUrl, falUrl: null, uploading: true }`, begin `fal.storage.upload()` in background |
| FAL upload completes | `editingTarget.falUrl = url`, `editingTarget.uploading = false` |
| FAL upload fails | Toast error, remove editingTarget, `isEditingMode = false` |
| Send message — create mode | `isLoading = true` → on result: `canvasImage = resultUrl`, append to `chatHistory`, `isLoading = false` |
| Send message — edit mode | Same as above; `editingTarget.falUrl` is first in `image_urls` |
| Upload reference image | Validate → push `{ uploading: true, falUrl: null }` → `fal.storage.upload()` → on success set `falUrl`, `uploading = false`; on failure remove entry + toast |
| Clear canvas | `isEditingMode = false`, `editingTarget = null`, `canvasImage = null` |
| Component unmount / stream cancel | `isLoading = false` (cleanup in useEffect return) |

### 4.4 Send Button Gating

The Send button is **disabled** when any of the following are true:
- `isLoading === true`
- `editingTarget?.uploading === true`
- Any entry in `referenceImages` has `uploading === true`

This prevents sending a malformed API call with `null` FAL URLs. The button shows a spinner and tooltip "正在上传图片..." when blocked by pending uploads.

### 4.5 Phase 2 Upgrade Path

Phase 2 adds user authentication (e.g., Clerk) and a database (e.g., Neon Postgres). The Zustand `persist` middleware supports custom async storage adapters. The upgrade requires:

1. Implement a custom storage adapter that reads/writes to a `/api/history` route backed by the database, keyed by `userId` from the auth session.
2. The store interface (`AppStore`) remains unchanged — only the persistence target changes.
3. **Known gap:** Phase 1 has no user identity, so localStorage history cannot be migrated to the database. Phase 2 starts with a fresh history for each authenticated user.

---

## 5. API Integration

### 5.1 FAL.ai Proxy

`app/api/fal/proxy/route.ts` — single route forwarding all FAL.ai requests. Requires one environment variable: `FAL_KEY`.

```typescript
import { route } from "@fal-ai/server-proxy/nextjs"
export const { GET, POST, PUT } = route({ credentials: process.env.FAL_KEY! })
```

Configure the client once (e.g., in `lib/fal.ts`):
```typescript
import * as fal from "@fal-ai/client"
fal.config({ credentials: "/api/fal/proxy" })
```

### 5.2 Generation Calls (`lib/fal.ts`)

> **Note:** The field names below (`image_urls`, `aspect_ratio`, `output_format`, `resolution`) are derived from the product requirements doc. These **must be verified against the live FAL.ai Nano Banana API schema** at `https://fal.ai/models/fal-ai/nano-banana/api` before implementation. If field names differ, update `lib/fal.ts` accordingly.

**Create mode:**
```typescript
const result = await fal.subscribe("fal-ai/nano-banana", {
  input: {
    prompt,
    image_urls: referenceUrls,      // optional, omit if empty
    num_images: 1,
    aspect_ratio: "auto",
    output_format: "png",
    resolution: "1K"
  }
})
// Extract URL:
const imageUrl = result.data.images[0].url  // verify shape against API docs
```

**Edit mode:**
```typescript
const result = await fal.subscribe("fal-ai/nano-banana", {
  input: {
    prompt,
    image_urls: [targetUrl, ...referenceUrls],  // target is always first
    num_images: 1,
    aspect_ratio: "auto",
    output_format: "png",
    resolution: "1K"
  }
})
const imageUrl = result.data.images[0].url
```

**Expected response shape (to be confirmed against API docs):**
```typescript
interface FalResult {
  data: {
    images: Array<{ url: string; width: number; height: number }>
  }
}
```

### 5.3 File Upload Flow

1. User selects/drops file → validate (type + size) → `URL.createObjectURL()` for instant local preview
2. Background: `fal.storage.upload(file)` → receive permanent FAL URL
3. Store both: `localUrl` for display, `falUrl` for API calls
4. Send button remains disabled until `falUrl` is populated (see Section 4.4)

---

## 6. UI Design

### 6.1 Dark Theme Tokens

| Token | Value |
|-------|-------|
| Background | `zinc-950` |
| Surface | `zinc-900` / `zinc-800` |
| Border | `zinc-700` |
| Accent | `violet-500` |
| Text primary | `zinc-100` |
| Text secondary | `zinc-400` |

### 6.2 Component Responsibilities

**`CanvasArea`**
- Renders image or dashed drop zone when empty
- Drag-and-drop events trigger store actions
- Loading overlay with spinner + "AI 正在思考..."
- Bottom bar: mode badge ("编辑模式" / "创建模式"), download button, clear button

**`MessageHistory`**
- Scrollable chat bubble list; auto-scrolls to bottom on new message
- User messages: right-aligned, zinc-800 background
- AI responses: left-aligned, violet accent border; includes result thumbnail if image was produced
- Streaming-safe: can append to last message

**`ReferenceUploader`**
- Horizontal thumbnail strip above text input
- Click `+` or drag to add; `×` to remove individual images
- Count badge (e.g., "2/6"); strip hidden when empty
- Uploading thumbnails show a spinner overlay until `falUrl` resolves

**`TextInput`**
- Textarea; placeholder adapts to mode:
  - Create: "描述你想创作的..."
  - Edit: "描述你想如何编辑..."
- Enter → send; Ctrl+Enter → newline
- Disabled (with tooltip) while `isLoading` or any upload is pending

---

## 7. Error Handling

| Error | User Feedback | State Effect |
|-------|---------------|--------------|
| Wrong file type | Toast: "仅支持 JPG/PNG/WebP" | Reject upload |
| File > 10MB | Toast: "文件不能超过 10MB" | Reject upload |
| > 6 reference images | Toast: "最多 6 张参考图" | Reject upload |
| FAL API failure | Toast: "生成失败，请重试" | Keep current state, re-enable input |
| Network error | Toast: "网络连接失败" + retry button in chat | Keep current state |
| FAL storage upload failure | Toast: "上传失败", remove thumbnail | Remove from referenceImages / clear editingTarget |

---

## 8. Responsive Design

| Breakpoint | Layout | Ratio |
|------------|--------|-------|
| ≥ 1024px | Side-by-side | 70% canvas / 30% chat |
| 768–1023px | Side-by-side | 60% canvas / 40% chat |
| < 768px | Vertical + bottom drawer | See below |

### Mobile Bottom Drawer

- **Initial state:** Collapsed — shows only the input bar (≈ 80px tall) anchored to the bottom of the screen
- **Expanded state:** Draws up to 60% of viewport height, overlapping the canvas (canvas does not resize)
- **Toggle:** Chevron button on the drawer handle; also expands automatically when the user taps the input field
- **Soft keyboard:** When the keyboard appears, the drawer shifts up with it (`env(keyboard-insets-bottom)` or equivalent); canvas remains partially visible above
- **Message History:** Visible only when drawer is expanded

### Mobile Edit Mode (Touch)

- Long-press on the canvas image → enters edit mode targeting the **currently displayed canvas image** (re-edit workflow). This is distinct from desktop drag-and-drop (which brings in an external file). The state transition is: `isEditingMode = true`, `editingTarget = { localUrl: canvasImage, falUrl: canvasImage, uploading: false }` — the current canvas URL is already a FAL URL, so no re-upload is needed.
- To bring in a new image on mobile: tap the `+` button in the reference strip, select from device, then the first reference image is treated as the edit target if no canvas image exists; otherwise it joins the reference strip.

---

## 9. Out of Scope (Phase 1)

- User accounts / authentication
- Database persistence (Phase 2)
- Version history / undo-redo
- Multiple canvas images (single image at a time)
- Real-time collaboration

---

## 10. Environment Variables

| Variable | Purpose |
|----------|---------|
| `FAL_KEY` | FAL.ai API key — server-side only, never exposed to browser |
