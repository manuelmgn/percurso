import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/i18n'
import { api } from '@/api'
import { getErrorMessage } from '@/hooks/useApiResource'

interface NotesEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

const toolbarButtonClass =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-sm font-medium text-muted transition-colors hover:bg-line/50 hover:text-ink disabled:opacity-50 dark:hover:bg-fill/60'

const toolbarIconButtonClass = `${toolbarButtonClass} w-8 px-0`

// Keep in sync with ALLOWED_FONT_FACES in backend/app/sanitize.py.
const FONT_OPTIONS = [
  { label: 'Arial', value: 'Arial' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Courier New', value: 'Courier New' },
  { label: 'Verdana', value: 'Verdana' },
]

// Extracts the video ID from the usual YouTube URL shapes.
function youtubeVideoId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
  )
  return match ? match[1] : null
}

// Lightweight contentEditable-based rich text editor (no external libs).
// Controlled via innerHTML: the parent owns the HTML string.
export function NotesEditor({ value, onChange, placeholder }: NotesEditorProps) {
  const { t } = useTranslation()
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Keep the DOM in sync when the value changes from outside (e.g. initial load).
  useEffect(() => {
    const el = editorRef.current
    if (el && el.innerHTML !== value) {
      el.innerHTML = value
    }
  }, [value])

  const handleInput = () => {
    onChange(editorRef.current?.innerHTML ?? '')
  }

  const exec = (command: string, commandValue?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, commandValue)
    handleInput()
  }

  const handleLink = () => {
    const url = window.prompt(t('notesEditor.linkUrl'))
    if (!url) return
    exec('createLink', url)
  }

  const handleFontChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const font = e.target.value
    e.target.value = ''
    if (!font) return
    exec('fontName', font)
  }

  const handleVideo = () => {
    const url = window.prompt(t('notesEditor.videoUrl'))
    if (!url) return
    const videoId = youtubeVideoId(url.trim())
    if (!videoId) {
      setUploadError(t('notesEditor.invalidYoutubeUrl'))
      return
    }
    setUploadError('')
    editorRef.current?.focus()
    document.execCommand(
      'insertHTML',
      false,
      `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}" title="${t('notesEditor.videoTitle')}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen=""></iframe><p><br></p>`
    )
    handleInput()
  }

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadError('')
    setIsUploading(true)
    try {
      const image = await api.images.upload(file)
      editorRef.current?.focus()
      document.execCommand('insertHTML', false, `<img src="${image.url}" loading="lazy" alt="">`)
      handleInput()
    } catch (err) {
      setUploadError(getErrorMessage(err, t('notesEditor.uploadError')))
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface transition-colors focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-fill/60 px-2 py-1.5 dark:bg-fill/40">
        <button type="button" onClick={() => exec('bold')} className={`${toolbarButtonClass} font-bold`} title={t('notesEditor.bold')} aria-label={t('notesEditor.bold')}>
          B
        </button>
        <button type="button" onClick={() => exec('italic')} className={`${toolbarButtonClass} italic`} title={t('notesEditor.italic')} aria-label={t('notesEditor.italic')}>
          I
        </button>
        <button type="button" onClick={() => exec('underline')} className={`${toolbarButtonClass} underline`} title={t('notesEditor.underline')} aria-label={t('notesEditor.underline')}>
          U
        </button>
        <button type="button" onClick={() => exec('strikeThrough')} className={`${toolbarButtonClass} line-through`} title={t('notesEditor.strikethrough')} aria-label={t('notesEditor.strikethrough')}>
          S
        </button>
        <button type="button" onClick={() => exec('formatBlock', 'h2')} className={toolbarButtonClass} title={t('notesEditor.heading')} aria-label={t('notesEditor.heading')}>
          H2
        </button>
        <button type="button" onClick={() => exec('formatBlock', 'h3')} className={toolbarButtonClass} title={t('notesEditor.subheading')} aria-label={t('notesEditor.subheading')}>
          H3
        </button>
        <button type="button" onClick={() => exec('formatBlock', 'p')} className={toolbarButtonClass} title={t('notesEditor.paragraph')} aria-label={t('notesEditor.paragraph')}>
          ¶
        </button>
        <select
          onChange={handleFontChange}
          defaultValue=""
          className="input ml-1 h-8 w-auto py-0 pl-3 pr-8 text-xs"
          title={t('notesEditor.font')}
          aria-label={t('notesEditor.font')}
        >
          <option value="" disabled>
            {t('notesEditor.fontPlaceholder')}
          </option>
          {FONT_OPTIONS.map((font) => (
            <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
              {font.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => exec('formatBlock', 'blockquote')}
          className={toolbarIconButtonClass}
          title={t('notesEditor.quote')}
          aria-label={t('notesEditor.quote')}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M6 7h4v4c0 3-1.5 5-4 6v-2c1.2-.6 2-1.7 2-3H6V7zm8 0h4v4c0 3-1.5 5-4 6v-2c1.2-.6 2-1.7 2-3h-2V7z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => exec('insertUnorderedList')}
          className={toolbarIconButtonClass}
          title={t('notesEditor.bulletedList')}
          aria-label={t('notesEditor.bulletedList')}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
            <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
            <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
            <line x1="9" y1="6" x2="21" y2="6" />
            <line x1="9" y1="12" x2="21" y2="12" />
            <line x1="9" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => exec('insertOrderedList')}
          className={toolbarIconButtonClass}
          title={t('notesEditor.numberedList')}
          aria-label={t('notesEditor.numberedList')}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="10" y1="6" x2="21" y2="6" />
            <line x1="10" y1="12" x2="21" y2="12" />
            <line x1="10" y1="18" x2="21" y2="18" />
            <text x="3" y="8" fontSize="8" fill="currentColor" stroke="none">1</text>
            <text x="3" y="14" fontSize="8" fill="currentColor" stroke="none">2</text>
            <text x="3" y="20" fontSize="8" fill="currentColor" stroke="none">3</text>
          </svg>
        </button>
        <button
          type="button"
          onClick={handleLink}
          className={toolbarIconButtonClass}
          title={t('notesEditor.link')}
          aria-label={t('notesEditor.link')}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className={toolbarIconButtonClass}
          title={t('notesEditor.image')}
          aria-label={t('notesEditor.image')}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleVideo}
          className={toolbarIconButtonClass}
          title={t('notesEditor.video')}
          aria-label={t('notesEditor.video')}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="3" ry="3" />
            <path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => exec('removeFormat')}
          className={toolbarIconButtonClass}
          title={t('notesEditor.clearFormatting')}
          aria-label={t('notesEditor.clearFormatting')}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20h16" />
            <path d="M6 16l6-12 2.5 5" />
            <path d="M9.5 12h5" />
            <path d="M18 14l4 4m0-4l-4 4" />
          </svg>
        </button>
        {isUploading && (
          <span className="ml-2 text-xs text-muted">{t('notesEditor.uploading')}</span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={handleImageFile}
          aria-hidden="true"
        />
      </div>
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        data-placeholder={placeholder || t('notesEditor.placeholder')}
        className="notes-content min-h-[120px] px-4 py-3 text-sm text-ink outline-none empty:before:text-muted empty:before:content-[attr(data-placeholder)]"
        role="textbox"
        aria-multiline="true"
        aria-label={t('notesEditor.aria')}
      />
      {uploadError && (
        <p className="border-t border-line px-4 py-2 text-xs text-red-700 dark:text-red-300">
          {uploadError}
        </p>
      )}
    </div>
  )
}
