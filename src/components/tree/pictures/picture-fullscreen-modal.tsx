'use client'

import { useState } from 'react'
import { Minimize } from 'lucide-react'

import { Icon } from '@/components/trees/icon'

import { Picture } from '@/ui'

import { Picture as PictureType } from '@/types'

import { cn } from '@/utils'

interface PictureFullscreenModalProps {
  picture: PictureType
  onClose: () => void
}

export function PictureFullscreenModal({
  picture,
  onClose,
}: PictureFullscreenModalProps) {
  const [isTapped, setIsTapped] = useState(false)

  if (!picture) return null

  return (
    <div
      className="bg-ocean-500 fixed inset-0 z-60 max-h-screen max-w-screen backdrop-blur-xs"
      onClick={() => setIsTapped(!isTapped)}
    >
      <Picture
        fileKey={picture.fileKey}
        classNameContainer="h-full w-full border-0 rounded-none"
        classNameImage="object-contain"
        animated={false}
      />
      <div
        className={cn(
          'pointer-events-none absolute top-8 right-8 flex flex-col gap-2 transition-opacity duration-300',
          isTapped ? 'pointer-events-auto opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
      >
        <button
          type="button"
          onClick={onClose}
          className="bg-pale-ocean text-ocean-400 shadow-center cursor-pointer rounded-lg p-2 transition-all duration-200"
        >
          <Minimize size={24} />
        </button>
      </div>
      <div
        className={cn(
          'bg-pale-ocean text-ocean-400 absolute right-8 bottom-24 flex flex-col justify-start items-start px-3 rounded-lg w-44 py-3',
          'shadow-center-sm transition-opacity duration-300 select-none opacity-0 pointer-events-none',
          isTapped ? 'opacity-100' : 'opacity-0'
        )}
      >
        {picture.tags?.map((tag, index) => (
          <div key={index}>
            {`${tag.node?.fullName} ${tag.node?.alias ? `(${tag.node.alias})` : ''}`}
          </div>
        ))}
      </div>
      <div
        className={cn(
          'bg-pale-ocean text-ocean-400 absolute right-8 bottom-8 flex justify-between items-center px-3 rounded-lg w-44 h-12',
          'shadow-center-sm transition-opacity duration-300 select-none opacity-0 pointer-events-none',
          isTapped ? 'opacity-100' : 'opacity-0'
        )}
      >
        <span>{picture.date?.toLocaleDateString()}</span>
        <div className="flex cursor-pointer items-center space-x-2">
          <Icon size={24} type="human" className="stroke-ocean-400" />
          <span>{picture.tags?.length}</span>
        </div>
      </div>
    </div>
  )
}
