import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('@/server/db', () => ({
  db: {
    tree: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    treeDeletionRequest: {
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    treeAccess: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    treeNode: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    treeEdge: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    activityLog: { create: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn() },
    picture: { findMany: vi.fn(), deleteMany: vi.fn() },
    pictureTag: { deleteMany: vi.fn() },
    union: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    treeNote: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendTreeDeletedEmail: vi.fn().mockResolvedValue(true),
  sendTreeDeletionRequestedEmail: vi.fn().mockResolvedValue(true),
  sendTreeInvitationEmail: vi.fn().mockResolvedValue(true),
}))
vi.mock('@/lib/s3', () => ({ deleteFileFromS3: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/utils/language', () => ({ languageToLocale: vi.fn(() => 'en') }))
vi.mock('@/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('@/server/utils', () => ({
  assertAuthenticated: vi.fn(),
  assertRole: vi.fn(),
  assertTreeWritable: vi.fn(),
  slugify: vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, '-')),
  getChanges: vi.fn(),
  checkTreeAccess: vi.fn(),
  getUserById: vi.fn(),
  getAccountByUserId: vi.fn(),
  calculateDaysUntil: vi.fn(),
  isInCurrentWeekOfYear: vi.fn(),
}))

import { db } from '@/server/db'
import { assertAuthenticated, assertRole, assertTreeWritable } from '@/server/utils'
import {
  sendTreeDeletedEmail,
  sendTreeDeletionRequestedEmail,
  sendTreeInvitationEmail,
} from '@/lib/email'
import { deleteFileFromS3 } from '@/lib/s3'
import * as Sentry from '@sentry/nextjs'
import {
  createTree,
  updateTree,
  inviteMember,
  updateMember,
  removeMember,
  createTreeNode,
  updateTreeNode,
  createTreeEdge,
  createUnion,
  deleteTreeNode,
  deleteTreeEdge,
  updateUnion,
  getTreeNodes,
  getTimelineEvents,
  generateShareToken,
  getShareLink,
  joinTreeViaShareToken,
  requestTreeDeletion,
  cancelTreeDeletion,
  approveTreeDeletion,
} from './trees'

const mockDb = db as any
const mockAssertAuth = assertAuthenticated as ReturnType<typeof vi.fn>
const mockAssertRole = assertRole as ReturnType<typeof vi.fn>
const mockAssertTreeWritable = assertTreeWritable as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockAssertAuth.mockResolvedValue('user-1')
  mockAssertRole.mockResolvedValue(undefined)
  mockAssertTreeWritable.mockResolvedValue(undefined)
  mockDb.$transaction.mockImplementation(async (fn: any) => fn(mockDb))
  mockDb.union.findMany.mockResolvedValue([])
})

describe('createTree', () => {
  const values = { name: 'My Tree' }

  it('returns error when not authenticated', async () => {
    mockAssertAuth.mockRejectedValue(new Error('unauthenticated'))
    const result = await createTree(values)
    expect(result.error).toBe(true)
  })

  it('creates tree successfully', async () => {
    const tree = { id: 't1', slug: 'my-tree', name: 'My Tree', accesses: [] }
    mockDb.tree.create.mockResolvedValue(tree)
    const result = await createTree(values)
    expect(result.error).toBe(false)
    expect(result.tree).toEqual(tree)
  })

  it('returns error-tree-exists on P2002', async () => {
    mockDb.tree.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6.0.0' })
    )
    const result = await createTree(values)
    expect(result).toEqual({ error: true, message: 'error-tree-exists' })
  })
})

describe('updateTree', () => {
  const values = { name: 'Updated', type: 'HUMAN' as const }

  it('returns error when not authenticated', async () => {
    mockAssertAuth.mockRejectedValue(new Error('unauthenticated'))
    const result = await updateTree('t1', values)
    expect(result.error).toBe(true)
  })

  it('returns error when no permission', async () => {
    mockAssertRole.mockRejectedValue(new Error('error-no-permission'))
    const result = await updateTree('t1', values)
    expect(result).toEqual({ error: true, message: 'error-no-permission' })
  })

  it('updates tree and creates activity log on changes', async () => {
    const prevTree = { id: 't1', name: 'Old', type: 'HUMAN', newsletter: false }
    const updatedTree = { id: 't1', name: 'Updated', type: 'HUMAN', accesses: [] }
    mockDb.tree.findUnique.mockResolvedValue(prevTree)
    mockDb.tree.update.mockResolvedValue(updatedTree)
    mockDb.activityLog.create.mockResolvedValue({})
    const { getChanges } = await import('@/server/utils')
    ;(getChanges as ReturnType<typeof vi.fn>).mockReturnValue({
      name: { before: 'Old', after: 'Updated' },
    })

    const result = await updateTree('t1', values)
    expect(result.error).toBe(false)
    expect(mockDb.activityLog.create).toHaveBeenCalled()
  })

  it('does not create activity log when nothing changed', async () => {
    const prevTree = { id: 't1', name: 'Updated', type: 'HUMAN', newsletter: false }
    const updatedTree = { id: 't1', name: 'Updated', type: 'HUMAN', accesses: [] }
    mockDb.tree.findUnique.mockResolvedValue(prevTree)
    mockDb.tree.update.mockResolvedValue(updatedTree)
    const { getChanges } = await import('@/server/utils')
    ;(getChanges as ReturnType<typeof vi.fn>).mockReturnValue(null)

    const result = await updateTree('t1', values)
    expect(result.error).toBe(false)
    expect(mockDb.activityLog.create).not.toHaveBeenCalled()
  })
})

describe('tree deletion lifecycle', () => {
  it('creates a deletion request for trees with nodes and notifies admins', async () => {
    const requestedAt = new Date('2026-04-01T00:00:00Z')
    const request = {
      id: 'dr1',
      treeId: 't1',
      requestedAt,
      requestedById: 'user-1',
      requestedBy: { id: 'user-1', name: 'Alice', email: 'alice@example.com', image: null },
      approvedBy: null,
      approvedAt: null,
    }
    const tree = {
      id: 't1',
      name: 'Family',
      slug: 'family',
      deletionRequest: null,
      _count: { nodes: 2 },
      accesses: [{ user: { email: 'alice@example.com', name: 'Alice', language: 'EN' } }],
    }
    mockDb.tree.findUnique.mockResolvedValueOnce(tree).mockResolvedValueOnce({
      ...tree,
      accesses: [],
      deletionRequest: request,
    })
    mockDb.user.findUnique.mockResolvedValue({ name: 'Alice', email: 'alice@example.com' })
    mockDb.treeDeletionRequest.create.mockResolvedValue(request)

    const result = await requestTreeDeletion('t1')

    expect(result.error).toBe(false)
    expect(result.deleted).toBeUndefined()
    expect(mockDb.treeDeletionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { treeId: 't1', requestedById: 'user-1' } })
    )
    expect(sendTreeDeletionRequestedEmail).toHaveBeenCalled()
  })

  it('hard deletes immediately when the tree has no nodes', async () => {
    mockDb.tree.findUnique
      .mockResolvedValueOnce({
        id: 't1',
        name: 'Empty',
        slug: 'empty',
        deletionRequest: null,
        _count: { nodes: 0 },
        accesses: [],
      })
      .mockResolvedValueOnce({
        id: 't1',
        name: 'Empty',
        slug: 'empty',
        accesses: [{ user: { email: 'admin@example.com', name: 'Admin', language: 'EN' } }],
        Picture: [{ id: 'p1', fileKey: 'images/tree_t1/a.jpg' }],
      })
    mockDb.tree.delete.mockResolvedValue({})

    const result = await requestTreeDeletion('t1')

    expect(result).toEqual({ error: false, deleted: true })
    expect(mockDb.tree.delete).toHaveBeenCalledWith({ where: { id: 't1' } })
    expect(deleteFileFromS3).toHaveBeenCalledWith('images/tree_t1/a.jpg')
    expect(sendTreeDeletedEmail).toHaveBeenCalled()
  })

  it('cancels a deletion request', async () => {
    const request = { id: 'dr1', requestedAt: new Date('2026-04-01T00:00:00Z') }
    mockDb.tree.findUnique.mockResolvedValueOnce({
      id: 't1',
      slug: 'family',
      deletionRequest: request,
    })
    mockDb.treeDeletionRequest.delete.mockResolvedValue({})
    mockDb.tree.findUnique.mockResolvedValueOnce({ id: 't1', accesses: [], deletionRequest: null })

    const result = await cancelTreeDeletion('t1')

    expect(result.error).toBe(false)
    expect(mockDb.treeDeletionRequest.delete).toHaveBeenCalledWith({ where: { treeId: 't1' } })
    expect(mockDb.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'TREE_DELETION_CANCELLED' }),
      })
    )
  })

  it('prevents approving a non-empty tree before the grace period passes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-05T00:00:00Z'))
    mockDb.tree.findUnique.mockResolvedValue({
      id: 't1',
      deletionRequest: { id: 'dr1', requestedAt: new Date('2026-04-01T00:00:00Z') },
      _count: { nodes: 1 },
    })

    const result = await approveTreeDeletion('t1')

    expect(result.error).toBe(true)
    expect(result.message).toBe('error-tree-deletion-not-ready')
    expect(mockDb.tree.delete).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('approves and hard deletes after the grace period', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-09T00:00:00Z'))
    mockDb.tree.findUnique
      .mockResolvedValueOnce({
        id: 't1',
        deletionRequest: { id: 'dr1', requestedAt: new Date('2026-04-01T00:00:00Z') },
        _count: { nodes: 1 },
      })
      .mockResolvedValueOnce({
        id: 't1',
        name: 'Family',
        slug: 'family',
        accesses: [],
        Picture: [],
      })
    mockDb.treeDeletionRequest.update.mockResolvedValue({})
    mockDb.tree.delete.mockResolvedValue({})

    const result = await approveTreeDeletion('t1')

    expect(result).toEqual({ error: false, deleted: true })
    expect(mockDb.treeDeletionRequest.update).toHaveBeenCalled()
    expect(mockDb.tree.delete).toHaveBeenCalledWith({ where: { id: 't1' } })
    vi.useRealTimers()
  })
})

describe('inviteMember', () => {
  it('returns error when not authenticated', async () => {
    mockAssertAuth.mockRejectedValue(new Error('unauthenticated'))
    const result = await inviteMember('t1', 'bob@example.com', 'EDITOR')
    expect(result.error).toBe(true)
  })

  it('returns error when no permission', async () => {
    mockAssertRole.mockRejectedValue(new Error('error-no-permission'))
    const result = await inviteMember('t1', 'bob@example.com', 'EDITOR')
    expect(result).toEqual({ error: true, message: 'error-no-permission' })
  })

  it('prevents non-admin from assigning admin role', async () => {
    mockDb.treeAccess.findFirst.mockResolvedValue({ role: 'EDITOR' })
    const result = await inviteMember('t1', 'bob@example.com', 'ADMIN')
    expect(result).toEqual({ error: true, message: 'error-no-permission' })
  })

  it('returns error when user not found', async () => {
    mockDb.treeAccess.findFirst.mockResolvedValue(null)
    mockDb.user.findUnique.mockResolvedValue(null)
    const result = await inviteMember('t1', 'bob@example.com', 'EDITOR')
    expect(result).toEqual({ error: true, message: 'error-user-not-found' })
  })

  it('returns error when user already in tree', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 'user-2', email: 'bob@example.com' })
    mockDb.treeAccess.findFirst.mockResolvedValue({ id: 'existing-access' })
    const result = await inviteMember('t1', 'bob@example.com', 'EDITOR')
    expect(result).toEqual({ error: true, message: 'error-user-already-in-tree' })
  })

  it('creates access and sends invitation email', async () => {
    mockDb.user.findUnique
      .mockResolvedValueOnce({ id: 'user-2', email: 'bob@example.com', name: 'Bob' })
      .mockResolvedValueOnce({ id: 'user-1', email: 'alice@example.com', name: 'Alice' })
    mockDb.treeAccess.findFirst.mockResolvedValue(null)
    mockDb.treeAccess.create.mockResolvedValue({})
    const tree = { id: 't1', name: 'My Tree', slug: 'my-tree', accesses: [] }
    mockDb.tree.findUnique.mockResolvedValue(tree)

    const result = await inviteMember('t1', 'bob@example.com', 'EDITOR')
    expect(result.error).toBe(false)
    expect(mockDb.treeAccess.create).toHaveBeenCalled()
    expect(sendTreeInvitationEmail).toHaveBeenCalled()
  })

  it('handles email sending failure gracefully', async () => {
    mockDb.user.findUnique
      .mockResolvedValueOnce({ id: 'user-2', email: 'bob@example.com', name: 'Bob' })
      .mockResolvedValueOnce({ id: 'user-1', email: 'alice@example.com', name: 'Alice' })
    mockDb.treeAccess.findFirst.mockResolvedValue(null)
    mockDb.treeAccess.create.mockResolvedValue({})
    const tree = { id: 't1', name: 'My Tree', slug: 'my-tree', accesses: [] }
    mockDb.tree.findUnique.mockResolvedValue(tree)

    const mockSendEmail = sendTreeInvitationEmail as ReturnType<typeof vi.fn>
    mockSendEmail.mockRejectedValue(new Error('SMTP failure'))

    const result = await inviteMember('t1', 'bob@example.com', 'EDITOR')
    expect(result.error).toBe(false)
    expect(mockDb.treeAccess.create).toHaveBeenCalled()
  })
})

describe('updateMember', () => {
  it('returns error when not authenticated', async () => {
    mockAssertAuth.mockRejectedValue(new Error('unauthenticated'))
    const result = await updateMember('t1', 'user-2', 'EDITOR')
    expect(result.error).toBe(true)
  })

  it('returns error when not admin', async () => {
    mockAssertRole.mockRejectedValue(new Error('error-no-permission'))
    const result = await updateMember('t1', 'user-2', 'EDITOR')
    expect(result).toEqual({ error: true, message: 'error-no-permission' })
  })

  it('updates member role successfully', async () => {
    mockDb.treeAccess.count.mockResolvedValue(1)
    mockDb.treeAccess.update.mockResolvedValue({})
    mockDb.tree.findUnique.mockResolvedValue({ id: 't1', accesses: [] })
    const result = await updateMember('t1', 'user-2', 'EDITOR')
    expect(result.error).toBe(false)
    expect(mockDb.treeAccess.update).toHaveBeenCalledWith({
      where: { treeId_userId: { treeId: 't1', userId: 'user-2' } },
      data: { role: 'EDITOR' },
    })
  })

  it('prevents demoting the last admin', async () => {
    mockDb.treeAccess.count.mockResolvedValue(0)
    const result = await updateMember('t1', 'user-1', 'EDITOR')
    expect(result).toEqual({ error: true, message: 'error-tree-admin-required' })
    expect(mockDb.treeAccess.update).not.toHaveBeenCalled()
  })

  it('skips last-admin check when promoting to ADMIN', async () => {
    mockDb.treeAccess.update.mockResolvedValue({})
    mockDb.tree.findUnique.mockResolvedValue({ id: 't1', accesses: [] })
    const result = await updateMember('t1', 'user-2', 'ADMIN')
    expect(result.error).toBe(false)
    expect(mockDb.treeAccess.count).not.toHaveBeenCalled()
  })
})

describe('removeMember', () => {
  it('returns error when not authenticated', async () => {
    mockAssertAuth.mockRejectedValue(new Error('unauthenticated'))
    const result = await removeMember('t1', 'user-2')
    expect(result.error).toBe(true)
  })

  it('returns error when not admin', async () => {
    mockAssertRole.mockRejectedValue(new Error('error-no-permission'))
    const result = await removeMember('t1', 'user-2')
    expect(result).toEqual({ error: true, message: 'error-no-permission' })
  })

  it('removes member successfully', async () => {
    mockDb.treeAccess.findUnique.mockResolvedValue({ role: 'EDITOR' })
    mockDb.treeAccess.delete.mockResolvedValue({})
    mockDb.tree.findUnique.mockResolvedValue({ id: 't1', accesses: [] })
    const result = await removeMember('t1', 'user-2')
    expect(result.error).toBe(false)
    expect(mockDb.treeAccess.delete).toHaveBeenCalledWith({
      where: { treeId_userId: { treeId: 't1', userId: 'user-2' } },
    })
  })

  it('prevents removing the last admin', async () => {
    mockDb.treeAccess.findUnique.mockResolvedValue({ role: 'ADMIN' })
    mockDb.treeAccess.count.mockResolvedValue(0)
    const result = await removeMember('t1', 'user-1')
    expect(result).toEqual({ error: true, message: 'error-tree-admin-required' })
    expect(mockDb.treeAccess.delete).not.toHaveBeenCalled()
  })

  it('allows removing an admin when another admin remains', async () => {
    mockDb.treeAccess.findUnique.mockResolvedValue({ role: 'ADMIN' })
    mockDb.treeAccess.count.mockResolvedValue(1)
    mockDb.treeAccess.delete.mockResolvedValue({})
    mockDb.tree.findUnique.mockResolvedValue({ id: 't1', accesses: [] })
    const result = await removeMember('t1', 'user-2')
    expect(result.error).toBe(false)
    expect(mockDb.treeAccess.delete).toHaveBeenCalled()
  })
})

describe('createTreeNode', () => {
  const values = { treeId: 't1', fullName: 'John Doe', gender: 'MALE' as const }

  it('returns error when not authenticated', async () => {
    mockAssertAuth.mockRejectedValue(new Error('unauthenticated'))
    const result = await createTreeNode(values)
    expect(result.error).toBe(true)
  })

  it('returns error when no permission', async () => {
    mockAssertRole.mockRejectedValue(new Error('error-no-permission'))
    const result = await createTreeNode(values)
    expect(result).toEqual({ error: true, message: 'error-no-permission' })
  })

  it('creates node and activity log', async () => {
    const node = { id: 'n1', treeId: 't1', fullName: 'John Doe', edgesFrom: [], edgesTo: [] }
    mockDb.treeNode.create.mockResolvedValue(node)
    mockDb.activityLog.create.mockResolvedValue({})
    const result = await createTreeNode(values)
    expect(result.error).toBe(false)
    expect(mockDb.treeNode.create).toHaveBeenCalled()
    expect(mockDb.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'NODE_CREATED', entityId: 'n1' }),
      })
    )
  })
})

describe('updateTreeNode', () => {
  const values = { id: 'n1', treeId: 't1', fullName: 'Jane Doe', gender: 'FEMALE' as const }

  it('returns error when not authenticated', async () => {
    mockAssertAuth.mockRejectedValue(new Error('unauthenticated'))
    const result = await updateTreeNode(values)
    expect(result.error).toBe(true)
  })

  it('returns error when node not found', async () => {
    mockDb.treeNode.findFirst.mockResolvedValue(null)
    const result = await updateTreeNode(values)
    expect(result).toEqual({ error: true, message: 'error-node-not-found' })
  })

  it('updates node successfully', async () => {
    const prevNode = { id: 'n1', fullName: 'John Doe', gender: 'MALE' }
    mockDb.treeNode.findFirst.mockResolvedValue(prevNode)
    mockDb.treeNode.update.mockResolvedValue({})
    mockDb.activityLog.create.mockResolvedValue({})

    const result = await updateTreeNode(values)
    expect(result.error).toBe(false)
    expect(mockDb.treeNode.update).toHaveBeenCalled()
  })

  it('rejects birth date changes that would put an existing marriage before birth', async () => {
    const prevNode = {
      id: 'n1',
      fullName: 'John Doe',
      gender: 'MALE',
      birthDate: new Date('1980-01-01'),
      deathDate: null,
    }
    mockDb.treeNode.findFirst.mockResolvedValue(prevNode)
    mockDb.union.findMany.mockResolvedValue([
      { marriedAt: new Date('2000-01-01'), divorcedAt: null },
    ])

    const result = await updateTreeNode({ ...values, birthDate: new Date('2001-01-01') })

    expect(result).toEqual({ error: true, message: 'error-married-before-birth' })
    expect(mockDb.treeNode.update).not.toHaveBeenCalled()
  })
})

describe('createTreeEdge', () => {
  const values = { treeId: 't1', fromNodeId: 'n1', toNodeId: 'n2', type: 'PARENT' as const }

  it('returns error when not authenticated', async () => {
    mockAssertAuth.mockRejectedValue(new Error('unauthenticated'))
    const result = await createTreeEdge(values)
    expect(result.error).toBe(true)
  })

  it('rejects self-loop', async () => {
    const selfLoop = { ...values, toNodeId: 'n1' }
    const result = await createTreeEdge(selfLoop)
    expect(result).toEqual({ error: true, message: 'error-cannot-connect-to-self' })
  })

  it('returns error when nodes not found', async () => {
    mockDb.treeNode.findFirst.mockResolvedValue(null)
    const result = await createTreeEdge(values)
    expect(result).toEqual({ error: true, message: 'error-nodes-not-found' })
  })

  it('returns error on duplicate edge', async () => {
    mockDb.treeNode.findFirst
      .mockResolvedValueOnce({ id: 'n1', fullName: 'A' })
      .mockResolvedValueOnce({ id: 'n2', fullName: 'B' })
    mockDb.treeEdge.findFirst.mockResolvedValue({ id: 'existing' })
    const result = await createTreeEdge(values)
    expect(result).toEqual({ error: true, message: 'error-relationship-already-exists' })
  })

  it('creates edge successfully', async () => {
    mockDb.treeNode.findFirst
      .mockResolvedValueOnce({ id: 'n1', fullName: 'A' })
      .mockResolvedValueOnce({ id: 'n2', fullName: 'B' })
    mockDb.treeEdge.findFirst.mockResolvedValue(null)
    mockDb.treeEdge.create.mockResolvedValue({ id: 'e1' })
    mockDb.activityLog.create.mockResolvedValue({})

    const result = await createTreeEdge(values)
    expect(result.error).toBe(false)
    expect(mockDb.treeEdge.create).toHaveBeenCalled()
    expect(mockDb.activityLog.create).toHaveBeenCalled()
  })

  it('rejects spouse edge when either member already has two marriages', async () => {
    mockDb.treeNode.findFirst
      .mockResolvedValueOnce({ id: 'n1', fullName: 'A' })
      .mockResolvedValueOnce({ id: 'n2', fullName: 'B' })
    mockDb.treeEdge.findFirst.mockResolvedValue(null)
    mockDb.union.findMany.mockResolvedValue([
      { id: 'u1', spouseAId: 'n1', spouseBId: 'x1' },
      { id: 'u2', spouseAId: 'x2', spouseBId: 'n1' },
    ])

    const result = await createTreeEdge({ ...values, type: 'SPOUSE' })

    expect(result).toEqual({ error: true, message: 'error-member-has-max-marriages' })
    expect(mockDb.treeEdge.create).not.toHaveBeenCalled()
  })
})

describe('createUnion', () => {
  const values = { treeId: 't1', spouseAId: 'n1', spouseBId: 'n2' }

  it('rejects a third marriage for either spouse', async () => {
    mockDb.treeNode.findMany.mockResolvedValue([
      { id: 'n1', fullName: 'A' },
      { id: 'n2', fullName: 'B' },
    ])
    mockDb.union.findFirst.mockResolvedValue(null)
    mockDb.union.findMany.mockResolvedValue([
      { id: 'u1', spouseAId: 'n1', spouseBId: 'x1' },
      { id: 'u2', spouseAId: 'x2', spouseBId: 'n1' },
    ])

    const result = await createUnion(values)

    expect(result).toEqual({ error: true, message: 'error-member-has-max-marriages' })
    expect(mockDb.union.create).not.toHaveBeenCalled()
  })

  it('rejects marriage dates before a spouse birth date', async () => {
    mockDb.treeNode.findMany.mockResolvedValue([
      { id: 'n1', fullName: 'A', birthDate: new Date('1990-01-01'), deathDate: null },
      { id: 'n2', fullName: 'B', birthDate: null, deathDate: null },
    ])

    const result = await createUnion({ ...values, marriedAt: new Date('1989-12-31') })

    expect(result).toEqual({ error: true, message: 'error-married-before-birth' })
    expect(mockDb.union.create).not.toHaveBeenCalled()
  })

  it('rejects marriage and divorce dates after a spouse death date', async () => {
    mockDb.treeNode.findMany.mockResolvedValue([
      { id: 'n1', fullName: 'A', birthDate: null, deathDate: new Date('2020-01-01') },
      { id: 'n2', fullName: 'B', birthDate: null, deathDate: null },
    ])

    const marriedResult = await createUnion({ ...values, marriedAt: new Date('2020-01-01') })
    const divorcedResult = await createUnion({ ...values, divorcedAt: new Date('2020-01-01') })

    expect(marriedResult).toEqual({ error: true, message: 'error-married-after-death' })
    expect(divorcedResult).toEqual({ error: true, message: 'error-divorced-after-death' })
    expect(mockDb.union.create).not.toHaveBeenCalled()
  })
})

describe('updateUnion', () => {
  const values = {
    id: 'u_current',
    treeId: 't1',
    spouseAId: 'n1',
    spouseBId: 'n2',
    marriedAt: null,
    divorcedAt: null,
    place: null,
  }

  it('rejects updates that would give either spouse a third marriage', async () => {
    mockDb.union.findFirst.mockResolvedValue({
      id: 'u_current',
      spouseAId: 'old1',
      spouseBId: 'old2',
      spouseA: { fullName: 'Old 1' },
      spouseB: { fullName: 'Old 2' },
      marriedAt: null,
      divorcedAt: null,
      place: null,
    })
    mockDb.treeNode.findMany.mockResolvedValue([
      { id: 'n1', fullName: 'A', birthDate: null, deathDate: null },
      { id: 'n2', fullName: 'B', birthDate: null, deathDate: null },
    ])
    mockDb.union.findMany.mockResolvedValue([
      { id: 'u1', spouseAId: 'n1', spouseBId: 'x1' },
      { id: 'u2', spouseAId: 'x2', spouseBId: 'n1' },
    ])

    const result = await updateUnion(values)

    expect(result).toEqual({ error: true, message: 'error-member-has-max-marriages' })
    expect(mockDb.union.update).not.toHaveBeenCalled()
  })

  it('rejects updates with marriage dates outside spouse life dates', async () => {
    mockDb.union.findFirst.mockResolvedValue({
      id: 'u_current',
      spouseAId: 'old1',
      spouseBId: 'old2',
      spouseA: { fullName: 'Old 1' },
      spouseB: { fullName: 'Old 2' },
      marriedAt: null,
      divorcedAt: null,
      place: null,
    })
    mockDb.treeNode.findMany.mockResolvedValue([
      { id: 'n1', fullName: 'A', birthDate: new Date('1990-01-01'), deathDate: null },
      { id: 'n2', fullName: 'B', birthDate: null, deathDate: null },
    ])

    const result = await updateUnion({ ...values, marriedAt: new Date('1980-01-01') })

    expect(result).toEqual({ error: true, message: 'error-married-before-birth' })
    expect(mockDb.union.update).not.toHaveBeenCalled()
  })
})

describe('deleteTreeNode', () => {
  it('returns error when not authenticated', async () => {
    mockAssertAuth.mockRejectedValue(new Error('unauthenticated'))
    const result = await deleteTreeNode('n1', 't1')
    expect(result.error).toBe(true)
  })

  it('returns error when node not found', async () => {
    mockDb.treeNode.findFirst.mockResolvedValue(null)
    const result = await deleteTreeNode('n1', 't1')
    expect(result).toEqual({ error: true, message: 'error-nodes-not-found' })
  })

  it('deletes node with edges and orphaned pictures', async () => {
    mockDb.treeNode.findFirst.mockResolvedValue({ id: 'n1', fullName: 'John' })
    mockDb.treeEdge.findMany.mockResolvedValue([{ id: 'e1' }])
    mockDb.treeEdge.deleteMany.mockResolvedValue({})
    mockDb.picture.findMany.mockResolvedValue([{ id: 'p1', fileKey: 'key1' }])
    mockDb.pictureTag.deleteMany.mockResolvedValue({})
    mockDb.picture.deleteMany.mockResolvedValue({})
    mockDb.treeNode.delete.mockResolvedValue({})
    mockDb.activityLog.create.mockResolvedValue({})

    const result = await deleteTreeNode('n1', 't1')
    expect(result.error).toBe(false)
    expect(mockDb.treeEdge.deleteMany).toHaveBeenCalled()
    expect(mockDb.picture.deleteMany).toHaveBeenCalled()
    expect(mockDb.treeNode.delete).toHaveBeenCalledWith({ where: { id: 'n1' } })
  })

  it('logs S3 cleanup failure to Sentry', async () => {
    mockDb.treeNode.findFirst.mockResolvedValue({ id: 'n1', fullName: 'John' })
    mockDb.treeEdge.findMany.mockResolvedValue([])
    mockDb.picture.findMany.mockResolvedValue([{ id: 'p1', fileKey: 'key1' }])
    mockDb.pictureTag.deleteMany.mockResolvedValue({})
    mockDb.picture.deleteMany.mockResolvedValue({})
    mockDb.treeNode.delete.mockResolvedValue({})
    mockDb.activityLog.create.mockResolvedValue({})

    const s3Error = new Error('S3 delete failed')
    ;(deleteFileFromS3 as ReturnType<typeof vi.fn>).mockRejectedValue(s3Error)

    const result = await deleteTreeNode('n1', 't1')
    expect(result.error).toBe(false)
    expect(Sentry.captureException).toHaveBeenCalledWith(
      s3Error,
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({ action: 'deleteTreeNode', step: 's3-cleanup' }),
      })
    )
    expect(mockDb.treeNode.delete).toHaveBeenCalledWith({ where: { id: 'n1' } })
  })
})

describe('deleteTreeEdge', () => {
  it('returns error when not authenticated', async () => {
    mockAssertAuth.mockRejectedValue(new Error('unauthenticated'))
    const result = await deleteTreeEdge('e1', 't1')
    expect(result.error).toBe(true)
  })

  it('returns error when edge not found', async () => {
    mockDb.treeEdge.findFirst.mockResolvedValue(null)
    const result = await deleteTreeEdge('e1', 't1')
    expect(result).toEqual({ error: true, message: 'error-edge-not-found' })
  })

  it('deletes edge successfully', async () => {
    mockDb.treeEdge.findFirst.mockResolvedValue({
      id: 'e1',
      fromNodeId: 'n1',
      toNodeId: 'n2',
      type: 'PARENT',
    })
    mockDb.treeNode.findFirst
      .mockResolvedValueOnce({ id: 'n1', fullName: 'A' })
      .mockResolvedValueOnce({ id: 'n2', fullName: 'B' })
    mockDb.treeEdge.delete.mockResolvedValue({})
    mockDb.activityLog.create.mockResolvedValue({})

    const result = await deleteTreeEdge('e1', 't1')
    expect(result.error).toBe(false)
    expect(mockDb.treeEdge.delete).toHaveBeenCalledWith({ where: { id: 'e1' } })
  })
})

describe('getTreeNodes', () => {
  it('returns empty on auth failure', async () => {
    mockAssertAuth.mockRejectedValue(new Error('unauthenticated'))
    const result = await getTreeNodes('t1')
    expect(result).toEqual([])
  })

  it('returns empty when no access', async () => {
    mockDb.treeAccess.findFirst.mockResolvedValue(null)
    const result = await getTreeNodes('t1')
    expect(result).toEqual([])
  })

  it('returns nodes when user has access', async () => {
    mockDb.treeAccess.findFirst.mockResolvedValue({ id: 'a1' })
    const nodes = [{ id: 'n1', fullName: 'John' }]
    mockDb.treeNode.findMany.mockResolvedValue(nodes)
    const result = await getTreeNodes('t1')
    expect(result).toEqual(nodes)
  })
})

describe('getTimelineEvents', () => {
  it('returns empty on auth failure', async () => {
    mockAssertAuth.mockRejectedValue(new Error('unauthenticated'))
    const result = await getTimelineEvents('my-tree')
    expect(result).toEqual([])
  })

  it('returns empty when tree not found', async () => {
    mockDb.tree.findFirst.mockResolvedValue(null)
    const result = await getTimelineEvents('my-tree')
    expect(result).toEqual([])
  })

  it('returns sorted timeline events', async () => {
    const birthDate = new Date('1990-01-15')
    const deathDate = new Date('2020-06-10')
    mockDb.tree.findFirst.mockResolvedValue({
      nodes: [
        {
          id: 'n1',
          fullName: 'John',
          birthDate,
          deathDate,
          birthPlace: 'NYC',
          deathPlace: 'LA',
          taggedIn: [],
        },
      ],
    })

    const result = await getTimelineEvents('my-tree')
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('birth')
    expect(result[1].type).toBe('death')
    expect(result[0].date.getTime()).toBeLessThan(result[1].date.getTime())
  })
})

describe('generateShareToken', () => {
  it('returns error when not authenticated', async () => {
    mockAssertAuth.mockRejectedValue(new Error('unauthenticated'))
    const result = await generateShareToken('t1', 7)
    expect(result.error).toBe(true)
  })

  it('returns error-no-permission for viewers', async () => {
    mockAssertRole.mockRejectedValue(new Error('error-no-permission'))
    const result = await generateShareToken('t1', 7)
    expect(result).toEqual({ error: true, message: 'error-no-permission' })
  })

  it('rejects invalid ttlDays values', async () => {
    const result = await generateShareToken('t1', 5 as any)
    expect(result).toEqual({ error: true, message: 'error-invalid-ttl' })
    expect(mockDb.tree.update).not.toHaveBeenCalled()
  })

  it('generates a token with correct ttl and writes activity log', async () => {
    mockDb.tree.update.mockResolvedValue({ id: 't1', slug: 'my-tree' })
    const before = Date.now()
    const result = await generateShareToken('t1', 7)
    const after = Date.now()

    expect(result.error).toBe(false)
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(result.expiresAt).toBeInstanceOf(Date)
    const expiresMs = result.expiresAt!.getTime()
    expect(expiresMs).toBeGreaterThanOrEqual(before + 7 * 86_400_000)
    expect(expiresMs).toBeLessThanOrEqual(after + 7 * 86_400_000)
    expect(mockDb.tree.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({ shareToken: result.token }),
      })
    )
    expect(mockDb.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'SHARE_TOKEN_GENERATED' }),
      })
    )
  })

  it('rotation produces a different token on each call', async () => {
    mockDb.tree.update.mockResolvedValue({ id: 't1', slug: 'my-tree' })
    const a = await generateShareToken('t1', 7)
    const b = await generateShareToken('t1', 7)
    expect(a.token).not.toEqual(b.token)
  })
})

describe('getShareLink', () => {
  it('returns null when not authenticated', async () => {
    mockAssertAuth.mockRejectedValue(new Error('unauthenticated'))
    const result = await getShareLink('t1')
    expect(result).toBeNull()
  })

  it('returns null when role check fails (viewer)', async () => {
    mockAssertRole.mockRejectedValue(new Error('error-no-permission'))
    const result = await getShareLink('t1')
    expect(result).toBeNull()
  })

  it('returns null when no token is set', async () => {
    mockDb.tree.findUnique.mockResolvedValue({ shareToken: null, shareTokenExpiresAt: null })
    const result = await getShareLink('t1')
    expect(result).toBeNull()
  })

  it('returns null when token is expired', async () => {
    mockDb.tree.findUnique.mockResolvedValue({
      shareToken: 'abc',
      shareTokenExpiresAt: new Date(Date.now() - 1000),
    })
    const result = await getShareLink('t1')
    expect(result).toBeNull()
  })

  it('returns token and expiresAt when active', async () => {
    const expiresAt = new Date(Date.now() + 86_400_000)
    mockDb.tree.findUnique.mockResolvedValue({ shareToken: 'abc', shareTokenExpiresAt: expiresAt })
    const result = await getShareLink('t1')
    expect(result).toEqual({ token: 'abc', expiresAt })
  })
})

describe('joinTreeViaShareToken', () => {
  it('returns error when not authenticated', async () => {
    mockAssertAuth.mockRejectedValue(new Error('unauthenticated'))
    const result = await joinTreeViaShareToken('anytoken')
    expect(result.error).toBe(true)
    expect(result.message).toBe('unauthenticated')
  })

  it('returns error-share-token-invalid for unknown token', async () => {
    mockDb.tree.findFirst.mockResolvedValue(null)
    const result = await joinTreeViaShareToken('bogus')
    expect(result).toEqual({ error: true, message: 'error-share-token-invalid' })
    expect(mockDb.treeAccess.create).not.toHaveBeenCalled()
  })

  it('returns error-share-token-expired when token is past expiry', async () => {
    mockDb.tree.findFirst.mockResolvedValue({
      id: 't1',
      slug: 'my-tree',
      shareTokenExpiresAt: new Date(Date.now() - 1000),
    })
    const result = await joinTreeViaShareToken('sometoken')
    expect(result).toEqual({ error: true, message: 'error-share-token-expired' })
    expect(mockDb.treeAccess.create).not.toHaveBeenCalled()
  })

  it('creates TreeAccess with VIEWER role and logs activity', async () => {
    mockDb.tree.findFirst.mockResolvedValue({
      id: 't1',
      slug: 'my-tree',
      shareTokenExpiresAt: new Date(Date.now() + 86_400_000),
    })
    mockDb.treeAccess.create.mockResolvedValue({})
    mockDb.user.findUnique.mockResolvedValue({ name: 'Alice' })

    const result = await joinTreeViaShareToken('tok')
    expect(result).toEqual({ error: false, slug: 'my-tree', alreadyMember: false })
    expect(mockDb.treeAccess.create).toHaveBeenCalledWith({
      data: { treeId: 't1', userId: 'user-1', role: 'VIEWER' },
    })
    expect(mockDb.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'MEMBER_JOINED_VIA_SHARE' }),
      })
    )
  })

  it('treats P2002 as alreadyMember without demoting role or double-logging', async () => {
    mockDb.tree.findFirst.mockResolvedValue({
      id: 't1',
      slug: 'my-tree',
      shareTokenExpiresAt: new Date(Date.now() + 86_400_000),
    })
    mockDb.treeAccess.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6.0.0' })
    )

    const result = await joinTreeViaShareToken('tok')
    expect(result).toEqual({ error: false, slug: 'my-tree', alreadyMember: true })
    expect(mockDb.treeAccess.update).not.toHaveBeenCalled()
    expect(mockDb.activityLog.create).not.toHaveBeenCalled()
  })

  it('is idempotent under race (Promise.all with two joins)', async () => {
    mockDb.tree.findFirst.mockResolvedValue({
      id: 't1',
      slug: 'my-tree',
      shareTokenExpiresAt: new Date(Date.now() + 86_400_000),
    })
    mockDb.user.findUnique.mockResolvedValue({ name: 'Alice' })

    let callCount = 0
    mockDb.treeAccess.create.mockImplementation(async () => {
      callCount += 1
      if (callCount === 1) return {}
      throw new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '6.0.0',
      })
    })

    const [r1, r2] = await Promise.all([joinTreeViaShareToken('tok'), joinTreeViaShareToken('tok')])

    expect(r1.error).toBe(false)
    expect(r2.error).toBe(false)
    const alreadyFlags = [r1.alreadyMember, r2.alreadyMember].sort()
    expect(alreadyFlags).toEqual([false, true])
    expect(mockDb.treeAccess.create).toHaveBeenCalledTimes(2)
    expect(mockDb.activityLog.create).toHaveBeenCalledTimes(1)
  })
})
