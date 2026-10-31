import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect } from 'vitest'

import { ActivityAction } from '@/types/activity.type'

const LOCALES = ['en', 'ur'] as const
const messagesDir = join(__dirname, '../../messages')

const loadLocale = (locale: string): Record<string, any> =>
  JSON.parse(readFileSync(join(messagesDir, `${locale}.json`), 'utf8'))

const messages = Object.fromEntries(LOCALES.map((l) => [l, loadLocale(l)])) as Record<
  (typeof LOCALES)[number],
  Record<string, any>
>

const collectLeafPaths = (obj: any, prefix = ''): string[] => {
  if (obj === null || typeof obj !== 'object') return [prefix]
  return Object.entries(obj).flatMap(([k, v]) =>
    collectLeafPaths(v, prefix ? `${prefix}.${k}` : k)
  )
}

describe('i18n completeness', () => {
  describe.each(LOCALES)('%s', (locale) => {
    it.each(ActivityAction)(
      'has a `log_activities.%s` translation',
      (action) => {
        expect(messages[locale].log_activities?.[action]).toBeTypeOf('string')
        expect(messages[locale].log_activities[action]).not.toBe('')
      }
    )
  })

  it('all locales share the same set of translation keys', () => {
    const keysByLocale = Object.fromEntries(
      LOCALES.map((l) => [l, new Set(collectLeafPaths(messages[l]))])
    )

    const reference = keysByLocale.en
    const drift: Record<string, { missing: string[]; extra: string[] }> = {}

    for (const locale of LOCALES) {
      if (locale === 'en') continue
      const current = keysByLocale[locale]
      const missing = [...reference].filter((k) => !current.has(k))
      const extra = [...current].filter((k) => !reference.has(k))
      if (missing.length || extra.length) drift[locale] = { missing, extra }
    }

    expect(drift, `Translation key drift between locales:\n${JSON.stringify(drift, null, 2)}`).toEqual({})
  })
})
