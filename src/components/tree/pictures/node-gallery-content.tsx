'use client'

import React from 'react'
import { useLocale } from 'next-intl'
import { Download, LoaderIcon, Maximize, Menu, X } from 'lucide-react'

import { Icon } from '@/components/trees/icon'
import { getImageAssetUrl, publicImagesEnabled } from '@/config/images'

import { Button, TypographyH5 } from '@/ui'

import { cn } from '@/utils'

import { Picture } from '@/types'

import { GalleryImage } from './gallery-image'

interface NodeGalleryContentProps {
  readonly: boolean
  pictures: Picture[]
  loadingPictures: boolean
  loading: boolean
  canExportGallery: boolean
  errorGalleryPicture: { [key: string]: boolean }
  tappedImageId: string | null
  isMobile: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  onTappedImageChange: (pictureId: string | null) => void
  onPictureMenuOpen: (e: React.MouseEvent, picture: Picture) => void
  onPictureFullscreen: (picture: Picture) => void
  onGalleryPictureError: (pictureId: string) => void
  galleryExportHref?: string
  onClose?: () => void
  t_trees: (key: string) => string
}

export function NodeGalleryContent({
  readonly,
  pictures,
  loadingPictures,
  loading,
  canExportGallery,
  errorGalleryPicture,
  tappedImageId,
  isMobile,
  fileInputRef,
  onFileChange,
  onTappedImageChange,
  onPictureMenuOpen,
  onPictureFullscreen,
  onGalleryPictureError,
  galleryExportHref,
  onClose,
  t_trees,
}: NodeGalleryContentProps) {
  const locale = useLocale()
  const canUploadPictures = publicImagesEnabled && !readonly
  const canExportPictures = publicImagesEnabled && canExportGallery

  if (isMobile) {
    return (
      <div
        className={cn('bg-ocean-400 text-pale-ocean shadow-center-sm h-full flex-col rounded-xl')}
      >
        <div className="styled-scrollbar flex w-full flex-1 flex-col overflow-y-auto px-6 pt-2 pb-6 text-start">
          <div className="mt-4 mb-6 flex flex-col items-start gap-x-3 gap-y-2 text-center">
            <p>{t_trees('node-gallery-description')} </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 self-center">
              {canUploadPictures && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="hover:text-ocean-50 bg-ocean-300 cursor-pointer"
                >
                  <span className="text-sm font-bold">{t_trees('node-gallery-upload')}</span>
                </Button>
              )}
              {canExportPictures && galleryExportHref && pictures.length > 0 && (
                <Button
                  asChild
                  variant="ghost"
                  className="hover:text-ocean-50 bg-ocean-300 cursor-pointer"
                >
                  <a href={galleryExportHref}>
                    <Download size={16} />
                    <span className="text-sm font-bold">{t_trees('node-gallery-download')}</span>
                  </a>
                </Button>
              )}
            </div>
          </div>
          {canUploadPictures && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="hidden"
            />
          )}
          {loadingPictures ? (
            <div className="flex items-center justify-center py-8">
              <LoaderIcon size={24} className="text-pale-ocean animate-spin" />
            </div>
          ) : pictures.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center space-y-5 pb-24 text-center">
              <p>{t_trees('node-gallery-empty')}</p>
            </div>
          ) : (
            <div className="columns-[124px] gap-2">
              {pictures.map((picture, idx) => (
                <div
                  key={picture.id}
                  className={cn(
                    'group shadow-center relative mb-2 shrink-0 cursor-pointer break-inside-avoid',
                    'bg-ocean-300 text-ocean-200 rounded-lg'
                  )}
                  onClick={() =>
                    onTappedImageChange(tappedImageId === picture.id ? null : picture.id)
                  }
                >
                  <GalleryImage
                    src={getImageAssetUrl(picture.fileKey)}
                    alt={`Picture ${idx + 1}`}
                    className="min-h-[124px] w-full"
                    hasError={errorGalleryPicture[picture.id]}
                    onError={() => onGalleryPictureError(picture.id)}
                  />
                  <div
                    className={cn(
                      'bg-ocean-500 pointer-events-none absolute inset-0 rounded-lg transition-opacity duration-300',
                      tappedImageId === picture.id ? 'opacity-20' : 'opacity-0'
                    )}
                  />
                  <div
                    className={cn(
                      'pointer-events-none absolute top-0 right-0 mt-2 mr-2 flex flex-col gap-2 transition-opacity duration-300',
                      tappedImageId === picture.id
                        ? 'pointer-events-auto opacity-100'
                        : 'pointer-events-none opacity-0'
                    )}
                  >
                    <div className="flex items-end justify-center gap-2 rounded">
                      <button
                        type="button"
                        onClick={(_) => onPictureFullscreen(picture)}
                        className="bg-pale-ocean text-ocean-400 shadow-center cursor-pointer rounded-lg p-2 transition-all duration-200"
                      >
                        <Maximize size={18} />
                      </button>
                    </div>
                    <div className="flex items-end justify-center gap-2 rounded">
                      <button
                        type="button"
                        onClick={(e) => onPictureMenuOpen(e, picture)}
                        className="bg-pale-ocean text-ocean-400 shadow-center cursor-pointer rounded-lg p-2 transition-all duration-200"
                      >
                        <Menu size={18} />
                      </button>
                    </div>
                  </div>
                  <div
                    className={cn(
                      'bg-pale-ocean text-ocean-400 pointer-events-none absolute right-0 bottom-0 left-0 mx-2 mb-2 flex justify-between rounded px-3 py-px text-sm opacity-0',
                      'shadow-center-sm transition-opacity duration-300',
                      tappedImageId === picture.id ? 'opacity-100' : 'opacity-0'
                    )}
                  >
                    <span>
                      {picture.date ? new Date(picture.date).toLocaleDateString(locale) : null}
                    </span>
                    <div className="flex items-center space-x-1">
                      <Icon size={12} type="human" className="stroke-ocean-400" />
                      <span>{picture.tags?.length}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="styled-scrollbar flex w-full flex-1 flex-col overflow-y-auto px-6 pt-2 pb-6 text-start">
      <div className="mt-4 mb-6 flex flex-col items-start gap-x-3 gap-y-2">
        <div className="flex w-full items-center justify-between space-x-3">
          <TypographyH5>{t_trees('node-gallery')}</TypographyH5>
          <button
            onClick={onClose}
            type="button"
            className="hover:bg-ocean-200/50 self-start rounded p-1 transition-colors duration-300"
          >
            <X size={24} className="text-pale-ocean" />
          </button>
        </div>
        <p>{t_trees('node-gallery-description')} </p>
        <div className="mt-5 flex flex-wrap items-center gap-2 self-center">
          {canUploadPictures && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="hover:text-ocean-50 bg-ocean-300 cursor-pointer"
            >
              <span className="text-sm font-bold">{t_trees('node-gallery-upload')}</span>
            </Button>
          )}
          {canExportPictures && galleryExportHref && pictures.length > 0 && (
            <Button
              asChild
              variant="ghost"
              className="hover:text-ocean-50 bg-ocean-300 cursor-pointer"
            >
              <a href={galleryExportHref}>
                <Download size={16} />
                <span className="text-sm font-bold">{t_trees('node-gallery-download')}</span>
              </a>
            </Button>
          )}
        </div>
      </div>
      {canUploadPictures && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFileChange}
          className="hidden"
        />
      )}
      {loadingPictures ? (
        <div className="flex items-center justify-center py-8">
          <LoaderIcon size={24} className="text-pale-ocean animate-spin" />
        </div>
      ) : pictures.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center space-y-5 pb-24 text-center">
          <p>{t_trees('node-gallery-empty')}</p>
        </div>
      ) : (
        <div className="columns-[124px] gap-2 sm:columns-[124px] xl:columns-3xs">
          {pictures.map((picture, idx) => (
            <div
              key={picture.id}
              className={cn(
                'group shadow-center-sm relative mb-2 shrink-0 cursor-pointer break-inside-avoid',
                'bg-ocean-300 text-ocean-200 rounded-lg'
              )}
            >
              <GalleryImage
                src={getImageAssetUrl(picture.fileKey)}
                alt={`Picture ${idx + 1}`}
                className="shadow-center-sm bg-ocean-300 mb-2 min-h-[124px] w-full"
                hasError={errorGalleryPicture[picture.id]}
                onError={() => onGalleryPictureError(picture.id)}
              />
              <div className="bg-ocean-500 pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity duration-300 group-hover:opacity-20" />
              <div className="pointer-events-none absolute top-0 right-0 mt-2 mr-2 flex flex-col gap-2">
                <div
                  className={cn(
                    'flex items-end justify-center gap-2 rounded opacity-0',
                    'transition-opacity duration-300 group-hover:pointer-events-auto group-hover:opacity-100'
                  )}
                >
                  <button
                    type="button"
                    onClick={(_) => onPictureFullscreen(picture)}
                    className="bg-pale-ocean text-ocean-400 shadow-center-sm cursor-pointer rounded-lg p-2 transition-all duration-200"
                  >
                    <Maximize size={18} />
                  </button>
                </div>
                <div
                  className={cn(
                    'flex items-end justify-center gap-2 rounded opacity-0',
                    'transition-opacity duration-300 group-hover:pointer-events-auto group-hover:opacity-100'
                  )}
                >
                  <button
                    type="button"
                    onClick={(e) => onPictureMenuOpen(e, picture)}
                    className="bg-pale-ocean text-ocean-400 shadow-center-sm cursor-pointer rounded-lg p-2 transition-all duration-200"
                  >
                    <Menu size={18} />
                  </button>
                </div>
              </div>

              <div
                className={cn(
                  'bg-pale-ocean text-ocean-400 pointer-events-none absolute right-0 bottom-0 left-0 mx-2 mb-2 flex justify-between rounded px-3 py-px text-sm opacity-0',
                  'shadow-center-sm transition-opacity duration-300 group-hover:opacity-100'
                )}
              >
                <span>
                  {picture.date ? new Date(picture.date).toLocaleDateString(locale) : null}
                </span>
                <div className="flex items-center space-x-1">
                  <Icon size={12} type="human" className="stroke-ocean-400" />
                  <span>{picture.tags?.length}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
