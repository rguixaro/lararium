'use client'

import { RefObject, useCallback, useState } from 'react'
import { toBlob } from 'html-to-image'

import { waitForTreeExportAssets } from './assets'

type RestoreExportView = () => Promise<void> | void
type PrepareExportView = () => Promise<RestoreExportView | void> | RestoreExportView | void

export interface TreeImageExportMetadata {
  familyName: string
  stats: string[]
  generatedLabel: string
  footerLabel: string
  footerDomain: string
}

interface TreeImageExportOptions {
  prepare?: PrepareExportView
  metadata?: TreeImageExportMetadata
}

const waitForFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const MAX_EXPORT_PIXELS = 28_000_000
const FONT_FAMILY = 'Outfit, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

const EXPORT_COLORS = {
  paper: '#ffffff',
  tree: '#ffffff',
  border: '#000000',
  text: '#000000',
  muted: '#000000',
  rule: '#000000',
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function getPixelRatio(element: HTMLElement) {
  const width = element.offsetWidth
  const height = element.offsetHeight
  const adaptiveRatio = Math.sqrt(MAX_EXPORT_PIXELS / Math.max(width * height, 1))

  return Math.max(1.25, Math.min(3, adaptiveRatio))
}

function loadBlobImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Unable to load exported tree image'))
    }
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function setCanvasFont(
  context: CanvasRenderingContext2D,
  weight: number,
  size: number,
  lineHeight = 1.2
) {
  context.font = `${weight} ${Math.round(size)}px/${lineHeight} ${FONT_FAMILY}`
}

function drawTruncatedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
) {
  if (context.measureText(text).width <= maxWidth) {
    context.fillText(text, x, y)
    return
  }

  const suffix = '...'
  let start = 0
  let end = text.length

  while (start < end) {
    const middle = Math.ceil((start + end) / 2)
    const candidate = `${text.slice(0, middle).trimEnd()}${suffix}`
    if (context.measureText(candidate).width <= maxWidth) start = middle
    else end = middle - 1
  }

  context.fillText(`${text.slice(0, start).trimEnd()}${suffix}`, x, y)
}

async function addExportFrame(
  treeBlob: Blob,
  pixelRatio: number,
  metadata?: TreeImageExportMetadata
) {
  if (!metadata) return treeBlob

  const treeImage = await loadBlobImage(treeBlob)
  const scale = pixelRatio
  const framePadding = Math.round(
    clamp(Math.min(treeImage.width, treeImage.height) * 0.075, 126 * scale, 182 * scale)
  )
  const sideBorder = framePadding
  const headerHeight = framePadding
  const hasFooter = !!(metadata.footerLabel || metadata.footerDomain)
  const footerHeight = hasFooter ? framePadding : Math.round(framePadding * 0.4)
  const canvas = document.createElement('canvas')

  canvas.width = treeImage.width + sideBorder * 2
  canvas.height = treeImage.height + headerHeight + footerHeight

  const context = canvas.getContext('2d')
  if (!context) return treeBlob

  const outerRadius = Math.round(
    clamp(Math.min(canvas.width, canvas.height) * 0.07, 72 * scale, 180 * scale)
  )
  context.save()
  context.beginPath()
  context.roundRect(0, 0, canvas.width, canvas.height, outerRadius)
  context.clip()

  context.fillStyle = EXPORT_COLORS.paper
  context.fillRect(0, 0, canvas.width, canvas.height)

  const treeX = sideBorder
  const treeY = headerHeight
  const treeRadius = Math.max(100, outerRadius - framePadding)

  context.fillStyle = EXPORT_COLORS.tree
  context.beginPath()
  context.roundRect(treeX, treeY, treeImage.width, treeImage.height, treeRadius)
  context.fill()
  context.save()
  context.beginPath()
  context.roundRect(treeX, treeY, treeImage.width, treeImage.height, treeRadius)
  context.clip()
  context.drawImage(treeImage, treeX, treeY)
  context.restore()

  const ruleHeight = Math.max(1, Math.round(scale))
  context.strokeStyle = EXPORT_COLORS.rule
  context.lineWidth = ruleHeight
  context.beginPath()
  context.roundRect(
    treeX + ruleHeight / 2,
    treeY + ruleHeight / 2,
    treeImage.width - ruleHeight,
    treeImage.height - ruleHeight,
    treeRadius
  )
  context.stroke()

  const contentX = sideBorder + Math.round(32 * scale)
  const contentRight = canvas.width - sideBorder - Math.round(32 * scale)
  const contentCenter = canvas.width / 2
  const contentWidth = contentRight - contentX
  const generatedWidth = Math.round(Math.min(contentWidth * 0.32, 330 * scale))
  const titleWidth = Math.max(
    contentWidth * 0.42,
    contentWidth - generatedWidth * 2 - Math.round(36 * scale)
  )
  const titleSize = 40 * scale
  const titleY = Math.round(headerHeight / 2 + titleSize * 0.32)

  context.textBaseline = 'alphabetic'
  context.fillStyle = EXPORT_COLORS.text
  context.textAlign = 'center'
  setCanvasFont(context, 800, titleSize, 1.1)
  drawTruncatedText(context, metadata.familyName, contentCenter, titleY, titleWidth)

  context.fillStyle = EXPORT_COLORS.muted
  setCanvasFont(context, 600, 18 * scale)
  drawTruncatedText(
    context,
    metadata.stats.join(' / '),
    contentCenter,
    titleY + Math.round(32 * scale),
    contentWidth
  )

  context.textAlign = 'right'
  context.fillStyle = EXPORT_COLORS.muted
  setCanvasFont(context, 600, 16 * scale)
  drawTruncatedText(context, metadata.generatedLabel, contentRight, titleY, generatedWidth)

  if (hasFooter) {
    context.textAlign = 'center'
    const footerStartY = treeY + treeImage.height + Math.round(footerHeight * 0.42)
    context.fillStyle = EXPORT_COLORS.muted
    setCanvasFont(context, 600, 16 * scale)
    drawTruncatedText(context, metadata.footerLabel, contentCenter, footerStartY, contentWidth)

    context.fillStyle = EXPORT_COLORS.text
    setCanvasFont(context, 800, 24 * scale, 1.1)
    drawTruncatedText(
      context,
      metadata.footerDomain,
      contentCenter,
      footerStartY + Math.round(34 * scale),
      contentWidth
    )

  }

  context.restore()

  return (await canvasToBlob(canvas)) ?? treeBlob
}

function prepareFullGraphCapture(element: HTMLElement): () => void {
  const viewport = element.querySelector<HTMLElement>('.react-flow__viewport')
  const graphNodes = Array.from(element.querySelectorAll<HTMLElement>('.react-flow__node'))
  if (!viewport || graphNodes.length === 0) return () => undefined

  const elementRect = element.getBoundingClientRect()
  const bounds = graphNodes.reduce(
    (acc, node) => {
      const rect = node.getBoundingClientRect()
      return {
        left: Math.min(acc.left, rect.left - elementRect.left),
        top: Math.min(acc.top, rect.top - elementRect.top),
        right: Math.max(acc.right, rect.right - elementRect.left),
        bottom: Math.max(acc.bottom, rect.bottom - elementRect.top),
      }
    },
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    }
  )

  const padding = 120
  const width = Math.ceil(bounds.right - bounds.left + padding * 2)
  const height = Math.ceil(bounds.bottom - bounds.top + padding * 2)
  const shiftX = Math.round(-bounds.left + padding)
  const shiftY = Math.round(-bounds.top + padding)

  const previousElementWidth = element.style.width
  const previousElementHeight = element.style.height
  const previousElementOverflow = element.style.overflow
  const previousViewportTransform = viewport.style.transform
  const previousViewportTransformOrigin = viewport.style.transformOrigin

  element.style.width = `${width}px`
  element.style.height = `${height}px`
  element.style.overflow = 'hidden'
  viewport.style.transformOrigin = '0 0'
  viewport.style.transform = `translate(${shiftX}px, ${shiftY}px) ${previousViewportTransform}`

  return () => {
    element.style.width = previousElementWidth
    element.style.height = previousElementHeight
    element.style.overflow = previousElementOverflow
    viewport.style.transform = previousViewportTransform
    viewport.style.transformOrigin = previousViewportTransformOrigin
  }
}

export function useTreeImageExport(
  containerRef: RefObject<HTMLElement | null>,
  filename: string,
  options: TreeImageExportOptions = {}
) {
  const [isExporting, setIsExporting] = useState(false)
  const { prepare, metadata } = options

  const exportTreeImage = useCallback(async () => {
    setIsExporting(true)
    await waitForFrame()

    let restore: RestoreExportView | void = undefined
    let restoreGraphCapture: (() => void) | void = undefined

    try {
      restore = await prepare?.()
      await waitForFrame()
      await waitForFrame()

      const element = containerRef.current?.querySelector<HTMLElement>('.react-flow')
      if (!element) return { error: true as const, message: 'error' }

      await waitForTreeExportAssets(element)
      element.classList.add('tree-exporting')
      restoreGraphCapture = prepareFullGraphCapture(element)
      await waitForFrame()

      const pixelRatio = getPixelRatio(element)
      const blob = await toBlob(element, {
        cacheBust: true,
        pixelRatio,
        backgroundColor: '#ffffff',
      })

      if (!blob) return { error: true as const, message: 'error' }

      const framedBlob = await addExportFrame(blob, pixelRatio, metadata)
      downloadBlob(framedBlob, filename)
      return { error: false as const }
    } catch {
      return { error: true as const, message: 'error' }
    } finally {
      restoreGraphCapture?.()
      containerRef.current
        ?.querySelector<HTMLElement>('.react-flow')
        ?.classList.remove('tree-exporting')
      await restore?.()
      setIsExporting(false)
    }
  }, [containerRef, filename, metadata, prepare])

  return {
    isExporting,
    exportTreeImage,
  }
}
