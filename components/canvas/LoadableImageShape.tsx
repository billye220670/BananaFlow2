"use client"

import { useState, useEffect } from 'react'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  RecordProps,
  T,
  TLShape,
} from 'tldraw'

// ── 类型声明：扩展 tldraw 全局 shape props 映射 ──
declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    'loadable-image': {
      w: number
      h: number
      status: string  // 'loading' | 'ready'
      url: string
    }
  }
}

// ── Shape 类型定义 ──
export type LoadableImageShape = TLShape<'loadable-image'>

// ── 常量导出 ──
export const LOADABLE_IMAGE_TYPE = 'loadable-image' as const

// ── ShapeUtil 实现 ──
export class LoadableImageShapeUtil extends BaseBoxShapeUtil<LoadableImageShape> {
  static override type = 'loadable-image' as const

  static override props: RecordProps<LoadableImageShape> = {
    w: T.number,
    h: T.number,
    status: T.string,  // 'loading' | 'ready'
    url: T.string,
  }

  getDefaultProps(): LoadableImageShape['props'] {
    return {
      w: 400,
      h: 400,
      status: 'loading',
      url: '',
    }
  }

  component(shape: LoadableImageShape) {
    const { w, h, status, url } = shape.props
    
    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          overflow: 'hidden',
        }}
      >
        <LoadableImageContent
          width={w}
          height={h}
          status={status}
          url={url}
        />
      </HTMLContainer>
    )
  }

  indicator(shape: LoadableImageShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

// ── 内部渲染组件：管理图片加载状态 ──
function LoadableImageContent({
  width,
  height,
  status,
  url,
}: {
  width: number
  height: number
  status: string
  url: string
}) {
  // 追踪图片是否已加载完成
  const [imageLoaded, setImageLoaded] = useState(false)

  // 当 url 变化时重置加载状态
  useEffect(() => {
    if (status === 'ready' && url) {
      setImageLoaded(false)
    }
  }, [url, status])

  // Shimmer 样式
  const shimmerStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(to right, #e0e0e0 4%, #c0c0c0 25%, #e0e0e0 36%)',
    backgroundSize: '1200px 100%',
    animation: 'shimmer 2s infinite linear',
  }

  // 容器样式
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width,
    height,
    overflow: 'hidden',
  }

  // 图片样式
  const imageStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: imageLoaded ? 1 : 0,
    transition: 'opacity 0.3s ease-in-out',
  }

  // loading 状态：只显示 shimmer
  if (status === 'loading') {
    return (
      <div style={containerStyle}>
        <div style={shimmerStyle} />
      </div>
    )
  }

  // ready 状态：显示图片（可能带 shimmer 预加载）
  return (
    <div style={containerStyle}>
      {/* 预加载未完成时显示 shimmer */}
      {!imageLoaded && <div style={shimmerStyle} />}
      
      {/* 图片元素 - 预加载时隐藏，加载完成后淡入 */}
      {url && (
        <img
          src={url}
          alt=""
          style={imageStyle}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageLoaded(true)}  // 即使加载失败也移除 shimmer
          draggable={false}
        />
      )}
    </div>
  )
}
