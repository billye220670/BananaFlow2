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
