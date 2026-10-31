import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { getLastActiveTree } from '@/server/queries'

import { Icon } from './icon'

export async function LastActive() {
  const t = await getTranslations('home')

  const data = await getLastActiveTree()
  if (!data) return null

  const { tree } = data

  return (
    <Link href={`/trees/${tree.slug}`} className="group block">
      <div className="text-pale-ocean bg-ocean-200 hover:bg-ocean-300 flex items-center gap-4 rounded-xl p-4 transition-colors duration-200">
        <div className="bg-pale-ocean flex h-12 w-12 shrink-0 items-center justify-center rounded-full">
          <Icon type="human" size={22} className="stroke-ocean-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-pale-ocean text-xs font-semibold tracking-wide uppercase">
            {t('continue')}
          </div>
          <div className="truncate text-base font-extrabold">{tree.name}</div>
        </div>
        <ArrowRight
          size={18}
          className="text-pale-ocean transition-transform duration-200 group-hover:translate-x-1"
        />
      </div>
    </Link>
  )
}
