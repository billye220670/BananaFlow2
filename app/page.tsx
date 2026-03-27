'use client'

import { CanvasArea } from "@/components/canvas/CanvasArea"
import { ChatPanel } from "@/components/chat/ChatPanel"
import { useAppStore } from "@/lib/store"

export default function Home() {
  const isChatOpen = useAppStore((s) => s.isChatOpen)
  const chatPanelWidth = useAppStore((s) => s.chatPanelWidth)

  return (
    <div className="h-screen w-screen overflow-hidden flex">
      {/* Canvas area - flex-1 allows it to shrink/grow, min-w-0 ensures it can shrink below content size */}
      <div className="flex-1 min-w-0 transition-all duration-300 ease-in-out">
        <CanvasArea />
      </div>
      
      {/* Chat panel - slides in from right */}
      <div 
        data-chat-panel-container
        className={`h-full bg-white transition-all duration-300 ease-in-out overflow-hidden`}
        style={{ width: isChatOpen ? chatPanelWidth : 0 }}
      >
        <div style={{ width: chatPanelWidth }} className="h-full">
          <ChatPanel />
        </div>
      </div>
    </div>
  )
}
