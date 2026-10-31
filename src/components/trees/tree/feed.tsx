import Link from 'next/link'
import { Plus, Sprout } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { getTrees } from '@/server/queries'

import { ItemTree } from '@/components/trees'
import { Section } from '../info/section'
import type { TreeFeedItem } from './item'

import { cn } from '@/utils'

export const TreesFeed = async () => {
  const t_common = await getTranslations('common')
  const t_trees = await getTranslations('trees')
  const t_home = await getTranslations('home')

  const raw = (await getTrees())?.trees ?? []
  const trees: TreeFeedItem[] = raw.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    memberCount: (t as any)._count?.nodes ?? 0,
    pendingDeletion: !!t.deletionRequest,
  }))

  if (trees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center sm:py-16">
        <div className="bg-ocean-100/60 mb-5 rounded-full p-5">
          <Sprout size={40} className="stroke-ocean-300" />
        </div>
        <h2 className="text-ocean-400 mb-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
          {t_home('empty-title')}
        </h2>
        <p className="text-ocean-300 mb-6 max-w-sm text-sm">{t_home('empty-description')}</p>
        <Link
          href="/trees/new"
          className={cn(
            'bg-ocean-200 hover:bg-ocean-300 shadow-center-sm group text-neutral-50',
            'flex items-center gap-2 rounded-xl px-6 py-3',
            'text-sm font-bold transition-colors duration-200'
          )}
        >
          <Plus size={18} className="transition-transform duration-200 group-hover:rotate-90" />
          {t_trees('tree-create')}
        </Link>
      </div>
    )
  }

  return (
    <Section title={t_common('trees')} description={t_common('trees-description')}>
      <div className="border-ocean-200/20 divide-ocean-100/60 divide-y overflow-hidden rounded-xl border-2">
        {trees.map((tree, i) => (
          <ItemTree key={tree.id} tree={tree} index={i} />
        ))}
      </div>
      <Link
        href="/trees/new"
        className={cn(
          'bg-ocean-200 hover:bg-ocean-300 shadow-center-sm group text-neutral-50',
          'mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3',
          'text-sm font-bold transition-colors duration-200'
        )}
      >
        <Plus size={18} className="transition-transform duration-200 group-hover:rotate-90" />
        {t_trees('tree-create')}
      </Link>
    </Section>
  )
}
