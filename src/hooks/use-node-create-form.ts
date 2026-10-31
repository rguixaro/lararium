'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { type z } from 'zod'

import { CreateTreeNodeSchema } from '@/server/schemas'
import { createTreeNode, createUnion } from '@/server/actions'

import { Tree } from '@/types'

export function useNodeCreateForm(
  tree: Tree,
  onSuccess?: (nodeId?: string) => void | Promise<void>
) {
  const t_toasts = useTranslations('toasts')
  const t_errors = useTranslations('errors')

  const form = useForm<z.infer<typeof CreateTreeNodeSchema>>({
    resolver: zodResolver(CreateTreeNodeSchema),
    defaultValues: {
      treeId: tree.id,
      fullName: '',
      married: false,
      spouseName: '',
      servingAs: '',
      birthPlace: '',
      deathPlace: '',
    },
  })

  const onSubmit = async (values: z.infer<typeof CreateTreeNodeSchema>): Promise<void> => {
    const { married, spouseName, ...personValues } = values
    const { error, message, nodeId } = await createTreeNode(personValues)
    if (error || !nodeId) {
      toast.error(t_errors(message || 'error'))
      return
    }

    if (married && spouseName) {
      const spouse = await createTreeNode({ treeId: tree.id, fullName: spouseName })
      if (!spouse.error && spouse.nodeId) {
        await createUnion({ treeId: tree.id, spouseAId: nodeId, spouseBId: spouse.nodeId })
      }
    }

    toast.success(t_toasts('node-created'))
    form.reset()
    await onSuccess?.(nodeId)
  }

  return { form, onSubmit }
}
