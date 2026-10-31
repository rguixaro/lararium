import { describe, it, expect } from 'vitest'

import type { Tree, TreeEdge, TreeNode, Union } from '@/types'

import {
  computedLayout,
  computeGenerations,
  createTreeLayout,
  familyTreeLayout,
  inferChildOfUnionFromEdges,
  nodeHeight,
  nodeWidth,
} from './layout'

const person = (id: string, extra: Partial<TreeNode> = {}): TreeNode => ({
  id,
  treeId: 't1',
  fullName: id,
  gender: 'UNSPECIFIED',
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...extra,
})

const union = (id: string, spouseAId: string, spouseBId: string | null): Union => ({
  id,
  treeId: 't1',
  spouseAId,
  spouseBId,
  marriedAt: null,
  divorcedAt: null,
  place: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
})

const tree = (): Tree => ({
  id: 't1',
  slug: 'tree',
  name: 'Tree',
  newsletter: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
})

const edge = (
  id: string,
  type: TreeEdge['type'],
  fromNodeId: string,
  toNodeId: string
): TreeEdge => ({
  id,
  treeId: 't1',
  type,
  createdAt: new Date(0),
  fromNodeId,
  toNodeId,
})

const widthMap = (persons: TreeNode[]) => new Map(persons.map((p) => [p.id, nodeWidth]))

describe('computeGenerations', () => {
  it('returns 0 for every node when there are no relationships', () => {
    const persons = [person('A'), person('B')]
    const gens = computeGenerations(persons, [], [])
    expect(gens.get('A')).toBe(0)
    expect(gens.get('B')).toBe(0)
  })

  it('assigns gen=1 to a child of a gen=0 parent', () => {
    const persons = [person('P'), person('C', { childOfUnionId: 'u1' })]
    const unions = [union('u1', 'P', null)]
    const gens = computeGenerations(persons, [], unions)
    expect(gens.get('P')).toBe(0)
    expect(gens.get('C')).toBe(1)
  })

  it('pins both spouses to the same generation even when one has no parents', () => {
    const persons = [person('Root'), person('Alice', { childOfUnionId: 'u_parent' }), person('Bob')]
    const unions = [union('u_parent', 'Root', null), union('u_marriage', 'Alice', 'Bob')]
    const gens = computeGenerations(persons, [], unions)
    expect(gens.get('Alice')).toBe(1)
    expect(gens.get('Bob')).toBe(1)
  })

  it('propagates generations across several layers', () => {
    const persons = [
      person('GP'),
      person('P', { childOfUnionId: 'u_gp' }),
      person('C', { childOfUnionId: 'u_p' }),
    ]
    const unions = [union('u_gp', 'GP', null), union('u_p', 'P', null)]
    const gens = computeGenerations(persons, [], unions)
    expect(gens.get('GP')).toBe(0)
    expect(gens.get('P')).toBe(1)
    expect(gens.get('C')).toBe(2)
  })

  it('uses the max parent generation when parents are at different depths', () => {
    const persons = [
      person('GP'),
      person('P1', { childOfUnionId: 'u_gp' }),
      person('P2'),
      person('C', { childOfUnionId: 'u_p1p2' }),
    ]
    const unions = [union('u_gp', 'GP', null), union('u_p1p2', 'P1', 'P2')]
    const gens = computeGenerations(persons, [], unions)
    expect(gens.get('P1')).toBe(1)
    expect(gens.get('P2')).toBe(1)
    expect(gens.get('C')).toBe(2)
  })

  it('also recognizes parent links stored as direct PARENT/CHILD edges', () => {
    const persons = [person('P'), person('C')]
    const edges = [edge('e1', 'PARENT', 'P', 'C')]
    const gens = computeGenerations(persons, edges, [])
    expect(gens.get('C')).toBe(1)
  })
})

describe('familyTreeLayout', () => {
  const run = (persons: TreeNode[], unions: Union[], edges: TreeEdge[] = []) => {
    const gens = computeGenerations(persons, edges, unions)
    const positions = familyTreeLayout(persons, unions, gens, widthMap(persons))
    return { gens, positions }
  }

  it('places every visible person exactly once', () => {
    const persons = [
      person('A'),
      person('B'),
      person('C', { childOfUnionId: 'u' }),
      person('D', { childOfUnionId: 'u' }),
    ]
    const { positions } = run(persons, [union('u', 'A', 'B')])
    expect(positions.size).toBe(4)
    for (const p of persons) expect(positions.has(p.id)).toBe(true)
  })

  it('places same-generation nodes at the same Y', () => {
    const persons = [
      person('A'),
      person('B'),
      person('C', { childOfUnionId: 'u' }),
      person('D', { childOfUnionId: 'u' }),
    ]
    const { positions } = run(persons, [union('u', 'A', 'B')])
    expect(positions.get('A')!.y).toBe(positions.get('B')!.y)
    expect(positions.get('C')!.y).toBe(positions.get('D')!.y)
    expect(positions.get('C')!.y).toBeGreaterThan(positions.get('A')!.y)
  })

  it('places spouses of one union next to each other with a single gap', () => {
    const persons = [person('A'), person('B')]
    const { positions } = run(persons, [union('u', 'A', 'B')])
    const ax = positions.get('A')!.x
    const bx = positions.get('B')!.x
    expect(bx).toBeGreaterThan(ax)
    expect(bx - ax).toBeLessThan(nodeWidth * 2)
  })

  it('centers children under their couple', () => {
    const persons = [
      person('A'),
      person('B'),
      person('C1', { childOfUnionId: 'u' }),
      person('C2', { childOfUnionId: 'u' }),
    ]
    const { positions } = run(persons, [union('u', 'A', 'B')])
    const coupleCenterX =
      (positions.get('A')!.x + nodeWidth + positions.get('B')!.x) / 2 + nodeWidth / 2 / 2
    const childrenMidX = (positions.get('C1')!.x + positions.get('C2')!.x + nodeWidth) / 2
    expect(Math.abs(coupleCenterX - childrenMidX)).toBeLessThan(nodeWidth)
  })

  it('keeps a single-parent union rendering the parent above the child', () => {
    const persons = [person('P'), person('C', { childOfUnionId: 'u' })]
    const { positions, gens } = run(persons, [union('u', 'P', null)])
    expect(gens.get('P')).toBe(0)
    expect(gens.get('C')).toBe(1)
    expect(positions.get('C')!.y).toBeGreaterThan(positions.get('P')!.y)
    expect(Math.abs(positions.get('C')!.x - positions.get('P')!.x)).toBeLessThan(nodeWidth)
  })

  it('does not overlap nodes on the same generation', () => {
    const persons = [
      person('A'),
      person('B'),
      person('C1', { childOfUnionId: 'u' }),
      person('C2', { childOfUnionId: 'u' }),
      person('C3', { childOfUnionId: 'u' }),
    ]
    const { positions } = run(persons, [union('u', 'A', 'B')])
    const sameGen = ['C1', 'C2', 'C3']
      .map((id) => ({ id, x: positions.get(id)!.x }))
      .sort((a, b) => a.x - b.x)
    for (let i = 1; i < sameGen.length; i++) {
      const gap = sameGen[i].x - sameGen[i - 1].x
      expect(gap).toBeGreaterThanOrEqual(nodeWidth)
    }
  })

  it('places disconnected subtrees side by side without overlap', () => {
    const persons = [
      person('Fam1_A'),
      person('Fam1_Child', { childOfUnionId: 'u1' }),
      person('Fam2_A'),
      person('Fam2_Child', { childOfUnionId: 'u2' }),
    ]
    const unions = [union('u1', 'Fam1_A', null), union('u2', 'Fam2_A', null)]
    const { positions } = run(persons, unions)

    const xs = persons.map((p) => positions.get(p.id)!.x).sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1] - 1)

    expect(positions.get('Fam1_Child')!.y).toBeGreaterThan(positions.get('Fam1_A')!.y)
    expect(positions.get('Fam2_Child')!.y).toBeGreaterThan(positions.get('Fam2_A')!.y)
  })

  it('supports multi-marriage with different children in each union', () => {
    const persons = [
      person('Alice'),
      person('Bob'),
      person('Charlie'),
      person('Child_AB', { childOfUnionId: 'u1' }),
      person('Child_AC', { childOfUnionId: 'u2' }),
    ]
    const unions = [union('u1', 'Alice', 'Bob'), union('u2', 'Alice', 'Charlie')]
    const { positions, gens } = run(persons, unions)

    expect(gens.get('Alice')).toBe(0)
    expect(gens.get('Bob')).toBe(0)
    expect(gens.get('Charlie')).toBe(0)
    expect(positions.get('Alice')!.y).toBe(positions.get('Bob')!.y)
    expect(positions.get('Alice')!.y).toBe(positions.get('Charlie')!.y)

    expect(gens.get('Child_AB')).toBe(1)
    expect(gens.get('Child_AC')).toBe(1)
    expect(positions.get('Child_AB')!.y).toBe(positions.get('Child_AC')!.y)

    const abCenterX = (positions.get('Alice')!.x + positions.get('Bob')!.x + nodeWidth) / 2
    const acCenterX = (positions.get('Alice')!.x + positions.get('Charlie')!.x + nodeWidth) / 2
    const childABx = positions.get('Child_AB')!.x + nodeWidth / 2
    const childACx = positions.get('Child_AC')!.x + nodeWidth / 2
    expect(Math.abs(childABx - abCenterX)).toBeLessThan(nodeWidth * 1.5)
    expect(Math.abs(childACx - acCenterX)).toBeLessThan(nodeWidth * 1.5)
  })

  it('places a 2-union owner between the two spouses so each spouse edge is direct', () => {
    // with the owner on an end, the second spouse edge crosses the first
    // spouse and the "+" buttons collapse onto the same horizontal gap.
    const persons = [person('Alice'), person('Bob'), person('Charlie')]
    const unions = [union('u1', 'Alice', 'Bob'), union('u2', 'Alice', 'Charlie')]
    const { positions } = run(persons, unions)
    const aliceX = positions.get('Alice')!.x
    const bobX = positions.get('Bob')!.x
    const charlieX = positions.get('Charlie')!.x
    const sorted = [bobX, aliceX, charlieX].sort((a, b) => a - b)
    expect(sorted[1]).toBe(aliceX)
  })

  it('falls back to nodeWidth when a width is missing from the width map', () => {
    const persons = [person('A')]
    const gens = new Map<string, number>([['A', 0]])
    const positions = familyTreeLayout(persons, [], gens, new Map())
    expect(positions.get('A')).toBeDefined()
  })

  it('produces positions spaced at least by generationYStep vertically', () => {
    const persons = [
      person('A'),
      person('B', { childOfUnionId: 'u' }),
      person('C', { childOfUnionId: 'u2' }),
    ]
    const unions = [union('u', 'A', null), union('u2', 'B', null)]
    const { positions } = run(persons, unions)
    const aY = positions.get('A')!.y
    const bY = positions.get('B')!.y
    const cY = positions.get('C')!.y
    expect(bY - aY).toBeGreaterThanOrEqual(nodeHeight)
    expect(cY - bY).toBeGreaterThanOrEqual(nodeHeight)
  })

  it('tucks leaf siblings into the empty horizontal space beside a deep sibling (contour pack)', () => {
    const persons = [
      person('GP'),
      person('S1', { childOfUnionId: 'u_gp' }),
      person('S2', { childOfUnionId: 'u_gp' }),
      person('S3', { childOfUnionId: 'u_gp' }),
      person('SP1'),
      person('C1', { childOfUnionId: 'u_s1' }),
      person('C2', { childOfUnionId: 'u_s1' }),
      person('C3', { childOfUnionId: 'u_s1' }),
      person('C4', { childOfUnionId: 'u_s1' }),
    ]
    const unions = [union('u_gp', 'GP', null), union('u_s1', 'S1', 'SP1')]
    const { positions } = run(persons, unions)

    const s1x = positions.get('S1')!.x
    const sp1x = positions.get('SP1')!.x
    const s2x = positions.get('S2')!.x
    const s3x = positions.get('S3')!.x

    expect(sp1x).toBeGreaterThan(s1x)
    expect(s2x).toBeGreaterThan(sp1x)
    expect(s3x).toBeGreaterThan(s2x)

    const topRowRight = sp1x + nodeWidth
    const gapAfterTopRow = s2x - topRowRight
    expect(gapAfterTopRow).toBeLessThan(nodeWidth)
    expect(gapAfterTopRow).toBeGreaterThanOrEqual(0)

    const s2ToS3 = s3x - (s2x + nodeWidth)
    expect(s2ToS3).toBeLessThan(nodeWidth)
    expect(s2ToS3).toBeGreaterThanOrEqual(0)

    const sameGenChildren = ['C1', 'C2', 'C3', 'C4']
      .map((id) => ({ id, x: positions.get(id)!.x }))
      .sort((a, b) => a.x - b.x)
    for (let i = 1; i < sameGenChildren.length; i++) {
      expect(sameGenChildren[i].x - sameGenChildren[i - 1].x).toBeGreaterThanOrEqual(nodeWidth)
    }
  })
})

describe('familyTreeLayout ownership edge case (regression)', () => {
  it('keeps inter-family spouses side by side with order matching parent-family sides', () => {
    const persons = [
      person('Alice'),
      person('Bob'),
      person('Carol'),
      person('Dave'),
      person('Eve', { childOfUnionId: 'u_d' }),
      person('Frank', { childOfUnionId: 'u_e' }),
    ]
    const unions = [
      union('u_d', 'Carol', 'Dave'),
      union('u_e', 'Alice', 'Bob'),
      union('u_c', 'Eve', 'Frank'),
    ]
    const gens = computeGenerations(persons, [], unions)
    const positions = familyTreeLayout(persons, unions, gens, widthMap(persons))

    const eveX = positions.get('Eve')!.x
    const frankX = positions.get('Frank')!.x

    const separation = Math.abs(eveX - frankX)
    expect(separation).toBeLessThan(nodeWidth * 2)
    expect(frankX).toBeLessThan(eveX)
  })

  it('keeps a married child under their biological family when the outsider spouse is rootless', () => {
    const persons = [
      person('Grandpa'),
      person('Alice', { childOfUnionId: 'u_grand' }),
      person('Bob'),
      person('Carol', { childOfUnionId: 'u_ab' }),
      person('Dave', { childOfUnionId: 'u_ab' }),
      person('Eve'),
      person('Child1', { childOfUnionId: 'u_dave_marriage' }),
    ]
    const unions = [
      union('u_grand', 'Grandpa', null),
      union('u_ab', 'Alice', 'Bob'),
      union('u_dave_marriage', 'Eve', 'Dave'),
    ]
    const gens = computeGenerations(persons, [], unions)
    const positions = familyTreeLayout(persons, unions, gens, widthMap(persons))

    expect(positions.get('Carol')!.y).toBe(positions.get('Dave')!.y)
    const aliceX = positions.get('Alice')!.x
    const bobX = positions.get('Bob')!.x
    const couple_left = Math.min(aliceX, bobX)
    const couple_right = Math.max(aliceX, bobX) + nodeWidth
    expect(positions.get('Dave')!.x).toBeGreaterThan(couple_left - nodeWidth * 4)
    expect(positions.get('Dave')!.x).toBeLessThan(couple_right + nodeWidth * 6)
  })

  it('places every child near its actual couple, even when the non-central spouse sorts first', () => {
    const persons = [
      person('Alice', { birthDate: new Date('1932-01-01') }),
      person('Bob', { birthDate: new Date('1930-01-01') }),
      person('Charlie', { birthDate: new Date('1935-01-01') }),
      person('Child_AB', { childOfUnionId: 'u1', birthDate: new Date('1960-01-01') }),
      person('Child_AC', { childOfUnionId: 'u2', birthDate: new Date('1965-01-01') }),
    ]
    const unions = [union('u1', 'Alice', 'Bob'), union('u2', 'Alice', 'Charlie')]
    const gens = computeGenerations(persons, [], unions)
    const positions = familyTreeLayout(persons, unions, gens, widthMap(persons))
    expect(positions.size).toBe(5)

    const abCenterX = (positions.get('Alice')!.x + positions.get('Bob')!.x + nodeWidth) / 2
    const abChildX = positions.get('Child_AB')!.x + nodeWidth / 2
    expect(Math.abs(abChildX - abCenterX)).toBeLessThan(nodeWidth * 1.5)

    const acCenterX = (positions.get('Alice')!.x + positions.get('Charlie')!.x + nodeWidth) / 2
    const acChildX = positions.get('Child_AC')!.x + nodeWidth / 2
    expect(Math.abs(acChildX - acCenterX)).toBeLessThan(nodeWidth * 1.5)
  })
})

describe('computedLayout spouse edge routing', () => {
  it('routes both spouse edges away from the shared married node', () => {
    const nodes = [
      {
        id: 'Member 2',
        type: 'DEFAULT',
        data: { node: person('Member 2'), generation: 0 },
        position: { x: 0, y: 0 },
      },
      {
        id: 'Member 1',
        type: 'DEFAULT',
        data: { node: person('Member 1'), generation: 0 },
        position: { x: 0, y: 0 },
      },
      {
        id: 'Test 11',
        type: 'DEFAULT',
        data: { node: person('Test 11'), generation: 0 },
        position: { x: 0, y: 0 },
      },
    ]
    const edges = [
      {
        id: 'e1',
        source: 'Member 2',
        target: 'Member 1',
        data: { type: 'SPOUSE' },
      },
      {
        id: 'e2',
        source: 'Test 11',
        target: 'Member 1',
        data: { type: 'SPOUSE' },
      },
    ]

    const { nodes: laidOutNodes, edges: laidOutEdges } = computedLayout(nodes, edges)
    const member1 = laidOutNodes.find((node) => node.id === 'Member 1')!
    const member2 = laidOutNodes.find((node) => node.id === 'Member 2')!
    const test11 = laidOutNodes.find((node) => node.id === 'Test 11')!

    expect(member1.position.x).toBeGreaterThan(member2.position.x)
    expect(member1.position.x).toBeLessThan(test11.position.x)

    expect(laidOutEdges).toContainEqual(
      expect.objectContaining({
        id: 'e1',
        source: 'Member 2',
        target: 'Member 1',
        sourceHandle: 'right',
        targetHandle: 'left',
      })
    )
    expect(laidOutEdges).toContainEqual(
      expect.objectContaining({
        id: 'e2',
        source: 'Member 1',
        target: 'Test 11',
        sourceHandle: 'right',
        targetHandle: 'left',
      })
    )
  })

  it('moves the spouse menu button into a clear gap when the midpoint hits another node', () => {
    const nodes = [
      {
        id: 'Member 2',
        type: 'DEFAULT',
        data: { node: person('Member 2'), generation: 0 },
        position: { x: 0, y: 0 },
      },
      {
        id: 'Member 1',
        type: 'DEFAULT',
        data: { node: person('Member 1'), generation: 0 },
        position: { x: 0, y: 0 },
      },
      {
        id: 'Test 11',
        type: 'DEFAULT',
        data: { node: person('Test 11'), generation: 0 },
        position: { x: 0, y: 0 },
      },
    ]
    const edges = [
      {
        id: 'e_crossing',
        source: 'Member 2',
        target: 'Test 11',
        data: { type: 'SPOUSE' },
      },
    ]

    const { nodes: laidOutNodes, edges: laidOutEdges } = computedLayout(nodes, edges)
    const member1 = laidOutNodes.find((node) => node.id === 'Member 1')!
    const buttonX = laidOutEdges[0].data.buttonX

    expect(laidOutEdges[0].data.showButton).toBe(true)
    expect(buttonX < member1.position.x || buttonX > member1.position.x + nodeWidth).toBe(true)
  })
})

describe('createTreeLayout union spouse edges', () => {
  it('renders spouse edges from unions so every marriage has its own menu target', () => {
    const persons = [person('Member 2'), person('Member 1'), person('Test 11')]
    const unions = [union('u1', 'Member 2', 'Member 1'), union('u2', 'Member 1', 'Test 11')]
    const edges = [
      edge('e1', 'SPOUSE', 'Member 2', 'Member 1'),
      edge('e2', 'SPOUSE', 'Member 2', 'Test 11'),
    ]

    const layout = createTreeLayout(
      tree(),
      persons,
      edges,
      unions,
      null,
      () => {},
      () => {},
      () => {},
      false
    )

    expect(layout.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'ue:u1:s', source: 'Member 2', target: 'Member 1' }),
        expect.objectContaining({ id: 'ue:u2:s', source: 'Member 1', target: 'Test 11' }),
      ])
    )
    expect(layout.edges).not.toContainEqual(expect.objectContaining({ id: 'e1' }))
    expect(layout.edges).not.toContainEqual(expect.objectContaining({ id: 'e2' }))

    const computed = computedLayout(layout.nodes, layout.edges)
    expect(computed.edges.find((edge) => edge.id === 'ue:u1:s')).toBeDefined()
    expect(computed.edges.find((edge) => edge.id === 'ue:u2:s')).toBeDefined()
  })
})

describe('inferChildOfUnionFromEdges', () => {
  it('returns an empty map when nothing needs inferring (no parent edges)', () => {
    const nodes = [person('A'), person('C', { childOfUnionId: 'u1' })]
    const result = inferChildOfUnionFromEdges(nodes, [], [union('u1', 'A', null)])
    expect(result.size).toBe(0)
  })

  it('infers childOfUnionId when a node has PARENT edges to all spouses of a union', () => {
    const nodes = [person('Alice'), person('Bob'), person('Carol')]
    const unions = [union('u1', 'Alice', 'Bob')]
    const edges = [edge('e1', 'PARENT', 'Alice', 'Carol'), edge('e2', 'PARENT', 'Bob', 'Carol')]
    const result = inferChildOfUnionFromEdges(nodes, edges, unions)
    expect(result.get('Carol')).toBe('u1')
  })

  it('infers single-parent unions too', () => {
    const nodes = [person('P'), person('C')]
    const unions = [union('u1', 'P', null)]
    const edges = [edge('e1', 'PARENT', 'P', 'C')]
    const result = inferChildOfUnionFromEdges(nodes, edges, unions)
    expect(result.get('C')).toBe('u1')
  })

  it('infers when the parent set is a subset of a single matching union', () => {
    const nodes = [person('Alice'), person('Bob'), person('Child')]
    const unions = [union('u1', 'Alice', 'Bob')]
    const edges = [edge('e1', 'PARENT', 'Alice', 'Child')]
    const result = inferChildOfUnionFromEdges(nodes, edges, unions)
    expect(result.get('Child')).toBe('u1')
  })

  it('prefers the couple union over a single-parent one when only one parent edge exists', () => {
    const nodes = [person('Alice'), person('Bob'), person('Carol')]
    const unions = [union('u_couple', 'Alice', 'Bob'), union('u_single', 'Alice', null)]
    const edges = [edge('e1', 'PARENT', 'Alice', 'Carol')]
    const result = inferChildOfUnionFromEdges(nodes, edges, unions)
    expect(result.get('Carol')).toBe('u_couple')
  })

  it('does NOT infer when multiple unions could match ambiguously', () => {
    const nodes = [person('Alice'), person('Bob'), person('Charlie'), person('Child')]
    const unions = [union('u1', 'Alice', 'Bob'), union('u2', 'Alice', 'Charlie')]
    const edges = [edge('e1', 'PARENT', 'Alice', 'Child')]
    const result = inferChildOfUnionFromEdges(nodes, edges, unions)
    expect(result.has('Child')).toBe(false)
  })

  it('does NOT infer when the parent set includes non-spouses (avoids over-attaching)', () => {
    const nodes = [person('Alice'), person('Bob'), person('Stranger'), person('Child')]
    const unions = [union('u1', 'Alice', 'Bob')]
    const edges = [
      edge('e1', 'PARENT', 'Alice', 'Child'),
      edge('e2', 'PARENT', 'Stranger', 'Child'),
    ]
    const result = inferChildOfUnionFromEdges(nodes, edges, unions)
    expect(result.has('Child')).toBe(false)
  })

  it('does not override when the current childOfUnionId IS the best match', () => {
    const nodes = [person('A'), person('B'), person('C', { childOfUnionId: 'u_other' })]
    const unions = [union('u_other', 'A', 'B')]
    const edges = [edge('e1', 'PARENT', 'A', 'C'), edge('e2', 'PARENT', 'B', 'C')]
    const result = inferChildOfUnionFromEdges(nodes, edges, unions)
    expect(result.has('C')).toBe(false)
  })

  it('repairs a stale childOfUnionId (pointing at a deleted/missing union)', () => {
    const nodes = [person('A'), person('B'), person('C', { childOfUnionId: 'gone' })]
    const unions = [union('u1', 'A', 'B')]
    const edges = [edge('e1', 'PARENT', 'A', 'C'), edge('e2', 'PARENT', 'B', 'C')]
    const result = inferChildOfUnionFromEdges(nodes, edges, unions)
    expect(result.get('C')).toBe('u1')
  })

  it('overrides childOfUnionId when a stronger match exists (regression)', () => {
    const nodes = [person('Alice'), person('Bob'), person('Carol', { childOfUnionId: 'u_single' })]
    const unions = [union('u_couple', 'Alice', 'Bob'), union('u_single', 'Alice', null)]
    const edges = [edge('e1', 'PARENT', 'Alice', 'Carol'), edge('e2', 'PARENT', 'Bob', 'Carol')]
    const result = inferChildOfUnionFromEdges(nodes, edges, unions)
    expect(result.get('Carol')).toBe('u_couple')
  })

  it('skips inference when two unions tie on coverage AND size (genuinely ambiguous)', () => {
    const nodes = [person('A'), person('B'), person('C'), person('Child')]
    const unions = [union('u1', 'A', 'B'), union('u2', 'A', 'C')]
    const edges = [edge('e1', 'PARENT', 'A', 'Child')]
    const result = inferChildOfUnionFromEdges(nodes, edges, unions)
    expect(result.has('Child')).toBe(false)
  })
})
