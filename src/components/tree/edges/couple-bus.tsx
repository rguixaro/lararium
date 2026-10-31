import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from 'reactflow'
import { Unlink2 } from 'lucide-react'

import { useEdgeMenu } from './edge-menu-context'
import { cn } from '@/utils'

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function CoupleBusEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    style,
    markerEnd,
    markerStart,
  } = props
  const openEdgeMenu = useEdgeMenu()

  const parts = id.split(':')
  const unionId = parts[1] ?? id
  const isChildLeg = parts[2] === 'c'

  const isStraight = Math.abs(sourceX - targetX) < 1
  let path: string
  if (isStraight) {
    path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
  } else {
    const offset = 24 + (hashStr(unionId) % 3) * 12
    const centerY = sourceY + offset
    ;[path] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      centerY,
      borderRadius: 0,
    })
  }

  const buttonX = targetX
  const buttonY = sourceY + (targetY - sourceY) * 0.65

  return (
    <>
      <BaseEdge path={path} style={style} markerEnd={markerEnd} markerStart={markerStart} />
      {isChildLeg && openEdgeMenu && (
        <EdgeLabelRenderer>
          <div
            className="absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${buttonX}px, ${buttonY}px)`,
              pointerEvents: 'auto',
              zIndex: 1000,
              willChange: 'transform',
            }}
          >
            <button
              type="button"
              data-edge-menu-trigger="true"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                openEdgeMenu(id, e.clientX, e.clientY)
              }}
              onContextMenu={(e) => {
                e.stopPropagation()
                e.preventDefault()
                openEdgeMenu(id, e.clientX, e.clientY)
              }}
              aria-label="Detach child"
              className={cn(
                'flex h-4 w-8 cursor-pointer items-center justify-center',
                'text-ocean-300 border-ocean-200/60 bg-pale-ocean rounded-md border-2',
                'transition-[transform,scale] duration-200 hover:scale-110'
              )}
            >
              <Unlink2 size={9} strokeWidth={2.5} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
