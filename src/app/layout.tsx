import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { SessionProvider } from 'next-auth/react'
import 'reactflow/dist/style.css'

import { auth } from '@/auth'

import { ToasterProvider, CookiesProvider } from '@/providers'

import { Header, Footer } from '@/components/layout'

import '@/styles/globals.css'

import { DEFAULT_SITE_URL } from '@/lib/seo'

import { cn } from '@/utils'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f0f9ff' },
    { media: '(prefers-color-scheme: dark)', color: '#0c4a6e' },
  ],
}

export async function generateMetadata(): Promise<Metadata> {
  const t_common = await getTranslations('common')
  const locale = await getLocale()
  const name = t_common('app-name')
  const description = t_common('app-description')

  const ogLocaleMap: Record<string, string> = { ur: 'ur_PK', en: 'en_US' }

  return {
    metadataBase: new URL(DEFAULT_SITE_URL),
    title: { default: name, template: `%s | ${name}` },
    description,
    applicationName: name,
    authors: [{ name: 'Ricard Guixaró', url: 'https://rguixaro.dev' }],
    creator: 'Ricard Guixaró',
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      },
    },
    openGraph: {
      type: 'website',
      siteName: name,
      title: name,
      description,
      locale: ogLocaleMap[locale] ?? 'ur_PK',
      alternateLocale: Object.values(ogLocaleMap).filter((l) => l !== ogLocaleMap[locale]),
      images: [
        {
          url: '/favicon.svg',
          width: 512,
          height: 512,
          alt: name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: name,
      description,
      images: ['/favicon.svg'],
    },
    icons: {
      icon: [
        { url: '/favicon.svg', type: 'image/svg+xml' },
        { url: '/favicon.png', type: 'image/png' },
      ],
    },
    manifest: '/manifest.webmanifest',
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = await getMessages()
  const dir = locale === 'ur' ? 'rtl' : 'ltr'

  const session = await auth()
  const userName = session?.user.name
  const userImage = session?.user.image ?? null

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body
        className={cn(
          'font-sans antialiased',
          'bg-ocean-50 selection:bg-ocean-200/15 flex justify-center overflow-x-hidden'
        )}
      >
        <div className="flex min-h-screen w-full flex-col">
          <SessionProvider>
            <NextIntlClientProvider messages={messages}>
              <CookiesProvider />
              <Header username={userName || ''} userImage={userImage} />
              <main className="flex-1">{children}</main>
              <Footer />
              <ToasterProvider />
            </NextIntlClientProvider>
          </SessionProvider>
        </div>
      </body>
    </html>
  )
}
