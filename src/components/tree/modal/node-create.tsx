'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { LoaderIcon, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { UseFormReturn } from 'react-hook-form'
import { type z } from 'zod'

import { CreateTreeNodeSchema } from '@/server/schemas'

import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  TypographyH4,
  TypographyH5,
} from '@/ui'

import { checkKeyDown, cn } from '@/utils'

interface NodeCreateModalProps {
  showModal: boolean
  form: UseFormReturn<z.infer<typeof CreateTreeNodeSchema>>
  onCreate: (values: z.infer<typeof CreateTreeNodeSchema>) => Promise<void>
  onClose: () => void
}

export function NodeCreateModal({ showModal, form, onCreate, onClose }: NodeCreateModalProps) {
  const t_common = useTranslations('common')
  const t_trees = useTranslations('trees')

  const [loading, setLoading] = useState(false)

  const [modalHeight, setModalHeight] = useState(90)
  const [isDragging, setIsDragging] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, startHeight: 0 })

  /**
   * Handle form submission
   */
  const submit = form.handleSubmit(async (values) => {
    setLoading(true)
    await onCreate(values)
    setLoading(false)
  })

  /**
   * Effect to check if the device is mobile based on window width
   */
  useEffect(() => {
    if (typeof window === 'undefined') return

    const checkMobile = () => setIsMobile(window.innerWidth < 640)

    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  /**
   * Handle drag start for mobile modal resizing
   */
  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isMobile) return

      e.preventDefault()
      setIsDragging(true)

      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

      dragStartRef.current = { x: 0, y: clientY, startHeight: modalHeight }
    },
    [modalHeight, isMobile]
  )

  /**
   * Handle drag move for mobile modal resizing
   */
  const handleDragMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDragging || !isMobile) return

      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const deltaY = clientY - dragStartRef.current.y

      const heightDelta = -(deltaY / window.innerHeight) * 100
      const newHeight = Math.min(95, Math.max(30, dragStartRef.current.startHeight + heightDelta))
      setModalHeight(newHeight)
    },
    [isDragging, isMobile]
  )

  /**
   * Handle drag end for mobile modal resizing
   */
  const handleDragEnd = useCallback(() => setIsDragging(false), [])

  /**
   * Effect to handle adding/removing event listeners for dragging on mobile modal resizing
   */
  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e: MouseEvent) => handleDragMove(e)
      const handleTouchMove = (e: TouchEvent) => handleDragMove(e)
      const handleMouseUp = () => handleDragEnd()
      const handleTouchEnd = () => handleDragEnd()

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('touchmove', handleTouchMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.addEventListener('touchend', handleTouchEnd)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [isDragging, handleDragMove, handleDragEnd])

  /**
   * Effect to disable background scrolling when modal is open
   */
  useEffect(() => {
    const html = document.documentElement
    const body = document.body

    if (showModal) {
      const originalHtmlOverflow = html.style.overflow
      const originalBodyOverflow = body.style.overflow

      html.style.overflow = 'hidden'
      body.style.overflow = 'hidden'

      return () => {
        html.style.overflow = originalHtmlOverflow
        body.style.overflow = originalBodyOverflow
      }
    }
  }, [showModal])

  /**
   * Effect to reset form when modal is closed
   */
  useEffect(() => {
    if (!showModal) {
      form.reset()
      setLoading(false)
    }
  }, [showModal, form])

  return (
    <>
      <div
        className={cn(
          'bg-ocean-100/50 fixed inset-0 z-50 backdrop-blur-xs transition-opacity duration-300',
          showModal ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
      />
      <div
        dir="ltr"
        className={cn(
          'text-ocean-400 fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out sm:top-0 sm:right-0 sm:h-full',
          isDragging ? 'transition-none' : 'transition-transform duration-300',
          isMobile ? 'border-t-8' : 'border-l-8',
          showModal
            ? 'border-ocean-200 translate-y-0 sm:translate-x-3/5 sm:translate-y-0 md:translate-x-3/5 lg:translate-x-3/5 xl:translate-x-2/3 2xl:translate-x-4/5'
            : 'translate-y-full sm:translate-x-full sm:translate-y-0'
        )}
        style={{
          height: isMobile ? `${modalHeight}vh` : '100vh',
          transform: showModal
            ? !isMobile
              ? ''
              : 'translateY(0)'
            : !isMobile
              ? ''
              : 'translateY(100%)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Form {...form}>
          <form
            onSubmit={submit}
            onKeyDown={(e) => checkKeyDown(e)}
            className="flex h-full w-full flex-col sm:w-2/5 md:w-2/5 lg:w-2/5 xl:w-1/3 2xl:w-1/5"
          >
            <div className="bg-ocean-50 shadow-center-sm flex h-full flex-col overflow-hidden sm:flex sm:flex-row">
              <div
                className="flex shrink-0 cursor-row-resize justify-center pt-3 pb-2 select-none sm:hidden"
                onMouseDown={handleDragStart}
                onTouchStart={(e) => {
                  e.stopPropagation()
                  handleDragStart(e)
                }}
              >
                <div
                  className={cn(
                    'bg-ocean-100 h-1.5 w-12 rounded-full transition-colors',
                    isDragging ? 'bg-ocean-200' : 'hover:bg-ocean-200'
                  )}
                />
              </div>
              <div
                className="styled-scrollbar w-full flex-1 overflow-y-auto px-6 pt-2 pb-6 text-start"
                style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
              >
                <div className="mb-6 flex items-start justify-between">
                  <div className="flex flex-col">
                    <TypographyH4 className="mt-4">{t_trees('node-new')}</TypographyH4>
                    <p>{t_trees('node-new-description')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="hover:bg-ocean-200/15 rounded p-1 transition-colors duration-300"
                  >
                    <X size={24} className="text-ocean-200" />
                  </button>
                </div>

                <TypographyH5 className="mt-5">{t_trees('node-general-info')}</TypographyH5>
                <div className="border-ocean-200/50 shadow-center bg-pale-ocean mb-2 flex-col items-start rounded-xl border-2 px-3 py-2 text-left">
                  {/* Full Name */}
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem className="w-fit">
                        <FormLabel>{`${t_trees('node-fullname')}*`}</FormLabel>
                        <FormControl>
                          <div className="py-2">
                            <Input
                              {...field}
                              autoComplete="off"
                              placeholder={t_trees('node-fullname')}
                              disabled={loading}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="married"
                    render={({ field }) => (
                      <FormItem className="mt-3 flex flex-row items-center gap-2">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value ?? false}
                            onChange={(e) => field.onChange(e.target.checked)}
                            disabled={loading}
                          />
                        </FormControl>
                        <FormLabel className="mb-0">{t_trees('node-married')}</FormLabel>
                      </FormItem>
                    )}
                  />

                  {form.watch('married') && (
                    <FormField
                      control={form.control}
                      name="spouseName"
                      render={({ field }) => (
                        <FormItem className="mt-3 w-fit">
                          <FormLabel>{t_trees('node-spouse-name')}</FormLabel>
                          <FormControl>
                            <div className="py-2">
                              <Input
                                {...field}
                                value={field.value ?? ''}
                                autoComplete="off"
                                placeholder={t_trees('node-spouse-name')}
                                disabled={loading}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <div className="bg-ocean-200/15 mx-auto my-3 h-1 w-full rounded" />

                  {/* Serving As */}
                  <FormField
                    control={form.control}
                    name="servingAs"
                    render={({ field }) => (
                      <FormItem className="w-fit">
                        <FormLabel>{t_trees('node-serving-as')}</FormLabel>
                        <FormControl>
                          <div className="py-2">
                            <Input
                              {...field}
                              value={field.value ?? ''}
                              autoComplete="off"
                              placeholder={t_trees('node-serving-as')}
                              disabled={loading}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="mt-6 flex gap-3">
                  <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
                    <span className="text-sm font-bold">{t_common('cancel')}</span>
                  </Button>
                  <Button type="submit" disabled={loading}>
                    <div className="flex items-center space-x-3">
                      {loading && <LoaderIcon size={16} className="animate-spin" />}
                      <span className="text-sm font-bold">
                        {loading ? t_common('creating') : t_common('create')}
                      </span>
                    </div>
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </>
  )
}
