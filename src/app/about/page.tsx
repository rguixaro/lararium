import Link from 'next/link'
import { Github, Heart, Shield, TreePine } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { cn } from '@/utils'

export default async function AboutPage() {
  const t_common = await getTranslations('common')
  const t_login = await getTranslations('login')
  const t_about = await getTranslations('about')

  const appName = t_common('app-name').toLowerCase()

  const features = [
    {
      icon: TreePine,
      title: t_login('build-your-tree-title'),
      description: t_login('build-your-tree-description'),
    },
    {
      icon: Heart,
      title: t_login('share-memories-title'),
      description: t_login('share-memories-description'),
    },
    {
      icon: Shield,
      title: t_login('private-and-secure-title'),
      description: t_login('private-and-secure-description'),
    },
  ]

  return (
    <main className="flex flex-col items-start justify-center">
      <div className="mx-auto w-11/12 max-w-4xl space-y-12 self-center py-10">
        <section className="text-center">
          <h1 className="text-ocean-300 text-4xl font-extrabold tracking-tight sm:text-5xl">
            {t_about.rich('title', {
              appName,
              app: (chunks) => <span className="text-ocean-400">{chunks}</span>,
            })}
          </h1>
          <p className="text-ocean-300 mx-auto mt-4 max-w-xl text-base sm:text-lg">
            {t_common('app-description')}
          </p>
        </section>

        <section>
          <h2 className="text-ocean-400 mb-4 text-xl font-extrabold tracking-tight">
            {t_about('features-title')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="bg-pale-ocean text-ocean-400 shadow-center-sm rounded-xl p-5"
              >
                <div className="bg-ocean-200/30 mb-3 flex h-10 w-10 items-center justify-center rounded-full">
                  <Icon size={20} className="stroke-ocean-300" />
                </div>
                <div className="text-base font-extrabold">{title}</div>
                <p className="text-ocean-300 mt-1 text-sm">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-ocean-200 shadow-center-sm rounded-xl px-6 py-8 text-center sm:px-10 sm:py-10">
          <h2 className="text-pale-ocean text-2xl font-extrabold tracking-tight sm:text-3xl">
            {t_about('feedback-title')}
          </h2>
          <p className="text-pale-ocean/80 mx-auto mt-3 max-w-lg text-sm sm:text-base">
            {t_about.rich('feedback-description', {
              appName,
              app: (chunks) => <span className="text-pale-ocean font-extrabold">{chunks}</span>,
            })}
          </p>
          <Link
            href="https://github.com/rguixaro/lararium"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'bg-pale-ocean text-ocean-400 hover:bg-neutral-50',
              'mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5',
              'text-sm font-bold transition-colors duration-200'
            )}
          >
            <Github size={18} />
            {t_about('github-cta')}
          </Link>
        </section>

        <section className="text-ocean-300 text-center text-sm">
          <p>
            <b className="text-ocean-400">{appName}</b> {t_common('app-status')}{' '}
            <b className="text-ocean-400">{t_common('app-beta')}</b>
          </p>
        </section>
      </div>
    </main>
  )
}
