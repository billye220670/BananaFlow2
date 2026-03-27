# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (http://localhost:3000)
npm run build      # Production build
npm run lint       # ESLint
npx vitest         # Run all tests
npx vitest run __tests__/store.test.ts   # Run a single test file
```

The `start.bat` / `start.ps1` scripts are Windows launchers that handle port cleanup and launch `npm run dev`.

## Environment

Requires `FAL_KEY` in `.env.local` — the fal.ai API key used for image generation and file uploads. Without it, all AI features fail.

## Architecture

This is a Next.js 16 app. The entire UI is a single full-screen canvas page (`app/page.tsx` → `CanvasArea`). There is no traditional sidebar or chat panel — they were removed; all interaction happens inline on the canvas.

### State management (`lib/store.ts`)

Single Zustand store (`useAppStore`) split into two slices:
- **Persisted** (localStorage key `lovart-storage`): `chatHistory` only
- **Session-only**: `canvasItems`, `isEditingMode`, `editingTarget`, `isLoading`, `editor` (tldraw instance ref), `selectedShapeIds`

The store is the single source of truth. tldraw shapes are kept in sync with `canvasItems` via a two-way bridge: tldraw store events → Zustand updates, and Zustand `canvasItems` changes → tldraw shape mutations.

Shape IDs and canvas item IDs are linked via `canvasItemIdToShapeId` / `shapeIdToCanvasItemId` helpers (prefix `shape:`).

### Canvas (`components/canvas/CanvasArea.tsx`)

Wraps tldraw with all native UI panels hidden (StylePanel, NavigationPanel, Minimap, Toolbar). Custom overlays are injected via tldraw's `InFrontOfTheCanvas` slot.

Key responsibilities:
- Two-way sync between `canvasItems` store and tldraw shapes using a `syncingRef` guard to prevent loops
- Placeholder shapes (grey `geo` rectangles) are created immediately when AI generation starts, then replaced with real image shapes when the result arrives
- File drops are handled at the container level and uploaded to fal.ai storage before being added to the canvas
- Background color picker and zoom controls are custom overlays at the bottom-left

### Inline edit panel (`components/canvas/InlineEditPanel.tsx`)

Floats below the selected image shape, positioned by converting tldraw page coordinates to screen coordinates on every camera change. Shows prompt textarea + up to 6 reference image thumbnails. Triggers `editImage` or `generateImage` based on whether the selected item has a `falUrl`.

### AI integration (`lib/fal.ts`)

All AI calls go through fal.ai:
- `generateImage` → `fal-ai/nano-banana` (text-to-image, optional reference URLs)
- `editImage` → `fal-ai/nano-banana/edit` (image editing with references)
- `uploadFile` → `fal.storage.upload` (required before passing local files as references)

All fal.ai client calls are proxied through `/api/fal/proxy` (route handler using `@fal-ai/server-proxy/nextjs`) so the `FAL_KEY` stays server-side.

### Types (`lib/types.ts`)

Three main types:
- `CanvasItem` — an image on the canvas with position, dimensions, FAL CDN URL, and optional per-item reference images
- `StoredRef` — a reference image attached to a canvas item (has both a local blob URL and a FAL CDN URL)
- `Message` — a chat history entry

### Toolbar (`components/canvas/Toolbar.tsx`)

Visual-only toolbar at the bottom-center. Tool state is local component state and not yet wired to tldraw tools — UI scaffolding only.

## Testing

Uses Vitest + jsdom + `@testing-library/react`. Test files live in `__tests__/`. Run with `npx vitest`.

## Key constraints

- `AGENTS.md` warns that this is Next.js 16 with breaking changes — always read `node_modules/next/dist/docs/` before writing Next.js code
- Object URLs (`URL.createObjectURL`) are manually revoked when canvas items or references are removed — always revoke when removing
- `canvasItems` must not be persisted to localStorage (only `chatHistory` is) because blob URLs are session-only
