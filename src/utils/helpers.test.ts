import { describe, it, expect } from 'vitest'

import { isTreeDetailRoute } from './helpers'

describe('isTreeDetailRoute', () => {
  it('matches the graph view route', () => {
    expect(isTreeDetailRoute('/trees/view/family-slug')).toBe(true)
    expect(isTreeDetailRoute('/trees/view/abc-123')).toBe(true)
  })

  it('normalizes trailing slash', () => {
    expect(isTreeDetailRoute('/trees/view/family/')).toBe(true)
  })

  it('does not match the hub root route', () => {
    expect(isTreeDetailRoute('/trees/family-slug')).toBe(false)
    expect(isTreeDetailRoute('/trees/abc')).toBe(false)
  })

  it('does not match `/trees/view` without a slug', () => {
    expect(isTreeDetailRoute('/trees/view')).toBe(false)
  })

  it('does not match sub-routes under `/trees/view/[slug]`', () => {
    expect(isTreeDetailRoute('/trees/view/family/extra')).toBe(false)
  })

  it('does not match other tree routes', () => {
    expect(isTreeDetailRoute('/trees/timeline/family')).toBe(false)
    expect(isTreeDetailRoute('/trees/logs/family')).toBe(false)
    expect(isTreeDetailRoute('/trees/settings/family')).toBe(false)
    expect(isTreeDetailRoute('/trees/new')).toBe(false)
  })

  it('does not match unrelated paths', () => {
    expect(isTreeDetailRoute('/')).toBe(false)
    expect(isTreeDetailRoute('/profile')).toBe(false)
    expect(isTreeDetailRoute('/auth')).toBe(false)
  })
})
