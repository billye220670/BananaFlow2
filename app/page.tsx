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
