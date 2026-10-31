import type { MetadataRoute } from 'next'

import { DEFAULT_SITE_URL } from '@/lib/seo'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return [
    {
      url: `${DEFAULT_SITE_URL}/auth`,
      lastModified,
      changeFrequency: 'monthly',
    },
  ]
}
