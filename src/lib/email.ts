import { SESClient, SendEmailCommand, type SendEmailCommandInput } from '@aws-sdk/client-ses'
import * as Sentry from '@sentry/nextjs'

import { env } from '@/env.mjs'

import { ocean } from '@/styles/colors'

import type { Locale } from '@/utils/language'

import enMessages from '../../messages/en.json'
import urMessages from '../../messages/ur.json'

const { AUTH_URL } = env

let ses: SESClient | null = null

async function sendEmail(input: SendEmailCommandInput, action: string) {
  if (!env.EMAILS_ENABLED) return false

  if (!env.AMAZON_REGION || !env.AMAZON_SES_FROM_EMAIL) {
    Sentry.captureException(new Error('Email support is enabled but AWS SES is not configured'), {
      tags: { action },
    })
    return false
  }

  try {
    ses ??= new SESClient({ region: env.AMAZON_REGION })
    await ses.send(new SendEmailCommand(input))
    return true
  } catch (error) {
    Sentry.captureException(error, { tags: { action } })
    return false
  }
}

interface WelcomeEmailParams {
  recipientEmail: string
  recipientName: string
  locale?: Locale
}

interface TreeInvitationEmailParams {
  recipientEmail: string
  recipientName: string
  inviterName: string
  treeName: string
  treeSlug: string
  role: string
  locale?: Locale
}

interface TreeDeletionRequestedEmailParams {
  recipientEmail: string
  recipientName: string
  treeName: string
  treeSlug: string
  requestedByName: string
  requestedAt: Date
  availableAt: Date
  locale?: Locale
}

interface TreeDeletedEmailParams {
  recipientEmail: string
  recipientName: string
  treeName: string
  locale?: Locale
}

interface NewsletterEmailParams {
  recipientEmail: string
  recipientName: string
  treeName: string
  treeSlug: string
  recentAdditions: Array<{
    name: string
    addedDate: Date
    birthDate?: Date | null
    deathDate?: Date | null
  }>
  events: Array<{
    name: string
    eventType: 'birthday' | 'anniversary'
    date: Date
    yearsAgo?: number
  }>
  totalMembers: number
  locale?: Locale
}

/**
 * Get translations for email
 */
function getEmailTranslations(locale: Locale = 'en') {
  const messagesMap = {
    en: enMessages,
    ur: urMessages,
  } as const
  return messagesMap[locale] || messagesMap.en
}

const EMAIL_LOCALE_TAGS: Record<Locale, string> = {
  ur: 'ur-PK',
  en: 'en-US',
} as const

function formatEmailDate(date: Date, locale: Locale, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(EMAIL_LOCALE_TAGS[locale], options).format(date)
}

/**
 * Replace placeholders in translation strings
 */
function replacePlaceholders(str: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)),
    str
  )
}

function formatMemberLifeYears(member: { birthDate?: Date | null; deathDate?: Date | null }) {
  const birthYear = member.birthDate ? member.birthDate.getUTCFullYear() : null
  const deathYear = member.deathDate ? member.deathDate.getUTCFullYear() : null

  if (birthYear && deathYear) return `${birthYear} - ${deathYear}`
  if (birthYear) return `${birthYear}`
  if (deathYear) return `† ${deathYear}`
  return null
}

function formatNewsletterMemberName(member: {
  name: string
  birthDate?: Date | null
  deathDate?: Date | null
}) {
  const years = formatMemberLifeYears(member)
  return years ? `${member.name}, ${years}` : member.name
}

/**
 * Sends a welcome email to a new user
 * @param params {WelcomeEmailParams} - Email parameters
 * @returns Promise<boolean> - True if email was sent successfully
 */
export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<boolean> {
  const { recipientEmail, recipientName, locale = 'en' } = params

  const t = getEmailTranslations(locale)

  const appUrl = AUTH_URL

  const htmlBody = `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.emails.welcome.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="border-radius: 16px; box-shadow: 0 4px 16px rgba(2, 132, 199, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 24px; text-align: center; background-color: ${ocean[400]}; border-radius: 16px;">
              <h1 style="margin: 0 0 8px; color: ${ocean[0]}; font-size: 28px; font-weight: 700;">
                ${t.emails.welcome.title}
              </h1>
              <p style="margin: 0; color: ${ocean[50]}; font-size: 16px; font-weight: 500;">
                ${t.emails.welcome.subtitle}
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: ${ocean[400]}; font-size: 18px; line-height: 1.6; font-weight: 600;">
                ${replacePlaceholders(t.emails.welcome.greeting, { name: recipientName })}
              </p>
              
              <p style="margin: 0 0 24px; color: ${ocean[400]}; font-size: 16px; line-height: 1.7;">
                ${t.emails.welcome.intro}
              </p>
              
              <div style="background-color: ${ocean[50]}; border-left: 6px solid ${ocean[400]}; padding: 20px; margin: 32px 0; border-radius: 0px 16px 16px 0px;">
                <h3 style="margin: 0 0 12px; color: ${ocean[400]}; font-size: 18px; font-weight: 600;">
                  ${t.emails.welcome['getting-started-title']}
                </h3>
                <ul style="margin: 0; padding-left: 24px; color: ${ocean[300]}; font-size: 15px; line-height: 1.8;">
                  <li style="margin-bottom: 8px;">${t.emails.welcome['step-1']}</li>
                  <li style="margin-bottom: 8px;">${t.emails.welcome['step-2']}</li>
                  <li style="margin-bottom: 8px;">${t.emails.welcome['step-3']}</li>
                  <li>${t.emails.welcome['step-4']}</li>
                </ul>
              </div>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 32px 0;">
                    <a href="${appUrl}" style="display: inline-block; padding: 16px 40px; background-color: ${ocean[400]}; color: ${ocean[0]}; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 16px; box-shadow: 0 4px 12px rgba(56, 189, 248, 0.3);">
                      ${t.emails.welcome.cta}
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0; color: ${ocean[300]}; font-size: 14px; line-height: 1.6;">
                ${t.emails.welcome.help}
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; border-top: 2px solid ${ocean[200]};">
              <p style="margin: 0; color: ${ocean[200]}; font-size: 12px; text-align: center; line-height: 1.6;">
                ${t.emails.welcome.footer}
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Footer Text -->
        <p style="margin: 24px 0 0; color: ${ocean[100]}; font-size: 12px; text-align: center;">
          ${replacePlaceholders(t.emails.copyright, { year: new Date().getFullYear() })}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  const textBody = `
${t.emails.welcome.title}

${replacePlaceholders(t.emails.welcome.greeting, { name: recipientName })}

${t.emails.welcome.intro}

${t.emails.welcome['getting-started-title']}:
• ${t.emails.welcome['step-1']}
• ${t.emails.welcome['step-2']}
• ${t.emails.welcome['step-3']}
• ${t.emails.welcome['step-4']}

${t.emails.welcome.cta}: ${appUrl}

${t.emails.welcome.help}

---
${t.emails.welcome.footer}

${replacePlaceholders(t.emails.copyright, { year: new Date().getFullYear() })}
  `.trim()

  return sendEmail(
    {
      Source: `Kinship <${env.AMAZON_SES_FROM_EMAIL}>`,
      Destination: { ToAddresses: [recipientEmail] },
      Message: {
        Subject: {
          Data: replacePlaceholders(t.emails.welcome.subject, { name: recipientName }),
          Charset: 'UTF-8',
        },
        Body: {
          Html: { Data: htmlBody, Charset: 'UTF-8' },
          Text: { Data: textBody, Charset: 'UTF-8' },
        },
      },
    },
    'sendWelcomeEmail'
  )
}

/**
 * Sends a tree invitation email using AWS SES
 * @param params {TreeInvitationEmailParams} - Email parameters
 * @returns Promise<boolean> - True if email was sent successfully
 */
export async function sendTreeInvitationEmail(params: TreeInvitationEmailParams): Promise<boolean> {
  const {
    recipientEmail,
    recipientName,
    inviterName,
    treeName,
    treeSlug,
    role,
    locale = 'en',
  } = params

  const t = getEmailTranslations(locale)

  const appUrl = AUTH_URL
  const treeUrl = `${appUrl}/trees/${treeSlug}`

  const roleTranslations: Record<string, string> = {
    ADMIN: t.emails.invitation['role-admin'],
    EDITOR: t.emails.invitation['role-editor'],
    VIEWER: t.emails.invitation['role-viewer'],
  }
  const roleDescription = roleTranslations[role] || role
  const permissionDescription =
    role === 'VIEWER'
      ? t.emails.invitation['permission-viewer']
      : role === 'ADMIN'
        ? t.emails.invitation['permission-admin']
        : t.emails.invitation['permission-editor']

  const htmlBody = `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.emails.invitation.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="border-radius: 16px; box-shadow: 0 4px 16px rgba(2, 132, 199, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 24px; text-align: center; background-color: ${ocean[400]}; border-radius: 16px;">
              <h1 style="margin: 0 0 8px; color: ${ocean[0]}; font-size: 28px; font-weight: 700;">${t.emails.invitation.title}</h1>
              <p style="margin: 0; color: ${ocean[50]}; font-size: 16px; font-weight: 500;">
                ${t.emails.invitation.subtitle}
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; color: ${ocean[400]}; font-size: 16px; line-height: 1.6;">
                ${replacePlaceholders(t.emails.invitation.greeting, { name: recipientName })}
              </p>

              <p style="margin: 0 0 24px; color: ${ocean[400]}; font-size: 16px; line-height: 1.6;">
                <strong>${inviterName}</strong>${t.emails.invitation.intro} <strong>${treeName}</strong>${t.emails.invitation.as} <strong>${roleDescription}</strong>.
              </p>
              
              <p style="margin: 0 0 32px; color: ${ocean[300]}; font-size: 14px; line-height: 1.6;">
${t.emails.invitation['permission-base-1']}${permissionDescription}${t.emails.invitation['permission-base-2']}
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 0 0 32px;">
                    <a href="${treeUrl}" style="display: inline-block; padding: 16px 40px; background-color: ${ocean[400]}; color: ${ocean[0]}; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 16px; box-shadow: 0 4px 12px rgba(56, 189, 248, 0.3);">
                      ${t.emails.invitation.cta}
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 8px; color: ${ocean[300]}; font-size: 14px; line-height: 1.5;">
                ${t.emails.invitation.link}
              </p>
              <p style="margin: 0; color: ${ocean[400]}; font-size: 14px; word-break: break-all;">
                ${treeUrl}
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; border-top: 2px solid ${ocean[200]};">
              <p style="margin: 0; color: ${ocean[200]}; font-size: 12px; text-align: center; line-height: 1.6;">
                ${t.emails.invitation.footer}
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Footer Text -->
        <p style="margin: 24px 0 0; color: ${ocean[100]}; font-size: 12px; text-align: center;">
          ${replacePlaceholders(t.emails.copyright, { year: new Date().getFullYear() })}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  const textBody = `
${replacePlaceholders(t.emails.invitation.greeting, { name: recipientName })}

${inviterName}${t.emails.invitation.intro} ${treeName}${t.emails.invitation.as} ${roleDescription}.

${t.emails.invitation['permission-base-1']}${permissionDescription}${t.emails.invitation['permission-base-2']}

${t.emails.invitation.cta}: ${treeUrl}

${t.emails.invitation.link}
${treeUrl}

---
${replacePlaceholders(t.emails.invitation.footer, { inviter: inviterName })}

${replacePlaceholders(t.emails.copyright, { year: new Date().getFullYear() })}
  `.trim()

  return sendEmail(
    {
      Source: `Kinship <${env.AMAZON_SES_FROM_EMAIL}>`,
      Destination: { ToAddresses: [recipientEmail] },
      Message: {
        Subject: {
          Data: replacePlaceholders(t.emails.invitation.subject, {
            inviter: inviterName,
            tree: treeName,
          }),
          Charset: 'UTF-8',
        },
        Body: {
          Html: { Data: htmlBody, Charset: 'UTF-8' },
          Text: { Data: textBody, Charset: 'UTF-8' },
        },
      },
    },
    'sendTreeInvitationEmail'
  )
}

export async function sendTreeDeletionRequestedEmail(
  params: TreeDeletionRequestedEmailParams
): Promise<boolean> {
  const {
    recipientEmail,
    recipientName,
    treeName,
    treeSlug,
    requestedByName,
    requestedAt,
    availableAt,
    locale = 'en',
  } = params
  const t = getEmailTranslations(locale)
  const settingsUrl = `${AUTH_URL}/trees/settings/${treeSlug}`

  const requestedAtLabel = formatEmailDate(requestedAt, locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const availableAtLabel = formatEmailDate(availableAt, locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const htmlBody = `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.emails['tree-deletion-requested'].title} - ${treeName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="border-radius: 16px; box-shadow: 0 4px 16px rgba(2, 132, 199, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 24px; text-align: center; background-color: ${ocean[400]}; border-radius: 16px;">
              <h1 style="margin: 0 0 8px; color: ${ocean[0]}; font-size: 28px; font-weight: 700;">
                ${treeName}
              </h1>
              <p style="margin: 0; color: ${ocean[50]}; font-size: 16px; font-weight: 500;">
                ${t.emails['tree-deletion-requested'].title}
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: ${ocean[400]}; font-size: 18px; line-height: 1.6; font-weight: 600;">
                ${replacePlaceholders(t.emails['tree-deletion-requested'].greeting, { name: recipientName })}
              </p>

              <p style="margin: 0 0 32px; color: ${ocean[400]}; font-size: 16px; line-height: 1.7;">
                ${replacePlaceholders(t.emails['tree-deletion-requested'].body, { tree: treeName, requester: requestedByName })}
              </p>

              <!-- Summary -->
              <div style="background: ${ocean[50]}; border-radius: 0px 0px 16px 16px; border-top: 6px solid ${ocean[400]}; padding: 24px; margin-bottom: 32px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="text-align: center; padding: 8px;">
                      <div style="font-size: 14px; color: ${ocean[300]}; font-weight: 500; margin-bottom: 6px;">${t.emails['tree-deletion-requested']['requested-at']}</div>
                      <div style="font-size: 16px; font-weight: 700; color: ${ocean[400]};">${requestedAtLabel}</div>
                    </td>
                    <td style="text-align: center; padding: 8px; border-left: 2px solid ${ocean[100]};">
                      <div style="font-size: 14px; color: ${ocean[300]}; font-weight: 500; margin-bottom: 6px;">${t.emails['tree-deletion-requested']['available-at']}</div>
                      <div style="font-size: 16px; font-weight: 700; color: ${ocean[400]};">${availableAtLabel}</div>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 24px 0;">
                    <a href="${settingsUrl}" style="display: inline-block; padding: 16px 40px; background-color: ${ocean[400]}; color: ${ocean[0]}; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 16px; box-shadow: 0 4px 12px rgba(56, 189, 248, 0.3);">
                      ${t.emails['tree-deletion-requested'].cta}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; border-top: 2px solid ${ocean[200]};">
              <p style="margin: 0; color: ${ocean[200]}; font-size: 12px; text-align: center; line-height: 1.6;">
                ${t.emails['tree-deletion-requested'].footer}
                <br>
                ${t.emails['tree-deletion-requested'].link}
                <br>
                <a href="${settingsUrl}" style="color: ${ocean[300]}; text-decoration: underline;">${settingsUrl}</a>
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer Text -->
        <p style="margin: 24px 0 0; color: ${ocean[100]}; font-size: 12px; text-align: center;">
          ${replacePlaceholders(t.emails.copyright, { year: new Date().getFullYear() })}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  const textBody = `
${treeName} - ${t.emails['tree-deletion-requested'].title}

${replacePlaceholders(t.emails['tree-deletion-requested'].greeting, { name: recipientName })}

${replacePlaceholders(t.emails['tree-deletion-requested'].body, { tree: treeName, requester: requestedByName })}

${t.emails['tree-deletion-requested']['requested-at']}: ${requestedAtLabel}
${t.emails['tree-deletion-requested']['available-at']}: ${availableAtLabel}

${t.emails['tree-deletion-requested'].cta}: ${settingsUrl}

---
${t.emails['tree-deletion-requested'].footer}
${t.emails['tree-deletion-requested'].link}: ${settingsUrl}

${replacePlaceholders(t.emails.copyright, { year: new Date().getFullYear() })}
  `.trim()

  return sendEmail(
    {
      Source: `Kinship <${env.AMAZON_SES_FROM_EMAIL}>`,
      Destination: { ToAddresses: [recipientEmail] },
      Message: {
        Subject: {
          Data: replacePlaceholders(t.emails['tree-deletion-requested'].subject, {
            tree: treeName,
          }),
          Charset: 'UTF-8',
        },
        Body: {
          Html: { Data: htmlBody, Charset: 'UTF-8' },
          Text: { Data: textBody, Charset: 'UTF-8' },
        },
      },
    },
    'sendTreeDeletionRequestedEmail'
  )
}

export async function sendTreeDeletedEmail(params: TreeDeletedEmailParams): Promise<boolean> {
  const { recipientEmail, recipientName, treeName, locale = 'en' } = params
  const t = getEmailTranslations(locale)

  const htmlBody = `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.emails['tree-deleted'].title} - ${treeName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="border-radius: 16px; box-shadow: 0 4px 16px rgba(2, 132, 199, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 24px; text-align: center; background-color: ${ocean[400]}; border-radius: 16px;">
              <h1 style="margin: 0 0 8px; color: ${ocean[0]}; font-size: 28px; font-weight: 700;">
                ${treeName}
              </h1>
              <p style="margin: 0; color: ${ocean[50]}; font-size: 16px; font-weight: 500;">
                ${t.emails['tree-deleted'].title}
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: ${ocean[400]}; font-size: 18px; line-height: 1.6; font-weight: 600;">
                ${replacePlaceholders(t.emails['tree-deleted'].greeting, { name: recipientName })}
              </p>

              <p style="margin: 0; color: ${ocean[400]}; font-size: 16px; line-height: 1.7;">
                ${replacePlaceholders(t.emails['tree-deleted'].body, { tree: treeName })}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; border-top: 2px solid ${ocean[200]};">
              <p style="margin: 0; color: ${ocean[200]}; font-size: 12px; text-align: center; line-height: 1.6;">
                ${t.emails['tree-deleted'].footer}
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer Text -->
        <p style="margin: 24px 0 0; color: ${ocean[100]}; font-size: 12px; text-align: center;">
          ${replacePlaceholders(t.emails.copyright, { year: new Date().getFullYear() })}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  const textBody = `
${treeName} - ${t.emails['tree-deleted'].title}

${replacePlaceholders(t.emails['tree-deleted'].greeting, { name: recipientName })}

${replacePlaceholders(t.emails['tree-deleted'].body, { tree: treeName })}

---
${t.emails['tree-deleted'].footer}

${replacePlaceholders(t.emails.copyright, { year: new Date().getFullYear() })}
  `.trim()

  return sendEmail(
    {
      Source: `Kinship <${env.AMAZON_SES_FROM_EMAIL}>`,
      Destination: { ToAddresses: [recipientEmail] },
      Message: {
        Subject: {
          Data: replacePlaceholders(t.emails['tree-deleted'].subject, { tree: treeName }),
          Charset: 'UTF-8',
        },
        Body: {
          Html: { Data: htmlBody, Charset: 'UTF-8' },
          Text: { Data: textBody, Charset: 'UTF-8' },
        },
      },
    },
    'sendTreeDeletedEmail'
  )
}

/**
 * Sends a weekly newsletter email with family tree updates
 * @param params {NewsletterEmailParams} - Email parameters
 * @returns Promise<boolean> - True if email was sent successfully
 */
export async function sendWeeklyNewsletter(params: NewsletterEmailParams): Promise<boolean> {
  const {
    recipientEmail,
    recipientName,
    treeName,
    treeSlug,
    recentAdditions,
    events,
    totalMembers,
    locale = 'en',
  } = params

  const t = getEmailTranslations(locale)

  const appUrl = AUTH_URL
  const treeUrl = `${appUrl}/trees/${treeSlug}`
  const profileUrl = `${appUrl}/profile`
  const birthdayEvents = events.filter((event) => event.eventType === 'birthday')
  const anniversaryEvents = events.filter((event) => event.eventType === 'anniversary')

  const htmlBody = `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.emails.newsletter.title} - ${treeName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="border-radius: 16px; box-shadow: 0 4px 16px rgba(2, 132, 199, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 24px; text-align: center; background-color: ${ocean[400]}; border-radius: 16px;">
              <h1 style="margin: 0 0 8px; color: ${ocean[0]}; font-size: 28px; font-weight: 700;">
                ${treeName}
              </h1>
              <p style="margin: 0; color: ${ocean[50]}; font-size: 16px; font-weight: 500;">
                ${t.emails.newsletter.title}
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: ${ocean[400]}; font-size: 18px; line-height: 1.6; font-weight: 600;">
                ${replacePlaceholders(t.emails.newsletter.greeting, { name: recipientName })}
              </p>
              
              <p style="margin: 0 0 32px; color: ${ocean[400]}; font-size: 16px; line-height: 1.7;">
                ${replacePlaceholders(t.emails.newsletter['summary-intro'], { tree: `<strong>${treeName}</strong>` })}
              </p>

              <!-- Summary -->
              <div style="background: ${ocean[50]}; border-radius: 0px 0px 16px 16px; border-top: 6px solid ${ocean[400]}; padding: 24px; margin-bottom: 32px;">
                <h2 style="margin: 0 0 20px; color: ${ocean[400]}; font-size: 18px; font-weight: 700;">
                  ${t.emails.newsletter['summary-title']}
                </h2>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="text-align: center; padding: 8px;">
                      <div style="font-size: 32px; font-weight: 700; color: ${ocean[400]}; margin-bottom: 4px;">${recentAdditions.length}</div>
                      <div style="font-size: 14px; color: ${ocean[300]}; font-weight: 500;">${t.emails.newsletter['members-new']}</div>
                    </td>  
                    <td style="text-align: center; padding: 8px; border-left: 2px solid ${ocean[100]};">
                      <div style="font-size: 32px; font-weight: 700; color: ${ocean[400]}; margin-bottom: 4px;">${birthdayEvents.length}</div>
                      <div style="font-size: 14px; color: ${ocean[300]}; font-weight: 500;">${t.emails.newsletter['events-birthdays-title']}</div>
                    </td>
                    <td style="text-align: center; padding: 8px; border-left: 2px solid ${ocean[100]};">
                      <div style="font-size: 32px; font-weight: 700; color: ${ocean[400]}; margin-bottom: 4px;">${anniversaryEvents.length}</div>
                      <div style="font-size: 14px; color: ${ocean[300]}; font-weight: 500;">${t.emails.newsletter['events-anniversaries-title']}</div>
                    </td>
                  </tr>
                </table>
                <p style="margin: 18px 0 0; color: ${ocean[300]}; font-size: 13px; text-align: center;">
                  ${replacePlaceholders(t.emails.newsletter['total-members'], { count: totalMembers })}
                </p>
              </div>

              ${
                recentAdditions.length > 0
                  ? `
              <!-- Recent Additions -->
              <div style="margin-bottom: 32px;">
                <h2 style="margin: 0 0 20px; color: ${ocean[400]}; font-size: 20px; font-weight: 600; border-bottom: 2px solid ${ocean[200]}; padding-bottom: 12px;">
                  ${t.emails.newsletter['new-members-title']}
                </h2>
                ${recentAdditions
                  .map(
                    (member) => `
                  <div style="background-color: ${ocean[50]}; border-left: 6px solid ${ocean[400]}; padding: 16px; margin-bottom: 12px; border-radius: 0px 16px 16px 0px;">
                    <p style="margin: 0; color: ${ocean[400]}; font-size: 16px; font-weight: 600;">
                      ${formatNewsletterMemberName(member)}
                    </p>
                    <p style="margin: 4px 0 0; color: ${ocean[300]}; font-size: 14px;">
                      ${formatEmailDate(member.addedDate, locale, {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                `
                  )
                  .join('')}
              </div>
              `
                  : ''
              }

              ${
                birthdayEvents.length > 0 || anniversaryEvents.length > 0
                  ? `
              <!-- Events -->
              <div style="margin-bottom: 32px;">
                <h2 style="margin: 0 0 20px; color: ${ocean[400]}; font-size: 20px; font-weight: 600; border-bottom: 2px solid ${ocean[200]}; padding-bottom: 12px;">
                  ${t.emails.newsletter['upcoming-events-title']}
                </h2>
                ${
                  birthdayEvents.length > 0
                    ? `
                <h3 style="margin: 0 0 12px; color: ${ocean[300]}; font-size: 15px; font-weight: 700;">
                  ${t.emails.newsletter['events-birthdays-title']}
                </h3>
                ${birthdayEvents
                  .map(
                    (event) => `
                  <div style="background-color: ${ocean[50]}; border-left: 6px solid ${ocean[400]}; padding: 16px; margin-bottom: 12px;border-radius: 0px 16px 16px 0px;">
                    <p style="margin: 0; color: ${ocean[400]}; font-size: 16px; font-weight: 600;">
                        ${event.name}
                    </p>
                    <p style="margin: 4px 0 0; color: ${ocean[300]}; font-size: 14px;">
                      ${replacePlaceholders(t.emails.newsletter['event-birthday'], { years: event.yearsAgo || 0 })}
                      - ${formatEmailDate(event.date, locale, { month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                `
                  )
                  .join('')}
                `
                    : ''
                }
                ${
                  anniversaryEvents.length > 0
                    ? `
                <h3 style="margin: 20px 0 12px; color: ${ocean[300]}; font-size: 15px; font-weight: 700;">
                  ${t.emails.newsletter['events-anniversaries-title']}
                </h3>
                ${anniversaryEvents
                  .map(
                    (event) => `
                  <div style="background-color: ${ocean[50]}; border-left: 6px solid ${ocean[300]}; padding: 16px; margin-bottom: 12px;border-radius: 0px 16px 16px 0px;">
                    <p style="margin: 0; color: ${ocean[400]}; font-size: 16px; font-weight: 600;">
                        ${event.name}
                    </p>
                    <p style="margin: 4px 0 0; color: ${ocean[300]}; font-size: 14px;">
                      ${replacePlaceholders(t.emails.newsletter['event-anniversary'], { years: event.yearsAgo || 0 })}
                      - ${formatEmailDate(event.date, locale, { month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                `
                  )
                  .join('')}
                `
                    : ''
                }
              </div>
              `
                  : ''
              }
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 24px 0;">
                    <a href="${treeUrl}" style="display: inline-block; padding: 16px 40px; background-color: ${ocean[400]}; color: ${ocean[0]}; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 16px; box-shadow: 0 4px 12px rgba(56, 189, 248, 0.3);">
                      ${replacePlaceholders(t.emails.newsletter.cta, { tree: treeName })}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; border-top: 2px solid ${ocean[200]};">
              <p style="margin: 0; color: ${ocean[200]}; font-size: 12px; text-align: center; line-height: 1.6;">
                ${t.emails.newsletter.footer}
                <br>
                ${t.emails.newsletter.help}
                <br>
                <a href="${profileUrl}" style="color: ${ocean[300]}; text-decoration: underline;">${t.emails.newsletter.link}</a>
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Footer Text -->
        <p style="margin: 24px 0 0; color: ${ocean[100]}; font-size: 12px; text-align: center;">
          ${replacePlaceholders(t.emails.copyright, { year: new Date().getFullYear() })}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  const textBody = `
${treeName} - ${t.emails.newsletter.title}

${replacePlaceholders(t.emails.newsletter.greeting, { name: recipientName })}

${replacePlaceholders(t.emails.newsletter['summary-intro'], { tree: treeName })}

${t.emails.newsletter['summary-title']}
${t.emails.newsletter['members-new']}: ${recentAdditions.length}
${t.emails.newsletter['events-birthdays-title']}: ${birthdayEvents.length}
${t.emails.newsletter['events-anniversaries-title']}: ${anniversaryEvents.length}
${replacePlaceholders(t.emails.newsletter['total-members'], { count: totalMembers })}

${
  recentAdditions.length > 0
    ? `
${t.emails.newsletter['new-members-title']}:
${recentAdditions
  .map(
    (member) =>
      `• ${formatNewsletterMemberName(member)} (${formatEmailDate(member.addedDate, locale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })})`
  )
  .join('\n')}
`
    : ''
}

${
  birthdayEvents.length > 0 || anniversaryEvents.length > 0
    ? `
${t.emails.newsletter['upcoming-events-title']}:
${
  birthdayEvents.length > 0
    ? `${t.emails.newsletter['events-birthdays-title']}:\n${birthdayEvents
        .map(
          (event) =>
            `• ${event.name} - ${replacePlaceholders(t.emails.newsletter['event-birthday'], { years: event.yearsAgo || 0 })} - ${formatEmailDate(event.date, locale, { month: 'long', day: 'numeric' })}`
        )
        .join('\n')}`
    : ''
}
${
  anniversaryEvents.length > 0
    ? `${t.emails.newsletter['events-anniversaries-title']}:\n${anniversaryEvents
        .map(
          (event) =>
            `• ${event.name} - ${replacePlaceholders(t.emails.newsletter['event-anniversary'], { years: event.yearsAgo || 0 })} - ${formatEmailDate(event.date, locale, { month: 'long', day: 'numeric' })}`
        )
        .join('\n')}`
    : ''
}
`
    : ''
}

${replacePlaceholders(t.emails.newsletter.cta, { tree: treeName })}: ${treeUrl}

---
${t.emails.newsletter.footer}
${t.emails.newsletter.help}
${t.emails.newsletter.link}: ${profileUrl}

${replacePlaceholders(t.emails.copyright, { year: new Date().getFullYear() })}
  `.trim()

  return sendEmail(
    {
      Source: `Kinship <${env.AMAZON_SES_FROM_EMAIL}>`,
      Destination: { ToAddresses: [recipientEmail] },
      Message: {
        Subject: {
          Data: replacePlaceholders(t.emails.newsletter.subject, { tree: treeName }),
          Charset: 'UTF-8',
        },
        Body: {
          Html: { Data: htmlBody, Charset: 'UTF-8' },
          Text: { Data: textBody, Charset: 'UTF-8' },
        },
      },
    },
    'sendWeeklyNewsletter'
  )
}
