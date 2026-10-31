import { describe, expect, it } from 'vitest'

import { formatGreetingDate } from './greeting'

describe('formatGreetingDate', () => {
  it('capitalizes only the first character of the localized date', () => {
    const date = new Date(2026, 3, 26, 12)

    expect(formatGreetingDate(date, 'en')).toBe('Sunday, April 26')
    expect(formatGreetingDate(date, 'ur')).toBe('اتوار، 26 اپریل')
  })
})
