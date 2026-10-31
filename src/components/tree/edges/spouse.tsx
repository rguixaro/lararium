import { BaseEdge, EdgeLabelRenderer, EdgeProps } from 'reactflow'
import { Plus } from 'lucide-react'

import { useEdgeMenu } from './edge-menu-context'
import { cn } from '@/utils'

export function SpouseEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, style, markerStart, markerEnd, data } = props
  const openEdgeMenu = useEdgeMenu()

  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
  const buttonX = (sourceX + targetX) / 2
  const buttonY = (sourceY + targetY) / 2
  const showButton =
    typeof data?.showButton === 'boolean' ? data.showButton : Math.abs(targetX - sourceX) >= 56

  return (
    <>
      <BaseEdge path={path} style={style} markerStart={markerStart} markerEnd={markerEnd} />
      {openEdgeMenu && showButton && (
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
              aria-label="Open marriage menu"
              className={cn(
                'flex h-6 w-12 cursor-pointer items-center justify-center',
                'text-ocean-300 border-ocean-200/60 bg-pale-ocean shadow-center-sm rounded-lg border-2',
                'transition-[transform,scale] duration-200 hover:scale-110'
              )}
            >
              <Plus size={14} strokeWidth={2.5} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
