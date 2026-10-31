import { Users } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { TreeInfo } from '@/types'

import { Section } from './section'
import { StackedBar } from './bar'

interface DemographicsProps {
  info: TreeInfo
}

export async function TreeInfoDemographics({ info }: DemographicsProps) {
  const t = await getTranslations('tree-info')
  const t_trees = await getTranslations('trees')
  const demo = info.demographics

  if (info.overview.totalMembers === 0) {
    return (
      <Section title={t('demographics-title')} icon={Users}>
        <p className="text-sm italic opacity-70">{t('empty-no-members')}</p>
      </Section>
    )
  }

  const genderSegments = [
    {
      label: t_trees('node-gender-male'),
      value: demo.genderBreakdown.MALE,
      color: 'bg-ocean-300',
    },
    {
      label: t_trees('node-gender-female'),
      value: demo.genderBreakdown.FEMALE,
      color: 'bg-ocean-400',
    },
    {
      label: t_trees('node-gender-other'),
      value: demo.genderBreakdown.OTHER,
      color: 'bg-ocean-200',
    },
    {
      label: t_trees('node-gender-unspecified'),
      value: demo.genderBreakdown.UNSPECIFIED,
      color: 'bg-ocean-100',
    },
  ]

  const livingSegments = [
    {
      label: t('demographics-living'),
      value: demo.livingCount,
      color: 'bg-ocean-300',
    },
    {
      label: t('demographics-deceased'),
      value: demo.deceasedCount,
      color: 'bg-ocean-100',
    },
  ]

  return (
    <Section title={t('demographics-title')} icon={Users}>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium opacity-70">{t('demographics-gender')}</p>
          <StackedBar segments={genderSegments} />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium opacity-70">{t('demographics-status')}</p>
          <StackedBar segments={livingSegments} />
        </div>
        {(demo.avgAgeLiving !== null || demo.avgAgeAtDeath !== null) && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            {demo.avgAgeLiving !== null && (
              <span>
                {t('demographics-avg-living-inline', {
                  years: Math.round(demo.avgAgeLiving),
                })}
              </span>
            )}
            {demo.avgAgeLiving !== null && demo.avgAgeAtDeath !== null && (
              <span className="opacity-40">·</span>
            )}
            {demo.avgAgeAtDeath !== null && (
              <span>
                {t('demographics-avg-death-inline', {
                  years: Math.round(demo.avgAgeAtDeath),
                })}
              </span>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}
