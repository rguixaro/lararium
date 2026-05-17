'use server'

import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import * as Sentry from '@sentry/nextjs'

import { db } from '@/server/db'
import { assertAuthenticated, assertRole, assertTreeWritable } from '@/server/utils'
import { UpdateTreeNoteSchema } from '@/server/schemas'

/**
 * How long (in minutes) to debounce NOTE_UPDATED activity log entries by the
 * same user on the same tree. Multiple saves within this window by the same
 * user only write one log entry to keep the activity feed useful.
 */
const ACTIVITY_LOG_DEBOUNCE_MIN = 10
const TREE_WRITE_ERROR_MESSAGES = ['error-no-permission', 'error-tree-pending-deletion'] as const

type TreeWriteErrorMessage = (typeof TREE_WRITE_ERROR_MESSAGES)[number]

const getActionErrorMessage = (error: unknown): string | undefined =>
  error instanceof Error ? error.message : undefined

const isTreeWriteError = (error: unknown) => {
  const message = getActionErrorMessage(error)
  return !!message && TREE_WRITE_ERROR_MESSAGES.includes(message as TreeWriteErrorMessage)
}

/**
 * Create or update the singleton shared note for a tree.
 * Auth + EDITOR/ADMIN role required.
 *
 * Writes a debounced NOTE_UPDATED activity log, consecutive saves by the same
 * user within ACTIVITY_LOG_DEBOUNCE_MIN minutes only produce a single log entry.
 */
export const updateTreeNote = async (input: {
  treeId: string
  content: string
}): Promise<{ error: boolean; message?: string }> => {
  try {
    const userId = await assertAuthenticated()

    const parsed = UpdateTreeNoteSchema.safeParse(input)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'error'
      return { error: true, message }
    }

    const { treeId, content } = parsed.data

    const tree = await db.tree.findUnique({
      where: { id: treeId },
      select: { id: true, slug: true },
    })
    if (!tree) return { error: true, message: 'error-tree-not-found' }

    await assertRole(treeId, userId, ['EDITOR', 'ADMIN'])
    await assertTreeWritable(treeId)

    // Upsert by unique treeId
    await db.treeNote.upsert({
      where: { treeId },
      create: { treeId, content, updatedById: userId },
      update: { content, updatedById: userId },
    })

    const since = new Date(Date.now() - ACTIVITY_LOG_DEBOUNCE_MIN * 60 * 1000)
    const recent = await db.activityLog.findFirst({
      where: {
        treeId,
        createdBy: userId,
        action: 'NOTE_UPDATED',
        createdAt: { gte: since },
      },
      select: { id: true },
    })
    if (!recent) {
      await db.activityLog.create({
        data: {
          treeId,
          createdBy: userId,
          action: 'NOTE_UPDATED',
          entityId: treeId,
          metadata: { charCount: content.length },
        },
      })
    }

    revalidatePath(`/trees/notes/${tree.slug}`)

    return { error: false }
  } catch (e) {
    if (isTreeWriteError(e)) return { error: true, message: getActionErrorMessage(e) }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return { error: true, message: 'error-tree-not-found' }
    }
    Sentry.captureException(e, { tags: { action: 'updateTreeNote' } })
    return { error: true, message: 'error' }
  }
}
