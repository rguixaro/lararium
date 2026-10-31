import { TreeNodeGender, TreeAccessRole, TreeDeletionRequest } from './tree.type'
import { ActivityAction, ActivityLog } from './activity.type'

export interface Milestone {
  id: string
  name: string
  treeName: string
  treeSlug: string
  date: string
  age?: number
  day?: number
  daysUntil?: number
  yearsAgo?: number
  picture?: string | null
  type?: 'birth' | 'death'
}

export interface MilestonesResponse {
  birthdays: Milestone[]
  anniversaries: Milestone[]
  memories: Milestone[]
}

export interface Highlight {
  id: string
  name: string
  treeName: string
  treeSlug: string
  gender?: TreeNodeGender
  addedAt?: string
  birthDate?: string
  birthYear?: number
  childrenCount?: number
  memberCount?: number
  photoCount?: number
  picture?: string | null
}

export interface HighlightsResponse {
  oldest: Highlight | null
  youngest: Highlight | null
  largest: Highlight | null
  mostPhotos: Highlight | null
  mostMembers: Highlight | null
}

export type HighlightCard = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  title: string
  value: string
  subtitle: string
  treeName: string
  treeSlug: string
  picture?: string | null
}

export interface MemberSummary {
  id: string
  name: string
  picture?: string | null
  birthDate?: Date | null
  deathDate?: Date | null
  gender?: TreeNodeGender
}

export interface TreeInfoUpcomingBirthday {
  id: string
  name: string
  date: Date
  age: number
  daysUntil: number
  picture?: string | null
}

export interface TreeInfoUpcomingAnniversary {
  id: string
  name: string
  type: 'birth' | 'death'
  date: Date
  yearsAgo: number
  picture?: string | null
}

export interface TreeInfoMemory {
  id: string
  name: string
  date: Date
  yearsAgo: number
  picture?: string | null
}

export interface TreeInfo {
  tree: {
    id: string
    slug: string
    name: string
    createdAt: Date
    updatedAt: Date
    newsletter: boolean
    ageInDays: number
    lastActivityAt: Date | null
    deletionRequest: TreeDeletionRequest | null
  }
  overview: {
    totalMembers: number
    totalEdges: number
    totalPictures: number
    totalCollaborators: number
  }
  demographics: {
    genderBreakdown: Record<TreeNodeGender, number>
    livingCount: number
    deceasedCount: number
    withBirthDate: number
    withDeathDate: number
    withBiography: number
    withProfilePicture: number
    withBirthPlace: number
    withGender: number
    avgAgeLiving: number | null
    avgAgeAtDeath: number | null
  }
  generations: {
    depth: number
    spanYears: number | null
    oldestMember: MemberSummary | null
    youngestMember: MemberSummary | null
  }
  relationships: {
    parentChildPairs: number
    spousePairs: number
    couplePairs: number
    isolatedNodes: number
    avgChildrenPerParent: number | null
    largestFamily: (MemberSummary & { childrenCount: number }) | null
    topFamilies: Array<MemberSummary & { childrenCount: number }>
  }
  lifeStats: {
    longestLived: (MemberSummary & { ageAtDeath: number }) | null
    topLongestLived: Array<MemberSummary & { ageAtDeath: number }>
    ageAtDeathBuckets: Array<{ label: string; count: number }>
    birthDecadeBuckets: Array<{ decade: string; count: number }>
  }
  places: {
    topBirthPlaces: Array<{ place: string; count: number }>
    topDeathPlaces: Array<{ place: string; count: number }>
    uniqueBirthPlaces: number
    uniqueDeathPlaces: number
  }
  pictures: {
    total: number
    withDate: number
    withGps: number
    earliestDate: Date | null
    mostPhotographed: Array<MemberSummary & { photoCount: number }>
    untaggedPeople: number
  }
  upcomingEvents: {
    birthdays: TreeInfoUpcomingBirthday[]
    anniversaries: TreeInfoUpcomingAnniversary[]
    memoriesThisWeek: TreeInfoMemory[]
  }
  collaborators: {
    byRole: Record<TreeAccessRole, number>
    list: Array<{
      id: string
      name: string | null
      email: string | null
      image: string | null
      role: TreeAccessRole
      joinedAt: Date
    }>
  }
  activity: {
    totalLogs: number
    recentLogs: ActivityLog[]
    topContributors: Array<{
      userId: string
      name: string | null
      image: string | null
      count: number
    }>
    actionBreakdown: Record<ActivityAction, number>
  }
  highlights: {
    oldestAncestor: MemberSummary | null
    youngestMember: MemberSummary | null
    largestBranch: (MemberSummary & { childrenCount: number }) | null
    mostPhotographed: (MemberSummary & { photoCount: number }) | null
  }
}

export type TreeInfoResult = TreeInfo | { error: true; message: string }
