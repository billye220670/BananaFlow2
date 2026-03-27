"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

// ── Custom Tooltip - Pure React Implementation ────────────────────────────────

interface CustomTooltipProps {
  children: React.ReactNode
  content: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}

export function CustomTooltip({ children, content, side = 'top', delay = 500 }: CustomTooltipProps) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [shouldRender, setShouldRender] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return { x: 0, y: 0 }
    const rect = triggerRef.current.getBoundingClientRect()
    let x = 0, y = 0

    switch (side) {
      case 'top':
        x = rect.left + rect.width / 2
        y = rect.top - 8
        break
      case 'bottom':
        x = rect.left + rect.width / 2
        y = rect.bottom + 8
        break
      case 'left':
        x = rect.left - 8
        y = rect.top + rect.height / 2
        break
      case 'right':
        x = rect.right + 8
        y = rect.top + rect.height / 2
        break
    }
    return { x, y }
  }, [side])

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      const pos = calculatePosition()
      setPosition(pos)
      setShouldRender(true)
      requestAnimationFrame(() => setVisible(true))
    }, delay)
  }, [delay, calculatePosition])

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setVisible(false)
    // Wait for fade-out animation to complete before removing from DOM
    setTimeout(() => setShouldRender(false), 150)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const getTransform = () => {
    switch (side) {
      case 'top':
        return 'translate(-50%, -100%)'
      case 'bottom':
        return 'translate(-50%, 0)'
      case 'left':
        return 'translate(-100%, -50%)'
      case 'right':
        return 'translate(0, -50%)'
    }
  }

  return (
    <div ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} className="inline-flex">
      {children}
      {shouldRender && (
        <div
          className={cn(
            "fixed z-[100] px-2.5 py-1.5 bg-zinc-900 text-white text-xs rounded-md whitespace-nowrap pointer-events-none transition-opacity duration-150",
            visible ? "opacity-100" : "opacity-0"
          )}
          style={{
            left: position.x,
            top: position.y,
            transform: getTransform(),
          }}
        >
          {content}
        </div>
      )}
    </div>
  )
}

// ── Base UI Tooltip Components ────────────────────────────────────────────────

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
