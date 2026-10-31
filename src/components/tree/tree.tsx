'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import ReactFlow, { Background, ConnectionLineType } from 'reactflow'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { LoaderIcon } from 'lucide-react'

import {
  useTreeState,
  useNodeCreateForm,
  useEdgeOperations,
  useNodeOperations,
  useNodeUpdateForm,
} from '@/hooks'

import {
  TreeOverlay,
  NodeInfoModal,
  NodeCreateModal,
  UnionPickModal,
  UnionEditModal,
  ViewingOptions,
} from '@/components/tree/modal'
import { EdgeContextMenu } from '@/components/tree/context'
import { EdgeMenuProvider, StyledEdge } from '@/components/tree/edges'
import { REACT_FLOW_NODE_TYPES, REACT_FLOW_EDGE_TYPES } from '@/components/tree/react-flow-types'
import { useTreeImageExport } from '@/components/tree/export'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@/ui'

import { Tree, TreeEdge, TreeNode, Union } from '@/types'

import { ocean } from '@/styles/colors'

import { positionCoupleNodes } from '@/components/tree/layout'

function getTimestampedTreeExportFilename(slug: string) {
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace(/[-:]/g, '')
    .replace('T', '-')

  return `${slug}-tree-${timestamp}.png`
}

interface StyledTreeProps {
  readonly: boolean
  canExportGallery: boolean
  tree: Tree
  nodes: TreeNode[]
  edges: TreeEdge[]
  unions: Union[]
}

export default function StyledTree({
  readonly,
  canExportGallery,
  tree,
  nodes,
  edges,
  unions,
}: StyledTreeProps) {
  const t_common = useTranslations('common')
  const t_toasts = useTranslations('toasts')
  const t_treeInfo = useTranslations('tree-info')
  const t_errors = useTranslations('errors')
  const locale = useLocale()
  const searchParams = useSearchParams()
  const treeContainerRef = useRef<HTMLDivElement | null>(null)
  const autoExportStarted = useRef(false)

  const treeState = useTreeState(tree, nodes, edges, unions, {
    initialGenerationsUp: 2,
    initialGenerationsDown: 2,
    enableProgressiveDisclosure: true,
  })

  const nodeCreateForm = useNodeCreateForm(tree, treeState.handleNodeCreated)
  const nodeUpdateForm = useNodeUpdateForm(tree, treeState.selectedNode, treeState.dismissModal)

  const edgeOperations = useEdgeOperations(
    tree,
    edges,
    unions,
    nodes,
    treeState.treeEdges,
    treeState.setTreeEdges,
    treeState.onUnionPickNeeded,
    treeState.onSpouseUnionConfirmNeeded
  )
  const nodeOperations = useNodeOperations(tree, nodes)

  const { setTreeNodes } = treeState
  const handleNodeDrag = useCallback(() => {
    setTreeNodes((nds) => positionCoupleNodes(nds))
  }, [setTreeNodes])
  const exportMetadata = useMemo(() => {
    const generatedDate = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date())

    return {
      familyName: tree.name,
      stats: [t_treeInfo('export-image-stat-members', { count: nodes.length })],
      generatedLabel: t_treeInfo('export-image-generated', { date: generatedDate }),
      footerLabel: '',
      footerDomain: '',
    }
  }, [locale, nodes.length, t_treeInfo, tree.name])
  const { isExporting, exportTreeImage } = useTreeImageExport(
    treeContainerRef,
    getTimestampedTreeExportFilename(tree.slug),
    {
      prepare: treeState.prepareExportView,
      metadata: exportMetadata,
    }
  )

  const handleExportImage = useCallback(async () => {
    const result = await exportTreeImage()
    if (result.error) {
      toast.error(t_errors(result.message || 'error'))
      return
    }

    toast.success(t_treeInfo('export-image-success'))
  }, [exportTreeImage, t_errors, t_treeInfo])

  useEffect(() => {
    if (searchParams.get('export') !== '1' || autoExportStarted.current) return
    autoExportStarted.current = true

    const timeout = window.setTimeout(() => {
      void handleExportImage()
    }, 500)

    return () => window.clearTimeout(timeout)
  }, [handleExportImage, searchParams])

  return (
    <EdgeMenuProvider value={treeState.toggleEdgeMenu}>
      <div ref={treeContainerRef} className="relative h-full w-full overflow-hidden">
        <TreeOverlay
          readonly={readonly}
          tree={tree}
          viewingOptionsEnabled={treeState.viewingOptionsEnabled}
          onCreateNode={treeState.createNode}
          onResetView={treeState.resetView}
          onFocus={treeState.setViewingOptionsShown}
          onExportImage={handleExportImage}
          exportingImage={isExporting}
        />
        {isExporting && (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-busy="true"
            className="bg-ocean-700/70 fixed inset-0 z-9999 flex cursor-wait items-center justify-center p-4 backdrop-blur-md"
          >
            <div className="bg-pale-ocean text-ocean-400 shadow-center-lg ring-ocean-100/60 flex max-w-sm flex-col items-center rounded-xl p-6 text-center ring-1">
              <div className="bg-ocean-50 text-ocean-300 mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                <LoaderIcon size={26} className="animate-spin" />
              </div>
              <div className="text-lg font-bold">{t_treeInfo('export-image-progress')}</div>
              <p className="mt-2 text-sm opacity-75">
                {t_treeInfo('export-image-progress-description')}
              </p>
            </div>
          </div>
        )}
        <ViewingOptions
          enabled={treeState.viewingOptionsEnabled}
          visible={treeState.viewingOptionsShown}
          nodes={nodes}
          visibleNodes={treeState.treeNodes}
          showAllNodes={treeState.showAllNodes}
          adjustGenerations={treeState.adjustGenerations}
          generationsUp={treeState.generationsUp}
          generationsDown={treeState.generationsDown}
          toggleShowAll={treeState.toggleShowAll}
          focusOnNode={treeState.focusOnNode}
          totalNodeCount={nodes.length}
        />
        <NodeInfoModal
          readonly={readonly}
          canExportGallery={canExportGallery}
          showModal={treeState.displayInfo}
          treeSlug={tree.slug}
          node={treeState.selectedNode}
          nodes={nodes}
          unions={unions}
          form={nodeUpdateForm.form}
          onUpdate={nodeUpdateForm.onSubmit}
          onClose={treeState.dismissModal}
          onDelete={() => {
            if (treeState.selectedNode?.id) {
              treeState.showDeleteConfirmation(treeState.selectedNode.id)
            }
          }}
        />
        <NodeCreateModal
          showModal={treeState.displayCreate}
          form={nodeCreateForm.form}
          onCreate={nodeCreateForm.onSubmit}
          onClose={treeState.dismissModal}
        />
        <ReactFlow
          dir="ltr"
          nodes={treeState.treeNodes}
          edges={treeState.treeEdges}
          onNodesChange={treeState.onTreeNodesChange}
          onEdgesChange={treeState.onTreeEdgesChange}
          nodeTypes={REACT_FLOW_NODE_TYPES}
          edgeTypes={REACT_FLOW_EDGE_TYPES}
          // suppress React Flow's 002 dev-warning; HMR swaps the module exports
          onError={(code, message) => {
            if (code === '002') return
            console.warn(`[React Flow]: ${message}`)
          }}
          onConnect={readonly ? undefined : edgeOperations.onConnect}
          onPaneClick={treeState.collapseAllNodes}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionLineComponent={StyledEdge}
          panOnDrag
          zoomOnScroll
          deleteKeyCode={null}
          nodesDraggable={!readonly}
          snapToGrid
          snapGrid={[12, 12]}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDrag}
          nodesConnectable={!readonly}
          edgesFocusable={false}
          className={'bg-ocean-50 h-full w-full shadow-inner'}
          onlyRenderVisibleElements={false}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.5}
          maxZoom={2}
        >
          <Background gap={24} size={1} color={ocean[300]} />
        </ReactFlow>
        <EdgeContextMenu
          visible={treeState.edgeContextMenu.visible && !readonly}
          x={treeState.edgeContextMenu.x}
          y={treeState.edgeContextMenu.y}
          edgeId={treeState.edgeContextMenu.edgeId}
          onDelete={() => {
            if (treeState.edgeContextMenu.edgeId) {
              const edgeId = treeState.edgeContextMenu.edgeId
              treeState.closeEdgeContextMenu()
              treeState.showEdgeDeleteConfirmation(edgeId)
            }
          }}
          onAddChild={(() => {
            const edgeId = treeState.edgeContextMenu.edgeId
            if (!edgeId) return undefined
            if (edgeId.startsWith('ue:')) {
              const parts = edgeId.split(':')
              const kind = parts[2]
              if (kind === 'a' || kind === 'b' || kind === 's') {
                const unionId = parts[1]
                return () => {
                  treeState.closeEdgeContextMenu()
                  treeState.createChildForUnion(unionId)
                }
              }
              return undefined
            }
            const spouseEdge = edges.find((e) => e.id === edgeId && e.type === 'SPOUSE')
            if (!spouseEdge) return undefined
            const union = unions.find(
              (u) =>
                (u.spouseAId === spouseEdge.fromNodeId && u.spouseBId === spouseEdge.toNodeId) ||
                (u.spouseAId === spouseEdge.toNodeId && u.spouseBId === spouseEdge.fromNodeId)
            )
            if (!union) return undefined
            return () => {
              treeState.closeEdgeContextMenu()
              treeState.createChildForUnion(union.id)
            }
          })()}
          onEditUnion={(() => {
            const edgeId = treeState.edgeContextMenu.edgeId
            if (!edgeId) return undefined
            if (edgeId.startsWith('ue:')) {
              const parts = edgeId.split(':')
              const kind = parts[2]
              if (kind !== 'a' && kind !== 'b' && kind !== 's') return undefined
              const unionId = parts[1]
              return () => {
                treeState.closeEdgeContextMenu()
                treeState.openEditUnion(unionId)
              }
            }
            const spouseEdge = edges.find((e) => e.id === edgeId && e.type === 'SPOUSE')
            if (!spouseEdge) return undefined
            const union = unions.find(
              (u) =>
                (u.spouseAId === spouseEdge.fromNodeId && u.spouseBId === spouseEdge.toNodeId) ||
                (u.spouseAId === spouseEdge.toNodeId && u.spouseBId === spouseEdge.fromNodeId)
            )
            if (!union) return undefined
            return () => {
              treeState.closeEdgeContextMenu()
              treeState.openEditUnion(union.id)
            }
          })()}
          onClose={treeState.closeEdgeContextMenu}
        />
        <UnionEditModal
          open={treeState.editingUnion !== null}
          union={treeState.editingUnion}
          nodes={nodes}
          onSave={treeState.applyEditUnion}
          onCancel={treeState.dismissEditUnion}
        />
        <UnionEditModal
          open={treeState.pendingSpouseUnion !== null}
          mode="create"
          union={null}
          createSeed={treeState.pendingSpouseUnion}
          nodes={nodes}
          onSave={treeState.applySpouseUnionConfirm}
          onCancel={treeState.dismissSpouseUnionConfirm}
        />
        <UnionPickModal
          open={treeState.unionPick !== null}
          parentId={treeState.unionPick?.parentId ?? null}
          childId={treeState.unionPick?.childId ?? null}
          candidates={treeState.unionPick?.candidates ?? []}
          nodes={nodes}
          onPick={(unionId) => treeState.applyUnionPick(unionId)}
          onCancel={treeState.dismissUnionPick}
        />
        {(() => {
          const edgeId = treeState.confirmEdgeDelete.edgeId
          if (!edgeId) {
            return (
              <Dialog
                open={treeState.confirmEdgeDelete.open}
                onOpenChange={treeState.closeEdgeDeleteConfirmation}
              >
                <DialogContent className="text-ocean-400" />
              </Dialog>
            )
          }

          const isCoupleLeg = edgeId.startsWith('ue:')
          const parts = edgeId.split(':')
          const dbEdge = edges.find((e) => e.id === edgeId)

          const isUnion =
            (isCoupleLeg && (parts[2] === 'a' || parts[2] === 'b' || parts[2] === 's')) ||
            dbEdge?.type === 'SPOUSE'

          const unionId = isCoupleLeg
            ? parts[1]
            : isUnion && dbEdge
              ? unions.find(
                  (u) =>
                    (u.spouseAId === dbEdge.fromNodeId && u.spouseBId === dbEdge.toNodeId) ||
                    (u.spouseAId === dbEdge.toNodeId && u.spouseBId === dbEdge.fromNodeId)
                )?.id
              : undefined

          const childrenCount = unionId
            ? nodes.filter((n) => n.childOfUnionId === unionId).length
            : 0

          return (
            <Dialog
              open={treeState.confirmEdgeDelete.open}
              onOpenChange={treeState.closeEdgeDeleteConfirmation}
            >
              <DialogContent className="text-ocean-400">
                <DialogHeader>
                  <DialogTitle>
                    {isUnion ? t_toasts('union-delete-title') : t_toasts('child-detach-title')}
                  </DialogTitle>
                  <DialogDescription className="my-2">
                    {isUnion
                      ? t_toasts('union-delete-description')
                      : t_toasts('child-detach-description')}
                  </DialogDescription>
                  {isUnion && childrenCount > 0 && (
                    <DialogDescription className="my-2">
                      {t_toasts('union-delete-children-warning', { count: childrenCount })}
                    </DialogDescription>
                  )}
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => treeState.closeEdgeDeleteConfirmation()}
                    disabled={treeState.loading}
                  >
                    {t_common('cancel')}
                  </Button>
                  <Button
                    variant="default"
                    className="font-bold"
                    onClick={() => {
                      if (treeState.confirmEdgeDelete.edgeId) {
                        treeState.withAsync(() =>
                          edgeOperations.deleteEdge(
                            treeState.confirmEdgeDelete.edgeId!,
                            treeState.closeEdgeDeleteConfirmation
                          )
                        )
                      }
                    }}
                    disabled={treeState.loading}
                  >
                    {treeState.loading ? t_common('deleting') : t_common('confirm')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        })()}
        <Dialog
          open={treeState.confirmDelete.open}
          onOpenChange={treeState.closeDeleteConfirmation}
        >
          <DialogContent className="text-ocean-400">
            <DialogHeader>
              <DialogTitle>{t_toasts('node-delete')}</DialogTitle>
              <DialogDescription className="my-2">
                {t_toasts('node-delete-confirmation')}
              </DialogDescription>
              <DialogDescription className="my-2">
                {t_toasts('node-delete-confirm-description')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => treeState.closeDeleteConfirmation()}
                disabled={treeState.loading}
              >
                {t_common('cancel')}
              </Button>
              <Button
                variant="default"
                className="font-bold"
                onClick={() => {
                  if (treeState.confirmDelete.nodeId) {
                    treeState.withAsync(() =>
                      nodeOperations.deleteNode(
                        treeState.confirmDelete.nodeId!,
                        treeState.closeDeleteConfirmation
                      )
                    )
                  }
                }}
                disabled={treeState.loading}
              >
                {treeState.loading ? t_common('deleting') : t_common('confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </EdgeMenuProvider>
  )
}
