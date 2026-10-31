import { icons, LucideIcon } from 'lucide-react'

import { TreeAccessRole } from '@/types'

type BuiltInType = TreeAccessRole | 'Enabled' | 'Disabled' | string

type IconProps = {
  type: BuiltInType
  className?: string
  color?: string
  size?: number
  customIcons?: Record<string, keyof typeof icons>
}

const defaultIconsByTreeType: Record<string, keyof typeof icons> = {
  human: 'UsersRound',
}

const defaultIconsByUserRole: Record<string, keyof typeof icons> = {
  admin: 'ShieldCheck',
  editor: 'Pencil',
  viewer: 'Eye',
}

const otherDefaultIcons: Record<string, keyof typeof icons> = {
  enabled: 'Mails',
  disabled: 'X',
  ur: 'Languages',
  en: 'Globe',
}

export const Icon: React.FC<IconProps> = ({
  type,
  className,
  color = '#78a9af',
  size = 18,
  customIcons = {},
}) => {
  const key = type?.toLowerCase() || ''

  const iconName =
    customIcons[key] ||
    defaultIconsByTreeType[key] ||
    defaultIconsByUserRole[key] ||
    otherDefaultIcons[key] ||
    'Globe'

  const LucideIcon = (icons[iconName as keyof typeof icons] || icons.Globe) as LucideIcon

  return <LucideIcon color={color} size={size} className={className} />
}
