import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

const booleanString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true')

/**
 * Environment variables schema
 */
export const env = createEnv({
  server: {
    /// Environment
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    IMAGES_ENABLED: booleanString,
    EMAILS_ENABLED: booleanString,

    /// Database
    DATABASE_URL: z.string(),

    /// Auth
    AUTH_SECRET: z.string(),
    AUTH_URL: z.string().url().optional(),
    AUTH_TRUST_HOST: z.string().optional(),

    /// Cookies
    COOKIES_DOMAIN: z.string().optional(),

    /// Google OAuth
    GOOGLE_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),

    /// Sentry
    SENTRY_ORG: z.string().optional(),

    /// AWS
    AMAZON_REGION: z.string().optional(),
    AMAZON_S3_BUCKET_NAME: z.string().optional(),
    AMAZON_CLOUDFRONT_KEY_PAIR_ID: z.string().optional(),
    AMAZON_CLOUDFRONT_PRIVATE_KEY_SECRET_NAME: z.string().optional(),
    AMAZON_SES_FROM_EMAIL: z.string().email().optional(),

    /// Cron
    CRON_SECRET: z.string().min(32).optional(),
  },
  client: {
    NEXT_PUBLIC_IMAGES_ENABLED: booleanString,
    NEXT_PUBLIC_CLOUDFRONT_ASSETS_DOMAIN: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
    NEXT_PUBLIC_UR_HOST: z.string().optional(),
    NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(['en', 'ur']).optional(),
  },
  runtimeEnv: {
    /// Environment
    NODE_ENV: process.env.NODE_ENV,
    IMAGES_ENABLED: process.env.IMAGES_ENABLED,
    EMAILS_ENABLED: process.env.EMAILS_ENABLED,

    /// Database
    DATABASE_URL: process.env.DATABASE_URL,

    /// Auth
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: process.env.AUTH_URL,
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,

    /// Cookies
    COOKIES_DOMAIN: process.env.COOKIES_DOMAIN,

    /// Google OAuth
    GOOGLE_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,

    /// Sentry
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    SENTRY_ORG: process.env.SENTRY_ORG,

    /// AWS
    AMAZON_REGION: process.env.AMAZON_REGION,
    AMAZON_S3_BUCKET_NAME: process.env.AMAZON_S3_BUCKET_NAME,
    AMAZON_CLOUDFRONT_KEY_PAIR_ID: process.env.AMAZON_CLOUDFRONT_KEY_PAIR_ID,
    AMAZON_CLOUDFRONT_PRIVATE_KEY_SECRET_NAME:
      process.env.AMAZON_CLOUDFRONT_PRIVATE_KEY_SECRET_NAME,
    AMAZON_SES_FROM_EMAIL: process.env.AMAZON_SES_FROM_EMAIL,

    /// Cron
    CRON_SECRET: process.env.CRON_SECRET,

    /// Public
    NEXT_PUBLIC_IMAGES_ENABLED: process.env.NEXT_PUBLIC_IMAGES_ENABLED,
    NEXT_PUBLIC_CLOUDFRONT_ASSETS_DOMAIN: process.env.NEXT_PUBLIC_CLOUDFRONT_ASSETS_DOMAIN,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_UR_HOST: process.env.NEXT_PUBLIC_UR_HOST,
    NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
})

if (!process.env.SKIP_ENV_VALIDATION) {
  const missingImageVars = [
    ['AMAZON_REGION', env.AMAZON_REGION],
    ['AMAZON_S3_BUCKET_NAME', env.AMAZON_S3_BUCKET_NAME],
    ['AMAZON_CLOUDFRONT_KEY_PAIR_ID', env.AMAZON_CLOUDFRONT_KEY_PAIR_ID],
    [
      'AMAZON_CLOUDFRONT_PRIVATE_KEY_SECRET_NAME',
      env.AMAZON_CLOUDFRONT_PRIVATE_KEY_SECRET_NAME,
    ],
    ['NEXT_PUBLIC_CLOUDFRONT_ASSETS_DOMAIN', env.NEXT_PUBLIC_CLOUDFRONT_ASSETS_DOMAIN],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (env.IMAGES_ENABLED && missingImageVars.length > 0) {
    throw new Error(
      `Image support is enabled, but these environment variables are missing: ${missingImageVars.join(', ')}`
    )
  }

  const missingEmailVars = [
    ['AMAZON_REGION', env.AMAZON_REGION],
    ['AMAZON_SES_FROM_EMAIL', env.AMAZON_SES_FROM_EMAIL],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (env.EMAILS_ENABLED && missingEmailVars.length > 0) {
    throw new Error(
      `Email support is enabled, but these environment variables are missing: ${missingEmailVars.join(', ')}`
    )
  }

  if (env.NEXT_PUBLIC_IMAGES_ENABLED && !env.IMAGES_ENABLED) {
    throw new Error('NEXT_PUBLIC_IMAGES_ENABLED cannot be true when IMAGES_ENABLED is false')
  }
}
