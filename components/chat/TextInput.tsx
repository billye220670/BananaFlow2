"use client"

import { useState, useCallback } from "react"
import { useAppStore } from "@/lib/store"
import { generateImage, editImage } from "@/lib/fal"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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
        placeholder={placeholder}
        disabled={isBlocked}
        className="flex-1 resize-none bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 disabled:opacity-50 min-h-[42px] max-h-32"
        style={{ height: "auto" }}
        onInput={(e) => {
          const t = e.currentTarget
          t.style.height = "auto"
          t.style.height = Math.min(t.scrollHeight, 128) + "px"
        }}
      />
      <TooltipProvider>
        <Tooltip open={hasPendingUploads && !isLoading ? undefined : false}>
          <TooltipTrigger render={<span className="shrink-0 inline-flex" />}>
            <Button
              size="icon"
              onClick={handleSend}
              disabled={isBlocked || !value.trim()}
              className="rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>正在上传图片...</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
