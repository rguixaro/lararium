'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { motion, Variants } from 'framer-motion'

import { TreeSchema } from '@/server/schemas'

import { cn } from '@/utils'

import { Icon } from '../icon'

export type TreeFeedItem = TreeSchema & { memberCount?: number; pendingDeletion?: boolean }

export function ItemTree({ tree, index }: { tree: TreeFeedItem; index: number }) {
  const t_trees = useTranslations('trees')
  const t_enums = useTranslations('enums')

  const motions: Variants = {
    hidden: { opacity: 0, y: 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.35, delay: index * 0.04 },
    },
  }

  return (
    <motion.div initial="hidden" animate="visible" variants={motions}>
      <Link
        href={`/trees/${tree.slug}`}
        className="text-ocean-400 group bg-pale-ocean flex items-center gap-4 px-4 py-4"
      >
        <div className="bg-ocean-100/60 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
          <Icon type="human" size={18} className="stroke-ocean-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-extrabold">{tree.name}</div>
          <div className="flex items-center gap-2 text-xs opacity-70">
            <span>{t_enums('human')}</span>
            {typeof tree.memberCount === 'number' && (
              <>
                <span>·</span>
                <span>{t_trees('tree-member-count', { count: tree.memberCount })}</span>
              </>
            )}
            {tree.pendingDeletion && (
              <>
                <span>·</span>
                <span className="font-bold">{t_trees('tree-pending-deletion')}</span>
              </>
            )}
          </div>
        </div>
        <ChevronRight
          size={18}
          className={cn(
            'text-ocean-300 opacity-50',
            'transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100'
          )}
        />
      </Link>
    </motion.div>
  )
}
