import { User } from './user.type'
import { PictureTag } from './picture.type'

export const TreeAccessRole = ['VIEWER', 'EDITOR', 'ADMIN'] as const
export type TreeAccessRole = (typeof TreeAccessRole)[number]

export interface Tree {
  id: string
  slug: string
  name: string
  createdAt: Date
  updatedAt: Date

  newsletter: boolean

  nodes?: TreeNode[]
  edges?: TreeEdge[]
  accesses?: TreeAccess[]
  deletionRequest?: TreeDeletionRequest | null
  _count?: { nodes?: number }
}

export interface TreeDeletionRequest {
  id: string
  treeId: string
  requestedById: string | null
  requestedBy?: Pick<User, 'id' | 'name' | 'email' | 'image'> | null
  requestedAt: Date
  approvedById?: string | null
  approvedBy?: Pick<User, 'id' | 'name' | 'email' | 'image'> | null
  approvedAt?: Date | null
}

export interface TreeAccess {
  id: string
  treeId: string
  userId: string
  user: Pick<User, 'id' | 'name' | 'email' | 'image'>
  role: TreeAccessRole
  createdAt: Date
}

export const TreeNodeGender = ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'] as const
export type TreeNodeGender = (typeof TreeNodeGender)[number]

export const TreeEdgeType = ['PARENT', 'CHILD', 'SPOUSE', 'COUPLE'] as const
export type TreeEdgeType = (typeof TreeEdgeType)[number]

export interface TreeNode {
  id: string
  treeId: string

  fullName: string
  alias?: string | null
  servingAs?: string | null
  birthDate?: Date | null
  deathDate?: Date | null
  gender: TreeNodeGender
  birthPlace?: string | null
  deathPlace?: string | null
  biography?: string | null
  createdAt: Date
  updatedAt: Date

  childOfUnionId?: string | null

  taggedIn?: PictureTag[]

  edgesFrom?: TreeEdge[]
  edgesTo?: TreeEdge[]
}

export interface Union {
  id: string
  treeId: string

  spouseAId: string
  spouseBId: string | null

  marriedAt: Date | null
  divorcedAt: Date | null
  place: string | null

  createdAt: Date
  updatedAt: Date

  spouseA?: TreeNode
  spouseB?: TreeNode | null
  children?: TreeNode[]
}

export interface TreeEdge {
  id: string
  treeId: string

  type: TreeEdgeType
  createdAt: Date

  fromNodeId: string
  toNodeId: string

  fromNode?: TreeNode
  toNode?: TreeNode
}

export interface TimelineEvent {
  type: 'birth' | 'death' | 'marriage' | 'divorce'
  date: Date
  name: string
  place?: string
  picture?: string
}

export type TimelineNode = { type: 'event'; item: TimelineEvent } | { type: 'gap'; years: number }
