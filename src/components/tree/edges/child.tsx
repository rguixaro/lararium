import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from 'reactflow'
import { Unlink2 } from 'lucide-react'

import { useEdgeMenu } from './edge-menu-context'
import { cn } from '@/utils'

export function ChildEdge(props: EdgeProps) {
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

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 0,
  })

  return (
    <>
      <BaseEdge path={path} style={style} markerEnd={markerEnd} markerStart={markerStart} />
      {openEdgeMenu && (
        <EdgeLabelRenderer>
          <div
            className="absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
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
              aria-label="Detach relation"
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
