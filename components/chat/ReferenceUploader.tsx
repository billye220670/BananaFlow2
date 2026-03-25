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
