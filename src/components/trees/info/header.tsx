import { Users, GitBranch, Camera, UserCheck } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'

import { TreeInfo } from '@/types'

import { TypographyH4 } from '@/ui'

import { StatCard } from './stat-card'

interface HeaderProps {
  info: TreeInfo
}

export async function TreeInfoHeader({ info }: HeaderProps) {
  const t = await getTranslations('tree-info')
  const t_enums = await getTranslations('enums')
  const locale = await getLocale()

  const createdLabel = info.tree.createdAt.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const lastActivityLabel = info.tree.lastActivityAt
    ? info.tree.lastActivityAt.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <div className="text-ocean-400 w-full">
      <div className="mb-4 flex flex-col gap-1">
        <TypographyH4>{info.tree.name}</TypographyH4>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-70">
          <span>{t_enums('human')}</span>
          {info.tree.deletionRequest && (
            <>
              <span>·</span>
              <span className="font-bold">{t('pending-deletion')}</span>
            </>
          )}
          <span>·</span>
          <span>
            {t('header-created')} {createdLabel}
          </span>
          {lastActivityLabel && (
            <>
              <span>·</span>
              <span>
                {t('header-last-activity')} {lastActivityLabel}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Users} label={t('overview-members')} value={info.overview.totalMembers} />
        <StatCard
          icon={GitBranch}
          label={t('overview-generations')}
          value={info.generations.depth}
        />
        <StatCard icon={Camera} label={t('overview-photos')} value={info.overview.totalPictures} />
        <StatCard
          icon={UserCheck}
          label={t('overview-collaborators')}
          value={info.overview.totalCollaborators}
        />
      </div>
    </div>
  )
}
