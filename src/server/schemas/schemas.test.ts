import { describe, it, expect } from 'vitest'
import {
  CreateTreeSchema,
  UpdateProfileSchema,
  CreateTreeNodeSchema,
  UpdateTreeNodeSchema,
  CreateTreeEdgeSchema,
  CreateUnionSchema,
  UpdateUnionSchema,
} from './index'

const validTree = {
  name: 'My Family Tree',
}

const validProfile = {
  name: 'John',
  email: 'john@example.com',
  language: 'EN' as const,
}

const validTreeNode = {
  treeId: 'tree-1',
  fullName: 'Alice Smith',
  gender: 'FEMALE' as const,
}

const validUpdateTreeNode = {
  id: 'node-1',
  treeId: 'tree-1',
  fullName: 'Alice Smith',
  gender: 'FEMALE' as const,
}

const validTreeEdge = {
  treeId: 'tree-1',
  fromNodeId: 'node-1',
  toNodeId: 'node-2',
  type: 'PARENT' as const,
}

describe('CreateTreeSchema', () => {
  it('accepts valid input', () => {
    const result = CreateTreeSchema.safeParse(validTree)
    expect(result.success).toBe(true)
  })

  it('rejects name shorter than 3 chars', () => {
    const result = CreateTreeSchema.safeParse({ ...validTree, name: 'ab' })
    expect(result.success).toBe(false)
  })

  it('rejects name longer than 24 chars', () => {
    const result = CreateTreeSchema.safeParse({ ...validTree, name: 'a'.repeat(25) })
    expect(result.success).toBe(false)
  })

  it('accepts name at boundary lengths (3 and 24)', () => {
    expect(CreateTreeSchema.safeParse({ ...validTree, name: 'abc' }).success).toBe(true)
    expect(CreateTreeSchema.safeParse({ ...validTree, name: 'a'.repeat(24) }).success).toBe(true)
  })

  it('accepts optional newsletter boolean', () => {
    const result = CreateTreeSchema.safeParse({ ...validTree, newsletter: true })
    expect(result.success).toBe(true)
  })

  it('accepts optional members array', () => {
    const result = CreateTreeSchema.safeParse({
      ...validTree,
      members: [{ userId: 'u1', name: 'Alice', email: 'a@b.com', role: 'EDITOR' }],
    })
    expect(result.success).toBe(true)
  })
})

describe('UpdateProfileSchema', () => {
  it('accepts valid input', () => {
    const result = UpdateProfileSchema.safeParse(validProfile)
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = UpdateProfileSchema.safeParse({ ...validProfile, name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects name longer than 40 chars', () => {
    const result = UpdateProfileSchema.safeParse({ ...validProfile, name: 'a'.repeat(41) })
    expect(result.success).toBe(false)
  })

  it('rejects invalid email', () => {
    const result = UpdateProfileSchema.safeParse({ ...validProfile, email: 'not-an-email' })
    expect(result.success).toBe(false)
  })

  it('accepts all valid languages', () => {
    for (const language of ['UR', 'EN']) {
      const result = UpdateProfileSchema.safeParse({ ...validProfile, language })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid language', () => {
    const result = UpdateProfileSchema.safeParse({ ...validProfile, language: 'FR' })
    expect(result.success).toBe(false)
  })

  it('accepts optional newsletter boolean', () => {
    const result = UpdateProfileSchema.safeParse({ ...validProfile, newsletter: false })
    expect(result.success).toBe(true)
  })
})

describe('CreateTreeNodeSchema', () => {
  it('accepts valid input with required fields only', () => {
    const result = CreateTreeNodeSchema.safeParse(validTreeNode)
    expect(result.success).toBe(true)
  })

  it('rejects empty treeId', () => {
    const result = CreateTreeNodeSchema.safeParse({ ...validTreeNode, treeId: '' })
    expect(result.success).toBe(false)
  })

  it('rejects empty fullName', () => {
    const result = CreateTreeNodeSchema.safeParse({ ...validTreeNode, fullName: '' })
    expect(result.success).toBe(false)
  })

  it('accepts all valid genders', () => {
    for (const gender of ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']) {
      const result = CreateTreeNodeSchema.safeParse({ ...validTreeNode, gender })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid gender', () => {
    const result = CreateTreeNodeSchema.safeParse({ ...validTreeNode, gender: 'NONE' })
    expect(result.success).toBe(false)
  })

  it('rejects alias longer than 16 chars', () => {
    const result = CreateTreeNodeSchema.safeParse({ ...validTreeNode, alias: 'a'.repeat(17) })
    expect(result.success).toBe(false)
  })

  it('accepts optional nullable fields', () => {
    const result = CreateTreeNodeSchema.safeParse({
      ...validTreeNode,
      alias: null,
      birthPlace: null,
      birthDate: null,
      deathPlace: null,
      deathDate: null,
    })
    expect(result.success).toBe(true)
  })

  it('coerces date strings to Date objects', () => {
    const result = CreateTreeNodeSchema.safeParse({
      ...validTreeNode,
      birthDate: '2000-01-01',
      deathDate: '2080-12-31',
    })
    expect(result.success).toBe(true)
  })

  it('rejects death dates that are not after birth dates', () => {
    const result = CreateTreeNodeSchema.safeParse({
      ...validTreeNode,
      birthDate: '2000-01-01',
      deathDate: '2000-01-01',
    })
    expect(result.success).toBe(false)
  })
})

describe('UpdateTreeNodeSchema', () => {
  it('accepts valid input', () => {
    const result = UpdateTreeNodeSchema.safeParse(validUpdateTreeNode)
    expect(result.success).toBe(true)
  })

  it('requires id field', () => {
    const { id: _, ...withoutId } = validUpdateTreeNode
    const result = UpdateTreeNodeSchema.safeParse(withoutId)
    expect(result.success).toBe(false)
  })

  it('rejects empty fullName', () => {
    const result = UpdateTreeNodeSchema.safeParse({ ...validUpdateTreeNode, fullName: '' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid gender', () => {
    const result = UpdateTreeNodeSchema.safeParse({ ...validUpdateTreeNode, gender: 'UNKNOWN' })
    expect(result.success).toBe(false)
  })

  it('rejects alias longer than 16 chars', () => {
    const result = UpdateTreeNodeSchema.safeParse({ ...validUpdateTreeNode, alias: 'a'.repeat(17) })
    expect(result.success).toBe(false)
  })

  it('accepts optional nullable fields', () => {
    const result = UpdateTreeNodeSchema.safeParse({
      ...validUpdateTreeNode,
      alias: null,
      birthPlace: null,
      birthDate: null,
      biography: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects death dates that are not after birth dates', () => {
    const result = UpdateTreeNodeSchema.safeParse({
      ...validUpdateTreeNode,
      birthDate: '2000-01-02',
      deathDate: '2000-01-01',
    })
    expect(result.success).toBe(false)
  })
})

describe('Union schemas', () => {
  const validCreateUnion = { treeId: 'tree-1', spouseAId: 'node-1', spouseBId: 'node-2' }
  const validUpdateUnion = { id: 'union-1', ...validCreateUnion }

  it('rejects divorce dates before marriage dates when creating', () => {
    const result = CreateUnionSchema.safeParse({
      ...validCreateUnion,
      marriedAt: '2020-01-02',
      divorcedAt: '2020-01-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects divorce dates before marriage dates when updating', () => {
    const result = UpdateUnionSchema.safeParse({
      ...validUpdateUnion,
      marriedAt: '2020-01-02',
      divorcedAt: '2020-01-01',
    })
    expect(result.success).toBe(false)
  })
})

describe('CreateTreeEdgeSchema', () => {
  it('accepts valid input', () => {
    const result = CreateTreeEdgeSchema.safeParse(validTreeEdge)
    expect(result.success).toBe(true)
  })

  it('rejects empty treeId', () => {
    const result = CreateTreeEdgeSchema.safeParse({ ...validTreeEdge, treeId: '' })
    expect(result.success).toBe(false)
  })

  it('rejects empty fromNodeId', () => {
    const result = CreateTreeEdgeSchema.safeParse({ ...validTreeEdge, fromNodeId: '' })
    expect(result.success).toBe(false)
  })

  it('rejects empty toNodeId', () => {
    const result = CreateTreeEdgeSchema.safeParse({ ...validTreeEdge, toNodeId: '' })
    expect(result.success).toBe(false)
  })

  it('accepts all valid edge types', () => {
    for (const type of ['PARENT', 'CHILD', 'SPOUSE', 'COUPLE']) {
      const result = CreateTreeEdgeSchema.safeParse({ ...validTreeEdge, type })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid edge type', () => {
    const result = CreateTreeEdgeSchema.safeParse({ ...validTreeEdge, type: 'SIBLING' })
    expect(result.success).toBe(false)
  })
})
