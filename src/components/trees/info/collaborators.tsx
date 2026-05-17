import Link from 'next/link'
import { UserCheck, ArrowRight } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'

import { auth } from '@/auth'

import { TreeInfo } from '@/types'

import { Section } from './section'

interface CollaboratorsProps {
  info: TreeInfo
}

/** First + last initial from a full name  */
function getInitials(name: string | null, email: string | null): string {
  const base = name?.trim() || email?.split('@')[0] || ''
  if (!base) return '?'
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

export async function TreeInfoCollaborators({ info }: CollaboratorsProps) {
  const t = await getTranslations('tree-info')
  const locale = await getLocale()
  const session = await auth()

  const currentUserAccess = info.collaborators.list.find((c) => c.id === session?.user?.id)
  const canManage = currentUserAccess?.role === 'ADMIN'

  const formatDate = (d: Date) =>
    d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <Section title={t('collaborators-title')} icon={UserCheck}>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-80">
        <span>{t('collaborators-admins', { count: info.collaborators.byRole.ADMIN })}</span>
        <span>{t('collaborators-editors', { count: info.collaborators.byRole.EDITOR })}</span>
        <span>{t('collaborators-viewers', { count: info.collaborators.byRole.VIEWER })}</span>
      </div>
      <div className="no-scrollbar -mx-2 flex gap-3 overflow-x-auto px-2 py-2">
        {info.collaborators.list.map((c) => (
          <div
            key={c.id}
            className="bg-pale-ocean shadow-center-sm border-ocean-200/20 flex w-44 shrink-0 flex-col items-center gap-2 rounded-xl border-2 p-3 text-center"
          >
            {c.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.image}
                alt={c.name ?? c.email ?? ''}
                referrerPolicy="no-referrer"
                className="border-ocean-200/40 h-12 w-12 shrink-0 rounded-full border-2 object-cover"
              />
            ) : (
              <div className="bg-ocean-200 border-ocean-200/40 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold text-neutral-50">
                {getInitials(c.name, c.email)}
              </div>
            )}
            <div className="flex w-full flex-col gap-0.5">
              <p className="truncate text-sm font-bold">{c.name || c.email || '-'}</p>
              <p className="text-xs font-medium opacity-80">
                {t(`collaborators-role-${c.role.toLowerCase()}`)}
              </p>
              <p className="text-xs opacity-60">
                {t('collaborators-joined')} {formatDate(c.joinedAt)}
              </p>
            </div>
          </div>
        ))}
      </div>
      {canManage && (
        <div className="mt-3 flex justify-end">
          <Link
            href={`/trees/settings/${info.tree.slug}`}
            className="text-ocean-400 hover:bg-ocean-200/15 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors"
          >
            {t('collaborators-manage')}
            <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </Section>
  )
}
