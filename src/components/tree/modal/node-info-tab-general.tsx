'use client'

import { LoaderIcon } from 'lucide-react'
import { UseFormReturn } from 'react-hook-form'
import { type z } from 'zod'

import { UpdateTreeNodeSchema } from '@/server/schemas'

import { NodeRelations } from '@/components/tree/modal/node-relations'

import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  TypographyH5,
} from '@/ui'

import { TreeNode, Union } from '@/types'

interface NodeInfoTabGeneralProps {
  readonly: boolean
  node: TreeNode | null
  nodes: TreeNode[]
  unions: Union[]
  form: UseFormReturn<z.infer<typeof UpdateTreeNodeSchema>>
  loading: boolean
  editMode: boolean
  isMobile: boolean
  onEditModeChange: (editMode: boolean) => void
  onDelete: () => void
  t_common: (key: string) => string
  t_trees: (key: string) => string
  t_toasts: (key: string) => string
}

export function NodeInfoTabGeneral({
  readonly,
  node,
  nodes,
  unions,
  form,
  loading,
  editMode,
  isMobile,
  onEditModeChange,
  onDelete,
  t_common,
  t_trees,
  t_toasts,
}: NodeInfoTabGeneralProps) {
  const fullName = form.watch('fullName')
  const servingAs = form.watch('servingAs')

  // Dirty check includes full name and serving as
  const isDirty = fullName !== node?.fullName || servingAs !== ((node as any)?.servingAs ?? '')

  const actionButtons = (
    <div className="flex gap-2">
      {!editMode && !readonly && (
        <Button type="button" onClick={() => onEditModeChange(true)} disabled={loading}>
          <span className="text-sm font-bold">{t_trees('node-info-edit')}</span>
        </Button>
      )}
      {editMode && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => onEditModeChange(false)}
          disabled={loading}
        >
          <span className="text-sm font-bold">{t_common('cancel')}</span>
        </Button>
      )}
      {editMode && (
        <Button type="submit" disabled={loading || !isDirty}>
          <div className="flex items-center space-x-3">
            {loading && <LoaderIcon size={16} className="animate-spin" />}
            <span className="text-sm font-bold">
              {loading ? t_common('updating') : t_common('update')}
            </span>
          </div>
        </Button>
      )}
    </div>
  )

  return (
    <>
      {!isMobile && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <TypographyH5>{t_trees('node-general-info')}</TypographyH5>
          {actionButtons}
        </div>
      )}
      <div className="border-ocean-200/50 shadow-center-sm bg-pale-ocean mb-5 flex-col items-start rounded-xl border-2 px-3 py-2 text-left">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem className="w-fit">
              <FormLabel>{t_trees('node-fullname')}</FormLabel>
              <FormControl>
                <div className="py-2">
                  <Input
                    {...field}
                    autoComplete="off"
                    placeholder={t_trees('node-fullname')}
                    disabled={!editMode || loading}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="bg-ocean-200/15 mx-auto my-3 h-1 w-full rounded" />
        <FormField
          control={form.control}
          name="servingAs"
          render={({ field }) => (
            <FormItem className="w-fit">
              <FormLabel>{t_trees('node-serving-as')}</FormLabel>
              <FormControl>
                <div className="py-2">
                  <Input
                    {...field}
                    value={field.value ?? ''}
                    autoComplete="off"
                    placeholder={t_trees('node-serving-as')}
                    disabled={!editMode || loading}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      {!isMobile && (
        <NodeRelations
          node={node}
          nodes={nodes}
          unions={unions}
          isMobile={false}
          t_trees={t_trees}
        />
      )}
      {isMobile && <div className="my-6">{actionButtons}</div>}
      {editMode && (
        <div className="mt-auto self-start">
          <Button type="button" variant="ghost" onClick={onDelete} disabled={loading}>
            <span className="text-sm font-bold">{t_toasts('node-delete')}</span>
          </Button>
        </div>
      )}
    </>
  )
}
