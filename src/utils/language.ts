import { Language } from '@prisma/client'

/**
 * Supported locale codes
 */
export type Locale = 'ur' | 'en'

/**
 * Map Language enum to locale codes
 */
export const LANGUAGE_TO_LOCALE: Record<Language, Locale> = {
  UR: 'ur',
  EN: 'en',
} as const

/**
 * Map locale codes to Language enum
 */
export const LOCALE_TO_LANGUAGE: Record<Locale, Language> = {
  ur: 'UR',
  en: 'EN',
} as const

/**
 * Convert Language enum to locale code
 */
export const languageToLocale = (language: Language): Locale => LANGUAGE_TO_LOCALE[language]

/**
 * Convert locale code to Language enum
 */
export const localeToLanguage = (locale: Locale): Language => LOCALE_TO_LANGUAGE[locale]
