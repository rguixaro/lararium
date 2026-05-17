/**
 * One-shot migration: synthesize Union records from existing SPOUSE + PARENT/CHILD
 * edges, and link TreeNode.childOfUnionId for every child. Idempotent.
 *
 * Usage: npx tsx scripts/backfill-unions.ts [--dry-run] [--tree=<treeId>]
 */
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

const db = new PrismaClient()

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const treeFilter = args.find((a) => a.startsWith('--tree='))?.split('=')[1]

const pairKey = (a: string, b: string | null) => {
  if (!b) return `single:${a}`
  return [a, b].sort().join(':')
}

async function backfillTree(treeId: string) {
  const [edges, nodes, existingUnions] = await Promise.all([
    db.treeEdge.findMany({ where: { treeId } }),
    db.treeNode.findMany({ where: { treeId } }),
    db.union.findMany({ where: { treeId } }),
  ])

  const nodeIds = new Set(nodes.map((n) => n.id))

  const parentsOf = new Map<string, Set<string>>()
  for (const e of edges) {
    if (e.type !== 'PARENT' && e.type !== 'CHILD') continue
    // CHILD edges use the legacy convention where fromNode is the child.
    const parent = e.type === 'PARENT' ? e.fromNodeId : e.toNodeId
    const child = e.type === 'PARENT' ? e.toNodeId : e.fromNodeId
    if (!nodeIds.has(parent) || !nodeIds.has(child)) continue
    if (!parentsOf.has(child)) parentsOf.set(child, new Set())
    parentsOf.get(child)!.add(parent)
  }

  const spousesOf = new Map<string, Set<string>>()
  for (const e of edges) {
    if (e.type !== 'SPOUSE') continue
    if (!nodeIds.has(e.fromNodeId) || !nodeIds.has(e.toNodeId)) continue
    if (!spousesOf.has(e.fromNodeId)) spousesOf.set(e.fromNodeId, new Set())
    if (!spousesOf.has(e.toNodeId)) spousesOf.set(e.toNodeId, new Set())
    spousesOf.get(e.fromNodeId)!.add(e.toNodeId)
    spousesOf.get(e.toNodeId)!.add(e.fromNodeId)
  }

  const unionsByKey = new Map<string, string>()
  for (const u of existingUnions) {
    unionsByKey.set(pairKey(u.spouseAId, u.spouseBId), u.id)
  }

  const toCreate: Array<{ key: string; spouseAId: string; spouseBId: string | null }> = []
  const childAssignments = new Map<string, string>()

  for (const child of nodes) {
    if (child.childOfUnionId) continue
    const parents = Array.from(parentsOf.get(child.id) ?? [])

    if (parents.length === 0) continue

    let chosen: { spouseAId: string; spouseBId: string | null } | null = null

    if (parents.length === 1) {
      chosen = { spouseAId: parents[0], spouseBId: null }
    } else {
      let paired: [string, string] | null = null
      for (let i = 0; i < parents.length && !paired; i++) {
        for (let j = i + 1; j < parents.length && !paired; j++) {
          if (spousesOf.get(parents[i])?.has(parents[j])) paired = [parents[i], parents[j]]
        }
      }
      if (paired) chosen = { spouseAId: paired[0], spouseBId: paired[1] }
      else chosen = { spouseAId: parents[0], spouseBId: parents[1] }
    }

    const key = pairKey(chosen.spouseAId, chosen.spouseBId)
    childAssignments.set(child.id, key)
    if (!unionsByKey.has(key) && !toCreate.find((u) => u.key === key)) {
      toCreate.push({ key, spouseAId: chosen.spouseAId, spouseBId: chosen.spouseBId })
    }
  }

  // Childless SPOUSE pairs still need a Union so the rendering pipeline
  // can route them through the couple node.
  for (const e of edges) {
    if (e.type !== 'SPOUSE') continue
    const key = pairKey(e.fromNodeId, e.toNodeId)
    if (!unionsByKey.has(key) && !toCreate.find((u) => u.key === key)) {
      const [a, b] = [e.fromNodeId, e.toNodeId].sort()
      toCreate.push({ key, spouseAId: a, spouseBId: b })
    }
  }

  console.log(
    `  tree=${treeId}: ${toCreate.length} union(s) to create, ${childAssignments.size} child link(s) to set`
  )

  if (dryRun) return

  for (const u of toCreate) {
    const created = await db.union.create({
      data: { treeId, spouseAId: u.spouseAId, spouseBId: u.spouseBId ?? null },
    })
    unionsByKey.set(u.key, created.id)
  }

  for (const [childId, key] of childAssignments) {
    const unionId = unionsByKey.get(key)
    if (!unionId) continue
    await db.treeNode.update({ where: { id: childId }, data: { childOfUnionId: unionId } })
  }
}

async function main() {
  const trees = await db.tree.findMany({
    where: treeFilter ? { id: treeFilter } : undefined,
    select: { id: true, slug: true },
  })
  console.log(`Backfilling ${trees.length} tree(s)${dryRun ? ' [dry-run]' : ''}`)

  for (const tree of trees) {
    console.log(`- ${tree.slug} (${tree.id})`)
    await backfillTree(tree.id)
  }

  console.log('Done.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
