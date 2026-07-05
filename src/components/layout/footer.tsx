'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { usePathname } from 'next/navigation'

import { useTranslations } from 'next-intl'

export const Footer = () => {
  const t_common = useTranslations('common')
  const pathname = usePathname()

  const showHeader = pathname == '/'
  if (!showHeader) return null

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 1 }}
        className="bg-pale-ocean text-ocean-300 bottom-0 px-6 py-4 text-center"
      >
        <div className="flex w-full items-center justify-center">
          <p className="text-sm md:text-base">
            <b className="text-ocean-400">{t_common('app-name').toLowerCase()}</b>{' '}
            {t_common('app-status')} <b className="text-ocean-400">{t_common('app-beta')}</b>.{' '}
            {`${t_common('app-issues')} `}
            <Link
              href="https://github.com/rguixaro/lararium/issues/new/choose"
              className="text-ocean-400 font-semibold underline decoration-dotted underline-offset-4"
            >
              {t_common('app-ticket')}
            </Link>{' '}
            {t_common('app-source')}.
          </p>
        </div>
      </motion.div>
    </>
  )
}
