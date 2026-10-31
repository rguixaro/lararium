import { headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import Negotiator from 'negotiator'

import { auth } from '@/auth'

import { getUserById } from '@/server/utils'

import { languageToLocale } from '@/utils/language'

export default getRequestConfig(async () => {
  const defaultHeaders = await headers()
  const headersObj = Object.fromEntries(defaultHeaders.entries())

  const host = headersObj['host'] || process.env.NEXT_PUBLIC_UR_HOST || 'kinship.vercel.com'
  const FORCE_UR_DOMAIN = process.env.NEXT_PUBLIC_UR_HOST || 'kinship.vercel.com'

  const locales = ['ur', 'en']
  const defaultLocale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE === 'en' ? 'en' : 'ur'

  let locale: string

  const session = await auth()
  if (session?.user?.id) {
    const user = await getUserById(session.user.id)
    if (user?.language) {
      locale = languageToLocale(user.language)
    } else if (host === FORCE_UR_DOMAIN) {
      locale = 'ur'
    } else {
      const negotiator = new Negotiator({ headers: headersObj })
      locale = negotiator.language(locales) || defaultLocale
    }
  } else if (host === FORCE_UR_DOMAIN) {
    locale = 'ur'
  } else {
    const negotiator = new Negotiator({ headers: headersObj })
    locale = negotiator.language(locales) || defaultLocale
  }

  const messages = (await import(`../../messages/${locale}.json`)).default

  return { locale, messages }
})
