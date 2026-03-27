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
            ? "bg-blue-500 text-white rounded-br-sm"
            : "bg-gray-100 text-gray-800 rounded-bl-sm"
        )}
      >
        {message.loading ? (
          <div className="space-y-2">
            <div className="w-[240px] h-[160px] bg-gray-200 rounded-lg animate-pulse" />
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-xs text-gray-500">正在生成...</span>
            </div>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
            {message.imageUrl && (
              <img
                src={message.imageUrl}
                alt="Generated result"
                className="mt-2 rounded-lg max-w-full"
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
