'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useForm, useFieldArray, UseFormReturn, FieldArrayWithId } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as Tabs from '@radix-ui/react-tabs'
import { LoaderIcon } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { type z } from 'zod'

import { CreateTreeSchema } from '@/server/schemas'
import { createTree, inviteMember, removeMember } from '@/server/actions'

import { GoBack } from '@/components/layout'
import { StyledSelector } from '@/components/trees/form'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  ConfirmDialog,
  TypographyH5,
  TypographyH4,
  Button,
} from '@/ui'

import { Tree, TreeAccessRole } from '@/types'

import { checkKeyDown, isValidEmail } from '@/utils'

type FormValues = z.infer<typeof CreateTreeSchema>

interface CreateTreeProps {
  userId: string
}

interface MemberItemProps {
  field: FieldArrayWithId<FormValues, 'members', 'id'>
  index: number
  form: UseFormReturn<FormValues>
  loading: boolean
  currentUserId: string
  t_trees: ReturnType<typeof useTranslations>
  t_errors: ReturnType<typeof useTranslations>
  inviteUser: (email: string, role: TreeAccessRole) => void
  remove: (index: number) => void
  setDialogOpen: (open: boolean) => void
  setCurrMember: (member: { index: number; memberId?: string } | null) => void
}

const MemberItem = ({
  field,
  index,
  form,
  loading,
  currentUserId,
  t_trees,
  t_errors,
  inviteUser,
  remove,
  setDialogOpen,
  setCurrMember,
}: MemberItemProps) => {
  const memberRole = form.watch(`members.${index}.role`)
  const memberEmail = form.watch(`members.${index}.email`)
  const canInvite = isValidEmail(memberEmail || '')
  const isNew = !field.userId

  return (
    <FormField
      key={field.id}
      control={form.control}
      name={`members.${index}.role`}
      render={() => (
        <FormItem className="bg-ocean-100/15 border-ocean-100/50 my-2 w-full flex-col items-center justify-start space-x-3 rounded-lg border-2 p-4">
          <div className="w-full sm:flex sm:justify-between">
            <div className="flex-col space-y-2">
              {isNew ? (
                <div className="flex w-full sm:space-x-5">
                  <FormField
                    control={form.control}
                    name={`members.${index}.email`}
                    render={({ field: emailField }) => (
                      <FormControl>
                        <Input
                          {...emailField}
                          placeholder={t_trees('tree-member-email')}
                          className="w-full"
                          disabled={loading}
                          value={memberEmail || ''}
                        />
                      </FormControl>
                    )}
                  />
                </div>
              ) : (
                <FormLabel>
                  {field.name} <span className="font-normal">{`(${memberEmail})`}</span>
                </FormLabel>
              )}
            </div>
            <div className="flex space-x-2">
              <Button
                type={'button'}
                variant={'outline'}
                disabled={!canInvite}
                onClick={() => inviteUser(memberEmail!, memberRole!)}
                className="bg-ocean-50 border-ocean-200 text-ocean-200 hover:bg-ocean-200 hover:text-pale-ocean disabled:bg-ocean-50 hidden text-xs font-bold sm:block"
              >
                {t_trees('tree-member-invite')}
              </Button>
              {currentUserId !== field.userId && (
                <Button
                  type="button"
                  onClick={() => {
                    if (field.userId) {
                      setCurrMember({ index, memberId: field.userId })
                      setDialogOpen(true)
                    } else remove(index)
                  }}
                  className="bg-ocean-300 hover:bg-ocean-400 text-pale-ocean hidden text-xs font-bold sm:block"
                >
                  {t_trees('tree-member-remove')}
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <FormControl>
              <StyledSelector
                types={TreeAccessRole}
                value={memberRole}
                disabled={currentUserId === field.userId}
                setValue={(value) => {
                  if (memberRole === 'ADMIN' && value !== 'ADMIN') {
                    const admins = form.getValues('members')?.filter((m) => m.role === 'ADMIN')
                    if (admins && admins.length <= 1)
                      return toast.error(t_errors('error-tree-admin-required'))
                  }
                  form.setValue(`members.${index}.role`, value)
                }}
              />
            </FormControl>
          </div>
          <div className="flex-col">
            {isNew && (
              <Button
                type="button"
                variant={'outline'}
                disabled={!canInvite}
                onClick={() => inviteUser(memberEmail!, memberRole!)}
                className="bg-ocean-50 border-ocean-200 text-ocean-200 hover:bg-ocean-200 hover:text-pale-ocean disabled:bg-ocean-50 visible w-full text-xs font-bold sm:hidden sm:w-auto"
              >
                {t_trees('tree-member-invite')}
              </Button>
            )}
            {currentUserId != field.userId && (
              <Button
                type="button"
                onClick={() => {
                  if (field.userId) {
                    setCurrMember({ index, memberId: field.userId })
                    setDialogOpen(true)
                  } else {
                    remove(index)
                  }
                }}
                className="text-ocean-400 visible bg-transparent text-xs font-bold underline decoration-dotted underline-offset-4 shadow-none! sm:hidden"
              >
                {t_trees('tree-member-remove')}
              </Button>
            )}
          </div>
        </FormItem>
      )}
    />
  )
}

export const CreateTree = ({ userId: currentUserId }: CreateTreeProps) => {
  const t_common = useTranslations('common')
  const t_trees = useTranslations('trees')
  const t_errors = useTranslations('errors')
  const t_toasts = useTranslations('toasts')

  const [loading, setLoading] = useState<boolean>(false)
  const [currentTree, setCurrentTree] = useState<Tree>()
  const [currentTab, setCurrentTab] = useState<'general' | 'members'>('general')
  const [canAccessMembers, setCanAccessMembers] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [currMember, setCurrMember] = useState<{ index: number; memberId?: string } | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(CreateTreeSchema),
    defaultValues: { name: '', newsletter: true, members: [] },
  })

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'members' })

  /**
   * Handle async operations with loading state
   * @param fn
   */
  const withAsync = async <T,>(fn: () => Promise<T>) => {
    try {
      setLoading(true)
      await fn()
    } finally {
      setLoading(false)
    }
  }

  /**
   * onSubmit form handler
   * @param values {z.infer<typeof CreateTreeSchema>}
   */
  const onSubmit = async (values: FormValues) =>
    withAsync(async () => {
      const { error, message, tree } = await createTree(values)
      if (error) return toast.error(t_errors(message || 'error'))

      toast.success(t_toasts('tree-created'))
      if (tree) resetTree(tree)
      setCanAccessMembers(true)
      setCurrentTab('members')
    })

  /**
   * Invite user to tree
   * @param email {string}
   * @param role {TreeAccessRole}
   */
  const inviteUser = (email: string, role: TreeAccessRole) =>
    withAsync(async () => {
      if (!currentTree) return
      const { error, message, tree } = await inviteMember(currentTree.id, email, role)
      if (error) return toast.error(t_errors(message || 'error'))
      toast.success(t_toasts('tree-member-added'))
      if (tree) resetTree(tree)
    })

  /**
   * Remove user from tree
   * @param index {number}
   * @param memberId {string}
   */
  const removeUser = (index: number, memberId?: string) =>
    withAsync(async () => {
      if (!memberId) return remove(index)
      if (!currentTree) return

      const { error, message, tree } = await removeMember(currentTree.id, memberId)
      if (error) return toast.error(t_errors(message || 'error'))
      toast.success(t_toasts('tree-member-removed'))
      if (tree) resetTree(tree)
    })

  /**
   * Reset the form and current tree state.
   * @param tree {Tree}
   */
  const resetTree = (tree: Tree) => {
    setCurrentTree(tree)
    form.reset({
      name: tree.name,
      members: tree.accesses?.map((a) => ({
        userId: a.userId,
        name: a.user.name,
        email: a.user.email,
        role: a.role,
      })),
    })
  }

  return (
    <div className="text-ocean-400 z-0 flex w-full flex-col">
      <GoBack
        variant="filled"
        text={currentTree ? 'tree' : 'trees'}
        to={currentTree ? `/trees/${currentTree.slug}` : '/'}
      />
      <TypographyH4>{t_trees('tree-create')}</TypographyH4>
      <p className="mb-4">{t_trees('tree-create-description')} </p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} onKeyDown={(e) => checkKeyDown(e)}>
          <Tabs.Root
            value={currentTab}
            onValueChange={(value) => setCurrentTab(value as 'general' | 'members')}
          >
            <Tabs.List className="border-ocean-200/50 mb-4 flex border-b-2">
              <Tabs.Trigger
                value="general"
                disabled={canAccessMembers}
                className="border-ocean-100 text-ocean-300 px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-50 data-[state=active]:border-b-2 data-[state=active]:font-bold"
              >
                {t_trees('general-tab-label')}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="members"
                disabled={!canAccessMembers}
                className="border-ocean-100 text-ocean-300 px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:border-b-2 data-[state=active]:font-bold"
              >
                {t_trees('tree-members-tab-label')}
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="general" className="space-y-4">
              <TypographyH5 className="mt-5">{t_trees('general-tab')}</TypographyH5>
              <div className="border-ocean-200/50 shadow-center-sm bg-pale-ocean mb-2 flex-col items-start rounded-xl border-2 px-3 py-2 text-left">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="w-fit">
                      <FormLabel>{t_trees('tree-name')}</FormLabel>
                      <FormDescription className="mb-2 text-sm opacity-70">
                        {t_trees('tree-name-description')}
                      </FormDescription>
                      <FormControl className="mb-5 flex w-max">
                        <Input
                          {...field}
                          autoComplete="off"
                          className="w-auto"
                          placeholder={t_trees('name')}
                          disabled={loading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="bg-ocean-200/15 mx-auto my-3 h-1 w-full rounded" />
              </div>
              <TypographyH5 className="mt-5">{t_trees('settings-tab')}</TypographyH5>
              <div className="border-ocean-200/50 shadow-center bg-pale-ocean flex-col items-start rounded-xl border-2 px-3 py-2">
                <FormField
                  control={form.control}
                  name="newsletter"
                  render={() => {
                    const value = form.getValues('newsletter')
                    return (
                      <FormItem>
                        <FormLabel>{t_trees('tree-newsletter-weekly')}</FormLabel>
                        <FormDescription className="mb-2 text-sm opacity-70">
                          {t_trees('tree-newsletter-weekly-info')}
                        </FormDescription>
                        <FormControl>
                          <StyledSelector
                            types={['Enabled', 'Disabled'] as const}
                            value={value == undefined ? '' : value ? 'Enabled' : 'Disabled'}
                            setValue={(value) => form.setValue('newsletter', value === 'Enabled')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )
                  }}
                />
              </div>
              <div className="my-5">
                <Button
                  type="submit"
                  disabled={loading}
                  className="hover:bg-ocean-300 text-pale-ocean"
                >
                  <div className="flex items-center space-x-3">
                    {loading && <LoaderIcon size={16} className="animate-spin" />}
                    <span className="text-sm font-bold">
                      {loading ? t_common('creating') : t_common('create')}
                    </span>
                  </div>
                </Button>
              </div>
            </Tabs.Content>
            <Tabs.Content value="members" className="space-y-4">
              <TypographyH5 className="mt-2">{t_trees('tree-members-tab')}</TypographyH5>
              <div className="border-ocean-200/50 shadow-center-sm bg-pale-ocean flex-col items-start rounded-xl border-2 p-3">
                <FormLabel>{t_trees('tree-members')}</FormLabel>
                <FormDescription className="mb-2 text-sm opacity-70">
                  {t_trees('tree-members-info')}
                </FormDescription>
                <FormDescription className="my-4 text-sm opacity-70">
                  {t_trees('tree-member-role')}
                </FormDescription>
                {fields.map((field, index) => (
                  <MemberItem
                    key={field.id}
                    field={field}
                    index={index}
                    form={form}
                    loading={loading}
                    currentUserId={currentUserId}
                    t_trees={t_trees}
                    t_errors={t_errors}
                    inviteUser={inviteUser}
                    remove={remove}
                    setDialogOpen={setDialogOpen}
                    setCurrMember={setCurrMember}
                  />
                ))}
              </div>
              <div className="my-5 flex justify-between">
                <Button
                  type="button"
                  disabled={loading}
                  onClick={() => append({ userId: '', name: '', email: '', role: 'VIEWER' })}
                  className="hover:bg-ocean-300 text-pale-ocean"
                >
                  <div className="flex items-center space-x-3">
                    {loading && <LoaderIcon size={16} className="animate-spin" />}
                    <span className="text-sm font-bold">{t_trees('tree-member-add')}</span>
                  </div>
                </Button>
                <Button
                  type="button"
                  variant={'outline'}
                  onClick={() => {}}
                  className="bg-ocean-50 border-ocean-200 text-ocean-200 hover:bg-ocean-200 hover:text-pale-ocean"
                >
                  <Link href={`/trees/${currentTree?.slug ?? ''}`} className="text-sm font-bold">
                    {t_common('finish')}
                  </Link>
                </Button>
              </div>
            </Tabs.Content>
          </Tabs.Root>
          <ConfirmDialog
            open={dialogOpen}
            title={t_trees('tree-member-remove-confirm')}
            description={t_trees('tree-member-remove-confirm-description')}
            onCancel={() => setDialogOpen(false)}
            onConfirm={() => {
              if (currMember) removeUser(currMember.index, currMember.memberId)
              setDialogOpen(false)
            }}
          />
        </form>
      </Form>
    </div>
  )
}
