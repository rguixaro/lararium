import { Link2 } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { TreeInfo } from '@/types'

import { Section } from './section'
import { StatCard } from './stat-card'
import { MemberCard } from './member-card'

interface RelationshipsProps {
  info: TreeInfo
}

export async function TreeInfoRelationships({ info }: RelationshipsProps) {
  const t = await getTranslations('tree-info')
  const r = info.relationships
  const childrenCountKey = 'relationships-children-count' as const
  const mostChildrenKey = 'relationships-most-children' as const
  const avgChildrenKey = 'relationships-avg-children' as const

  if (info.overview.totalEdges === 0 && r.isolatedNodes === info.overview.totalMembers) {
    return (
      <Section title={t('relationships-title')} icon={Link2}>
        <p className="text-sm italic opacity-70">{t('empty-no-relationships')}</p>
      </Section>
    )
  }

  return (
    <Section title={t('relationships-title')} icon={Link2}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t('relationships-parent-child')} value={r.parentChildPairs} />
        <StatCard label={t('relationships-spouses')} value={r.spousePairs} />
        <StatCard label={t('relationships-couples')} value={r.couplePairs} />
        <StatCard label={t('relationships-isolated')} value={r.isolatedNodes} />
      </div>
      {r.topFamilies.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium opacity-70">{t(mostChildrenKey)}</p>
          <div className="no-scrollbar -mx-2 flex gap-3 overflow-x-auto px-2 py-2">
            {r.topFamilies.map((m) => (
              <MemberCard
                key={m.id}
                picture={m.picture}
                name={m.name}
                primary={t(childrenCountKey, { count: m.childrenCount })}
              />
            ))}
          </div>
        </div>
      )}
      {r.avgChildrenPerParent !== null && (
        <p className="mt-2 text-xs opacity-70">
          {t(avgChildrenKey, { count: r.avgChildrenPerParent.toFixed(1) })}
        </p>
      )}
    </Section>
  )
}
