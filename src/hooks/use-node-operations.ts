'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { deleteTreeNode } from '@/server/actions'
import { Tree, TreeNode } from '@/types'

export function useNodeOperations(tree: Tree, nodes: TreeNode[]) {
  const t_toasts = useTranslations('toasts')
  const t_errors = useTranslations('errors')
  const router = useRouter()

  /**
   * Delete a node and all its associated edges
   * @param nodeId - The id of the node to delete
   * @param closeDialog - Function to close the confirmation dialog
   * @return {Promise<void>}
   */
  const deleteNode = useCallback(
    async (nodeId: string, closeDialog: () => void) => {
      try {
        const { error, message } = await deleteTreeNode(nodeId, tree.id)

        if (error) {
          toast.error(t_errors(message || 'error'))
        } else {
          toast.success(t_toasts('node-deleted'))
          router.refresh()
        }
      } catch (error) {
        toast.error(t_errors('error'))
      }

      closeDialog()
    },
    [tree.id, t_errors, t_toasts, router]
  )

  return { deleteNode }
}
