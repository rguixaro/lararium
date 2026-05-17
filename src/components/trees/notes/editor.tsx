'use client'

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { NotebookPen, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import { updateTreeNote } from '@/server/actions'
import { MAX_TREE_NOTE_LENGTH } from '@/server/schemas'

import { cn } from '@/utils'

interface TreeNotesEditorProps {
  treeId: string
  initialContent: string
  canEdit: boolean
}

export function TreeNotesEditor({ treeId, initialContent, canEdit }: TreeNotesEditorProps) {
  const router = useRouter()
  const t_notes = useTranslations('notes')
  const t_errors = useTranslations('errors')

  const [content, setContent] = useState(initialContent)
  const [savedContent, setSavedContent] = useState(initialContent)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isDirty = content !== savedContent
  const isTooLong = content.length > MAX_TREE_NOTE_LENGTH
  const canSubmit = canEdit && isDirty && !isTooLong && !isPending

  /** Autoresize the textarea to fit its content. */
  useLayoutEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
  }, [content])

  /** Warn if the user navigates away with unsaved changes. */
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Chrome requires returnValue to be set.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const handleSave = () => {
    if (!canSubmit) return
    startTransition(async () => {
      const result = await updateTreeNote({ treeId, content })
      if (result.error) {
        toast.error(t_errors(result.message ?? 'error'))
        return
      }
      setSavedContent(content)
      toast.success(t_notes('saved'))
      router.refresh()
    })
  }

  /** ⌘/Ctrl + Enter to save. */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  // Read-only branch (VIEWER).
  if (!canEdit) {
    if (!initialContent.trim()) {
      return (
        <div className="text-ocean-300 flex flex-col items-center justify-center py-16 text-center">
          <div className="bg-ocean-100/60 mb-4 rounded-full p-4">
            <NotebookPen size={28} className="stroke-ocean-300" />
          </div>
          <p className="text-sm italic">{t_notes('empty-viewer')}</p>
        </div>
      )
    }
    return (
      <div className="text-ocean-400 bg-pale-ocean shadow-center-sm rounded-xl p-5 text-sm leading-relaxed whitespace-pre-wrap">
        {initialContent}
      </div>
    )
  }

  // Edit branch (EDITOR/ADMIN).
  return (
    <div className="flex flex-col gap-3">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t_notes('empty-editor-placeholder')}
        rows={8}
        className={cn(
          'bg-pale-ocean text-ocean-400 shadow-center-sm w-full resize-none rounded-xl p-5 text-sm leading-relaxed',
          'placeholder:text-ocean-200 focus:outline-none',
          'border-2',
          isTooLong ? 'border-red-300' : 'border-transparent focus:border-ocean-200'
        )}
        aria-label={t_notes('title')}
      />

      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            'text-xs',
            isTooLong ? 'font-semibold text-red-500' : 'text-ocean-300'
          )}
        >
          {t_notes('char-counter', { count: content.length, max: MAX_TREE_NOTE_LENGTH })}
        </span>

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSubmit}
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors duration-200',
            canSubmit
              ? 'bg-ocean-200 hover:bg-ocean-300 shadow-center-sm text-neutral-50'
              : 'bg-ocean-100/60 text-ocean-300 cursor-not-allowed'
          )}
        >
          <Save size={16} />
          {isPending ? t_notes('saving') : t_notes('save')}
        </button>
      </div>
    </div>
  )
}
