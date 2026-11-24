import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/i18n'

interface DateInputProps {
  id?: string
  /** ISO date (YYYY-MM-DD) or '' when empty/incomplete/invalid. */
  value: string
  onChange: (iso: string) => void
  required?: boolean
  /** ISO lower bound for the calendar picker. */
  min?: string
  placeholder?: string
}

const isoToDisplay = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

// Returns an ISO date only for a real calendar date (rejects 31/02 etc.).
const displayToIso = (text: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (!m) return ''
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (y < 1000 || date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return ''
  }
  return `${m[3]}-${m[2]}-${m[1]}`
}

// Keeps digits only and re-inserts the slashes as the user types.
const maskDigits = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/**
 * Text date field that always uses dd/mm/aaaa, independent of the browser
 * locale (native date inputs follow the OS and showed mm/dd/yyyy). The
 * calendar button opens a native picker as a convenience.
 */
export function DateInput({ id, value, onChange, required, min, placeholder }: DateInputProps) {
  const { t } = useTranslation()
  const [text, setText] = useState(isoToDisplay(value))
  const pickerRef = useRef<HTMLInputElement>(null)

  // Sync from the parent only when it changed the value itself (load,
  // picker, auto-adjust) — never overwrite what the user is mid-typing.
  useEffect(() => {
    setText((prev) => (displayToIso(prev) === value ? prev : isoToDisplay(value)))
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskDigits(e.target.value)
    setText(masked)
    onChange(displayToIso(masked))
  }

  const invalid = text.length === 10 && displayToIso(text) === ''

  const openPicker = () => {
    const el = pickerRef.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
      el.click()
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        maxLength={10}
        value={text}
        onChange={handleChange}
        placeholder={placeholder ?? t('dateInput.placeholder')}
        aria-invalid={invalid || undefined}
        pattern="\d{2}/\d{2}/\d{4}"
        title={t('dateInput.format')}
        className={`input pr-11 ${invalid ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`}
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label={t('dateInput.openCalendar')}
        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:text-ink"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        min={min}
        onChange={(e) => {
          setText(isoToDisplay(e.target.value))
          onChange(e.target.value)
        }}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
      />
    </div>
  )
}
