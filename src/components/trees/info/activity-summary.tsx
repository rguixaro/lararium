import Link from 'next/link'
import { Activity, ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { TreeInfo } from '@/types'

import { Section } from './section'
import { StatCard } from './stat-card'
import { Bar } from './bar'
import { MemberRow } from './member-row'

interface ActivitySummaryProps {
  info: TreeInfo
}

export async function TreeInfoActivitySummary({ info }: ActivitySummaryProps) {
  const t = await getTranslations('tree-info')
  const t_log = await getTranslations('log_activities')
  const a = info.activity

  if (a.totalLogs === 0) {
    return (
      <Section title={t('activity-title')} icon={Activity}>
        <p className="text-sm italic opacity-70">{t('activity-no-activity')}</p>
      </Section>
    )
  }

  const maxActionCount = Math.max(1, ...Object.values(a.actionBreakdown).map((v) => v))
  const populatedActions = Object.entries(a.actionBreakdown)
    .filter(([, count]) => count > 0)
    .sort((x, y) => y[1] - x[1])

  const maxContribCount = Math.max(1, ...a.topContributors.map((c) => c.count))

  return (
    <Section title={t('activity-title')} icon={Activity}>
      <div className="mb-4">
        <StatCard label={t('activity-total')} value={a.totalLogs} />
      </div>
      {a.topContributors.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium opacity-70">{t('activity-top-contributors')}</p>
          <div className="space-y-1">
            {a.topContributors.map((c) => (
              <MemberRow
                key={c.userId}
                picture={c.image}
                name={c.name || '-'}
                primaryText={t('activity-contribution-count', { count: c.count })}
                trailing={
                  <div className="w-24">
                    <Bar label="" value={c.count} total={maxContribCount} valueLabel=" " />
                  </div>
                }
              />
            ))}
          </div>
        </div>
      )}
      {populatedActions.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium opacity-70">{t('activity-action-breakdown')}</p>
          <div className="space-y-2">
            {populatedActions.map(([action, count]) => (
              <Bar
                key={action}
                label={t_log(action)}
                value={count}
                total={maxActionCount}
                valueLabel={String(count)}
              />
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Link
          href={`/trees/logs/${info.tree.slug}`}
          className="text-ocean-400 hover:bg-ocean-200/15 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors"
        >
          {t('activity-view-log')}
          <ArrowRight size={14} />
        </Link>
      </div>
    </Section>
  )
}
