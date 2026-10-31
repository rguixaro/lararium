import { Node, Edge, Position } from 'reactflow'

import { Tree, TreeEdge, TreeNode, Union } from '@/types'

import { ocean } from '@/styles/colors'

const nodeWidth = 208
const nodeHeight = 80

const coupleNodeWidth = 2
const coupleNodeHeight = 2

const generationYStep = nodeHeight + 160

const spouseGap = 80
const siblingGap = 48
const unionGap = 120
const subtreeGap = 120

const COUPLE_ID_PREFIX = 'couple:'

const makeCoupleId = (unionId: string) => `${COUPLE_ID_PREFIX}${unionId}`

const isCoupleId = (id: string) => id.startsWith(COUPLE_ID_PREFIX)

const spousePairKey = (a: string, b: string) => [a, b].sort().join(':')

function getNodeWidth(node: Node): number {
  if (isCoupleId(node.id) || node.type === 'COUPLE') return coupleNodeWidth

  const name = node.data?.node?.fullName || node.data?.node?.name || ''
  if (name.length <= 15) {
    const charWidth = 9
    const padding = 80
    const estimatedWidth = Math.max(nodeWidth, name.length * charWidth + padding)
    return Math.min(estimatedWidth, nodeWidth)
  }

  return nodeWidth
}

export function computeGenerations(
  nodes: TreeNode[],
  edges: TreeEdge[],
  unions: Union[]
): Map<string, number> {
  const gen = new Map<string, number>()
  const parentsOf = new Map<string, Set<string>>()

  const addParent = (childId: string, parentId: string) => {
    if (!parentsOf.has(childId)) parentsOf.set(childId, new Set())
    parentsOf.get(childId)!.add(parentId)
  }

  for (const e of edges) {
    if (e.type !== 'PARENT' && e.type !== 'CHILD') continue
    const parentId = e.type === 'PARENT' ? e.fromNodeId : e.toNodeId
    const childId = e.type === 'PARENT' ? e.toNodeId : e.fromNodeId
    addParent(childId, parentId)
  }

  const unionById = new Map<string, Union>()
  for (const u of unions) unionById.set(u.id, u)

  for (const n of nodes) {
    if (!n.childOfUnionId) continue
    const u = unionById.get(n.childOfUnionId)
    if (!u) continue
    addParent(n.id, u.spouseAId)
    if (u.spouseBId) addParent(n.id, u.spouseBId)
  }

  const spouseParent = new Map<string, string>()
  const findRoot = (id: string): string => {
    let r = id
    while (spouseParent.get(r) && spouseParent.get(r) !== r) r = spouseParent.get(r)!
    while (id !== r) {
      const next = spouseParent.get(id)!
      spouseParent.set(id, r)
      id = next
    }
    return r
  }
  const unite = (a: string, b: string) => {
    if (!spouseParent.has(a)) spouseParent.set(a, a)
    if (!spouseParent.has(b)) spouseParent.set(b, b)
    const ra = findRoot(a)
    const rb = findRoot(b)
    if (ra !== rb) spouseParent.set(ra, rb)
  }
  for (const u of unions) {
    if (u.spouseBId) unite(u.spouseAId, u.spouseBId)
  }
  for (const e of edges) {
    if (e.type === 'SPOUSE') unite(e.fromNodeId, e.toNodeId)
  }

  for (const n of nodes) gen.set(n.id, 0)

  const maxIters = nodes.length + 4
  let changed = true
  let iters = 0
  while (changed && iters++ < maxIters) {
    changed = false

    for (const n of nodes) {
      const parents = parentsOf.get(n.id)
      if (!parents || parents.size === 0) continue
      let maxParentGen = 0
      for (const p of parents) maxParentGen = Math.max(maxParentGen, gen.get(p) ?? 0)
      const next = maxParentGen + 1
      if ((gen.get(n.id) ?? 0) < next) {
        gen.set(n.id, next)
        changed = true
      }
    }

    const clusters = new Map<string, string[]>()
    for (const id of spouseParent.keys()) {
      const root = findRoot(id)
      if (!clusters.has(root)) clusters.set(root, [])
      clusters.get(root)!.push(id)
    }
    for (const members of clusters.values()) {
      let maxGen = 0
      for (const id of members) maxGen = Math.max(maxGen, gen.get(id) ?? 0)
      for (const id of members) {
        if ((gen.get(id) ?? 0) < maxGen) {
          gen.set(id, maxGen)
          changed = true
        }
      }
    }
  }

  return gen
}

/**
 * Infer childOfUnionId from PARENT/CHILD edges for legacy nodes that don't
 * have it set. Conservative: skips ambiguous cases instead of guessing.
 */
export function inferChildOfUnionFromEdges(
  nodes: TreeNode[],
  edges: TreeEdge[],
  unions: Union[]
): Map<string, string> {
  const inferred = new Map<string, string>()
  for (const p of nodes) {
    const parentIds = new Set<string>()
    for (const e of edges) {
      if (e.type === 'PARENT' && e.toNodeId === p.id) parentIds.add(e.fromNodeId)
      else if (e.type === 'CHILD' && e.fromNodeId === p.id) parentIds.add(e.toNodeId)
    }
    if (parentIds.size === 0) continue

    type Candidate = { u: Union; coverage: number; size: number }
    const candidates: Candidate[] = []
    for (const u of unions) {
      const spouses = [u.spouseAId, u.spouseBId].filter((s): s is string => !!s)
      if (spouses.length === 0) continue
      const allParentsAreSpouses = Array.from(parentIds).every((pid) => spouses.includes(pid))
      if (!allParentsAreSpouses) continue
      const coverage = spouses.filter((s) => parentIds.has(s)).length
      candidates.push({ u, coverage, size: spouses.length })
    }

    if (candidates.length === 0) continue
    candidates.sort((a, b) => {
      if (a.coverage !== b.coverage) return b.coverage - a.coverage
      return b.size - a.size
    })
    const top = candidates[0]
    const second = candidates[1]
    if (second && top.coverage === second.coverage && top.size === second.size) continue

    const best = top.u
    if (p.childOfUnionId === best.id) continue
    inferred.set(p.id, best.id)
  }
  return inferred
}

/**
 * Calculate which nodes should be visible based on focus node and generation depth
 * @param allNodes {TreeNode[]} - All nodes in the tree
 * @param allEdges {TreeEdge[]} - All edges in the tree
 * @param allUnions {Union[]} - All unions in the tree
 * @param focusOnNode {string | null} - Node id to focus on
 * @param generationsUp {number} - Number of generations to show above focus node
 * @param generationsDown {number} - Number of generations to show below focus node
 * @param expandedNodes {Set<string>} - Set of node ids that are expanded
 */
export function getVisibleNodesAndEdges(
  allNodes: TreeNode[],
  allEdges: TreeEdge[],
  allUnions: Union[],
  focusOnNode: string | null,
  generationsUp: number = 2,
  generationsDown: number = 2,
  expandedNodes: Set<string> = new Set()
): {
  nodes: TreeNode[]
  edges: TreeEdge[]
  unions: Union[]
  hiddenCounts: Map<string, { parents: number; children: number }>
} {
  if (!focusOnNode || allNodes.length === 0)
    return {
      nodes: allNodes,
      edges: allEdges,
      unions: allUnions,
      hiddenCounts: new Map(),
    }

  const visible = new Set<string>([focusOnNode])
  const hiddenCounts = new Map<string, { parents: number; children: number }>()

  const getParents = (nodeId: string): string[] =>
    allEdges.filter((e) => e.toNodeId === nodeId && e.type !== 'SPOUSE').map((e) => e.fromNodeId)

  const getChildren = (nodeId: string): string[] =>
    allEdges.filter((e) => e.fromNodeId === nodeId && e.type !== 'SPOUSE').map((e) => e.toNodeId)

  const getSpouses = (nodeId: string): string[] => {
    const fromUnions = allUnions
      .filter((u) => u.spouseAId === nodeId || u.spouseBId === nodeId)
      .flatMap((u) =>
        [u.spouseAId, u.spouseBId].filter((id): id is string => !!id && id !== nodeId)
      )
    const fromEdges = allEdges
      .filter((e) => e.type === 'SPOUSE' && (e.fromNodeId === nodeId || e.toNodeId === nodeId))
      .map((e) => (e.fromNodeId === nodeId ? e.toNodeId : e.fromNodeId))
    return Array.from(new Set([...fromUnions, ...fromEdges]))
  }

  let currentLevel = [focusOnNode]
  for (let i = 0; i < generationsUp; i++) {
    const nextLevel: string[] = []
    currentLevel.forEach((nodeId) => {
      const parents = getParents(nodeId)
      parents.forEach((p) => {
        visible.add(p)
        nextLevel.push(p)
        getSpouses(p).forEach((s) => visible.add(s))
      })
    })
    currentLevel = nextLevel
  }

  currentLevel = [focusOnNode]
  for (let i = 0; i < generationsDown; i++) {
    const nextLevel: string[] = []
    currentLevel.forEach((nodeId) => {
      const isExpanded = expandedNodes.has(nodeId)
      const children = getChildren(nodeId)

      children.forEach((c) => {
        if (isExpanded || i < generationsDown - 1) {
          visible.add(c)
          nextLevel.push(c)
        }
      })
    })
    currentLevel = nextLevel
  }

  getSpouses(focusOnNode).forEach((s) => visible.add(s))

  visible.forEach((nodeId) => {
    const allParents = getParents(nodeId)
    const visibleParents = allParents.filter((p) => visible.has(p))
    const hiddenParents = allParents.length - visibleParents.length

    const allChildren = getChildren(nodeId)
    const visibleChildren = allChildren.filter((c) => visible.has(c))
    const hiddenChildren = allChildren.length - visibleChildren.length

    if (hiddenParents > 0 || hiddenChildren > 0)
      hiddenCounts.set(nodeId, { parents: hiddenParents, children: hiddenChildren })
  })

  const visibleNodes = allNodes.filter((n) => visible.has(n.id))
  const visibleEdges = allEdges.filter((e) => visible.has(e.fromNodeId) && visible.has(e.toNodeId))
  const visibleUnions = allUnions.filter(
    (u) => visible.has(u.spouseAId) || (u.spouseBId && visible.has(u.spouseBId))
  )

  return { nodes: visibleNodes, edges: visibleEdges, unions: visibleUnions, hiddenCounts }
}

export function familyTreeLayout(
  persons: TreeNode[],
  unions: Union[],
  generations: Map<string, number>,
  widthOf: Map<string, number>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  if (persons.length === 0) return positions

  const personById = new Map<string, TreeNode>(persons.map((p) => [p.id, p]))
  const unionById = new Map<string, Union>(unions.map((u) => [u.id, u]))

  const unionsOfPerson = new Map<string, string[]>()
  for (const u of unions) {
    if (!unionsOfPerson.has(u.spouseAId)) unionsOfPerson.set(u.spouseAId, [])
    unionsOfPerson.get(u.spouseAId)!.push(u.id)
    if (u.spouseBId) {
      if (!unionsOfPerson.has(u.spouseBId)) unionsOfPerson.set(u.spouseBId, [])
      unionsOfPerson.get(u.spouseBId)!.push(u.id)
    }
  }

  const childrenOfUnion = new Map<string, string[]>()
  for (const p of persons) {
    if (!p.childOfUnionId) continue
    if (!unionById.has(p.childOfUnionId)) continue
    if (!childrenOfUnion.has(p.childOfUnionId)) childrenOfUnion.set(p.childOfUnionId, [])
    childrenOfUnion.get(p.childOfUnionId)!.push(p.id)
  }
  for (const [, ids] of childrenOfUnion) {
    ids.sort((a, b) => {
      const pa = personById.get(a)
      const pb = personById.get(b)
      const da = pa?.birthDate ? new Date(pa.birthDate).getTime() : Number.POSITIVE_INFINITY
      const db = pb?.birthDate ? new Date(pb.birthDate).getTime() : Number.POSITIVE_INFINITY
      if (da !== db) return da - db
      const ca = pa?.createdAt ? new Date(pa.createdAt).getTime() : 0
      const cb = pb?.createdAt ? new Date(pb.createdAt).getTime() : 0
      return ca - cb
    })
  }

  const widthForPerson = (id: string) => widthOf.get(id) ?? nodeWidth

  // Each Union is owned by the spouse driving its layout (see tiebreakers below).
  // A multi-marriage person needs to own all their unions or some children
  // won't get laid out (regression test in layout.test.ts).
  const unionIds = new Set(unions.map((u) => u.id))

  const rootsForSort = persons
    .filter((p) => !p.childOfUnionId || !unionIds.has(p.childOfUnionId))
    .sort((a, b) => {
      const ga = generations.get(a.id) ?? 0
      const gb = generations.get(b.id) ?? 0
      if (ga !== gb) return ga - gb
      const da = a.birthDate ? new Date(a.birthDate).getTime() : Number.POSITIVE_INFINITY
      const db = b.birthDate ? new Date(b.birthDate).getTime() : Number.POSITIVE_INFINITY
      return da - db
    })
  const rootSortIndex = new Map(rootsForSort.map((r, i) => [r.id, i]))

  const rootAncestorOf = (personId: string): string | null => {
    let cur: string | null = personId
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const node = personById.get(cur)
      if (!node?.childOfUnionId || !unionIds.has(node.childOfUnionId)) return cur
      const u = unionById.get(node.childOfUnionId)!
      cur = u.spouseAId
    }
    return cur
  }

  const unionOwner = new Map<string, string>()
  for (const u of unions) {
    if (!u.spouseBId) {
      unionOwner.set(u.id, u.spouseAId)
      continue
    }
    const aNode = personById.get(u.spouseAId)
    const bNode = personById.get(u.spouseBId)
    const aHasParents = !!aNode?.childOfUnionId && unionIds.has(aNode.childOfUnionId)
    const bHasParents = !!bNode?.childOfUnionId && unionIds.has(bNode.childOfUnionId)

    // prefer the spouse whose family root is in this tree; a rootless
    // outsider would drag the subtree to the forest tail. must come before
    // the union-count tiebreaker so phantom unions can't hijack ownership.
    if (aHasParents !== bHasParents) {
      unionOwner.set(u.id, aHasParents ? u.spouseAId : u.spouseBId)
      continue
    }

    // both have parents: the spouse with the later family-root index owns,
    // so the later family places the couple next to its own subtree.
    if (aHasParents && bHasParents) {
      const aRoot = rootAncestorOf(u.spouseAId)
      const bRoot = rootAncestorOf(u.spouseBId)
      const aIdx = aRoot ? (rootSortIndex.get(aRoot) ?? -1) : -1
      const bIdx = bRoot ? (rootSortIndex.get(bRoot) ?? -1) : -1
      if (aIdx !== bIdx) {
        unionOwner.set(u.id, aIdx > bIdx ? u.spouseAId : u.spouseBId)
        continue
      }
    }

    // neither has parents: the multi-marriage person owns all their unions.
    const aCount = unionsOfPerson.get(u.spouseAId)?.length ?? 0
    const bCount = unionsOfPerson.get(u.spouseBId)?.length ?? 0
    if (aCount !== bCount) {
      unionOwner.set(u.id, aCount > bCount ? u.spouseAId : u.spouseBId)
      continue
    }

    unionOwner.set(u.id, u.spouseAId)
  }

  const ownedUnionsOf = new Map<string, string[]>()
  for (const [uid, owner] of unionOwner) {
    if (!ownedUnionsOf.has(owner)) ownedUnionsOf.set(owner, [])
    ownedUnionsOf.get(owner)!.push(uid)
  }

  const roots = persons
    .filter((p) => !p.childOfUnionId || !unionById.has(p.childOfUnionId))
    .sort((a, b) => {
      const ga = generations.get(a.id) ?? 0
      const gb = generations.get(b.id) ?? 0
      if (ga !== gb) return ga - gb
      const da = a.birthDate ? new Date(a.birthDate).getTime() : Number.POSITIVE_INFINITY
      const db = b.birthDate ? new Date(b.birthDate).getTime() : Number.POSITIVE_INFINITY
      return da - db
    })

  const effectiveRoots = roots.filter((r) => {
    const ownedCount = ownedUnionsOf.get(r.id)?.length ?? 0
    const totalCount = unionsOfPerson.get(r.id)?.length ?? 0
    return ownedCount > 0 || totalCount === 0
  })

  // A Contour captures a subtree's horizontal footprint per generation Y, so
  // packing only shifts by the max overlap on shared rows; narrow top rows
  // can tuck into the empty space beside a sibling's wider descendants.
  // placeSubtree returns LOCAL coords; the forest pass translates them.
  type Contour = Map<number, { left: number; right: number }>

  const makeRangeContour = (y: number, left: number, right: number): Contour =>
    new Map([[y, { left, right }]])

  const shiftContour = (c: Contour, dx: number): Contour => {
    const out: Contour = new Map()
    for (const [y, r] of c) out.set(y, { left: r.left + dx, right: r.right + dx })
    return out
  }

  const mergeContour = (a: Contour, b: Contour): Contour => {
    const out: Contour = new Map()
    for (const [y, r] of a) out.set(y, { left: r.left, right: r.right })
    for (const [y, r] of b) {
      const existing = out.get(y)
      if (!existing) out.set(y, { left: r.left, right: r.right })
      else
        out.set(y, {
          left: Math.min(existing.left, r.left),
          right: Math.max(existing.right, r.right),
        })
    }
    return out
  }

  const minShiftToAvoidOverlap = (prev: Contour, next: Contour, gap: number): number => {
    let shift = 0
    for (const [y, nextRange] of next) {
      const prevRange = prev.get(y)
      if (!prevRange) continue
      const required = prevRange.right + gap - nextRange.left
      if (required > shift) shift = required
    }
    return shift
  }

  interface SubtreeLayout {
    positions: Map<string, { x: number; y: number }>
    contour: Contour
  }

  const shiftLayout = (layout: SubtreeLayout, dx: number): SubtreeLayout => {
    const newPositions = new Map<string, { x: number; y: number }>()
    for (const [id, p] of layout.positions) newPositions.set(id, { x: p.x + dx, y: p.y })
    return { positions: newPositions, contour: shiftContour(layout.contour, dx) }
  }

  const packSubtrees = (
    subtrees: SubtreeLayout[],
    gap: number
  ): { positions: Map<string, { x: number; y: number }>; contour: Contour; offsets: number[] } => {
    const positions = new Map<string, { x: number; y: number }>()
    let contour: Contour = new Map()
    const offsets: number[] = []

    subtrees.forEach((s, idx) => {
      const shift = idx === 0 ? 0 : minShiftToAvoidOverlap(contour, s.contour, gap)
      offsets.push(shift)
      const shifted = idx === 0 ? s : shiftLayout(s, shift)
      for (const [id, p] of shifted.positions) positions.set(id, p)
      contour = idx === 0 ? shifted.contour : mergeContour(contour, shifted.contour)
    })

    return { positions, contour, offsets }
  }

  const subtreeMemo = new Map<string, SubtreeLayout>()

  const placeSubtree = (personId: string): SubtreeLayout => {
    const cached = subtreeMemo.get(personId)
    if (cached) return cached

    const myUnions = ownedUnionsOf.get(personId) ?? []
    const gen = generations.get(personId) ?? 0
    const personY = gen * generationYStep
    const myW = widthForPerson(personId)

    if (myUnions.length === 0) {
      const positions = new Map<string, { x: number; y: number }>()
      positions.set(personId, { x: 0, y: personY })
      const layout: SubtreeLayout = {
        positions,
        contour: makeRangeContour(personY, 0, myW),
      }
      subtreeMemo.set(personId, layout)
      return layout
    }

    type UnionPack = {
      uid: string
      positions: Map<string, { x: number; y: number }>
      contour: Contour
      childIds: string[]
      childOffsets: number[]
      childLayouts: SubtreeLayout[]
      totalWidth: number
      hasChildren: boolean
    }

    const unionPacks: UnionPack[] = myUnions.map((uid) => {
      const childIds = childrenOfUnion.get(uid) ?? []
      const childLayouts = childIds.map((cid) => placeSubtree(cid))
      const packed = packSubtrees(childLayouts, siblingGap)
      const childY = (gen + 1) * generationYStep
      let rowLeft = Number.POSITIVE_INFINITY
      let rowRight = Number.NEGATIVE_INFINITY
      const childRange = packed.contour.get(childY)
      if (childRange) {
        rowLeft = childRange.left
        rowRight = childRange.right
      }
      return {
        uid,
        positions: packed.positions,
        contour: packed.contour,
        childIds,
        childOffsets: packed.offsets,
        childLayouts,
        totalWidth: isFinite(rowLeft) ? rowRight - rowLeft : 0,
        hasChildren: childIds.length > 0,
      }
    })

    const unionLayouts: SubtreeLayout[] = unionPacks.map((up) => ({
      positions: up.positions,
      contour: up.contour,
    }))
    const packedUnions = packSubtrees(unionLayouts, unionGap)

    // top row: [person, other_of_u0, other_of_u1, ...]; flipped to put the
    // other before the person for monogamous inter-family couples whose
    // family roots sit to the left in the forest.
    interface TopEntry {
      id: string
      width: number
      unionIdx: number | null
    }

    const topEntries: TopEntry[] = []
    let flipIndex: number | null = null
    if (myUnions.length === 1) {
      const uid = myUnions[0]
      const u = unionById.get(uid)!
      const other = u.spouseAId === personId ? u.spouseBId : u.spouseAId
      if (other) {
        const ownerNode = personById.get(personId)
        const otherNode = personById.get(other)
        const ownerHasParents =
          !!ownerNode?.childOfUnionId && unionIds.has(ownerNode.childOfUnionId)
        const otherHasParents =
          !!otherNode?.childOfUnionId && unionIds.has(otherNode.childOfUnionId)
        if (ownerHasParents && otherHasParents) {
          const ownerRoot = rootAncestorOf(personId)
          const otherRoot = rootAncestorOf(other)
          const ownerRootIdx = ownerRoot ? (rootSortIndex.get(ownerRoot) ?? -1) : -1
          const otherRootIdx = otherRoot ? (rootSortIndex.get(otherRoot) ?? -1) : -1
          if (ownerRootIdx !== otherRootIdx && otherRootIdx < ownerRootIdx) flipIndex = 0
        }
      }
    }

    if (flipIndex === 0) {
      const uid = myUnions[0]
      const u = unionById.get(uid)!
      const other = u.spouseAId === personId ? u.spouseBId : u.spouseAId
      if (other) topEntries.push({ id: other, width: widthForPerson(other), unionIdx: 0 })
      topEntries.push({ id: personId, width: myW, unionIdx: null })
    } else if (myUnions.length === 2) {
      // multi-marriage: place owner between the two spouses so both
      // spouse edges are direct. with the owner on an end, the second
      // edge crosses the first spouse and chooseButtonX collapses both
      // "+" buttons onto the same gap.
      const u0 = unionById.get(myUnions[0])!
      const u1 = unionById.get(myUnions[1])!
      const other0 = u0.spouseAId === personId ? u0.spouseBId : u0.spouseAId
      const other1 = u1.spouseAId === personId ? u1.spouseBId : u1.spouseAId
      if (other0 && other1) {
        topEntries.push({ id: other0, width: widthForPerson(other0), unionIdx: 0 })
        topEntries.push({ id: personId, width: myW, unionIdx: null })
        topEntries.push({ id: other1, width: widthForPerson(other1), unionIdx: 1 })
      } else {
        topEntries.push({ id: personId, width: myW, unionIdx: null })
        if (other0) topEntries.push({ id: other0, width: widthForPerson(other0), unionIdx: 0 })
        if (other1) topEntries.push({ id: other1, width: widthForPerson(other1), unionIdx: 1 })
      }
    } else {
      topEntries.push({ id: personId, width: myW, unionIdx: null })
      myUnions.forEach((uid, idx) => {
        const u = unionById.get(uid)!
        const other = u.spouseAId === personId ? u.spouseBId : u.spouseAId
        if (other) topEntries.push({ id: other, width: widthForPerson(other), unionIdx: idx })
      })
    }

    const topRowWidth =
      topEntries.reduce((s, e) => s + e.width, 0) + spouseGap * (topEntries.length - 1)

    const childY = (gen + 1) * generationYStep
    const combinedChildRange = packedUnions.contour.get(childY)

    let topRowStart: number
    if (combinedChildRange) {
      const childCenter = (combinedChildRange.left + combinedChildRange.right) / 2
      topRowStart = childCenter - topRowWidth / 2
    } else {
      topRowStart = 0
    }

    const positions = new Map<string, { x: number; y: number }>()
    {
      let cursor = topRowStart
      for (const entry of topEntries) {
        positions.set(entry.id, { x: cursor, y: personY })
        cursor += entry.width + spouseGap
      }
    }

    for (const [id, p] of packedUnions.positions) positions.set(id, p)

    let minX = Number.POSITIVE_INFINITY
    for (const [, p] of positions) if (p.x < minX) minX = p.x
    if (isFinite(minX) && minX !== 0) {
      const shifted = new Map<string, { x: number; y: number }>()
      for (const [id, p] of positions) shifted.set(id, { x: p.x - minX, y: p.y })
      positions.clear()
      for (const [id, p] of shifted) positions.set(id, p)
    }
    const dx = isFinite(minX) ? -minX : 0

    let topRowLeft = Number.POSITIVE_INFINITY
    let topRowRight = Number.NEGATIVE_INFINITY
    for (const entry of topEntries) {
      const p = positions.get(entry.id)!
      if (p.x < topRowLeft) topRowLeft = p.x
      if (p.x + entry.width > topRowRight) topRowRight = p.x + entry.width
    }

    const topRowContour =
      isFinite(topRowLeft) && isFinite(topRowRight)
        ? makeRangeContour(personY, topRowLeft, topRowRight)
        : new Map<number, { left: number; right: number }>()

    const shiftedChildrenContour = shiftContour(packedUnions.contour, dx)
    const finalContour = mergeContour(topRowContour, shiftedChildrenContour)

    const layout: SubtreeLayout = { positions, contour: finalContour }
    subtreeMemo.set(personId, layout)
    return layout
  }

  const rootLayouts = effectiveRoots.map((r) => placeSubtree(r.id))
  const forestPack = packSubtrees(rootLayouts, subtreeGap)
  for (const [id, p] of forestPack.positions) positions.set(id, p)

  let tailX = 0
  for (const [, p] of positions) if (p.x > tailX) tailX = p.x
  for (const [, r] of forestPack.contour) if (r.right > tailX) tailX = r.right
  tailX += subtreeGap

  for (const p of persons) {
    if (positions.has(p.id)) continue
    const strayLayout = placeSubtree(p.id)
    const shifted = shiftLayout(strayLayout, tailX)
    for (const [id, pp] of shifted.positions) {
      if (!positions.has(id)) positions.set(id, pp)
    }
    let rightmost = tailX
    for (const [, r] of shifted.contour) if (r.right > rightmost) rightmost = r.right
    tailX = rightmost + subtreeGap
  }

  return positions
}

/**
 * Compute final node positions and edge styling. Uses the custom
 * family-tree layout; dagre is no longer involved.
 */
export function computedLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const treeNodes: Node[] = []
  const coupleNodes: Node[] = []
  for (const n of nodes) {
    if (n.type === 'COUPLE' || isCoupleId(n.id)) coupleNodes.push(n)
    else treeNodes.push(n)
  }

  const persons: TreeNode[] = treeNodes
    .map((n) => n.data?.node as TreeNode | undefined)
    .filter((p): p is TreeNode => !!p)

  const unions: Union[] = coupleNodes
    .map((cn) => {
      const d = cn.data
      if (!d?.unionId || !d.spouseAId) return null
      return {
        id: d.unionId,
        treeId: persons[0]?.treeId ?? '',
        spouseAId: d.spouseAId,
        spouseBId: d.spouseBId ?? null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      } as Union
    })
    .filter((u): u is Union => !!u)

  const generations = new Map<string, number>()
  for (const n of treeNodes) {
    const g = n.data?.generation
    if (typeof g === 'number') generations.set(n.id, g)
  }

  const widthMap = new Map<string, number>()
  for (const n of treeNodes) widthMap.set(n.id, getNodeWidth(n))

  const layout = familyTreeLayout(persons, unions, generations, widthMap)

  const positionedNodes: Node[] = nodes.map((node) => {
    const isCouple = node.type === 'COUPLE' || isCoupleId(node.id)
    if (isCouple) {
      // positionCoupleNodes assigns final X/Y downstream
      return {
        ...node,
        draggable: false,
        targetPosition: Position.Top,
        sourcePosition: Position.Bottom,
        position: node.position ?? { x: 0, y: 0 },
        style: { ...node.style, zIndex: 0 },
      }
    }
    const pos = layout.get(node.id)
    if (!pos) return node
    return {
      ...node,
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      position: { x: pos.x, y: pos.y },
      style: { ...node.style },
    }
  })

  const nodePositionById = new Map<string, Node>(positionedNodes.map((n) => [n.id, n]))
  const memberBounds = positionedNodes
    .filter((node) => node.type !== 'COUPLE' && !isCoupleId(node.id))
    .map((node) => {
      const width = getNodeWidth(node)
      return {
        id: node.id,
        left: node.position.x,
        right: node.position.x + width,
        top: node.position.y,
        bottom: node.position.y + nodeHeight,
      }
    })

  const chooseButtonX = (
    source: string,
    target: string,
    sourceRight: number | null,
    targetLeft: number | null,
    buttonY: number | undefined
  ): number | undefined => {
    if (sourceRight == null || targetLeft == null) return undefined

    const fallback = sourceRight + (targetLeft - sourceRight) / 2
    if (buttonY == null) return fallback

    const buttonHalfWidth = 28
    const buttonHalfHeight = 14
    const start = sourceRight + buttonHalfWidth
    const end = targetLeft - buttonHalfWidth
    if (start > end) return fallback

    let segments = [{ start, end }]
    const blockers = memberBounds
      .filter(
        (bounds) =>
          bounds.id !== source &&
          bounds.id !== target &&
          buttonY >= bounds.top - buttonHalfHeight &&
          buttonY <= bounds.bottom + buttonHalfHeight
      )
      .map((bounds) => ({
        start: bounds.left - buttonHalfWidth,
        end: bounds.right + buttonHalfWidth,
      }))
      .sort((a, b) => a.start - b.start)

    for (const blocker of blockers) {
      const next: typeof segments = []
      for (const segment of segments) {
        if (blocker.end <= segment.start || blocker.start >= segment.end) {
          next.push(segment)
          continue
        }
        if (blocker.start > segment.start) next.push({ start: segment.start, end: blocker.start })
        if (blocker.end < segment.end) next.push({ start: blocker.end, end: segment.end })
      }
      segments = next
    }

    const best = segments.sort((a, b) => b.end - b.start - (a.end - a.start))[0]
    return best ? best.start + (best.end - best.start) / 2 : fallback
  }

  const computedEdges: Edge[] = edges.map((e) => {
    const isSpouse = e.data?.type === 'SPOUSE' || e.type === 'SPOUSE'

    if (isSpouse) {
      // node component only has `right` as a source and `left` as a target,
      // so the edge must always be drawn left to right
      const src = nodePositionById.get(e.source)
      const tgt = nodePositionById.get(e.target)
      const shouldSwap = !!(src && tgt && src.position.x > tgt.position.x)
      const source = shouldSwap ? e.target : e.source
      const target = shouldSwap ? e.source : e.target
      const sourceNode = nodePositionById.get(source)
      const targetNode = nodePositionById.get(target)
      const sourceWidth = sourceNode ? getNodeWidth(sourceNode) : nodeWidth
      const sourceRight = sourceNode ? sourceNode.position.x + sourceWidth : null
      const targetLeft = targetNode ? targetNode.position.x : null
      const edgeGap = sourceRight != null && targetLeft != null ? targetLeft - sourceRight : null
      const buttonY =
        sourceNode && targetNode
          ? (sourceNode.position.y + nodeHeight / 2 + targetNode.position.y + nodeHeight / 2) / 2
          : undefined
      const buttonX = chooseButtonX(source, target, sourceRight, targetLeft, buttonY)
      return {
        ...e,
        type: 'SPOUSE',
        source,
        target,
        sourceHandle: 'right',
        targetHandle: 'left',
        // selectable: false drops the .selectable class so the dashed line
        // doesn't show a pointer cursor (the pill button keeps its own).
        selectable: false,
        data: {
          ...e.data,
          buttonX,
          buttonY,
          showButton: e.data?.unionId ? true : edgeGap == null || edgeGap >= 56,
        },
        style: { stroke: ocean[100], strokeWidth: 5, strokeDasharray: '8 8' },
      }
    }

    const isCoupleChildEdge = typeof e.id === 'string' && /^ue:[^:]+:c:/.test(e.id)
    const isStandaloneChildEdge = e.type === 'CHILD'

    let type: string = 'smoothstep'
    if (isCoupleChildEdge) type = 'COUPLE_BUS'
    else if (isStandaloneChildEdge) type = 'CHILD'

    return {
      ...e,
      type,
      animated: false,
      sourceHandle: 'bottom',
      targetHandle: 'top',
      selectable: false,
      style: { stroke: ocean[100], strokeWidth: 3 },
    }
  })

  return { nodes: positionedNodes, edges: computedEdges }
}

/**
 * Convert domain (TreeNode/TreeEdge/Union) into reactflow (Node/Edge) shape.
 * One couple spacer node is synthesized per Union; PARENT/CHILD edges that
 * route through a union are suppressed in favor of the couple node.
 */
export function createTreeLayout(
  tree: Tree,
  nodes: TreeNode[],
  edges: TreeEdge[],
  unions: Union[],
  selectedNodeId: string | null,
  onInfo: (node: TreeNode) => void,
  onFocus: (node: string) => void,
  onExpand: (nodeId: string, expanded: boolean) => void,
  focusEnabled: boolean = false,
  collapseKey: number = 0,
  expandedNodes: Set<string> = new Set(),
  allEdges: TreeEdge[] = []
) {
  const unionById = new Map<string, Union>()
  for (const u of unions) unionById.set(u.id, u)

  // render-time only patch for legacy orphan children; the DB is untouched
  const inferredChildOfUnion = inferChildOfUnionFromEdges(nodes, edges, unions)

  const effectiveNodes =
    inferredChildOfUnion.size === 0
      ? nodes
      : nodes.map((n) =>
          inferredChildOfUnion.has(n.id)
            ? { ...n, childOfUnionId: inferredChildOfUnion.get(n.id)! }
            : n
        )

  const generations = computeGenerations(effectiveNodes, edges, unions)

  const highlightedNodes = new Set<string>()
  expandedNodes.forEach((nodeId) => {
    const parents = allEdges
      .filter((e) => e.toNodeId === nodeId && e.type !== 'SPOUSE')
      .map((e) => e.fromNodeId)
    parents.forEach((parentId) => highlightedNodes.add(parentId))
  })

  const unionsWithChildrenSpouseIds = new Set<string>()
  for (const u of unions) {
    const hasChildren = effectiveNodes.some((n) => n.childOfUnionId === u.id)
    if (!hasChildren) continue
    unionsWithChildrenSpouseIds.add(u.spouseAId)
    if (u.spouseBId) unionsWithChildrenSpouseIds.add(u.spouseBId)
  }

  const nodeById = new Map(effectiveNodes.map((n) => [n.id, n]))
  const spouseOf = (nodeId: string): string | null => {
    const u = unions.find(
      (u) => u.spouseBId && !u.divorcedAt && (u.spouseAId === nodeId || u.spouseBId === nodeId)
    )
    if (!u) return null
    const otherId = u.spouseAId === nodeId ? u.spouseBId! : u.spouseAId
    return nodeById.get(otherId)?.fullName ?? null
  }

  const treeNodes: Node[] = effectiveNodes.map((node) => {
    const edgesFrom = edges.filter((e) => e.fromNodeId === node.id)
    const edgesTo = edges.filter((e) => e.toNodeId === node.id)

    return {
      id: node.id,
      type: 'DEFAULT',
      data: {
        node: { ...node, edgesFrom, edgesTo },
        selectedNodeId,
        onInfo,
        onFocus: focusEnabled ? onFocus : null,
        onExpand,
        collapseKey,
        isHighlighted: highlightedNodes.has(node.id),
        isExpanded: expandedNodes.has(node.id),
        generation: generations.get(node.id) ?? 0,
        hasUnionChildren: unionsWithChildrenSpouseIds.has(node.id),
        isRootGeneration: (generations.get(node.id) ?? 0) === 0,
        hasUnionParents: !!node.childOfUnionId,
        spouseName: spouseOf(node.id),
      },
      position: { x: 0, y: 0 },
    }
  })

  const coupleNodes: Node[] = []
  const coupleEdges: Edge[] = []
  const unionSpousePairs = new Set(
    unions
      .filter((union): union is Union & { spouseBId: string } => !!union.spouseBId)
      .map((union) => spousePairKey(union.spouseAId, union.spouseBId))
  )

  for (const union of unions) {
    const unionChildren = effectiveNodes.filter((n) => n.childOfUnionId === union.id)
    const hasChildren = unionChildren.length > 0

    // childless unions still need a couple node so the layout pairs the
    // spouses; only the spouse-to-couple edges are skipped.
    const coupleId = makeCoupleId(union.id)
    coupleNodes.push({
      id: coupleId,
      type: 'COUPLE',
      data: {
        unionId: union.id,
        spouseAId: union.spouseAId,
        spouseBId: union.spouseBId,
        hasChildren,
      },
      position: { x: 0, y: 0 },
    })

    if (union.spouseBId) {
      coupleEdges.push({
        id: `ue:${union.id}:s`,
        source: union.spouseAId,
        target: union.spouseBId,
        data: { type: 'SPOUSE', unionId: union.id },
      })
    }

    if (hasChildren) {
      coupleEdges.push({
        id: `ue:${union.id}:a`,
        source: union.spouseAId,
        target: coupleId,
      })
      if (union.spouseBId) {
        coupleEdges.push({
          id: `ue:${union.id}:b`,
          source: union.spouseBId,
          target: coupleId,
        })
      }

      for (const child of unionChildren) {
        coupleEdges.push({
          id: `ue:${union.id}:c:${child.id}`,
          source: coupleId,
          target: child.id,
        })
      }
    }
  }

  const keptTreeEdges: Edge[] = []
  for (const edge of edges) {
    if (edge.type === 'SPOUSE') {
      if (unions.length > 0 || unionSpousePairs.has(spousePairKey(edge.fromNodeId, edge.toNodeId)))
        continue

      // static dashes; the scrolling dasharray repainted every frame and
      // also fought the menu button portal for z-stacking
      keptTreeEdges.push({
        id: edge.id,
        source: edge.fromNodeId,
        target: edge.toNodeId,
        type: 'smoothstep',
        animated: false,
        data: { type: edge.type },
      })
      continue
    }

    if (edge.type !== 'PARENT' && edge.type !== 'CHILD') continue

    const parentId = edge.type === 'PARENT' ? edge.fromNodeId : edge.toNodeId
    const childId = edge.type === 'PARENT' ? edge.toNodeId : edge.fromNodeId
    const childNode = effectiveNodes.find((n) => n.id === childId)
    const union = childNode?.childOfUnionId ? unionById.get(childNode.childOfUnionId) : undefined
    const routedViaCouple =
      !!union && (union.spouseAId === parentId || union.spouseBId === parentId)

    if (routedViaCouple) continue

    // standalone parent/child edges get the CHILD type for the detach button
    keptTreeEdges.push({
      id: edge.id,
      source: edge.fromNodeId,
      target: edge.toNodeId,
      type: 'CHILD',
      animated: false,
      data: { type: edge.type },
    })
  }

  return {
    nodes: [...treeNodes, ...coupleNodes],
    edges: [...keptTreeEdges, ...coupleEdges],
  }
}

/**
 * Position couple spacer nodes at the midpoint between their two spouses.
 * Single-parent unions sit directly below the lone spouse.
 */
export function positionCoupleNodes(layoutNodes: Node[]): Node[] {
  const nodeById = new Map(layoutNodes.map((n) => [n.id, n]))

  return layoutNodes.map((node) => {
    if (node.type !== 'COUPLE' && !isCoupleId(node.id)) return node

    const spouseAId: string | undefined = node.data?.spouseAId
    const spouseBId: string | null | undefined = node.data?.spouseBId

    if (!spouseAId) return node

    const spouseA = nodeById.get(spouseAId)
    if (!spouseA) return node

    if (!spouseBId) {
      const width = getNodeWidth(spouseA)
      return {
        ...node,
        position: {
          x: spouseA.position.x + width / 2 - coupleNodeWidth / 2,
          y: spouseA.position.y + nodeHeight + 80,
        },
      }
    }

    const spouseB = nodeById.get(spouseBId)
    if (!spouseB) {
      const width = getNodeWidth(spouseA)
      return {
        ...node,
        position: {
          x: spouseA.position.x + width / 2 - coupleNodeWidth / 2,
          y: spouseA.position.y + nodeHeight + 80,
        },
      }
    }

    const widthA = getNodeWidth(spouseA)
    const widthB = getNodeWidth(spouseB)
    const centerA = spouseA.position.x + widthA / 2
    const centerB = spouseB.position.x + widthB / 2
    const midX = (centerA + centerB) / 2
    const midY = Math.max(spouseA.position.y, spouseB.position.y)

    return {
      ...node,
      position: {
        x: midX - coupleNodeWidth / 2,
        y: midY + nodeHeight + 80,
      },
    }
  })
}

export { nodeWidth, nodeHeight, isCoupleId, makeCoupleId }
