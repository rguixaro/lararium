import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/server/db', () => ({
  db: {
    tree: { findMany: vi.fn() },
    treeNode: { findMany: vi.fn() },
  },
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendWeeklyNewsletter: vi.fn().mockResolvedValue(true) }))
vi.mock('@/utils/language', () => ({ languageToLocale: vi.fn(() => 'en') }))

import { db } from '@/server/db'
import { sendWeeklyNewsletter } from '@/lib/email'
import { languageToLocale } from '@/utils/language'
import { sendWeeklyNewsletters } from './newsletter'

const mockDb = db as unknown as {
  tree: { findMany: ReturnType<typeof vi.fn> }
  treeNode: { findMany: ReturnType<typeof vi.fn> }
}
const mockSendNewsletter = vi.mocked(sendWeeklyNewsletter)
const mockLanguageToLocale = vi.mocked(languageToLocale)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 3, 13, 0, 0, 0))
  vi.clearAllMocks()
  mockSendNewsletter.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('sendWeeklyNewsletters', () => {
  it('returns failure on db error', async () => {
    mockDb.tree.findMany.mockRejectedValue(new Error('db error'))
    const result = await sendWeeklyNewsletters()
    expect(result).toEqual({ success: false, emailsSent: 0, errors: 1 })
  })

  it('skips trees with no subscribers', async () => {
    mockDb.tree.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Empty',
        slug: 'empty',
        newsletter: true,
        accesses: [],
        nodes: [{ id: 'n1', fullName: 'John', createdAt: new Date() }],
      },
    ])

    const result = await sendWeeklyNewsletters()
    expect(result.success).toBe(true)
    expect(result.emailsSent).toBe(0)
    expect(mockSendNewsletter).not.toHaveBeenCalled()
  })

  it('skips trees with no new nodes and no events', async () => {
    mockDb.tree.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Quiet',
        slug: 'quiet',
        newsletter: true,
        accesses: [{ user: { id: 'u1', email: 'alice@example.com', name: 'Alice' } }],
        nodes: [],
      },
    ])
    mockDb.treeNode.findMany.mockResolvedValue([
      { id: 'n1', fullName: 'Bob', birthDate: new Date(1990, 8, 1), deathDate: null },
    ])

    const result = await sendWeeklyNewsletters()
    expect(result.success).toBe(true)
    expect(result.emailsSent).toBe(0)
    expect(mockSendNewsletter).not.toHaveBeenCalled()
  })

  it('sends emails and counts correctly', async () => {
    const recentNode = {
      id: 'n1',
      fullName: 'NewKid',
      birthDate: null,
      deathDate: null,
      createdAt: new Date(2026, 3, 12),
    }
    mockDb.tree.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Family',
        slug: 'family',
        newsletter: true,
        accesses: [
          { user: { id: 'u1', email: 'alice@example.com', name: 'Alice' } },
          { user: { id: 'u2', email: 'bob@example.com', name: 'Bob' } },
        ],
        nodes: [recentNode],
      },
    ])
    mockDb.treeNode.findMany.mockResolvedValue([recentNode])

    const result = await sendWeeklyNewsletters()
    expect(result.success).toBe(true)
    expect(result.emailsSent).toBe(2)
    expect(result.errors).toBe(0)
    expect(mockSendNewsletter).toHaveBeenCalledTimes(2)
  })

  it('formats each newsletter using the recipient language', async () => {
    const recentNode = {
      id: 'n1',
      fullName: 'NewKid',
      birthDate: null,
      deathDate: null,
      createdAt: new Date(2026, 3, 12),
    }

    mockLanguageToLocale.mockReturnValueOnce('ur')
    mockDb.tree.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Family',
        slug: 'family',
        newsletter: true,
        accesses: [
          { user: { id: 'u1', email: 'alice@example.com', name: 'Alice', language: 'UR' } },
        ],
        nodes: [recentNode],
      },
    ])
    mockDb.treeNode.findMany.mockResolvedValue([recentNode])

    const result = await sendWeeklyNewsletters()

    expect(result.success).toBe(true)
    expect(mockLanguageToLocale).toHaveBeenCalledWith('UR')
    expect(mockSendNewsletter).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'ur',
      })
    )
  })

  it('handles individual email failures gracefully', async () => {
    const recentNode = {
      id: 'n1',
      fullName: 'NewKid',
      birthDate: null,
      deathDate: null,
      createdAt: new Date(2026, 3, 12),
    }
    mockDb.tree.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Family',
        slug: 'family',
        newsletter: true,
        accesses: [
          { user: { id: 'u1', email: 'alice@example.com', name: 'Alice' } },
          { user: { id: 'u2', email: 'bob@example.com', name: 'Bob' } },
        ],
        nodes: [recentNode],
      },
    ])
    mockDb.treeNode.findMany.mockResolvedValue([recentNode])

    mockSendNewsletter.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('SMTP failure'))

    const result = await sendWeeklyNewsletters()
    expect(result.success).toBe(true)
    expect(result.emailsSent).toBe(1)
    expect(result.errors).toBe(1)
  })

  it('counts individual email failures separately across trees', async () => {
    const recentNode = {
      id: 'n1',
      fullName: 'NewKid',
      birthDate: null,
      deathDate: null,
      createdAt: new Date(2026, 3, 12),
    }
    mockDb.tree.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Family A',
        slug: 'family-a',
        newsletter: true,
        accesses: [{ user: { id: 'u1', email: 'alice@example.com', name: 'Alice' } }],
        nodes: [recentNode],
      },
      {
        id: 't2',
        name: 'Family B',
        slug: 'family-b',
        newsletter: true,
        accesses: [
          { user: { id: 'u2', email: 'bob@example.com', name: 'Bob' } },
          { user: { id: 'u3', email: 'carol@example.com', name: 'Carol' } },
        ],
        nodes: [recentNode],
      },
    ])
    mockDb.treeNode.findMany.mockResolvedValue([recentNode])

    mockSendNewsletter
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('SMTP failure'))
      .mockResolvedValueOnce(true)

    const result = await sendWeeklyNewsletters()
    expect(result.success).toBe(true)
    expect(result.emailsSent).toBe(2)
    expect(result.errors).toBe(1)
  })
})
