'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslations } from 'next-intl'
import { LoaderIcon, LogOut, SaveIcon } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import type { z } from 'zod'
import * as Tabs from '@radix-ui/react-tabs'

import { Language } from '@prisma/client'

import { updateProfile } from '@/server/actions'
import { UpdateProfileSchema } from '@/server/schemas'

import {
  Button,
  Input,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  TypographyH5,
} from '@/ui'

import { DeleteAccount } from './delete-account'
import { LogoutAccount } from './logout-account'
import { StyledSelector } from '../trees/form'

interface UpdateAccountProps {
  id: string
  name: string
  email: string
  newsletter: boolean
  language: Language
}

export const UpdateAccount = (props: UpdateAccountProps) => {
  const t_common = useTranslations('common')
  const t_profile = useTranslations('profile')
  const t_toasts = useTranslations('toasts')
  const t_errors = useTranslations('errors')

  const [loading, setLoading] = useState<boolean>(false)
  const [currentTab, setCurrentTab] = useState<'profile' | 'account'>('profile')

  const initialLanguage = (
    ['UR', 'EN'].includes(props.language) ? props.language : 'UR'
  ) as Language

  const hookForm = useForm<z.infer<typeof UpdateProfileSchema>>({
    resolver: zodResolver(UpdateProfileSchema),
    defaultValues: {
      name: props.name,
      newsletter: props.newsletter,
      language: initialLanguage,
      email: props.email,
    },
  })

  const name = hookForm.watch('name')
  const newsletter = hookForm.watch('newsletter')
  const language = hookForm.watch('language')

  /**
   * Handle form submission to update profile.
   * @param values {z.infer<typeof UpdateProfileSchema>}
   */
  const onSubmit = async (values: z.infer<typeof UpdateProfileSchema>) => {
    try {
      setLoading(true)
      const result = await updateProfile(values)
      if (result.error) {
        toast.error(t_errors(result.message || 'error'))
      } else {
        toast.success(t_toasts('profile-updated'))
      }
    } catch (error) {
      toast.error(t_errors('error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="text-ocean-400 z-0 flex w-full flex-col">
      <Form {...hookForm}>
        <form onSubmit={hookForm.handleSubmit(onSubmit)}>
          <Tabs.Root
            value={currentTab}
            onValueChange={(value) => setCurrentTab(value as 'profile' | 'account')}
          >
            <Tabs.List className="border-ocean-200/50 mb-4 flex border-b-2">
              <Tabs.Trigger
                value="profile"
                className="border-ocean-100 text-ocean-300 px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-50 data-[state=active]:border-b-2 data-[state=active]:font-bold"
              >
                {t_profile('profile-tab-label')}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="account"
                className="border-ocean-100 text-ocean-300 px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:border-b-2 data-[state=active]:font-bold"
              >
                {t_profile('account-tab-label')}
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="profile">
              <TypographyH5 className="mt-2">{t_profile('profile-tab')}</TypographyH5>
              <div className="border-ocean-200/50 shadow-center-sm bg-pale-ocean mb-2 flex-col items-start rounded-xl border-2 p-3 text-left">
                <FormField
                  control={hookForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="w-fit">
                      <FormLabel className="font-bold">{t_profile('name')}</FormLabel>
                      <FormDescription className="text-sm opacity-70">
                        {t_profile('name-description')}
                      </FormDescription>
                      <FormControl className="mb-5 flex w-max">
                        <Input
                          className="w-auto"
                          placeholder={t_profile('name')}
                          disabled={loading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="bg-ocean-200/15 mx-auto my-3 h-1 w-full rounded" />
                <FormField
                  control={hookForm.control}
                  name="newsletter"
                  render={(_) => (
                    <FormItem className="w-fit">
                      <FormLabel className="font-bold">{t_profile('newsletter')}</FormLabel>
                      <FormDescription className="text-sm opacity-70">
                        {t_profile('newsletter-description')}
                      </FormDescription>
                      <FormControl className="mb-5 flex w-max">
                        <StyledSelector
                          types={['Enabled', 'Disabled'] as const}
                          value={hookForm.getValues('newsletter') ? 'Enabled' : 'Disabled'}
                          setValue={(value) => hookForm.setValue('newsletter', value === 'Enabled')}
                        />
                      </FormControl>
                      <FormMessage />
                      <FormDescription className="opacity-70">
                        {t_profile('newsletter-description-alert')}
                      </FormDescription>
                    </FormItem>
                  )}
                />
                <div className="bg-ocean-200/15 mx-auto my-3 h-1 w-full rounded" />
                <FormField
                  control={hookForm.control}
                  name="language"
                  render={(_) => (
                    <FormItem className="w-fit">
                      <FormLabel className="font-bold">{t_profile('language')}</FormLabel>
                      <FormDescription className="text-sm opacity-70">
                        {t_profile('language-description')}
                      </FormDescription>
                      <FormControl className="mb-5 flex w-max">
                        <StyledSelector
                          types={['UR', 'EN'] as const}
                          value={hookForm.getValues('language')}
                          setValue={(value) => hookForm.setValue('language', value as Language)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="my-5 flex w-full justify-between gap-2">
                <Button
                  type="submit"
                  disabled={
                    loading ||
                    (name === props.name &&
                      newsletter === props.newsletter &&
                      language === initialLanguage)
                  }
                >
                  {loading ? (
                    <LoaderIcon size={16} className="animate-spin" />
                  ) : (
                    <SaveIcon size={16} />
                  )}
                  <span className="font-bold">
                    {loading ? t_common('saving') : t_common('save')}
                  </span>
                </Button>
                <LogoutAccount
                  trigger={
                    <Button className="bg-ocean-400 hover:bg-ocean-300">
                      <LogOut size={16} />
                      <span className="font-bold">{t_profile('account-logout')}</span>
                    </Button>
                  }
                />
              </div>
            </Tabs.Content>
            <Tabs.Content value="account">
              <TypographyH5 className="mt-2">{t_profile('account-tab')}</TypographyH5>
              <div className="border-ocean-200/50 shadow-center-sm bg-pale-ocean mb-2 flex flex-col items-start rounded-xl border-2 p-3 text-left">
                <FormField
                  name="email"
                  render={({ field }) => (
                    <FormItem className="w-fit">
                      <FormLabel className="font-bold">{t_profile('email')}</FormLabel>
                      <FormDescription className="text-sm opacity-70">
                        {t_profile('email-description')}
                      </FormDescription>
                      <FormControl>
                        <Input
                          placeholder={t_profile('email')}
                          {...field}
                          disabled
                          className="w-auto"
                        />
                      </FormControl>
                      <FormDescription className="text-xs opacity-70">
                        <span>{t_profile('email-hint')}</span>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="my-5 flex w-full justify-end">
                <DeleteAccount
                  email={props.email!}
                  trigger={
                    <Button className="bg-ocean-400 hover:bg-ocean-300">
                      {t_profile('account-delete')}
                    </Button>
                  }
                />
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </form>
      </Form>
    </div>
  )
}
