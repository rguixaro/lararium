'use server'

import * as Sentry from '@sentry/nextjs'

import { db } from '@/server/db'
import { assertAuthenticated, calculateDaysUntil, isInCurrentWeekOfYear } from '@/server/utils'

import {
  HighlightsResponse,
  MilestonesResponse,
  Milestone,
  Highlight,
  TreeNode,
  Tree,
  TreeInfo,
  TreeInfoResult,
  TreeInfoUpcomingBirthday,
  TreeInfoUpcomingAnniversary,
  TreeInfoMemory,
  MemberSummary,
  ActivityAction,
  TreeAccessRole,
  TreeNodeGender,
  PictureMetadata,
} from '@/types'

/**
 * Get milestones for the authenticated user's trees
 * @returns { Promise<MilestonesResponse> } Milestones data
 */
export async function getMilestones(): Promise<MilestonesResponse> {
  try {
    const userId = await assertAuthenticated()

    const trees = await db.tree.findMany({
      where: { accesses: { some: { userId } } },
      include: {
        nodes: {
          select: {
            id: true,
            fullName: true,
            birthDate: true,
            deathDate: true,
            treeId: true,
            taggedIn: {
              select: {
                isProfile: true,
                picture: { select: { fileKey: true, date: true, tags: true } },
              },
            },
          },
        },
      },
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const birthdays: Milestone[] = []
    const anniversaries: Milestone[] = []
    const memories: Milestone[] = []

    const addedPics = new Set<string>()

    const _getProfilePic = (node: TreeNode) => node.taggedIn?.find((tag) => tag.isProfile)?.picture
    const _getNodeName = (tree: Tree, nodeId: string) =>
      tree.nodes?.find((n) => n.id === nodeId)?.fullName || null

    const _addBirthday = (tree: Tree, node: TreeNode, birthDate: Date) => {
      let nextBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate())
      if (
        birthDate.getMonth() === 1 &&
        birthDate.getDate() === 29 &&
        nextBirthday.getMonth() !== 1
      ) {
        nextBirthday = new Date(today.getFullYear(), 1, 28)
      }
      nextBirthday.setHours(0, 0, 0, 0)
      if (nextBirthday < today) nextBirthday.setFullYear(today.getFullYear() + 1)
      const daysUntil = Math.round(
        (nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      )

      if (daysUntil >= 0 && daysUntil <= 30) {
        birthdays.push({
          id: node.id,
          name: node.fullName,
          treeName: tree.name,
          treeSlug: tree.slug,
          date: birthDate.toISOString().split('T')[0],
          age: nextBirthday.getFullYear() - birthDate.getFullYear(),
          picture: _getProfilePic(node)?.fileKey || null,
          daysUntil,
        })
      }
    }

    const _addAnniversary = (tree: Tree, node: TreeNode, date: Date, type: 'birth' | 'death') => {
      const daysUntil = calculateDaysUntil(date, { ignoreYear: true })
      if (daysUntil >= 0 && daysUntil <= 30) {
        anniversaries.push({
          id: node.id,
          name: node.fullName,
          treeName: tree.name,
          treeSlug: tree.slug,
          date: date.toISOString().split('T')[0],
          yearsAgo: today.getFullYear() - date.getFullYear(),
          daysUntil,
          picture: _getProfilePic(node)?.fileKey || null,
          type,
        })
      }
    }

    const _addMemories = (tree: Tree, node: TreeNode) => {
      node.taggedIn?.forEach((tag) => {
        const pic = tag.picture
        if (!pic?.date || addedPics.has(pic.fileKey)) return

        const taken = new Date(pic.date)

        if (isInCurrentWeekOfYear(taken)) {
          const allNames = pic.tags
            ?.map((t) => _getNodeName(tree, t.nodeId))
            .filter((n): n is string => !!n)

          memories.push({
            id: node.id,
            name: allNames && allNames.length > 0 ? allNames.join(', ') : node.fullName,
            treeName: tree.name,
            treeSlug: tree.slug,
            picture: pic.fileKey,
            yearsAgo: today.getFullYear() - taken.getFullYear(),
            date: taken.toISOString().split('T')[0],
          })
          addedPics.add(pic.fileKey)
        }
      })
    }

    trees.forEach((tree) => {
      tree.nodes?.forEach((node) => {
        const birthDate = node.birthDate ? new Date(node.birthDate) : null
        const deathDate = node.deathDate ? new Date(node.deathDate) : null

        if (birthDate && !deathDate)
          _addBirthday(tree as unknown as Tree, node as unknown as TreeNode, birthDate)
        if (birthDate)
          _addAnniversary(tree as unknown as Tree, node as unknown as TreeNode, birthDate, 'birth')
        if (deathDate)
          _addAnniversary(tree as unknown as Tree, node as unknown as TreeNode, deathDate, 'death')
        _addMemories(tree as unknown as Tree, node as unknown as TreeNode)
      })
    })

    return {
      birthdays: birthdays.sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0)),
      anniversaries: anniversaries.sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0)),
      memories: memories.sort((a, b) => (b.yearsAgo ?? 0) - (a.yearsAgo ?? 0)),
    }
  } catch (e) {
    Sentry.captureException(e, { tags: { action: 'getMilestones' } })
    return { birthdays: [], anniversaries: [], memories: [] }
  }
}

/**
 * Get highlights for the authenticated user's trees
 * @returns { Promise<HighlightsResponse> } Highlights data
 */
export async function getHighlights(): Promise<HighlightsResponse> {
  try {
    const userId = await assertAuthenticated()

    const trees = await db.tree.findMany({
      where: { accesses: { some: { userId } } },
      include: {
        nodes: {
          include: {
            edgesFrom: true,
            edgesTo: true,
            taggedIn: {
              select: { id: true, isProfile: true, picture: { select: { fileKey: true } } },
            },
          },
        },
      },
    })

    let oldestAncestor: Highlight | null = null
    let youngestAncestor: Highlight | null = null
    let mostPhotos: Highlight | null = null
    let mostChildren: Highlight | null = null
    let mostMembers: Highlight | null = null

    trees.forEach((t) => {
      const oldest = t.nodes
        .filter((n) => n.birthDate)
        .sort((a, b) => new Date(a.birthDate!).getTime() - new Date(b.birthDate!).getTime())[0]
      if (
        oldest &&
        (!oldestAncestor ||
          new Date(oldest.birthDate!).getTime() < new Date(oldestAncestor.birthDate!).getTime())
      ) {
        const picture = oldest.taggedIn.find((tag) => tag.isProfile)?.picture
        oldestAncestor = {
          id: oldest.id,
          name: oldest.fullName,
          gender: oldest.gender,
          treeName: t.name,
          treeSlug: t.slug,
          picture: picture?.fileKey,
          birthDate: oldest.birthDate!.toISOString(),
          birthYear: new Date(oldest.birthDate!).getFullYear(),
          addedAt: oldest.createdAt.toISOString(),
        }
      }
      const youngest = t.nodes.sort(
        (a, b) => new Date(b.birthDate!).getTime() - new Date(a.birthDate!).getTime()
      )[0]

      if (
        youngest &&
        (!youngestAncestor ||
          new Date(youngest.birthDate!).getTime() > new Date(youngestAncestor.birthDate!).getTime())
      ) {
        const picture = youngest.taggedIn.find((tag) => tag.isProfile)?.picture
        youngestAncestor = {
          id: youngest.id,
          name: youngest.fullName,
          treeName: t.name,
          treeSlug: t.slug,
          picture: picture?.fileKey,
          birthDate: youngest.birthDate!.toISOString(),
          birthYear: new Date(youngest.birthDate!).getFullYear(),
          addedAt: youngest.createdAt.toISOString(),
        }
      }
      const mostPictures = t.nodes
        .map((n) => ({
          n,
          photoCount: n.taggedIn.length,
          treeName: t.name,
          treeSlug: t.slug,
          picture: n.taggedIn.find((tag) => tag.isProfile)?.picture?.fileKey,
        }))
        .filter((i) => i.photoCount > 0)
        .sort((a, b) => b.photoCount - a.photoCount)[0]

      if (mostPictures && (!mostPhotos || mostPictures.photoCount > (mostPhotos.photoCount ?? 0))) {
        mostPhotos = {
          id: mostPictures.n.id,
          name: mostPictures.n.fullName,
          treeName: t.name,
          treeSlug: t.slug,
          photoCount: mostPictures.photoCount,
          picture: mostPictures?.picture,
        }
      }
      const largestBranch = t.nodes
        .map((n) => ({
          n,
          childrenCount: n.edgesFrom.filter((e) => e.type === 'PARENT').length,
          treeName: t.name,
          treeSlug: t.slug,
          picture: n.taggedIn.find((tag) => tag.isProfile)?.picture?.fileKey,
        }))
        .filter((i) => i.childrenCount > 0)
        .sort((a, b) => b.childrenCount - a.childrenCount)[0]
      if (
        largestBranch &&
        (!mostChildren || largestBranch.childrenCount > (mostChildren.childrenCount ?? 0))
      ) {
        mostChildren = {
          id: largestBranch.n.id,
          name: largestBranch.n.fullName,
          treeName: t.name,
          treeSlug: t.slug,
          childrenCount: largestBranch.childrenCount,
          picture: largestBranch?.picture,
        }
      }
    })

    if (trees.length > 0) {
      const largestTree = trees.sort((a, b) => b.nodes.length - a.nodes.length)[0]
      if (largestTree.nodes.length > 0) {
        const randomMember = largestTree.nodes[Math.floor(Math.random() * largestTree.nodes.length)]
        const picture = randomMember.taggedIn.find((tag) => tag.isProfile)?.picture

        mostMembers = {
          id: largestTree.id,
          name: largestTree.name,
          treeName: largestTree.name,
          treeSlug: largestTree.slug,
          memberCount: largestTree.nodes.length,
          picture: picture?.fileKey,
        }
      }
    }

    return {
      oldest: oldestAncestor,
      youngest: youngestAncestor,
      largest: mostChildren,
      mostPhotos,
      mostMembers,
    }
  } catch (e) {
    Sentry.captureException(e, { tags: { action: 'getHighlights' } })
    return { oldest: null, youngest: null, largest: null, mostPhotos: null, mostMembers: null }
  }
}

const AGE_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: '0-10', min: 0, max: 10 },
  { label: '11-20', min: 11, max: 20 },
  { label: '21-40', min: 21, max: 40 },
  { label: '41-60', min: 41, max: 60 },
  { label: '61-80', min: 61, max: 80 },
  { label: '81-100', min: 81, max: 100 },
  { label: '100+', min: 101, max: Infinity },
]

const ALL_ACTIONS: ActivityAction[] = [
  'NODE_CREATED',
  'NODE_UPDATED',
  'NODE_DELETED',
  'EDGE_CREATED',
  'EDGE_DELETED',
  'PICTURE_ADDED',
  'PICTURE_DELETED',
  'PICTURE_TAG_CREATED',
  'PICTURE_TAG_DELETED',
  'TREE_UPDATED',
  'SHARE_TOKEN_GENERATED',
  'MEMBER_JOINED_VIA_SHARE',
]

const ALL_GENDERS: TreeNodeGender[] = ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']

const ALL_ROLES: TreeAccessRole[] = ['VIEWER', 'EDITOR', 'ADMIN']

/**
 * Compute the longest chain of PARENT edges ending at each node using
 * DFS + memoization. Guards against cycles with a visiting-set.
 * Returns the maximum chain length across all nodes.
 */
function computeGenerationDepth(nodeIds: string[], parentsOf: Map<string, string[]>): number {
  const memo = new Map<string, number>()
  const visiting = new Set<string>()

  function depth(id: string): number {
    if (memo.has(id)) return memo.get(id)!
    if (visiting.has(id)) return 1
    visiting.add(id)
    const parents = parentsOf.get(id) ?? []
    const d = parents.length === 0 ? 1 : 1 + Math.max(...parents.map(depth))
    visiting.delete(id)
    memo.set(id, d)
    return d
  }

  let max = 0
  for (const id of nodeIds) {
    const d = depth(id)
    if (d > max) max = d
  }
  return max
}

function bucketAge(age: number): string {
  for (const b of AGE_BUCKETS) {
    if (age >= b.min && age <= b.max) return b.label
  }
  return '100+'
}

function normalizePlace(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * Get a comprehensive information snapshot for a single tree.
 */
export async function getTreeInfo(slug: string): Promise<TreeInfoResult> {
  try {
    const userId = await assertAuthenticated()

    const tree = await db.tree.findFirst({
      where: { slug, accesses: { some: { userId } } },
      include: {
        nodes: {
          select: {
            id: true,
            fullName: true,
            alias: true,
            gender: true,
            birthDate: true,
            birthPlace: true,
            deathDate: true,
            deathPlace: true,
            biography: true,
            createdAt: true,
            taggedIn: {
              select: {
                isProfile: true,
                picture: { select: { fileKey: true } },
              },
            },
          },
        },
        TreeEdge: {
          select: { id: true, fromNodeId: true, toNodeId: true, type: true },
        },
        accesses: {
          select: {
            role: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        deletionRequest: {
          include: {
            requestedBy: { select: { id: true, name: true, email: true, image: true } },
            approvedBy: { select: { id: true, name: true, email: true, image: true } },
          },
        },
      },
    })

    if (!tree) return { error: true, message: 'error-tree-not-found' }

    const nodes = tree.nodes
    const edges = tree.TreeEdge
    const accesses = tree.accesses

    const pictures = await db.picture.findMany({
      where: { treeId: tree.id },
      select: {
        id: true,
        fileKey: true,
        date: true,
        metadata: true,
        createdAt: true,
        tags: { select: { nodeId: true } },
      },
    })

    const [activityCount, recentLogsRaw, actionCounts, contributorCounts] = await Promise.all([
      db.activityLog.count({ where: { treeId: tree.id } }),
      db.activityLog.findMany({
        where: { treeId: tree.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          tree: true,
          user: { select: { id: true, name: true, image: true } },
        },
      }),
      db.activityLog.groupBy({
        by: ['action'],
        where: { treeId: tree.id },
        _count: true,
      }),
      db.activityLog.groupBy({
        by: ['createdBy'],
        where: { treeId: tree.id, createdBy: { not: null } },
        _count: true,
        orderBy: { _count: { createdBy: 'desc' } },
        take: 5,
      }),
    ])

    const contributorIds = contributorCounts
      .map((c) => c.createdBy)
      .filter((id): id is string => !!id)
    const contributorUsers =
      contributorIds.length > 0
        ? await db.user.findMany({
            where: { id: { in: contributorIds } },
            select: { id: true, name: true, image: true },
          })
        : []

    const getProfilePic = (nodeId: string): string | null => {
      const n = nodes.find((x) => x.id === nodeId)
      return n?.taggedIn?.find((t) => t.isProfile)?.picture?.fileKey ?? null
    }

    const toSummary = (n: (typeof nodes)[number]): MemberSummary => ({
      id: n.id,
      name: n.fullName,
      picture: n.taggedIn?.find((t) => t.isProfile)?.picture?.fileKey ?? null,
      birthDate: n.birthDate,
      deathDate: n.deathDate,
      gender: n.gender as TreeNodeGender,
    })

    const lastActivityAt = recentLogsRaw[0]?.createdAt ?? null
    const ageInDays = Math.max(
      0,
      Math.floor((Date.now() - tree.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    )

    const genderBreakdown: Record<TreeNodeGender, number> = {
      MALE: 0,
      FEMALE: 0,
      OTHER: 0,
      UNSPECIFIED: 0,
    }
    let livingCount = 0
    let deceasedCount = 0
    let withBirthDate = 0
    let withDeathDate = 0
    let withBiography = 0
    let withProfilePicture = 0
    let withBirthPlace = 0
    let withGender = 0
    let sumAgeLiving = 0
    let countAgeLiving = 0
    let sumAgeAtDeath = 0
    let countAgeAtDeath = 0

    const now = new Date()
    const nowTs = now.getTime()
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000

    let oldestMember: MemberSummary | null = null
    let youngestMember: MemberSummary | null = null
    let oldestBirthYear: number | null = null
    let youngestBirthYear: number | null = null
    let longestLived: (MemberSummary & { ageAtDeath: number }) | null = null
    const deceasedByAge: Array<MemberSummary & { ageAtDeath: number }> = []

    const ageAtDeathCounts = new Map<string, number>()
    const birthDecadeCounts = new Map<string, number>()
    const birthPlaceMap = new Map<string, { display: string; count: number }>()
    const deathPlaceMap = new Map<string, { display: string; count: number }>()

    for (const n of nodes) {
      genderBreakdown[n.gender as TreeNodeGender]++
      if (n.gender !== 'UNSPECIFIED') withGender++

      if (n.deathDate) {
        deceasedCount++
        withDeathDate++
      } else {
        livingCount++
      }

      if (n.birthDate) {
        withBirthDate++
        const birthYear = n.birthDate.getFullYear()
        if (oldestBirthYear === null || birthYear < oldestBirthYear) {
          oldestBirthYear = birthYear
          oldestMember = toSummary(n)
        }
        if (youngestBirthYear === null || birthYear > youngestBirthYear) {
          youngestBirthYear = birthYear
          youngestMember = toSummary(n)
        }

        const decade = `${Math.floor(birthYear / 10) * 10}s`
        birthDecadeCounts.set(decade, (birthDecadeCounts.get(decade) ?? 0) + 1)

        if (!n.deathDate) {
          const ageYears = (nowTs - n.birthDate.getTime()) / YEAR_MS
          if (ageYears >= 0 && ageYears < 130) {
            sumAgeLiving += ageYears
            countAgeLiving++
          }
        } else {
          const ageAtDeathYears = (n.deathDate.getTime() - n.birthDate.getTime()) / YEAR_MS
          if (ageAtDeathYears >= 0 && ageAtDeathYears < 130) {
            sumAgeAtDeath += ageAtDeathYears
            countAgeAtDeath++
            const floored = Math.floor(ageAtDeathYears)
            const bucket = bucketAge(floored)
            ageAtDeathCounts.set(bucket, (ageAtDeathCounts.get(bucket) ?? 0) + 1)
            const entry = { ...toSummary(n), ageAtDeath: floored }
            deceasedByAge.push(entry)
            if (!longestLived || floored > longestLived.ageAtDeath) {
              longestLived = entry
            }
          }
        }
      }

      if (n.biography && n.biography.trim().length > 0) withBiography++
      if (n.birthPlace && n.birthPlace.trim().length > 0) withBirthPlace++
      if (n.taggedIn?.some((t) => t.isProfile)) withProfilePicture++

      if (n.birthPlace && n.birthPlace.trim().length > 0) {
        const key = normalizePlace(n.birthPlace)
        const prev = birthPlaceMap.get(key)
        if (prev) prev.count++
        else birthPlaceMap.set(key, { display: n.birthPlace.trim(), count: 1 })
      }
      if (n.deathPlace && n.deathPlace.trim().length > 0) {
        const key = normalizePlace(n.deathPlace)
        const prev = deathPlaceMap.get(key)
        if (prev) prev.count++
        else deathPlaceMap.set(key, { display: n.deathPlace.trim(), count: 1 })
      }
    }

    const parentsOf = new Map<string, string[]>()
    const childrenOf = new Map<string, string[]>()
    const hasAnyEdge = new Set<string>()
    let parentChildPairs = 0
    let spousePairs = 0
    let couplePairs = 0

    for (const e of edges) {
      hasAnyEdge.add(e.fromNodeId)
      hasAnyEdge.add(e.toNodeId)
      if (e.type === 'PARENT') {
        parentChildPairs++
        const kids = childrenOf.get(e.fromNodeId) ?? []
        kids.push(e.toNodeId)
        childrenOf.set(e.fromNodeId, kids)
        const pars = parentsOf.get(e.toNodeId) ?? []
        pars.push(e.fromNodeId)
        parentsOf.set(e.toNodeId, pars)
      } else if (e.type === 'SPOUSE') {
        spousePairs++
      } else if (e.type === 'COUPLE') {
        couplePairs++
      }
    }

    const isolatedNodes = nodes.filter((n) => !hasAnyEdge.has(n.id)).length
    const parents = Array.from(childrenOf.keys())
    const avgChildrenPerParent =
      parents.length > 0
        ? parents.reduce((sum, p) => sum + (childrenOf.get(p)?.length ?? 0), 0) / parents.length
        : null

    const topFamilies = Array.from(childrenOf.entries())
      .map(([parentId, kids]) => {
        const parentNode = nodes.find((n) => n.id === parentId)
        if (!parentNode) return null
        return { ...toSummary(parentNode), childrenCount: kids.length }
      })
      .filter((x): x is MemberSummary & { childrenCount: number } => x !== null)
      .sort((a, b) => b.childrenCount - a.childrenCount)
      .slice(0, 5)
    const largestFamily = topFamilies[0] ?? null

    const generationDepth = computeGenerationDepth(
      nodes.map((n) => n.id),
      parentsOf
    )

    const pictureCountByNode = new Map<string, number>()
    let picturesWithDate = 0
    let picturesWithGps = 0
    let earliestPictureDate: Date | null = null

    for (const p of pictures) {
      for (const tag of p.tags) {
        pictureCountByNode.set(tag.nodeId, (pictureCountByNode.get(tag.nodeId) ?? 0) + 1)
      }
      const meta = (p.metadata ?? null) as PictureMetadata | null
      const effectiveDate = p.date ?? meta?.takenAt ?? null
      if (effectiveDate) {
        picturesWithDate++
        const d = new Date(effectiveDate)
        if (!earliestPictureDate || d < earliestPictureDate) earliestPictureDate = d
      }
      if (meta?.gps?.lat != null && meta?.gps?.lng != null) picturesWithGps++
    }

    const mostPhotographed = Array.from(pictureCountByNode.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nodeId, count]) => {
        const n = nodes.find((x) => x.id === nodeId)
        if (!n) return null
        return { ...toSummary(n), photoCount: count }
      })
      .filter((x): x is MemberSummary & { photoCount: number } => x !== null)

    const untaggedPeople = nodes.filter((n) => !pictureCountByNode.has(n.id)).length

    const today0 = new Date()
    today0.setHours(0, 0, 0, 0)

    const upcomingBirthdays: TreeInfoUpcomingBirthday[] = []
    const upcomingAnniversaries: TreeInfoUpcomingAnniversary[] = []
    const memoriesThisWeek: TreeInfoMemory[] = []

    for (const n of nodes) {
      if (n.birthDate && !n.deathDate) {
        const daysUntil = calculateDaysUntil(n.birthDate, { ignoreYear: true })
        if (daysUntil >= 0 && daysUntil <= 30) {
          const nextBirthday = new Date(n.birthDate)
          nextBirthday.setFullYear(today0.getFullYear())
          if (nextBirthday < today0) nextBirthday.setFullYear(today0.getFullYear() + 1)
          const age = nextBirthday.getFullYear() - n.birthDate.getFullYear()
          upcomingBirthdays.push({
            id: n.id,
            name: n.fullName,
            date: nextBirthday,
            age,
            daysUntil,
            picture: getProfilePic(n.id),
          })
        }
      }

      if (n.birthDate) {
        const daysUntil = calculateDaysUntil(n.birthDate, { ignoreYear: true })
        if (daysUntil >= 0 && daysUntil <= 30) {
          const nextOccurrence = new Date(n.birthDate)
          nextOccurrence.setFullYear(today0.getFullYear())
          if (nextOccurrence < today0) nextOccurrence.setFullYear(today0.getFullYear() + 1)
          const yearsAgo = nextOccurrence.getFullYear() - n.birthDate.getFullYear()
          upcomingAnniversaries.push({
            id: n.id,
            name: n.fullName,
            type: 'birth',
            date: nextOccurrence,
            yearsAgo,
            picture: getProfilePic(n.id),
          })
        }
      }

      if (n.deathDate) {
        const daysUntil = calculateDaysUntil(n.deathDate, { ignoreYear: true })
        if (daysUntil >= 0 && daysUntil <= 30) {
          const nextOccurrence = new Date(n.deathDate)
          nextOccurrence.setFullYear(today0.getFullYear())
          if (nextOccurrence < today0) nextOccurrence.setFullYear(today0.getFullYear() + 1)
          const yearsAgo = nextOccurrence.getFullYear() - n.deathDate.getFullYear()
          upcomingAnniversaries.push({
            id: n.id,
            name: n.fullName,
            type: 'death',
            date: nextOccurrence,
            yearsAgo,
            picture: getProfilePic(n.id),
          })
        }
      }
    }

    const addedMemoryPics = new Set<string>()
    for (const p of pictures) {
      const meta = (p.metadata ?? null) as PictureMetadata | null
      const effectiveDate = p.date ?? meta?.takenAt ?? null
      if (!effectiveDate) continue
      const d = new Date(effectiveDate)
      if (!isInCurrentWeekOfYear(d)) continue
      if (addedMemoryPics.has(p.id)) continue
      addedMemoryPics.add(p.id)

      const firstTag = p.tags[0]
      if (!firstTag) continue
      const node = nodes.find((x) => x.id === firstTag.nodeId)
      if (!node) continue
      const yearsAgo = today0.getFullYear() - d.getFullYear()
      memoriesThisWeek.push({
        id: p.id,
        name: node.fullName,
        date: d,
        yearsAgo,
        picture: p.fileKey,
      })
    }

    upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil)
    upcomingAnniversaries.sort((a, b) => a.date.getTime() - b.date.getTime())
    memoriesThisWeek.sort((a, b) => a.date.getTime() - b.date.getTime())

    const byRole: Record<TreeAccessRole, number> = { VIEWER: 0, EDITOR: 0, ADMIN: 0 }
    const collaboratorList = accesses.map((a) => {
      byRole[a.role as TreeAccessRole]++
      return {
        id: a.user.id,
        name: a.user.name,
        email: a.user.email,
        image: a.user.image,
        role: a.role as TreeAccessRole,
        joinedAt: a.createdAt,
      }
    })

    const actionBreakdown: Record<ActivityAction, number> = ALL_ACTIONS.reduce(
      (acc, a) => {
        acc[a] = 0
        return acc
      },
      {} as Record<ActivityAction, number>
    )
    for (const row of actionCounts) {
      actionBreakdown[row.action as ActivityAction] = row._count
    }

    const topContributors = contributorCounts.map((c) => {
      const user = contributorUsers.find((u) => u.id === c.createdBy)
      return {
        userId: c.createdBy as string,
        name: user?.name ?? null,
        image: user?.image ?? null,
        count: c._count,
      }
    })

    const mostPhotographedTop = mostPhotographed[0] ?? null

    const ageAtDeathBuckets = AGE_BUCKETS.map((b) => ({
      label: b.label,
      count: ageAtDeathCounts.get(b.label) ?? 0,
    })).filter((b) => b.count > 0)
    const birthDecadeBuckets = Array.from(birthDecadeCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([decade, count]) => ({ decade, count }))

    const topBirthPlaces = Array.from(birthPlaceMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((x) => ({ place: x.display, count: x.count }))
    const topDeathPlaces = Array.from(deathPlaceMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((x) => ({ place: x.display, count: x.count }))

    const info: TreeInfo = {
      tree: {
        id: tree.id,
        slug: tree.slug,
        name: tree.name,
        type: tree.type,
        createdAt: tree.createdAt,
        updatedAt: tree.updatedAt,
        newsletter: tree.newsletter,
        ageInDays,
        lastActivityAt,
        deletionRequest: tree.deletionRequest,
      },
      overview: {
        totalMembers: nodes.length,
        totalEdges: edges.length,
        totalPictures: pictures.length,
        totalCollaborators: accesses.length,
      },
      demographics: {
        genderBreakdown,
        livingCount,
        deceasedCount,
        withBirthDate,
        withDeathDate,
        withBiography,
        withProfilePicture,
        withBirthPlace,
        withGender,
        avgAgeLiving: countAgeLiving > 0 ? sumAgeLiving / countAgeLiving : null,
        avgAgeAtDeath: countAgeAtDeath > 0 ? sumAgeAtDeath / countAgeAtDeath : null,
      },
      generations: {
        depth: generationDepth,
        spanYears:
          oldestBirthYear !== null && youngestBirthYear !== null
            ? youngestBirthYear - oldestBirthYear
            : null,
        oldestMember,
        youngestMember,
      },
      relationships: {
        parentChildPairs,
        spousePairs,
        couplePairs,
        isolatedNodes,
        avgChildrenPerParent,
        largestFamily,
        topFamilies,
      },
      lifeStats: {
        longestLived,
        topLongestLived: deceasedByAge
          .slice()
          .sort((a, b) => b.ageAtDeath - a.ageAtDeath)
          .slice(0, 5),
        ageAtDeathBuckets,
        birthDecadeBuckets,
      },
      places: {
        topBirthPlaces,
        topDeathPlaces,
        uniqueBirthPlaces: birthPlaceMap.size,
        uniqueDeathPlaces: deathPlaceMap.size,
      },
      pictures: {
        total: pictures.length,
        withDate: picturesWithDate,
        withGps: picturesWithGps,
        earliestDate: earliestPictureDate,
        mostPhotographed,
        untaggedPeople,
      },
      upcomingEvents: {
        birthdays: upcomingBirthdays,
        anniversaries: upcomingAnniversaries,
        memoriesThisWeek,
      },
      collaborators: {
        byRole,
        list: collaboratorList,
      },
      activity: {
        totalLogs: activityCount,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recentLogs: recentLogsRaw as any,
        topContributors,
        actionBreakdown,
      },
      highlights: {
        oldestAncestor: oldestMember,
        youngestMember,
        largestBranch: largestFamily,
        mostPhotographed: mostPhotographedTop,
      },
    }

    void ALL_GENDERS
    void ALL_ROLES

    return info
  } catch (e) {
    Sentry.captureException(e, { tags: { action: 'getTreeInfo' } })
    return { error: true, message: 'error' }
  }
}
