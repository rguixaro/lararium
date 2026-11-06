import z from 'zod'

export const TreeAccessRole = ['VIEWER', 'EDITOR', 'ADMIN'] as const
export type TreeAccessRole = (typeof TreeAccessRole)[number]

export const TreeNodeGender = ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'] as const
export type TreeNodeGender = (typeof TreeNodeGender)[number]

export const TreeEdgeType = ['PARENT', 'CHILD', 'SPOUSE', 'COUPLE'] as const
export type TreeEdgeType = (typeof TreeEdgeType)[number]

export const ActivityAction = [
  'NODE_CREATED',
  'NODE_UPDATED',
  'NODE_DELETED',

  'EDGE_CREATED',
  'EDGE_DELETED',

  'PICTURE_ADDED',
  'PICTURE_DELETED',

  'PICTURE_TAG_CREATED',
  'PICTURE_TAG_DELETED',

  'TREE_UPDATED',

  'SHARE_TOKEN_GENERATED',
  'MEMBER_JOINED_VIA_SHARE',

  'NOTE_UPDATED',

  'UNION_CREATED',
  'UNION_UPDATED',
  'UNION_DELETED',

  'TREE_DELETION_REQUESTED',
  'TREE_DELETION_CANCELLED',
  'TREE_DELETION_APPROVED',
] as const
export type ActivityAction = (typeof ActivityAction)[number]

// Schema for updating a tree's shared note
export const MAX_TREE_NOTE_LENGTH = 10_000

export const UpdateTreeNoteSchema = z.object({
  treeId: z.string().min(1),
  content: z.string().max(MAX_TREE_NOTE_LENGTH, { message: 'error-note-too-long' }),
})
export type UpdateTreeNoteSchema = z.infer<typeof UpdateTreeNoteSchema>

// Schema for creating a new tree
export const CreateTreeSchema = z.object({
  name: z
    .string()
    .min(3, { message: 'tree-name-too-short' })
    .max(100, { message: 'tree-name-too-long' }),
  newsletter: z.boolean().optional(),
  members: z
    .array(
      z.object({
        userId: z.string(),
        name: z.string().nullable(),
        email: z.string().email().nullable(),
        role: z.enum(TreeAccessRole),
      })
    )
    .optional(),
})
export type CreateTreeInput = z.TypeOf<typeof CreateTreeSchema>

// Schema for a Tree record
export const TreeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type TreeSchema = z.TypeOf<typeof TreeSchema>

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
})
export type UserSchema = z.TypeOf<typeof UserSchema>

// Schema for TreeAccess record
export const TreeAccessSchema = z.object({
  id: z.string(),
  treeId: z.string(),
  userId: z.string(),
  user: UserSchema,
  role: z.enum(TreeAccessRole).default('VIEWER'),
  createdAt: z.date(),
})

export const UpdateProfileSchema = z.object({
  name: z
    .string()
    .min(1, { message: 'username-required' })
    .max(40, { message: 'username-too-long' }),
  email: z.string().email({ message: 'email-invalid' }),
  newsletter: z.boolean().optional(),
  language: z.enum(['UR', 'EN']),
})

export type UpdateProfileInput = z.TypeOf<typeof UpdateProfileSchema>

export const CreateTreeNodeSchema = z
  .object({
    treeId: z.string().min(1),
    fullName: z.string().trim().min(1, { message: 'full-name-required' }),
    married: z.boolean().optional(),
    spouseName: z.string().trim().max(100).optional(),
    servingAs: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.married && !data.spouseName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'spouse-name-required',
        path: ['spouseName'],
      })
    }
  })

export type CreateTreeMemberInput = z.TypeOf<typeof CreateTreeNodeSchema>

export const UpdateTreeNodeSchema = z.object({
  id: z.string().min(1),
  treeId: z.string().min(1),
  fullName: z.string().trim().min(1, { message: 'full-name-required' }),
  servingAs: z.string().optional().nullable(),
})

export type UpdateTreeNodeInput = z.TypeOf<typeof UpdateTreeNodeSchema>

export const CreateTreeEdgeSchema = z.object({
  treeId: z.string().min(1),
  fromNodeId: z.string().min(1, { message: 'from-node-required' }),
  toNodeId: z.string().min(1, { message: 'to-node-required' }),
  type: z.enum(TreeEdgeType, { required_error: 'edge-type-required' }),
})

export type CreateTreeEdgeInput = z.TypeOf<typeof CreateTreeEdgeSchema>

const divorceAfterMarriage = (
  data: { marriedAt?: Date | null; divorcedAt?: Date | null },
  ctx: z.RefinementCtx
) => {
  if (data.marriedAt && data.divorcedAt && data.divorcedAt.getTime() < data.marriedAt.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'error-divorced-before-married',
      path: ['divorcedAt'],
    })
  }
}

export const CreateUnionSchema = z
  .object({
    treeId: z.string().min(1),
    spouseAId: z.string().min(1, { message: 'spouse-a-required' }),
    spouseBId: z.string().min(1).nullable().optional(),
    marriedAt: z.coerce.date().nullable().optional(),
    divorcedAt: z.coerce.date().nullable().optional(),
    place: z.string().max(120).nullable().optional(),
  })
  .superRefine(divorceAfterMarriage)
export type CreateUnionInput = z.TypeOf<typeof CreateUnionSchema>

export const UpdateUnionSchema = z
  .object({
    id: z.string().min(1),
    treeId: z.string().min(1),
    spouseAId: z.string().min(1, { message: 'spouse-a-required' }),
    spouseBId: z.string().min(1).nullable().optional(),
    marriedAt: z.coerce.date().nullable().optional(),
    divorcedAt: z.coerce.date().nullable().optional(),
    place: z.string().max(120).nullable().optional(),
  })
  .superRefine(divorceAfterMarriage)
export type UpdateUnionInput = z.TypeOf<typeof UpdateUnionSchema>

export const AttachChildToUnionSchema = z.object({
  treeId: z.string().min(1),
  unionId: z.string().min(1).nullable(),
  childNodeId: z.string().min(1),
})
export type AttachChildToUnionInput = z.TypeOf<typeof AttachChildToUnionSchema>
