'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  useReactFlow,
  useNodesState,
  useEdgesState,
  Node as FlowNode,
  Edge as FlowEdge,
} from 'reactflow'

import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { attachChildToUnion, createTreeEdge, createUnion, updateUnion } from '@/server/actions'
import { TreeNode, TreeEdge, Tree, Union } from '@/types'
import type { UnionPickRequest } from '@/hooks/use-edge-operations'

import {
  createTreeLayout,
  computedLayout,
  positionCoupleNodes,
  getVisibleNodesAndEdges,
  isCoupleId,
} from '@/components/tree/layout'
import { StyledNode, VoidNode } from '@/components/tree/nodes'
import { CoupleBusEdge } from '@/components/tree/edges'

import { ocean } from '@/styles/colors'

interface UseTreeStateOptions {
  initialGenerationsUp?: number
  initialGenerationsDown?: number
  enableProgressiveDisclosure?: boolean
}

const waitForFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

async function waitForRenderedPeople(
  getPeopleCount: () => number,
  expectedPeopleCount: number
): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt++) {
    if (getPeopleCount() >= expectedPeopleCount) return
    await waitForFrame()
  }
}

export function useTreeState(
  tree: Tree,
  allNodes: TreeNode[],
  allEdges: TreeEdge[],
  allUnions: Union[],
  options: UseTreeStateOptions = {}
) {
  const {
    initialGenerationsUp = 2,
    initialGenerationsDown = 2,
    enableProgressiveDisclosure = true,
  } = options

  /**
   * Progressive disclosure state
   */
  const router = useRouter()

  const [viewingOptionsShown, setViewingOptionsShown] = useState(false)
  const [focusOnNode, setFocusOnNode] = useState<string | null>(null)
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null)
  const [generationsUp, setGenerationsUp] = useState(initialGenerationsUp)
  const [generationsDown, setGenerationsDown] = useState(initialGenerationsDown)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [showAllNodes, setShowAllNodes] = useState(true)

  const viewingOptionsEnabled =
    enableProgressiveDisclosure && tree.type !== 'ANIMAL' && allNodes.length > 6

  /**
   * Calculate visible nodes based on progressive disclosure settings
   */
  const { nodes, edges, unions, hiddenCounts } = useMemo(() => {
    if (!viewingOptionsEnabled || showAllNodes || !focusOnNode) {
      return {
        nodes: allNodes,
        edges: allEdges,
        unions: allUnions,
        hiddenCounts: new Map<string, { parents: number; children: number }>(),
      }
    }

    return getVisibleNodesAndEdges(
      allNodes,
      allEdges,
      allUnions,
      focusOnNode,
      generationsUp,
      generationsDown,
      expandedNodes
    )
  }, [
    allNodes,
    allEdges,
    allUnions,
    focusOnNode,
    generationsUp,
    generationsDown,
    expandedNodes,
    showAllNodes,
    viewingOptionsEnabled,
  ])

  /**
   * Utility states
   */
  const [loading, setLoading] = useState<boolean>(false)

  /**
   * Modals state
   */
  const [displayCreate, setDisplayCreate] = useState(false)
  const [displayInfo, setDisplayInfo] = useState(false)

  const [selectedNode, selectNode] = useState<TreeNode | null>(null)

  /**
   * Key to trigger collapse of all expanded nodes
   */
  const [collapseKey, setCollapseKey] = useState(0)

  /**
   * Edge context menu state
   */
  const [edgeContextMenu, setEdgeContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    edgeId: string | null
  }>({ visible: false, x: 0, y: 0, edgeId: null })

  /**
   * Confirmation dialog state
   */
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean
    nodeId: string | null
  }>({ open: false, nodeId: null })

  // edgeId stays populated while closing so the dialog has a stable target
  const [confirmEdgeDelete, setConfirmEdgeDelete] = useState<{
    open: boolean
    edgeId: string | null
  }>({ open: false, edgeId: null })

  const [unionPick, setUnionPick] = useState<UnionPickRequest | null>(null)
  const onUnionPickNeeded = useCallback((req: UnionPickRequest) => setUnionPick(req), [])
  const dismissUnionPick = useCallback(() => setUnionPick(null), [])
  const t_errors_unionPick = useTranslations('errors')
  const applyUnionPick = useCallback(
    async (unionId: string) => {
      if (!unionPick) return
      const { error, message } = await attachChildToUnion({
        treeId: tree.id,
        unionId,
        childNodeId: unionPick.childId,
      })
      if (error) toast.error(t_errors_unionPick(message || 'error'))
      else router.refresh()
      setUnionPick(null)
    },
    [unionPick, tree.id, router, t_errors_unionPick]
  )

  const [pendingUnionAttach, setPendingUnionAttach] = useState<string | null>(null)

  const [editingUnion, setEditingUnion] = useState<Union | null>(null)
  const openEditUnion = useCallback(
    (unionId: string) => {
      const u = allUnions.find((x) => x.id === unionId)
      if (u) setEditingUnion(u)
    },
    [allUnions]
  )
  const dismissEditUnion = useCallback(() => setEditingUnion(null), [])
  const applyEditUnion = useCallback(
    async (values: {
      spouseAId: string
      spouseBId: string | null
      marriedAt: Date | null
      divorcedAt: Date | null
      place: string | null
    }) => {
      if (!editingUnion) return
      const { error, message } = await updateUnion({
        id: editingUnion.id,
        treeId: tree.id,
        spouseAId: values.spouseAId,
        spouseBId: values.spouseBId,
        marriedAt: values.marriedAt,
        divorcedAt: values.divorcedAt,
        place: values.place,
      })
      if (error) toast.error(t_errors_unionPick(message || 'error'))
      else router.refresh()
      setEditingUnion(null)
    },
    [editingUnion, tree.id, router, t_errors_unionPick]
  )

  // SPOUSE-edge persistence is deferred until the user confirms the union
  // modal so dates and place can be captured up-front
  const [pendingSpouseUnion, setPendingSpouseUnion] = useState<{
    spouseAId: string
    spouseBId: string
  } | null>(null)
  const onSpouseUnionConfirmNeeded = useCallback(
    (req: { spouseAId: string; spouseBId: string }) => setPendingSpouseUnion(req),
    []
  )
  const dismissSpouseUnionConfirm = useCallback(() => setPendingSpouseUnion(null), [])
  const t_toasts_spouseCreate = useTranslations('toasts')
  const applySpouseUnionConfirm = useCallback(
    async (values: {
      spouseAId: string
      spouseBId: string | null
      marriedAt: Date | null
      divorcedAt: Date | null
      place: string | null
    }) => {
      if (!pendingSpouseUnion) return
      const edgeRes = await createTreeEdge({
        treeId: tree.id,
        fromNodeId: pendingSpouseUnion.spouseAId,
        toNodeId: pendingSpouseUnion.spouseBId,
        type: 'SPOUSE',
      })
      if (edgeRes.error) {
        toast.error(t_errors_unionPick(edgeRes.message || 'error'))
        setPendingSpouseUnion(null)
        return
      }

      const unionRes = await createUnion({
        treeId: tree.id,
        spouseAId: values.spouseAId,
        spouseBId: values.spouseBId ?? undefined,
        marriedAt: values.marriedAt,
        divorcedAt: values.divorcedAt,
        place: values.place,
      })
      if (unionRes.error) {
        toast.error(t_errors_unionPick(unionRes.message || 'error'))
      } else {
        toast.success(t_toasts_spouseCreate('edge-created'))
      }
      router.refresh()
      setPendingSpouseUnion(null)
    },
    [pendingSpouseUnion, tree.id, router, t_errors_unionPick, t_toasts_spouseCreate]
  )

  const reactFlowInstance = useReactFlow()

  /**
   * Node types mapping
   * @return {object} Node types mapping
   */
  const nodeTypes = useMemo(
    () => ({
      DEFAULT: StyledNode,
      COUPLE: VoidNode,
    }),
    []
  )

  const edgeTypes = useMemo(() => ({ COUPLE_BUS: CoupleBusEdge }), [])

  /**
   * Reset the view to fit all nodes
   */
  const resetView = () => reactFlowInstance.fitView({ padding: 0.2 })

  /**
   * Handle node info click event
   * @param node {TreeNode} Node that was clicked
   */
  const onInfo = useCallback((node: TreeNode) => {
    selectNode(node)
    setDisplayInfo(true)
  }, [])

  /**
   * Handle node expand/collapse from node component
   */
  const onExpand = useCallback(
    (nodeId: string, expanded: boolean) =>
      setTimeout(() => {
        setExpandedNodes((_) => {
          const next = new Set<string>()
          if (expanded) next.add(nodeId)
          return next
        })
      }, 0),
    []
  )

  // camera centering is driven by the effect that watches `treeNodes`,
  // which avoids racing the layout pipeline
  const setFocus = useCallback((nodeId: string) => {
    setFocusOnNode(nodeId)
    setShowAllNodes(false)
    setExpandedNodes(new Set())
    setViewingOptionsShown(true)
    setPendingFocusNodeId(nodeId)
  }, [])

  /**
   * Adjust generation depth
   */
  const adjustGenerations = useCallback((direction: 'up' | 'down', delta: number) => {
    if (direction === 'up') {
      setGenerationsUp((prev) => Math.max(1, Math.min(prev + delta, 10)))
    } else {
      setGenerationsDown((prev) => Math.max(1, Math.min(prev + delta, 10)))
    }
  }, [])

  /**
   * Toggle show all nodes
   */
  const toggleShowAll = useCallback(() => {
    setShowAllNodes((prev) => {
      const next = !prev
      const previousFocus = focusOnNode

      setTimeout(() => {
        if (next) {
          if (previousFocus) {
            const node = reactFlowInstance.getNode(previousFocus)
            if (node) {
              reactFlowInstance.setCenter(
                node.position.x + (node.width ?? 0) / 2,
                node.position.y + (node.height ?? 0) / 2,
                { zoom: 1, duration: 300 }
              )
            } else {
              resetView()
            }
          } else {
            resetView()
          }
          setViewingOptionsShown(false)
          setFocusOnNode(null)
        } else if (previousFocus) {
          const node = reactFlowInstance.getNode(previousFocus)
          if (node) {
            reactFlowInstance.setCenter(
              node.position.x + (node.width ?? 0) / 2,
              node.position.y + (node.height ?? 0) / 2,
              { zoom: 1, duration: 300 }
            )
          } else {
            resetView()
          }
        }
      }, 150)
      return next
    })
  }, [focusOnNode, reactFlowInstance, resetView])

  /**
   * Collapse all expanded nodes (triggered on pane click)
   */
  const collapseAllNodes = useCallback(() => setExpandedNodes(new Set()), [])

  /**
   * Create a new node by showing the modal
   */
  const createNode = () => {
    setPendingUnionAttach(null)
    setDisplayCreate(true)
  }

  const createChildForUnion = useCallback((unionId: string) => {
    setPendingUnionAttach(unionId)
    setDisplayCreate(true)
  }, [])

  /**
   * Handle modal close event
   */
  const dismissModal = () => {
    if (displayCreate) setDisplayCreate(false)
    else if (displayInfo) setDisplayInfo(false)

    setPendingUnionAttach(null)

    if (selectedNode) setTimeout(() => selectNode(null), 500)
  }

  // closes the modal directly because `dismissModal` would close over a
  // stale `displayCreate` and no-op
  const handleNodeCreated = useCallback(
    async (nodeId?: string) => {
      if (nodeId && pendingUnionAttach) {
        await attachChildToUnion({
          treeId: tree.id,
          unionId: pendingUnionAttach,
          childNodeId: nodeId,
        })
      }
      router.refresh()
      setDisplayCreate(false)
      setPendingUnionAttach(null)
    },
    [pendingUnionAttach, tree.id, router]
  )

  /**
   * Handle async operations with loading state
   * @param fn Async function to execute
   * @return Promise<void>
   */
  const withAsync = async <T>(fn: () => Promise<T>) => {
    try {
      setLoading(true)
      await fn()
    } finally {
      setLoading(false)
    }
  }

  /**
   * Create tree layout
   * @return {{nodes: Node[], edges: Edge[], spousePairs: [string, string][]}} Layout with nodes, edges, and spouse pairs
   */
  const layout = useMemo(() => {
    const { nodes: layoutNodes, edges: layoutEdges } = createTreeLayout(
      tree,
      nodes,
      edges,
      unions,
      selectedNode?.id ?? null,
      onInfo,
      setFocus,
      onExpand,
      viewingOptionsEnabled,
      collapseKey,
      expandedNodes,
      allEdges
    )
    return { nodes: layoutNodes, edges: layoutEdges }
  }, [tree, edges, nodes, unions, onInfo, onExpand])

  /**
   * Compute layout synchronously to avoid race conditions during updates
   */
  const layoutResult = useMemo(() => {
    return computedLayout(layout.nodes, layout.edges)
  }, [layout])

  /**
   * Position couple nodes in the layout
   * @return {Node[]} Positioned nodes
   */
  const computedNodes = useMemo(() => positionCoupleNodes(layoutResult.nodes), [layoutResult.nodes])

  /**
   * React Flow nodes state
   */
  const [treeNodes, setTreeNodes, onTreeNodesChange] = useNodesState(computedNodes)
  /**
   * React Flow edges state
   */
  const [treeEdges, setTreeEdges, onTreeEdgesChange] = useEdgesState(layoutResult.edges)

  /**
   * Sync computed nodes and edges with React Flow state
   */
  useEffect(() => {
    setTreeNodes(computedNodes)
    setTreeEdges(layoutResult.edges)
  }, [computedNodes, layoutResult.edges, setTreeNodes, setTreeEdges])

  // one RAF lets React Flow measure the node DOM before we center on it
  useEffect(() => {
    const target = pendingFocusNodeId
    if (!target) return
    const node = treeNodes.find((n) => n.id === target)
    if (!node) return

    const raf = requestAnimationFrame(() => {
      const measured = reactFlowInstance.getNode(target) ?? node
      reactFlowInstance.setCenter(
        measured.position.x + (measured.width ?? 0) / 2,
        measured.position.y + (measured.height ?? 0) / 2,
        { zoom: 1, duration: 300 }
      )
      setPendingFocusNodeId(null)
    })
    return () => cancelAnimationFrame(raf)
  }, [pendingFocusNodeId, treeNodes, reactFlowInstance])

  /**
   * Update node and edge data when expandedNodes changes (without recalculating layout)
   */
  useEffect(() => {
    const highlightedNodes = new Set<string>()
    const highlightedEdges = new Set<string>()

    expandedNodes.forEach((nodeId) => {
      const visited = new Set<string>()
      const findAncestors = (nodeId: string, currentEdges?: any[]) => {
        if (visited.has(nodeId)) return
        visited.add(nodeId)

        allEdges.forEach((edge) => {
          if (edge.toNodeId === nodeId && edge.type !== 'SPOUSE') {
            highlightedEdges.add(`${edge.fromNodeId}->${edge.toNodeId}`)
            highlightedNodes.add(edge.fromNodeId)
            findAncestors(edge.fromNodeId, currentEdges)
          }
        })

        if (currentEdges) {
          const coupleNodeEdges = currentEdges.filter(
            (e) => e.target === nodeId && isCoupleId(e.source)
          )
          coupleNodeEdges.forEach((coupleEdge) => {
            highlightedEdges.add(`${coupleEdge.source}->${coupleEdge.target}`)
            currentEdges.forEach((e) => {
              if (e.target === coupleEdge.source) {
                highlightedEdges.add(`${e.source}->${e.target}`)
                highlightedNodes.add(e.source)
                findAncestors(e.source, currentEdges)
              }
            })
          })
        }
      }

      findAncestors(nodeId)
    })

    setTreeNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isHighlighted: highlightedNodes.has(node.id),
          isExpanded: expandedNodes.has(node.id),
        },
      }))
    )

    setTreeEdges((currentEdges) => {
      const allNodes = new Set([...expandedNodes, ...highlightedNodes])

      allNodes.forEach((nodeId) => {
        const coupleNodeEdges = currentEdges.filter(
          (e) => e.target === nodeId && isCoupleId(e.source)
        )
        coupleNodeEdges.forEach((coupleEdge) => {
          highlightedEdges.add(`${coupleEdge.source}->${coupleEdge.target}`)
          currentEdges.forEach((e) => {
            if (e.target === coupleEdge.source) highlightedEdges.add(`${e.source}->${e.target}`)
          })
        })
      })

      return currentEdges.map((edge) => {
        const connectionKey = `${edge.source}->${edge.target}`
        const isHighlighted = highlightedEdges.has(connectionKey)
        const isSpouse = edge.data?.type === 'SPOUSE'

        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: isHighlighted ? ocean[200] : ocean[100],
            strokeWidth: isSpouse ? 6 : isHighlighted ? 5 : 3,
          },
          zIndex: isHighlighted ? 1000 : undefined,
          data: { ...edge.data, isHighlighted },
        }
      })
    })
  }, [expandedNodes, allEdges, setTreeNodes, setTreeEdges])

  /**
   * Handle edge click event (left-click)
   * @param event React mouse event
   * @param edge Edge that was clicked
   * @return void
   */
  const onEdgeClick = useCallback((event: React.MouseEvent, edge: FlowEdge) => {
    event.preventDefault()
    setEdgeContextMenu({ visible: true, x: event.clientX, y: event.clientY, edgeId: edge.id })
  }, [])

  const toggleEdgeMenu = useCallback(
    (edgeId: string, x: number, y: number) =>
      setEdgeContextMenu((s) =>
        s.visible && s.edgeId === edgeId
          ? { ...s, visible: false }
          : { visible: true, x, y, edgeId }
      ),
    []
  )

  /**
   * Handle edge context menu event (right-click)
   * @param event React mouse event
   * @param edge Edge that was right-clicked
   * @return void
   */
  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: FlowEdge) => {
    event.preventDefault()
    setEdgeContextMenu({ visible: true, x: event.clientX, y: event.clientY, edgeId: edge.id })
  }, [])

  /**
   * Close the edge context menu
   * @return void
   */
  const closeEdgeContextMenu = useCallback(
    // keep edgeId/x/y stable so the dropdown's exit animation has a trigger
    () => setEdgeContextMenu((s) => ({ ...s, visible: false })),
    []
  )

  const prepareExportView = useCallback(async () => {
    const previousViewport = reactFlowInstance.getViewport()
    const previousShowAllNodes = showAllNodes
    const previousFocusOnNode = focusOnNode
    const previousViewingOptionsShown = viewingOptionsShown
    const previousExpandedNodes = expandedNodes

    closeEdgeContextMenu()
    setShowAllNodes(true)
    setFocusOnNode(null)
    setViewingOptionsShown(false)
    setExpandedNodes(new Set())

    await waitForFrame()
    await waitForFrame()
    await waitForRenderedPeople(
      () => reactFlowInstance.getNodes().filter((node) => !isCoupleId(node.id)).length,
      allNodes.length
    )
    reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 0 })
    await waitForFrame()
    await waitForFrame()

    return async () => {
      setShowAllNodes(previousShowAllNodes)
      setFocusOnNode(previousFocusOnNode)
      setViewingOptionsShown(previousViewingOptionsShown)
      setExpandedNodes(previousExpandedNodes)
      await waitForFrame()
      reactFlowInstance.setViewport(previousViewport, { duration: 0 })
    }
  }, [
    closeEdgeContextMenu,
    expandedNodes,
    focusOnNode,
    allNodes.length,
    reactFlowInstance,
    showAllNodes,
    viewingOptionsShown,
  ])

  /**
   * Show confirmation dialog for node deletion
   * @param nodeId - The id of the node to delete
   * @return void
   */
  const showDeleteConfirmation = useCallback(
    (nodeId: string) => setConfirmDelete({ open: true, nodeId }),
    []
  )

  /**
   * Close confirmation dialog
   * @return void
   */
  const closeDeleteConfirmation = useCallback(() => {
    setConfirmDelete({ open: false, nodeId: null })
    if (displayInfo) dismissModal()
  }, [displayInfo])

  const showEdgeDeleteConfirmation = useCallback(
    (edgeId: string) => setConfirmEdgeDelete({ open: true, edgeId }),
    []
  )

  const closeEdgeDeleteConfirmation = useCallback(
    () => setConfirmEdgeDelete((s) => ({ ...s, open: false })),
    []
  )

  return {
    setLoading,
    loading,

    edgeContextMenu,

    onEdgeContextMenu,

    closeEdgeContextMenu,

    setTreeNodes,
    setTreeEdges,

    onTreeNodesChange,
    onTreeEdgesChange,

    treeNodes,
    treeEdges,

    nodeTypes,
    edgeTypes,

    createNode,
    dismissModal,

    selectedNode,
    selectNode,

    onEdgeClick,
    toggleEdgeMenu,

    displayCreate,
    displayInfo,

    setDisplayCreate,
    setDisplayInfo,

    confirmDelete,
    showDeleteConfirmation,
    closeDeleteConfirmation,

    confirmEdgeDelete,
    showEdgeDeleteConfirmation,
    closeEdgeDeleteConfirmation,

    unionPick,
    onUnionPickNeeded,
    dismissUnionPick,
    applyUnionPick,

    createChildForUnion,
    handleNodeCreated,

    editingUnion,
    openEditUnion,
    dismissEditUnion,
    applyEditUnion,

    pendingSpouseUnion,
    onSpouseUnionConfirmNeeded,
    dismissSpouseUnionConfirm,
    applySpouseUnionConfirm,

    withAsync,
    resetView,
    prepareExportView,

    collapseAllNodes,

    setViewingOptionsShown: () => setViewingOptionsShown(!viewingOptionsShown),
    viewingOptionsShown,
    viewingOptionsEnabled,
    focusOnNode,
    setFocus,
    generationsUp,
    generationsDown,
    showAllNodes,
    adjustGenerations,
    toggleShowAll,
    totalNodeCount: allNodes.length,
    hiddenCounts,
  }
}
