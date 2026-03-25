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
