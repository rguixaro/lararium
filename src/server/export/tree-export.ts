import { db } from '@/server/db'
import { env } from '@/env.mjs'
import { getFileFromS3 } from '@/lib/s3'
import { createZipStream, ZipEntry } from '@/lib/zip'

import { PictureMetadata, TreeAccessRole } from '@/types'

type ExportAccess = {
  role: TreeAccessRole
}

type GalleryPicture = {
  id: string
  fileKey: string
  date: Date | null
  metadata: unknown
  createdAt: Date
  updatedAt: Date
  tags: Array<{
    id: string
    nodeId: string
    isProfile: boolean
    node: {
      id: string
      fullName: string
      alias: string | null
    }
  }>
}

type ExportIds = {
  sourceTreeId: string
  tree: string
  deletionRequest?: string
  nodes: Map<string, string>
  edges: Map<string, string>
  unions: Map<string, string>
  pictures: Map<string, string>
  pictureTags: Map<string, string>
  accesses: Map<string, string>
  activityLogs: Map<string, string>
  users: Map<string, string>
  fileKeys: Map<string, string>
}

export type TreeJsonExportResult =
  | { error: false; filename: string; payload: unknown }
  | { error: true; status: number; message: string }

export type GalleryExportResult =
  | { error: false; filename: string; stream: ReadableStream<Uint8Array> }
  | { error: true; status: number; message: string }

const canViewPictureMetadata = (access: ExportAccess) =>
  access.role === 'EDITOR' || access.role === 'ADMIN'

const canExportGallery = (access: ExportAccess) =>
  access.role === 'EDITOR' || access.role === 'ADMIN'

const toExportId = (prefix: string, index: number) =>
  `${prefix}_${String(index + 1).padStart(4, '0')}`

export function safeExportFilename(value: string, fallback = 'tree') {
  const safe = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

  return safe || fallback
}

function createIdMap<T>(items: T[], prefix: string, getId: (item: T) => string) {
  return new Map(items.map((item, index) => [getId(item), toExportId(prefix, index)]))
}

function addUserId(ids: Set<string>, value?: string | null) {
  if (value) ids.add(value)
}

function mapRequired(map: Map<string, string>, value: string) {
  return map.get(value) ?? value
}

function mapOptional(map: Map<string, string>, value?: string | null) {
  return value ? (map.get(value) ?? value) : null
}

function sanitizeExportValue(value: unknown, ids: ExportIds): unknown {
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    return (
      ids.fileKeys.get(value) ??
      ids.nodes.get(value) ??
      ids.edges.get(value) ??
      ids.unions.get(value) ??
      ids.pictures.get(value) ??
      ids.pictureTags.get(value) ??
      ids.accesses.get(value) ??
      ids.activityLogs.get(value) ??
      ids.users.get(value) ??
      (value === ids.sourceTreeId ? ids.tree : value)
    )
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeExportValue(item, ids))
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, sanitizeExportValue(entry, ids)])
  )
}

function publicUser(
  user: { id: string; name: string | null; email?: string | null; image: string | null } | null,
  ids: ExportIds
) {
  if (!user) return null
  return {
    id: mapRequired(ids.users, user.id),
    name: user.name,
    email: user.email ?? undefined,
    image: user.image,
  }
}

function publicPictureMetadata(
  metadata: unknown,
  showMetadata: boolean,
  ids: ExportIds
): PictureMetadata | unknown | null {
  if (!showMetadata) return null
  return sanitizeExportValue(metadata as PictureMetadata | null, ids)
}

function createJsonExportIds(tree: NonNullable<Awaited<ReturnType<typeof getTreeForJsonExport>>>) {
  const users = new Set<string>()

  for (const access of tree.accesses) {
    addUserId(users, access.userId)
    addUserId(users, access.user.id)
  }
  for (const picture of tree.Picture) addUserId(users, picture.uploadedBy)
  for (const log of tree.ActivityLog) {
    addUserId(users, log.createdBy)
    addUserId(users, log.user?.id)
  }
  addUserId(users, tree.note?.updatedById)
  addUserId(users, tree.note?.updatedBy?.id)
  addUserId(users, tree.deletionRequest?.requestedById)
  addUserId(users, tree.deletionRequest?.requestedBy?.id)
  addUserId(users, tree.deletionRequest?.approvedById)
  addUserId(users, tree.deletionRequest?.approvedBy?.id)

  const pictures = createIdMap(tree.Picture, 'picture', (picture) => picture.id)
  const fileKeys = new Map(
    tree.Picture.map((picture, index) => [
      picture.fileKey,
      toGalleryPhotoName(picture, index, mapRequired(pictures, picture.id)),
    ])
  )

  return {
    sourceTreeId: tree.id,
    tree: 'tree_0001',
    deletionRequest: tree.deletionRequest ? 'deletion_request_0001' : undefined,
    nodes: createIdMap(tree.nodes, 'node', (node) => node.id),
    edges: createIdMap(tree.TreeEdge, 'edge', (edge) => edge.id),
    unions: createIdMap(tree.Unions, 'union', (union) => union.id),
    pictures,
    pictureTags: createIdMap(
      tree.Picture.flatMap((picture) => picture.tags),
      'picture_tag',
      (tag) => tag.id
    ),
    accesses: createIdMap(tree.accesses, 'collaborator', (access) => access.id),
    activityLogs: createIdMap(tree.ActivityLog, 'activity', (log) => log.id),
    users: new Map(Array.from(users).map((id, index) => [id, toExportId('user', index)])),
    fileKeys,
  } satisfies ExportIds
}

async function getTreeForJsonExport(treeId: string) {
  return db.tree.findUnique({
    where: { id: treeId },
    include: {
      accesses: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
      deletionRequest: {
        include: {
          requestedBy: { select: { id: true, name: true, email: true, image: true } },
          approvedBy: { select: { id: true, name: true, email: true, image: true } },
        },
      },
      nodes: { orderBy: [{ birthDate: 'asc' }, { createdAt: 'asc' }] },
      TreeEdge: { orderBy: { createdAt: 'asc' } },
      Unions: { orderBy: { createdAt: 'asc' } },
      Picture: {
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        include: {
          tags: {
            include: { node: { select: { id: true, fullName: true, alias: true } } },
          },
        },
      },
      ActivityLog: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, name: true, image: true } } },
      },
      note: {
        include: { updatedBy: { select: { id: true, name: true, image: true } } },
      },
    },
  })
}

async function getReadableTree(slug: string, userId: string) {
  const tree = await db.tree.findFirst({
    where: { slug, accesses: { some: { userId } } },
    select: {
      id: true,
      slug: true,
      name: true,
      newsletter: true,
      createdAt: true,
      updatedAt: true,
      accesses: { where: { userId }, select: { role: true } },
    },
  })

  if (!tree) return null
  const access = tree.accesses[0]
  if (!access) return null
  return { tree, access: { role: access.role as TreeAccessRole } }
}

export async function collectTreeJsonExport(
  slug: string,
  userId: string
): Promise<TreeJsonExportResult> {
  const readable = await getReadableTree(slug, userId)
  if (!readable) return { error: true, status: 404, message: 'error-tree-not-found' }

  const { tree: readableTree, access } = readable
  if (access.role !== 'ADMIN') return { error: true, status: 403, message: 'error-no-permission' }

  const showMetadata = canViewPictureMetadata(access)

  const tree = await getTreeForJsonExport(readableTree.id)

  if (!tree) return { error: true, status: 404, message: 'error-tree-not-found' }

  const ids = createJsonExportIds(tree)

  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: mapRequired(ids.users, userId),
    scope: 'tree',
    tree: {
      id: ids.tree,
      slug: tree.slug,
      name: tree.name,
      newsletter: tree.newsletter,
      createdAt: tree.createdAt,
      updatedAt: tree.updatedAt,
      deletionRequest: tree.deletionRequest
        ? {
            id: ids.deletionRequest,
            requestedById: mapOptional(ids.users, tree.deletionRequest.requestedById),
            requestedBy: publicUser(tree.deletionRequest.requestedBy, ids),
            requestedAt: tree.deletionRequest.requestedAt,
            approvedById: mapOptional(ids.users, tree.deletionRequest.approvedById),
            approvedBy: publicUser(tree.deletionRequest.approvedBy, ids),
            approvedAt: tree.deletionRequest.approvedAt,
          }
        : null,
    },
    collaborators: tree.accesses.map((access) => ({
      id: mapRequired(ids.accesses, access.id),
      userId: mapRequired(ids.users, access.userId),
      role: access.role,
      createdAt: access.createdAt,
      user: publicUser(access.user, ids),
    })),
    nodes: tree.nodes.map((node) => ({
      id: mapRequired(ids.nodes, node.id),
      treeId: ids.tree,
      fullName: node.fullName,
      birthDate: node.birthDate,
      deathDate: node.deathDate,
      gender: node.gender,
      birthPlace: node.birthPlace,
      deathPlace: node.deathPlace,
      biography: node.biography,
      alias: node.alias,
      childOfUnionId: mapOptional(ids.unions, node.childOfUnionId),
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    })),
    edges: tree.TreeEdge.map((edge) => ({
      id: mapRequired(ids.edges, edge.id),
      treeId: ids.tree,
      fromNodeId: mapRequired(ids.nodes, edge.fromNodeId),
      toNodeId: mapRequired(ids.nodes, edge.toNodeId),
      type: edge.type,
      createdAt: edge.createdAt,
    })),
    unions: tree.Unions.map((union) => ({
      id: mapRequired(ids.unions, union.id),
      treeId: ids.tree,
      spouseAId: mapRequired(ids.nodes, union.spouseAId),
      spouseBId: mapOptional(ids.nodes, union.spouseBId),
      marriedAt: union.marriedAt,
      divorcedAt: union.divorcedAt,
      place: union.place,
      createdAt: union.createdAt,
      updatedAt: union.updatedAt,
    })),
    pictures: tree.Picture.map((picture) => ({
      id: mapRequired(ids.pictures, picture.id),
      treeId: ids.tree,
      assetRef: mapRequired(ids.fileKeys, picture.fileKey),
      uploadedBy: mapRequired(ids.users, picture.uploadedBy),
      date: picture.date,
      metadata: publicPictureMetadata(picture.metadata, showMetadata, ids),
      tags: picture.tags.map((tag) => ({
        id: mapRequired(ids.pictureTags, tag.id),
        pictureId: mapRequired(ids.pictures, tag.pictureId),
        nodeId: mapRequired(ids.nodes, tag.nodeId),
        isProfile: tag.isProfile,
        node: {
          id: mapRequired(ids.nodes, tag.node.id),
          fullName: tag.node.fullName,
          alias: tag.node.alias,
        },
      })),
      createdAt: picture.createdAt,
      updatedAt: picture.updatedAt,
    })),
    note: tree.note
      ? {
          id: 'note_0001',
          treeId: ids.tree,
          content: tree.note.content,
          updatedById: mapOptional(ids.users, tree.note.updatedById),
          updatedBy: publicUser(tree.note.updatedBy, ids),
          createdAt: tree.note.createdAt,
          updatedAt: tree.note.updatedAt,
        }
      : null,
    activityLogs: tree.ActivityLog.map((log) => ({
      id: mapRequired(ids.activityLogs, log.id),
      treeId: ids.tree,
      action: log.action,
      entityId: sanitizeExportValue(log.entityId, ids),
      metadata: sanitizeExportValue(log.metadata, ids),
      createdBy: mapOptional(ids.users, log.createdBy),
      user: publicUser(log.user, ids),
      createdAt: log.createdAt,
    })),
    counts: {
      nodes: tree.nodes.length,
      edges: tree.TreeEdge.length,
      unions: tree.Unions.length,
      pictures: tree.Picture.length,
      collaborators: tree.accesses.length,
      activityLogs: tree.ActivityLog.length,
    },
  }

  return {
    error: false,
    filename: `${safeExportFilename(tree.name)}-tree-export.json`,
    payload,
  }
}

async function collectTreeGallery(slug: string, userId: string) {
  const readable = await getReadableTree(slug, userId)
  if (!readable) return null
  if (!canExportGallery(readable.access)) return { forbidden: true as const }

  const pictures = await db.picture.findMany({
    where: { treeId: readable.tree.id },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    include: {
      tags: {
        include: { node: { select: { id: true, fullName: true, alias: true } } },
      },
    },
  })

  return {
    tree: readable.tree,
    access: readable.access,
    pictures: pictures as GalleryPicture[],
    scope: 'tree' as const,
  }
}

async function collectNodeGallery(slug: string, nodeId: string, userId: string) {
  const readable = await getReadableTree(slug, userId)
  if (!readable) return null
  if (!canExportGallery(readable.access)) return { forbidden: true as const }

  const node = await db.treeNode.findFirst({
    where: { id: nodeId, treeId: readable.tree.id },
    select: { id: true, fullName: true, alias: true, treeId: true },
  })

  if (!node) return { nodeNotFound: true as const }

  const pictures = await db.picture.findMany({
    where: { treeId: readable.tree.id, tags: { some: { nodeId } } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    include: {
      tags: {
        include: { node: { select: { id: true, fullName: true, alias: true } } },
      },
    },
  })

  return {
    tree: readable.tree,
    access: readable.access,
    node,
    pictures: pictures as GalleryPicture[],
    scope: 'node' as const,
  }
}

function getPictureExtension(fileKey: string) {
  const ext = fileKey
    .split('/')
    .pop()
    ?.match(/\.([a-zA-Z0-9]+)$/)?.[1]
  return ext ? `.${ext.toLowerCase()}` : '.jpg'
}

function toGalleryPhotoName(
  picture: Pick<GalleryPicture, 'fileKey'>,
  index: number,
  pictureId: string
) {
  return `photos/${String(index + 1).padStart(4, '0')}-${pictureId}${getPictureExtension(picture.fileKey)}`
}

function toAsyncIterable(body: unknown): AsyncIterable<Uint8Array> {
  if (body && typeof body === 'object' && Symbol.asyncIterator in body) {
    return body as AsyncIterable<Uint8Array>
  }

  throw new Error('error-picture-download')
}

function createGalleryExportIds({
  tree,
  node,
  pictures,
}: {
  tree: { id: string }
  node?: { id: string }
  pictures: GalleryPicture[]
}) {
  const nodeIds = new Set<string>()
  if (node) nodeIds.add(node.id)
  for (const picture of pictures) {
    for (const tag of picture.tags) nodeIds.add(tag.nodeId)
  }

  const pictureIds = createIdMap(pictures, 'picture', (picture) => picture.id)
  const fileKeys = new Map(
    pictures.map((picture, index) => [
      picture.fileKey,
      toGalleryPhotoName(picture, index, mapRequired(pictureIds, picture.id)),
    ])
  )

  return {
    sourceTreeId: tree.id,
    tree: 'tree_0001',
    nodes: new Map(Array.from(nodeIds).map((id, index) => [id, toExportId('node', index)])),
    edges: new Map<string, string>(),
    unions: new Map<string, string>(),
    pictures: pictureIds,
    pictureTags: createIdMap(
      pictures.flatMap((picture) => picture.tags),
      'picture_tag',
      (tag) => tag.id
    ),
    accesses: new Map<string, string>(),
    activityLogs: new Map<string, string>(),
    users: new Map<string, string>(),
    fileKeys,
  } satisfies ExportIds
}

function buildGalleryEntries({
  tree,
  access,
  node,
  pictures,
  scope,
}: {
  tree: { id: string; slug: string; name: string }
  access: ExportAccess
  node?: { id: string; fullName: string; alias: string | null }
  pictures: GalleryPicture[]
  scope: 'tree' | 'node'
}): ZipEntry[] {
  const showMetadata = canViewPictureMetadata(access)
  const generatedAt = new Date()
  const ids = createGalleryExportIds({ tree, node, pictures })

  const manifest = {
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    scope,
    tree: {
      id: ids.tree,
      slug: tree.slug,
      name: tree.name,
    },
    node: node
      ? {
          id: mapRequired(ids.nodes, node.id),
          fullName: node.fullName,
          alias: node.alias,
        }
      : null,
    pictures: pictures.map((picture) => ({
      id: mapRequired(ids.pictures, picture.id),
      file: mapRequired(ids.fileKeys, picture.fileKey),
      date: picture.date,
      createdAt: picture.createdAt,
      updatedAt: picture.updatedAt,
      metadata: publicPictureMetadata(picture.metadata, showMetadata, ids),
      tags: picture.tags.map((tag) => ({
        id: mapRequired(ids.pictureTags, tag.id),
        nodeId: mapRequired(ids.nodes, tag.nodeId),
        nodeName: tag.node.fullName,
        nodeAlias: tag.node.alias,
        isProfile: tag.isProfile,
        isExportedNode: node ? tag.nodeId === node.id : undefined,
      })),
    })),
    counts: {
      pictures: pictures.length,
    },
  }

  return [
    {
      name: 'manifest.json',
      source: `${JSON.stringify(manifest, null, 2)}\n`,
      modifiedAt: generatedAt,
    },
    ...pictures.map((picture) => ({
      name: mapRequired(ids.fileKeys, picture.fileKey),
      modifiedAt: picture.updatedAt ?? picture.createdAt,
      source: async () => {
        const object = await getFileFromS3(picture.fileKey)
        return toAsyncIterable(object.Body)
      },
    })),
  ]
}

export async function collectTreeGalleryExport(
  slug: string,
  userId: string
): Promise<GalleryExportResult> {
  if (!env.IMAGES_ENABLED) return { error: true, status: 404, message: 'error-pictures-disabled' }

  const gallery = await collectTreeGallery(slug, userId)
  if (!gallery) return { error: true, status: 404, message: 'error-tree-not-found' }
  if ('forbidden' in gallery) return { error: true, status: 403, message: 'error-no-permission' }

  return {
    error: false,
    filename: `${safeExportFilename(gallery.tree.name)}-gallery.zip`,
    stream: createZipStream(buildGalleryEntries(gallery)),
  }
}

export async function collectNodeGalleryExport(
  slug: string,
  nodeId: string,
  userId: string
): Promise<GalleryExportResult> {
  if (!env.IMAGES_ENABLED) return { error: true, status: 404, message: 'error-pictures-disabled' }

  const gallery = await collectNodeGallery(slug, nodeId, userId)
  if (!gallery) return { error: true, status: 404, message: 'error-tree-not-found' }
  if ('forbidden' in gallery) return { error: true, status: 403, message: 'error-no-permission' }
  if ('nodeNotFound' in gallery)
    return { error: true, status: 404, message: 'error-node-not-found' }

  return {
    error: false,
    filename: `${safeExportFilename(gallery.node.fullName, 'member')}-gallery.zip`,
    stream: createZipStream(buildGalleryEntries(gallery)),
  }
}
