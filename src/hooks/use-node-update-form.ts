'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { type z } from 'zod'

import { UpdateTreeNodeSchema } from '@/server/schemas'
import { updateTreeNode } from '@/server/actions'

import { Tree, TreeNode } from '@/types'
import { useEffect } from 'react'

export function useNodeUpdateForm(tree: Tree, node: TreeNode | null, onSuccess?: () => void) {
  const t_toasts = useTranslations('toasts')
  const t_errors = useTranslations('errors')

  const form = useForm<z.infer<typeof UpdateTreeNodeSchema>>({
    resolver: zodResolver(UpdateTreeNodeSchema),
    defaultValues: { treeId: tree.id, fullName: '', servingAs: '' },
  })

  /** Reset form when node changes */
  useEffect(() => {
    if (!node) return

    form.reset({
      id: node.id,
      treeId: tree.id,
      fullName: node.fullName ?? '',
      servingAs: node.servingAs ?? '',
    })
  }, [node, tree.id, form])

  /**
   * Handle form update submission
   * @param values {z.infer<typeof UpdateTreeNodeSchema>}
   * @returns {Promise<void>}
   */
  const onSubmit = async (values: z.infer<typeof UpdateTreeNodeSchema>): Promise<void> => {
    const { error, message } = await updateTreeNode(values)
    if (error) {
      toast.error(t_errors(message || 'error'))
      return
    }

    toast.success(t_toasts('node-updated'))
    form.reset()
    onSuccess?.()
  }

  return { form, onSubmit }
}
