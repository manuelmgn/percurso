import { useState } from 'react'
import { Home, Repeat } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { AlertBanner } from '@/components/ui/ErrorBanner'
import type { PlaceRelation, PlaceRelationInput, PlaceRelationKind } from '@/types'

type PeriodMode = 'none' | 'single' | 'range' | 'since'

const MIN_YEAR = 1900
const MAX_YEAR = 2100

function initialPeriodMode(relation: PlaceRelation | null | undefined): PeriodMode {
  if (!relation) return 'none'
  const { year_from: from, year_to: to } = relation
  if (from == null && to == null) return 'none'
  if (from != null && to != null) return from === to ? 'single' : 'range'
  if (from != null && to == null) return 'since'
  return 'range'
}

function parseYear(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d{4}$/.test(trimmed)) return null
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n < MIN_YEAR || n > MAX_YEAR) return null
  return n
}

interface PlaceRelationEditorProps {
  initial?: PlaceRelation | null
  onSave: (data: PlaceRelationInput) => Promise<void>
  onRemove?: () => Promise<void>
  onCancel?: () => void
  idPrefix?: string
}

export function PlaceRelationEditor({
  initial,
  onSave,
  onRemove,
  onCancel,
  idPrefix = 'place-rel',
}: PlaceRelationEditorProps) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<PlaceRelationKind>(initial?.kind ?? 'residence')
  const [periodMode, setPeriodMode] = useState<PeriodMode>(() => initialPeriodMode(initial))
  const [yearFrom, setYearFrom] = useState<string>(initial?.year_from != null ? String(initial.year_from) : '')
  const [yearTo, setYearTo] = useState<string>(initial?.year_to != null ? String(initial.year_to) : '')
  const [isSaving, setIsSaving] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [error, setError] = useState('')

  const isBusy = isSaving || isRemoving

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isBusy) return
    setError('')

    let resolvedFrom: number | null = null
    let resolvedTo: number | null = null

    if (periodMode === 'single') {
      const y = parseYear(yearFrom)
      if (y == null) {
        setError(t('places.relation.invalidYear'))
        return
      }
      resolvedFrom = y
      resolvedTo = y
    } else if (periodMode === 'since') {
      const y = parseYear(yearFrom)
      if (y == null) {
        setError(t('places.relation.invalidYear'))
        return
      }
      resolvedFrom = y
      resolvedTo = null
    } else if (periodMode === 'range') {
      const hasFrom = yearFrom.trim().length > 0
      const hasTo = yearTo.trim().length > 0
      const yFrom = hasFrom ? parseYear(yearFrom) : null
      const yTo = hasTo ? parseYear(yearTo) : null
      if ((hasFrom && yFrom == null) || (hasTo && yTo == null) || (!hasFrom && !hasTo)) {
        setError(t('places.relation.invalidYear'))
        return
      }
      if (yFrom != null && yTo != null && yTo < yFrom) {
        setError(t('places.relation.invalidRange'))
        return
      }
      resolvedFrom = yFrom
      resolvedTo = yTo
    }

    setIsSaving(true)
    try {
      await onSave({ kind, year_from: resolvedFrom, year_to: resolvedTo })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('places.relation.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!onRemove || isBusy) return
    setError('')
    setIsRemoving(true)
    try {
      await onRemove()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('places.relation.removeError'))
    } finally {
      setIsRemoving(false)
    }
  }

  const periodOptions: { value: PeriodMode; label: string }[] = [
    { value: 'none', label: t('places.relation.periodNone') },
    { value: 'single', label: t('places.relation.periodSingle') },
    { value: 'range', label: t('places.relation.periodRange') },
    { value: 'since', label: t('places.relation.periodSince') },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted">
          {t('places.relation.kindLabel')}
        </span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('places.relation.kindLabel')}>
          {([
            { value: 'residence', label: t('places.relation.residence'), Icon: Home },
            { value: 'frequent', label: t('places.relation.frequent'), Icon: Repeat },
          ] as const).map(({ value, label, Icon }) => {
            const active = kind === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={isBusy}
                onClick={() => setKind(value)}
                className={`inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-primary bg-primary-tint text-primary'
                    : 'border-line bg-surface text-ink hover:bg-line/40 dark:hover:bg-fill/40'
                }`}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted">
          {t('places.relation.periodLabel')}
        </span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('places.relation.periodLabel')}>
          {periodOptions.map((opt) => {
            const active = periodMode === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={isBusy}
                onClick={() => {
                  setPeriodMode(opt.value)
                  setError('')
                }}
                className={`rounded-pill border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'border-primary bg-primary-tint text-primary'
                    : 'border-line bg-surface text-muted hover:text-ink'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {periodMode !== 'none' && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="w-32">
              <label htmlFor={`${idPrefix}-from`} className="mb-1 block text-xs font-medium text-muted">
                {periodMode === 'single' ? t('places.relation.yearLabel') : t('places.relation.yearFromLabel')}
              </label>
              <input
                id={`${idPrefix}-from`}
                type="number"
                inputMode="numeric"
                min={MIN_YEAR}
                max={MAX_YEAR}
                step={1}
                placeholder="2018"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                disabled={isBusy}
                className="input"
              />
            </div>

            {periodMode === 'range' && (
              <div className="w-32">
                <label htmlFor={`${idPrefix}-to`} className="mb-1 block text-xs font-medium text-muted">
                  {t('places.relation.yearToLabel')}
                </label>
                <input
                  id={`${idPrefix}-to`}
                  type="number"
                  inputMode="numeric"
                  min={MIN_YEAR}
                  max={MAX_YEAR}
                  step={1}
                  placeholder="2024"
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  disabled={isBusy}
                  className="input"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <AlertBanner small message={error} />

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={isBusy} className="btn-primary">
          {isSaving ? t('places.relation.saving') : t('places.relation.save')}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={isBusy} className="btn-outline">
            {t('actions.cancel')}
          </button>
        )}
        {initial && onRemove && (
          <button type="button" onClick={handleRemove} disabled={isBusy} className="btn-danger-quiet ml-auto">
            {isRemoving ? t('places.relation.removing') : t('places.relation.remove')}
          </button>
        )}
      </div>
    </form>
  )
}
