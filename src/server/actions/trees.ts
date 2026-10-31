'use server'

import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import type { z } from 'zod'

import { db } from '@/server/db'
import { deleteFileFromS3 } from '@/lib/s3'
import {
  CreateTreeSchema,
  CreateTreeNodeSchema,
  CreateTreeEdgeSchema,
  UpdateTreeNodeSchema,
  CreateUnionSchema,
  UpdateUnionSchema,
  AttachChildToUnionSchema,
} from '@/server/schemas'
import type { TreeAccessRole } from '@/server/schemas'
import {
  slugify,
  assertRole,
  assertAuthenticated,
  assertTreeWritable,
  getChanges,
} from '@/server/utils'

import {
  sendTreeDeletedEmail,
  sendTreeDeletionRequestedEmail,
  sendTreeInvitationEmail,
} from '@/lib/email'

import { languageToLocale } from '@/utils/language'

import { PictureMetadata, Tree, TreeEdge, TreeNode, TimelineEvent, Union } from '@/types'

interface TreeResult {
  error: boolean
  message?: string
  tree?: Tree
}

interface TreeDeletionResult extends TreeResult {
  deleted?: boolean
  availableAt?: Date
}

export type TreeExportResult =
  | { error: false; tree: Tree; nodes: TreeNode[]; edges: TreeEdge[]; unions: Union[] }
  | { error: true; message?: string }

const TREE_DELETION_GRACE_PERIOD_DAYS = 7
const MS_PER_DAY = 86_400_000
const TREE_WRITE_ERROR_MESSAGES = ['error-no-permission', 'error-tree-pending-deletion'] as const

const getTreeDeletionAvailableAt = (requestedAt: Date) =>
  new Date(requestedAt.getTime() + TREE_DELETION_GRACE_PERIOD_DAYS * MS_PER_DAY)

const getActionErrorMessage = (error: unknown): string | undefined =>
  error instanceof Error ? error.message : undefined

const isTreeWriteError = (error: unknown) => {
  const message = getActionErrorMessage(error)
  return !!message && TREE_WRITE_ERROR_MESSAGES.includes(message as TreeWriteErrorMessage)
}

type TreeWriteErrorMessage = (typeof TREE_WRITE_ERROR_MESSAGES)[number]

type MemberLifeDates = { birthDate?: Date | null; deathDate?: Date | null }
type UnionLifeDates = { marriedAt?: Date | null; divorcedAt?: Date | null }

function getUnionLifeDateError(
  spouses: MemberLifeDates[],
  dates: UnionLifeDates
): string | undefined {
  for (const spouse of spouses) {
    if (
      dates.marriedAt &&
      spouse.birthDate &&
      dates.marriedAt.getTime() <= spouse.birthDate.getTime()
    )
      return 'error-married-before-birth'

    if (
      dates.marriedAt &&
      spouse.deathDate &&
      dates.marriedAt.getTime() >= spouse.deathDate.getTime()
    )
      return 'error-married-after-death'

    if (
      dates.divorcedAt &&
      spouse.deathDate &&
      dates.divorcedAt.getTime() >= spouse.deathDate.getTime()
    )
      return 'error-divorced-after-death'
  }
}

type TreeAdminRecipient = {
  user: { email: string | null; name: string | null; language?: 'UR' | 'EN' | null }
}

async function sendDeletionRequestedEmails({
  admins,
  treeName,
  treeSlug,
  requestedByName,
  requestedAt,
  availableAt,
}: {
  admins: TreeAdminRecipient[]
  treeName: string
  treeSlug: string
  requestedByName: string
  requestedAt: Date
  availableAt: Date
}) {
  await Promise.all(
    admins
      .filter((access) => access.user.email)
      .map((access) =>
        sendTreeDeletionRequestedEmail({
          recipientEmail: access.user.email!,
          recipientName: access.user.name || access.user.email!,
          treeName,
          treeSlug,
          requestedByName,
          requestedAt,
          availableAt,
          locale: access.user.language ? languageToLocale(access.user.language) : 'en',
        }).catch((err) =>
          Sentry.captureException(err, {
            level: 'warning',
            tags: { action: 'requestTreeDeletion', step: 'send-email' },
          })
        )
      )
  )
}

async function sendDeletedEmails({
  admins,
  treeName,
}: {
  admins: TreeAdminRecipient[]
  treeName: string
}) {
  await Promise.all(
    admins
      .filter((access) => access.user.email)
      .map((access) =>
        sendTreeDeletedEmail({
          recipientEmail: access.user.email!,
          recipientName: access.user.name || access.user.email!,
          treeName,
          locale: access.user.language ? languageToLocale(access.user.language) : 'en',
        }).catch((err) =>
          Sentry.captureException(err, {
            level: 'warning',
            tags: { action: 'approveTreeDeletion', step: 'send-email' },
          })
        )
      )
  )
}

async function hardDeleteTree(treeId: string) {
  const tree = await db.tree.findUnique({
    where: { id: treeId },
    include: {
      accesses: {
        where: { role: 'ADMIN' },
        include: { user: { select: { email: true, name: true, language: true } } },
      },
      Picture: { select: { id: true, fileKey: true } },
    },
  })
  if (!tree) return null

  await db.$transaction(async (tx) => {
    await tx.treeNode.updateMany({
      where: { treeId },
      data: { childOfUnionId: null },
    })
    await tx.union.deleteMany({ where: { treeId } })
    await tx.treeEdge.deleteMany({ where: { treeId } })
    await tx.pictureTag.deleteMany({
      where: { pictureId: { in: tree.Picture.map((picture) => picture.id) } },
    })
    await tx.picture.deleteMany({ where: { treeId } })
    await tx.treeNote.deleteMany({ where: { treeId } })
    await tx.treeDeletionRequest.deleteMany({ where: { treeId } })
    await tx.activityLog.deleteMany({ where: { treeId } })
    await tx.treeAccess.deleteMany({ where: { treeId } })
    await tx.treeNode.deleteMany({ where: { treeId } })
    await tx.tree.delete({ where: { id: treeId } })
  })

  await Promise.all(
    tree.Picture.map((picture) =>
      deleteFileFromS3(picture.fileKey).catch((err) =>
        Sentry.captureException(err, {
          level: 'warning',
          tags: { action: 'hardDeleteTree', step: 's3-cleanup' },
          extra: { fileKey: picture.fileKey },
        })
      )
    )
  )

  await sendDeletedEmails({ admins: tree.accesses, treeName: tree.name })

  revalidatePath('/')
  revalidatePath('/trees')
  revalidatePath(`/trees/${tree.slug}`)
  revalidatePath(`/trees/view/${tree.slug}`)
  revalidatePath(`/trees/settings/${tree.slug}`)

  return tree
}

/**
 * Create new tree.
 * Auth required.
 * @param values {z.infer<typeof CreateTreeSchema>}
 * @returns Promise<TreeResult>
 */
export const createTree = async (values: z.infer<typeof CreateTreeSchema>): Promise<TreeResult> => {
  try {
    CreateTreeSchema.parse(values)
    const userId = await assertAuthenticated()

    const tree = await db.tree.create({
      data: {
        slug: slugify(values.name),
        name: values.name,
        newsletter: values.newsletter,
        accesses: { create: { userId, role: 'ADMIN' } },
      },
      include: {
        accesses: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        },
      },
    })

    revalidatePath('/')
    revalidatePath('/trees')

    return { error: false, tree: tree || undefined }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return { error: true, message: 'error-tree-exists' }
    }
    Sentry.captureException(e, { tags: { action: 'createTree' } })
    return { error: true, message: 'error' }
  }
}

/**
 * Update an existing tree.
 * Auth required.
 * Only users with ADMIN or EDITOR role can update.
 * @param values {z.infer<typeof CreateTreeSchema>}
 * @returns Promise<TreeResult>
 */
export const updateTree = async (
  id: string,
  values: z.infer<typeof CreateTreeSchema>
): Promise<TreeResult> => {
  try {
    CreateTreeSchema.parse(values)
    const userId = await assertAuthenticated()
    await assertRole(id, userId)
    await assertTreeWritable(id)

    const prevTree = await db.tree.findUnique({ where: { id } })
    if (!prevTree) return { error: true, message: 'error-tree-not-found' }

    const updatedTree = await db.tree.update({
      where: { id },
      data: {
        name: values.name,
        newsletter: values.newsletter,
        slug: slugify(values.name),
      },
      include: {
        accesses: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        },
      },
    })

    const changes = getChanges(prevTree, values, ['name', 'newsletter'])

    if (changes) {
      await db.activityLog.create({
        data: {
          treeId: id,
          createdBy: userId,
          action: 'TREE_UPDATED',
          entityId: id,
          metadata: { treeName: values.name, changes },
        },
      })
    }

    return { error: false, tree: updatedTree || undefined }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return { error: true, message: 'error-tree-exists' }
    }
    Sentry.captureException(e, { tags: { action: 'updateTree' } })
    return { error: true, message: 'error' }
  }
}

export const requestTreeDeletion = async (treeId: string): Promise<TreeDeletionResult> => {
  try {
    const userId = await assertAuthenticated()
    await assertRole(treeId, userId, ['ADMIN'])

    const tree = await db.tree.findUnique({
      where: { id: treeId },
      include: {
        deletionRequest: true,
        _count: { select: { nodes: true } },
        accesses: {
          where: { role: 'ADMIN' },
          include: { user: { select: { email: true, name: true, language: true } } },
        },
      },
    })
    if (!tree) return { error: true, message: 'error-tree-not-found' }
    if (tree.deletionRequest) return { error: true, message: 'error-tree-pending-deletion' }

    if (tree._count.nodes === 0) {
      await hardDeleteTree(treeId)
      return { error: false, deleted: true }
    }

    const requestedBy = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    })
    const request = await db.treeDeletionRequest.create({
      data: { treeId, requestedById: userId },
      include: {
        requestedBy: { select: { id: true, name: true, email: true, image: true } },
        approvedBy: { select: { id: true, name: true, email: true, image: true } },
      },
    })
    const availableAt = getTreeDeletionAvailableAt(request.requestedAt)

    await db.activityLog.create({
      data: {
        treeId,
        createdBy: userId,
        action: 'TREE_DELETION_REQUESTED',
        entityId: request.id,
        metadata: {
          requestedAt: request.requestedAt.toISOString(),
          availableAt: availableAt.toISOString(),
        },
      },
    })

    await sendDeletionRequestedEmails({
      admins: tree.accesses,
      treeName: tree.name,
      treeSlug: tree.slug,
      requestedByName: requestedBy?.name || requestedBy?.email || 'Unknown',
      requestedAt: request.requestedAt,
      availableAt,
    })

    const updatedTree = await db.tree.findUnique({
      where: { id: treeId },
      include: {
        accesses: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        },
        deletionRequest: {
          include: {
            requestedBy: { select: { id: true, name: true, email: true, image: true } },
            approvedBy: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        _count: { select: { nodes: true } },
      },
    })

    revalidatePath('/')
    revalidatePath('/trees')
    revalidatePath(`/trees/${tree.slug}`)
    revalidatePath(`/trees/view/${tree.slug}`)
    revalidatePath(`/trees/settings/${tree.slug}`)

    return { error: false, tree: updatedTree ?? undefined, availableAt }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    Sentry.captureException(e, { tags: { action: 'requestTreeDeletion' } })
    return { error: true, message: 'error' }
  }
}

export const cancelTreeDeletion = async (treeId: string): Promise<TreeDeletionResult> => {
  try {
    const userId = await assertAuthenticated()
    await assertRole(treeId, userId, ['ADMIN'])

    const tree = await db.tree.findUnique({
      where: { id: treeId },
      include: { deletionRequest: true },
    })
    if (!tree) return { error: true, message: 'error-tree-not-found' }
    if (!tree.deletionRequest)
      return { error: true, message: 'error-tree-deletion-request-not-found' }

    await db.treeDeletionRequest.delete({ where: { treeId } })

    await db.activityLog.create({
      data: {
        treeId,
        createdBy: userId,
        action: 'TREE_DELETION_CANCELLED',
        entityId: tree.deletionRequest.id,
        metadata: { requestedAt: tree.deletionRequest.requestedAt.toISOString() },
      },
    })

    const updatedTree = await db.tree.findUnique({
      where: { id: treeId },
      include: {
        accesses: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        },
        deletionRequest: {
          include: {
            requestedBy: { select: { id: true, name: true, email: true, image: true } },
            approvedBy: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        _count: { select: { nodes: true } },
      },
    })

    revalidatePath('/')
    revalidatePath('/trees')
    revalidatePath(`/trees/${tree.slug}`)
    revalidatePath(`/trees/view/${tree.slug}`)
    revalidatePath(`/trees/settings/${tree.slug}`)

    return { error: false, tree: updatedTree ?? undefined }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    Sentry.captureException(e, { tags: { action: 'cancelTreeDeletion' } })
    return { error: true, message: 'error' }
  }
}

export const approveTreeDeletion = async (treeId: string): Promise<TreeDeletionResult> => {
  try {
    const userId = await assertAuthenticated()
    await assertRole(treeId, userId, ['ADMIN'])

    const tree = await db.tree.findUnique({
      where: { id: treeId },
      include: { deletionRequest: true, _count: { select: { nodes: true } } },
    })
    if (!tree) return { error: true, message: 'error-tree-not-found' }
    if (!tree.deletionRequest)
      return { error: true, message: 'error-tree-deletion-request-not-found' }

    const availableAt = getTreeDeletionAvailableAt(tree.deletionRequest.requestedAt)
    if (tree._count.nodes > 0 && availableAt.getTime() > Date.now()) {
      return { error: true, message: 'error-tree-deletion-not-ready', availableAt }
    }

    await db.treeDeletionRequest.update({
      where: { treeId },
      data: { approvedAt: new Date(), approvedById: userId },
    })

    await db.activityLog.create({
      data: {
        treeId,
        createdBy: userId,
        action: 'TREE_DELETION_APPROVED',
        entityId: tree.deletionRequest.id,
        metadata: {
          requestedAt: tree.deletionRequest.requestedAt.toISOString(),
          approvedAt: new Date().toISOString(),
        },
      },
    })

    await hardDeleteTree(treeId)

    return { error: false, deleted: true }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    Sentry.captureException(e, { tags: { action: 'approveTreeDeletion' } })
    return { error: true, message: 'error' }
  }
}

/**
 * Invite a user to a tree.
 * Auth required.
 * Only users with ADMIN or EDITOR role can invite.
 * @param treeId {string} Tree id
 * @param email {string} User email
 * @param role {TreeAccessRole} Tree access role
 * @returns Promise<TreeResult>
 */
export const inviteMember = async (
  treeId: string,
  email: string,
  role: TreeAccessRole
): Promise<TreeResult> => {
  try {
    const inviterId = await assertAuthenticated()
    await assertRole(treeId, inviterId)
    await assertTreeWritable(treeId)

    if (role === 'ADMIN') {
      const inviterAccess = await db.treeAccess.findFirst({ where: { treeId, userId: inviterId } })
      if (inviterAccess?.role !== 'ADMIN') return { error: true, message: 'error-no-permission' }
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user) return { error: true, message: 'error-user-not-found' }

    const existing = await db.treeAccess.findFirst({ where: { treeId, userId: user.id } })
    if (existing) return { error: true, message: 'error-user-already-in-tree' }

    await db.treeAccess.create({ data: { treeId, userId: user.id, role } })

    const tree = await db.tree.findUnique({
      where: { id: treeId },
      include: {
        accesses: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        },
      },
    })

    const inviter = await db.user.findUnique({ where: { id: inviterId } })
    if (tree && inviter) {
      await sendTreeInvitationEmail({
        recipientEmail: user.email!,
        recipientName: user.name || user.email!,
        inviterName: inviter.name || inviter.email!,
        treeName: tree.name,
        treeSlug: tree.slug,
        role,
        locale: user.language ? languageToLocale(user.language) : 'en',
      }).catch((err) =>
        Sentry.captureException(err, {
          level: 'warning',
          tags: { action: 'inviteMember', step: 'send-email' },
        })
      )
    }

    revalidatePath('/')
    revalidatePath('/trees')

    return { error: false, tree: tree || undefined }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    Sentry.captureException(e, { tags: { action: 'inviteMember' } })
    return { error: true, message: 'error' }
  }
}

/**
 * Update a tree member's role.
 * @param treeId {string} Tree id
 * @param memberId {string} User id of the member
 * @param role {TreeAccessRole} New role
 * @returns Promise<TreeResult>
 */
export const updateMember = async (
  treeId: string,
  memberId: string,
  role: TreeAccessRole
): Promise<TreeResult> => {
  try {
    const userId = await assertAuthenticated()
    await assertRole(treeId, userId, ['ADMIN'])
    await assertTreeWritable(treeId)

    if (role !== 'ADMIN') {
      const remainingAdmins = await db.treeAccess.count({
        where: { treeId, role: 'ADMIN', userId: { not: memberId } },
      })
      if (remainingAdmins === 0) return { error: true, message: 'error-tree-admin-required' }
    }

    await db.treeAccess.update({
      where: { treeId_userId: { treeId, userId: memberId } },
      data: { role },
    })

    const tree = await db.tree.findUnique({
      where: { id: treeId },
      include: {
        accesses: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        },
      },
    })

    revalidatePath('/')
    revalidatePath('/trees')

    return { error: false, tree: tree ?? undefined }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    Sentry.captureException(e, { tags: { action: 'updateMember' } })
    return { error: true, message: 'error' }
  }
}

/**
 * Remove a user from a tree.
 * Auth required.
 * Only users with ADMIN or EDITOR role can remove members.
 * @param treeId {string} Tree id
 * @param memberId {string} User id to remove
 * @returns Promise<TreeResult>
 */
export const removeMember = async (treeId: string, memberId: string): Promise<TreeResult> => {
  try {
    const userId = await assertAuthenticated()
    await assertRole(treeId, userId, ['ADMIN'])
    await assertTreeWritable(treeId)

    const target = await db.treeAccess.findUnique({
      where: { treeId_userId: { treeId, userId: memberId } },
      select: { role: true },
    })
    if (target?.role === 'ADMIN') {
      const remainingAdmins = await db.treeAccess.count({
        where: { treeId, role: 'ADMIN', userId: { not: memberId } },
      })
      if (remainingAdmins === 0) return { error: true, message: 'error-tree-admin-required' }
    }

    await db.treeAccess.delete({ where: { treeId_userId: { treeId, userId: memberId } } })

    const tree = await db.tree.findUnique({
      where: { id: treeId },
      include: {
        accesses: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        },
      },
    })

    revalidatePath('/')
    revalidatePath('/trees')

    return { error: false, tree: tree ?? undefined }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    Sentry.captureException(e, { tags: { action: 'removeMember' } })
    return { error: true, message: 'error' }
  }
}

/**
 * Create new tree node.
 * Auth required.
 * @param values {z.infer<typeof CreateTreeNodeSchema>}
 * @returns Promise<TreeResult>
 */
export const createTreeNode = async (
  values: z.infer<typeof CreateTreeNodeSchema>
): Promise<TreeResult & { nodeId?: string }> => {
  try {
    CreateTreeNodeSchema.parse(values)
    const userId = await assertAuthenticated()
    await assertRole(values.treeId, userId)
    await assertTreeWritable(values.treeId)

    const node = await db.treeNode.create({
      data: {
        treeId: values.treeId,
        fullName: values.fullName,
        servingAs: values.servingAs,
      },
      include: { edgesFrom: true, edgesTo: true },
    })

    await db.activityLog.create({
      data: {
        treeId: values.treeId,
        createdBy: userId,
        action: 'NODE_CREATED',
        entityId: node.id,
        metadata: { nodeName: values.fullName },
      },
    })

    revalidatePath('/')
    revalidatePath('/trees')
    revalidatePath(`/trees/${values.treeId}`)

    return { error: false, nodeId: node.id }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return { error: true, message: 'error-tree-not-found' }
    }
    Sentry.captureException(e, { tags: { action: 'createTreeNode' } })
    return { error: true, message: 'error' }
  }
}

/**
 * Update an existing tree node.
 * Auth required.
 * @param values {z.infer<typeof UpdateTreeNodeSchema>}
 * @returns Promise<TreeResult>
 */
export const updateTreeNode = async (
  values: z.infer<typeof UpdateTreeNodeSchema>
): Promise<TreeResult> => {
  try {
    UpdateTreeNodeSchema.parse(values)
    const userId = await assertAuthenticated()
    await assertRole(values.treeId, userId)
    await assertTreeWritable(values.treeId)

    const prevNode = await db.treeNode.findFirst({
      where: { id: values.id, treeId: values.treeId },
    })
    if (!prevNode) return { error: true, message: 'error-node-not-found' }

    await db.treeNode.update({
      where: { id: prevNode.id },
      data: {
        fullName: values.fullName,
        servingAs: values.servingAs,
      },
      include: { edgesFrom: true, edgesTo: true },
    })

    const changes = getChanges(prevNode, values, ['fullName', 'servingAs'])

    if (changes)
      await db.activityLog.create({
        data: {
          treeId: values.treeId,
          createdBy: userId,
          action: 'NODE_UPDATED',
          entityId: values.id,
          metadata: { nodeName: values.fullName, changes },
        },
      })

    revalidatePath('/')
    revalidatePath('/trees')
    revalidatePath(`/trees/${values.treeId}`)

    return { error: false }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return { error: true, message: 'error-node-not-found' }
    }
    Sentry.captureException(e, { tags: { action: 'updateTreeNode' } })
    return { error: true, message: 'error' }
  }
}

/**
 * Return true when any member already has the maximum number of couple unions.
 * Single-parent unions do not count as marriages.
 */
async function hasReachedMarriageLimit(
  treeId: string,
  nodeIds: string[],
  excludeUnionId?: string
): Promise<boolean> {
  const uniqueNodeIds = Array.from(new Set(nodeIds.filter(Boolean)))
  if (uniqueNodeIds.length === 0) return false

  const existingUnions = await db.union.findMany({
    where: {
      treeId,
      OR: [{ spouseAId: { in: uniqueNodeIds } }, { spouseBId: { in: uniqueNodeIds } }],
    },
    select: { id: true, spouseAId: true, spouseBId: true },
  })

  const counts = new Map(uniqueNodeIds.map((id) => [id, 0]))
  for (const union of existingUnions) {
    if (excludeUnionId && union.id === excludeUnionId) continue
    if (!union.spouseBId) continue

    if (counts.has(union.spouseAId)) counts.set(union.spouseAId, counts.get(union.spouseAId)! + 1)
    if (counts.has(union.spouseBId)) counts.set(union.spouseBId, counts.get(union.spouseBId)! + 1)
  }

  return Array.from(counts.values()).some((count) => count >= 2)
}

/**
 * Create new tree edge (relationship).
 * Auth required.
 * @param values {z.infer<typeof CreateTreeEdgeSchema>}
 * @returns Promise<TreeResult>
 */
export const createTreeEdge = async (
  values: z.infer<typeof CreateTreeEdgeSchema>
): Promise<TreeResult> => {
  try {
    CreateTreeEdgeSchema.parse(values)
    const userId = await assertAuthenticated()
    await assertRole(values.treeId, userId)
    await assertTreeWritable(values.treeId)

    if (values.fromNodeId === values.toNodeId)
      return { error: true, message: 'error-cannot-connect-to-self' }

    const [fromNode, toNode] = await Promise.all([
      db.treeNode.findFirst({ where: { id: values.fromNodeId, treeId: values.treeId } }),
      db.treeNode.findFirst({ where: { id: values.toNodeId, treeId: values.treeId } }),
    ])
    if (!fromNode || !toNode) return { error: true, message: 'error-nodes-not-found' }

    const existingEdge = await db.treeEdge.findFirst({
      where: {
        treeId: values.treeId,
        OR: [
          { fromNodeId: values.fromNodeId, toNodeId: values.toNodeId },
          { fromNodeId: values.toNodeId, toNodeId: values.fromNodeId },
        ],
      },
    })
    if (existingEdge) return { error: true, message: 'error-relationship-already-exists' }

    if (
      values.type === 'SPOUSE' &&
      (await hasReachedMarriageLimit(values.treeId, [values.fromNodeId, values.toNodeId]))
    )
      return { error: true, message: 'error-member-has-max-marriages' }

    const newEdge = await db.treeEdge.create({
      data: {
        treeId: values.treeId,
        fromNodeId: values.fromNodeId,
        toNodeId: values.toNodeId,
        type: values.type,
      },
    })

    await db.activityLog.create({
      data: {
        treeId: values.treeId,
        createdBy: userId,
        action: 'EDGE_CREATED',
        entityId: newEdge.id,
        metadata: {
          fromNodeId: values.fromNodeId,
          fromNodeName: fromNode.fullName,
          toNodeId: values.toNodeId,
          toNodeName: toNode.fullName,
          type: values.type,
        },
      },
    })

    revalidatePath('/')
    revalidatePath('/trees')
    revalidatePath(`/trees/${values.treeId}`)

    return { error: false }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return { error: true, message: 'error-tree-not-found' }
    }
    Sentry.captureException(e, { tags: { action: 'createTreeEdge' } })
    return { error: true, message: 'error' }
  }
}

/**
 * Delete a tree node and all its associated edges.
 * Auth required.
 * @param nodeId - The id of the node to delete
 * @param treeId - The id of the tree the node belongs to
 * @returns Promise<TreeResult>
 */
export const deleteTreeNode = async (nodeId: string, treeId: string): Promise<TreeResult> => {
  try {
    const userId = await assertAuthenticated()
    await assertRole(treeId, userId)
    await assertTreeWritable(treeId)

    const nodeToDelete = await db.treeNode.findFirst({ where: { id: nodeId, treeId: treeId } })
    if (!nodeToDelete) return { error: true, message: 'error-nodes-not-found' }

    const connectedEdges = await db.treeEdge.findMany({
      where: { treeId: treeId, OR: [{ fromNodeId: nodeId }, { toNodeId: nodeId }] },
    })

    await db.$transaction(async (tx) => {
      if (connectedEdges.length > 0)
        await tx.treeEdge.deleteMany({
          where: { id: { in: connectedEdges.map((edge) => edge.id) } },
        })

      // Delete pictures where this node is the only tagged member
      const orphanedPictures = await tx.picture.findMany({
        where: {
          treeId,
          tags: { every: { nodeId }, some: {} },
        },
      })
      if (orphanedPictures.length > 0) {
        await tx.pictureTag.deleteMany({
          where: { pictureId: { in: orphanedPictures.map((p) => p.id) } },
        })
        await tx.picture.deleteMany({
          where: { id: { in: orphanedPictures.map((p) => p.id) } },
        })

        // Clean up S3 files (best-effort, outside transaction)
        for (const pic of orphanedPictures) {
          await deleteFileFromS3(pic.fileKey).catch((err) =>
            Sentry.captureException(err, {
              level: 'warning',
              tags: { action: 'deleteTreeNode', step: 's3-cleanup' },
            })
          )
        }
      }

      await tx.treeNode.delete({ where: { id: nodeId } })

      await tx.activityLog.create({
        data: {
          treeId: treeId,
          createdBy: userId,
          action: 'NODE_DELETED',
          entityId: nodeId,
          metadata: {
            nodeName: nodeToDelete.fullName,
            edgeIds: connectedEdges.map((edge) => edge.id),
          },
        },
      })
    })

    revalidatePath('/')
    revalidatePath('/trees')
    revalidatePath(`/trees/${treeId}`)

    return { error: false }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return { error: true, message: 'error-nodes-not-found' }
    }
    Sentry.captureException(e, { tags: { action: 'deleteTreeNode' } })
    return { error: true, message: 'error' }
  }
}

/**
 * Delete a tree edge (relationship).
 * Auth required.
 * @param edgeId {string} - The id of the edge to delete
 * @param treeId {string} - The tree id for permission checking
 * @returns Promise<TreeResult>
 */
export const deleteTreeEdge = async (edgeId: string, treeId: string): Promise<TreeResult> => {
  try {
    const userId = await assertAuthenticated()
    await assertRole(treeId, userId)
    await assertTreeWritable(treeId)

    const edgeToDelete = await db.treeEdge.findFirst({ where: { id: edgeId, treeId: treeId } })
    if (!edgeToDelete) return { error: true, message: 'error-edge-not-found' }

    const [fromNode, toNode] = await Promise.all([
      db.treeNode.findFirst({ where: { id: edgeToDelete.fromNodeId, treeId: treeId } }),
      db.treeNode.findFirst({ where: { id: edgeToDelete.toNodeId, treeId: treeId } }),
    ])
    if (!fromNode || !toNode) return { error: true, message: 'error-nodes-not-found' }

    await db.$transaction(async (tx) => {
      await tx.treeEdge.delete({ where: { id: edgeId } })

      await tx.activityLog.create({
        data: {
          treeId: treeId,
          createdBy: userId,
          action: 'EDGE_DELETED',
          entityId: edgeId,
          metadata: {
            fromNodeId: fromNode.id,
            fromNodeName: fromNode.fullName,
            toNodeId: toNode.id,
            toNodeName: toNode.fullName,
            type: edgeToDelete.type,
          },
        },
      })
    })

    revalidatePath('/')
    revalidatePath('/trees')
    revalidatePath(`/trees/${treeId}`)

    return { error: false }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return { error: true, message: 'error-edge-not-found' }
    }
    Sentry.captureException(e, { tags: { action: 'deleteTreeEdge' } })
    return { error: true, message: 'error' }
  }
}

/**
 * Get all tree nodes for a specific tree
 * @param treeId Tree id
 * @returns Promise<TreeNode[]>
 */
export const getTreeNodes = async (treeId: string): Promise<TreeNode[]> => {
  try {
    const userId = await assertAuthenticated()

    const hasAccess = await db.treeAccess.findFirst({ where: { treeId, userId } })
    if (!hasAccess) return []

    return await db.treeNode.findMany({ where: { treeId } })
  } catch (error) {
    Sentry.captureException(error, { tags: { action: 'getTreeNodes' } })
    return []
  }
}

/**
 * Get all major events (births and deaths) for a specific tree by slug
 * @param slug Tree slug
 * @returns Promise<TimelineEvent[]>
 */
export const getTimelineEvents = async (slug: string): Promise<TimelineEvent[]> => {
  try {
    const userId = await assertAuthenticated()

    const tree = await db.tree.findFirst({
      where: { slug, accesses: { some: { userId } } },
      include: {
        nodes: {
          select: {
            id: true,
            fullName: true,
            birthDate: true,
            deathDate: true,
            birthPlace: true,
            deathPlace: true,
            taggedIn: {
              select: {
                isProfile: true,
                picture: { select: { fileKey: true, date: true, tags: true } },
              },
            },
          },
        },
        Unions: {
          select: {
            id: true,
            spouseAId: true,
            spouseBId: true,
            marriedAt: true,
            divorcedAt: true,
            place: true,
          },
        },
      },
    })

    if (!tree) return []

    const events: TimelineEvent[] = []

    tree.nodes.forEach((node) => {
      if (node.birthDate) {
        events.push({
          type: 'birth',
          date: node.birthDate,
          name: node.fullName,
          place: node.birthPlace ?? undefined,
          picture: node.taggedIn.find((tag) => tag.isProfile)?.picture.fileKey,
        })
      }

      if (node.deathDate) {
        events.push({
          type: 'death',
          date: node.deathDate,
          name: node.fullName,
          place: node.deathPlace ?? undefined,
          picture: node.taggedIn.find((tag) => tag.isProfile)?.picture.fileKey,
        })
      }
    })

    const nameById = new Map(tree.nodes.map((n) => [n.id, n.fullName]))
    ;(tree.Unions ?? []).forEach((u) => {
      if (!u.spouseBId) return
      const a = nameById.get(u.spouseAId)
      const b = nameById.get(u.spouseBId)
      if (!a || !b) return
      const couple = `${a} & ${b}`

      if (u.marriedAt) {
        events.push({
          type: 'marriage',
          date: u.marriedAt,
          name: couple,
          place: u.place ?? undefined,
        })
      }

      if (u.divorcedAt) {
        events.push({
          type: 'divorce',
          date: u.divorcedAt,
          name: couple,
          place: u.place ?? undefined,
        })
      }
    })

    return events.sort((a, b) => a.date.getTime() - b.date.getTime())
  } catch (error) {
    Sentry.captureException(error, { tags: { action: 'getTimelineEvents' } })
    return []
  }
}

export type ShareTokenTtlDays = 1 | 7 | 30

interface ShareTokenResult {
  error: boolean
  message?: string
  token?: string
  expiresAt?: Date
}

interface JoinResult {
  error: boolean
  message?: string
  slug?: string
  alreadyMember?: boolean
}

interface ShareLink {
  token: string
  expiresAt: Date
}

/**
 * Generate (or rotate) a share token for a tree.
 * Auth required. ADMIN or EDITOR only.
 * Overwriting the token implicitly invalidates the previous one.
 */
export const generateShareToken = async (
  treeId: string,
  ttlDays: ShareTokenTtlDays
): Promise<ShareTokenResult> => {
  try {
    if (ttlDays !== 1 && ttlDays !== 7 && ttlDays !== 30)
      return { error: true, message: 'error-invalid-ttl' }

    const userId = await assertAuthenticated()
    await assertRole(treeId, userId)
    await assertTreeWritable(treeId)

    const token = crypto.randomBytes(24).toString('base64url')
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000)

    const tree = await db.tree.update({
      where: { id: treeId },
      data: { shareToken: token, shareTokenExpiresAt: expiresAt },
    })

    await db.activityLog.create({
      data: {
        treeId,
        createdBy: userId,
        action: 'SHARE_TOKEN_GENERATED',
        entityId: treeId,
        metadata: { ttlDays, expiresAt: expiresAt.toISOString() },
      },
    })

    revalidatePath('/trees')
    revalidatePath(`/trees/${tree.slug}`)

    return { error: false, token, expiresAt }
  } catch (e) {
    const message = getActionErrorMessage(e)
    if (isTreeWriteError(e)) return { error: true, message }
    if (message === 'unauthenticated') return { error: true, message: 'unauthenticated' }
    Sentry.captureException(e, { tags: { action: 'generateShareToken' } })
    return { error: true, message: 'error' }
  }
}

export const getShareLink = async (treeId: string): Promise<ShareLink | null> => {
  try {
    const userId = await assertAuthenticated()
    await assertRole(treeId, userId)

    const tree = await db.tree.findUnique({
      where: { id: treeId },
      select: { shareToken: true, shareTokenExpiresAt: true },
    })

    if (!tree?.shareToken || !tree.shareTokenExpiresAt) return null
    if (tree.shareTokenExpiresAt.getTime() < Date.now()) return null

    return { token: tree.shareToken, expiresAt: tree.shareTokenExpiresAt }
  } catch (e) {
    Sentry.captureException(e, { tags: { action: 'getShareLink' } })
    return null
  }
}

/**
 * Join a tree via share token. Auth required.
 * Creates TreeAccess with VIEWER role if one doesn't already exist.
 * Never demotes an existing member. Idempotent under race via P2002 catch.
 */
export const joinTreeViaShareToken = async (token: string): Promise<JoinResult> => {
  try {
    const userId = await assertAuthenticated()

    const tree = await db.tree.findFirst({
      where: { shareToken: token },
      select: { id: true, slug: true, shareTokenExpiresAt: true },
    })
    if (!tree) return { error: true, message: 'error-share-token-invalid' }

    if (!tree.shareTokenExpiresAt || tree.shareTokenExpiresAt.getTime() < Date.now())
      return { error: true, message: 'error-share-token-expired' }

    let alreadyMember = false
    try {
      await db.treeAccess.create({ data: { treeId: tree.id, userId, role: 'VIEWER' } })

      const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
      await db.activityLog.create({
        data: {
          treeId: tree.id,
          createdBy: userId,
          action: 'MEMBER_JOINED_VIA_SHARE',
          entityId: userId,
          metadata: { joinedName: user?.name ?? null },
        },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        alreadyMember = true
      } else throw e
    }

    revalidatePath('/')
    revalidatePath('/trees')

    return { error: false, slug: tree.slug, alreadyMember }
  } catch (e) {
    if (getActionErrorMessage(e) === 'unauthenticated')
      return { error: true, message: 'unauthenticated' }
    Sentry.captureException(e, { tags: { action: 'joinTreeViaShareToken' } })
    return { error: true, message: 'error' }
  }
}

/**
 * Create a Union. Returns the union id (or the existing one if a matching
 * union is already present).
 */
export const createUnion = async (
  values: z.infer<typeof CreateUnionSchema>
): Promise<TreeResult & { unionId?: string }> => {
  try {
    CreateUnionSchema.parse(values)
    const userId = await assertAuthenticated()
    await assertRole(values.treeId, userId)
    await assertTreeWritable(values.treeId)

    if (values.spouseBId && values.spouseAId === values.spouseBId)
      return { error: true, message: 'error-cannot-connect-to-self' }

    const spouseIds = [values.spouseAId, values.spouseBId].filter(Boolean) as string[]
    const spouses = await db.treeNode.findMany({
      where: { id: { in: spouseIds }, treeId: values.treeId },
    })
    if (spouses.length !== spouseIds.length)
      return { error: true, message: 'error-nodes-not-found' }
    const lifeDateError = getUnionLifeDateError(spouses, values)
    if (lifeDateError) return { error: true, message: lifeDateError }

    const [spouseAId, spouseBId] = values.spouseBId
      ? [values.spouseAId, values.spouseBId].sort()
      : [values.spouseAId, null]

    const existing = await db.union.findFirst({
      where: {
        treeId: values.treeId,
        OR: spouseBId
          ? [
              { spouseAId, spouseBId },
              { spouseAId: spouseBId, spouseBId: spouseAId },
            ]
          : [{ spouseAId, spouseBId: null }],
      },
    })
    if (existing) return { error: false, unionId: existing.id }

    if (spouseBId && (await hasReachedMarriageLimit(values.treeId, [spouseAId, spouseBId])))
      return { error: true, message: 'error-member-has-max-marriages' }

    const union = await db.union.create({
      data: {
        treeId: values.treeId,
        spouseAId,
        spouseBId,
        marriedAt: values.marriedAt ?? null,
        divorcedAt: values.divorcedAt ?? null,
        place: values.place ?? null,
      },
    })

    const spouseAName = spouses.find((s) => s.id === spouseAId)?.fullName ?? null
    const spouseBName = spouseBId
      ? (spouses.find((s) => s.id === spouseBId)?.fullName ?? null)
      : null

    await db.activityLog.create({
      data: {
        treeId: values.treeId,
        createdBy: userId,
        action: 'UNION_CREATED',
        entityId: union.id,
        metadata: {
          spouseAId,
          spouseBId,
          spouseAName,
          spouseBName,
          marriedAt: union.marriedAt?.toISOString() ?? null,
          divorcedAt: union.divorcedAt?.toISOString() ?? null,
          place: union.place ?? null,
        },
      },
    })

    revalidatePath('/')
    revalidatePath('/trees')
    revalidatePath(`/trees/${values.treeId}`)

    return { error: false, unionId: union.id }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    Sentry.captureException(e, { tags: { action: 'createUnion' } })
    return { error: true, message: 'error' }
  }
}

/**
 * Update an existing Union's spouses and/or metadata.
 */
export const updateUnion = async (
  values: z.infer<typeof UpdateUnionSchema>
): Promise<TreeResult> => {
  try {
    UpdateUnionSchema.parse(values)
    const userId = await assertAuthenticated()
    await assertRole(values.treeId, userId)
    await assertTreeWritable(values.treeId)

    if (values.spouseBId && values.spouseAId === values.spouseBId)
      return { error: true, message: 'error-cannot-connect-to-self' }

    const union = await db.union.findFirst({
      where: { id: values.id, treeId: values.treeId },
      include: {
        spouseA: { select: { fullName: true } },
        spouseB: { select: { fullName: true } },
      },
    })
    if (!union) return { error: true, message: 'error-union-not-found' }

    const [spouseAId, spouseBId] = values.spouseBId
      ? [values.spouseAId, values.spouseBId].sort()
      : [values.spouseAId, null]

    const newSpouseIds = [spouseAId, spouseBId].filter(Boolean) as string[]
    const newSpouses = await db.treeNode.findMany({
      where: { id: { in: newSpouseIds }, treeId: values.treeId },
      select: { id: true, fullName: true, birthDate: true, deathDate: true },
    })
    if (newSpouses.length !== newSpouseIds.length)
      return { error: true, message: 'error-nodes-not-found' }
    const lifeDateError = getUnionLifeDateError(newSpouses, values)
    if (lifeDateError) return { error: true, message: lifeDateError }

    if (
      spouseBId &&
      (await hasReachedMarriageLimit(values.treeId, [spouseAId, spouseBId], union.id))
    )
      return { error: true, message: 'error-member-has-max-marriages' }

    await db.union.update({
      where: { id: union.id },
      data: {
        spouseAId,
        spouseBId,
        marriedAt: values.marriedAt ?? null,
        divorcedAt: values.divorcedAt ?? null,
        place: values.place ?? null,
      },
    })

    const spouseAName = newSpouses.find((s) => s.id === spouseAId)?.fullName ?? null
    const spouseBName = spouseBId
      ? (newSpouses.find((s) => s.id === spouseBId)?.fullName ?? null)
      : null

    const prevData = {
      spouseA: union.spouseA?.fullName ?? null,
      spouseB: union.spouseB?.fullName ?? null,
      marriedAt: union.marriedAt,
      divorcedAt: union.divorcedAt,
      place: union.place,
    }
    const newData = {
      spouseA: spouseAName,
      spouseB: spouseBName,
      marriedAt: values.marriedAt ?? null,
      divorcedAt: values.divorcedAt ?? null,
      place: values.place ?? null,
    }
    const changes = getChanges(prevData, newData, [
      'spouseA',
      'spouseB',
      'marriedAt',
      'divorcedAt',
      'place',
    ])

    if (changes)
      await db.activityLog.create({
        data: {
          treeId: values.treeId,
          createdBy: userId,
          action: 'UNION_UPDATED',
          entityId: union.id,
          metadata: { spouseAId, spouseBId, spouseAName, spouseBName, changes },
        },
      })

    revalidatePath('/')
    revalidatePath('/trees')
    revalidatePath(`/trees/${values.treeId}`)

    return { error: false }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    Sentry.captureException(e, { tags: { action: 'updateUnion' } })
    return { error: true, message: 'error' }
  }
}

/**
 * Delete a Union. Children linked to it have their childOfUnionId cleared
 * (SetNull is enforced at the Prisma level).
 */
export const deleteUnion = async (id: string, treeId: string): Promise<TreeResult> => {
  try {
    const userId = await assertAuthenticated()
    await assertRole(treeId, userId)
    await assertTreeWritable(treeId)

    const union = await db.union.findFirst({
      where: { id, treeId },
      include: {
        spouseA: { select: { fullName: true } },
        spouseB: { select: { fullName: true } },
      },
    })
    if (!union) return { error: true, message: 'error-union-not-found' }

    await db.union.delete({ where: { id } })

    await db.activityLog.create({
      data: {
        treeId,
        createdBy: userId,
        action: 'UNION_DELETED',
        entityId: id,
        metadata: {
          spouseAId: union.spouseAId,
          spouseBId: union.spouseBId,
          spouseAName: union.spouseA?.fullName ?? null,
          spouseBName: union.spouseB?.fullName ?? null,
          marriedAt: union.marriedAt?.toISOString() ?? null,
          divorcedAt: union.divorcedAt?.toISOString() ?? null,
          place: union.place ?? null,
        },
      },
    })

    revalidatePath('/')
    revalidatePath('/trees')
    revalidatePath(`/trees/${treeId}`)

    return { error: false }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    Sentry.captureException(e, { tags: { action: 'deleteUnion' } })
    return { error: true, message: 'error' }
  }
}

/**
 * Set (or clear) a child's childOfUnionId. `unionId: null` detaches the
 * child from any union (rendered via direct PARENT/CHILD edges).
 */
export const attachChildToUnion = async (
  values: z.infer<typeof AttachChildToUnionSchema>
): Promise<TreeResult> => {
  try {
    AttachChildToUnionSchema.parse(values)
    const userId = await assertAuthenticated()
    await assertRole(values.treeId, userId)
    await assertTreeWritable(values.treeId)

    const child = await db.treeNode.findFirst({
      where: { id: values.childNodeId, treeId: values.treeId },
    })
    if (!child) return { error: true, message: 'error-node-not-found' }

    if (values.unionId) {
      const union = await db.union.findFirst({
        where: { id: values.unionId, treeId: values.treeId },
      })
      if (!union) return { error: true, message: 'error-union-not-found' }
    }

    await db.treeNode.update({
      where: { id: child.id },
      data: { childOfUnionId: values.unionId },
    })

    revalidatePath('/')
    revalidatePath('/trees')
    revalidatePath(`/trees/${values.treeId}`)

    return { error: false }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    Sentry.captureException(e, { tags: { action: 'attachChildToUnion' } })
    return { error: true, message: 'error' }
  }
}
