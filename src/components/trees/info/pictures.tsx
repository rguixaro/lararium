import { Camera } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { TreeInfo } from '@/types'

import { Section } from './section'
import { StatCard } from './stat-card'
import { MemberCard } from './member-card'

interface PicturesProps {
  info: TreeInfo
}

export async function TreeInfoPictures({ info }: PicturesProps) {
  const t = await getTranslations('tree-info')
  const p = info.pictures
  const totalMembers = info.overview.totalMembers

  if (p.total === 0) {
    return (
      <Section title={t('pictures-title')} icon={Camera}>
        <p className="text-sm italic opacity-70">{t('empty-no-pictures')}</p>
      </Section>
    )
  }

  const membersPhotographed = Math.max(0, totalMembers - p.untaggedPeople)
  const avgPerMember = membersPhotographed > 0 ? (p.total / membersPhotographed).toFixed(1) : '-'

  return (
    <Section title={t('pictures-title')} icon={Camera}>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t('pictures-total')} value={p.total} />
        <StatCard label={t('pictures-members-photographed')} value={membersPhotographed} />
        <StatCard label={t('pictures-untagged-members')} value={p.untaggedPeople} />
        <StatCard label={t('pictures-avg-per-member')} value={avgPerMember} />
      </div>
      {p.mostPhotographed.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium opacity-70">{t('pictures-most-photographed')}</p>
          <div className="no-scrollbar -mx-2 flex gap-3 overflow-x-auto px-2 py-2">
            {p.mostPhotographed.map((m) => (
              <MemberCard
                key={m.id}
                picture={m.picture}
                name={m.name}
                primary={t('pictures-count', { count: m.photoCount })}
              />
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}
