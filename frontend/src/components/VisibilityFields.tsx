import { useTranslation } from '@/i18n'
import { PillChecklist } from '@/components/ui/PillChecklist'
import type { User, Visibility } from '@/types'

// Sharing fields used by both entity edit forms (trip and project). `prefix`
// picks the i18n namespace ('tripEdit' | 'projectEdit'); both define the
// same keys for these labels.

interface VisibilitySelectProps {
  prefix: string
  value: Visibility
  onChange: (value: Visibility) => void
}

export function VisibilitySelect({ prefix, value, onChange }: VisibilitySelectProps) {
  const { t } = useTranslation()
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor="visibility">
        {t(`${prefix}.visibilityLabel`)}
      </label>
      <select
        id="visibility"
        value={value}
        onChange={(e) => onChange(e.target.value as Visibility)}
        className="input"
      >
        <option value="all">{t('visibility.optionAll')}</option>
        <option value="specific">{t('visibility.optionSpecific')}</option>
        <option value="private">{t('visibility.optionPrivate')}</option>
      </select>
    </div>
  )
}

interface VisibleUsersFieldProps {
  prefix: string
  users: User[]
  selectedIds: number[]
  onToggle: (id: number) => void
}

export function VisibleUsersField({ prefix, users, selectedIds, onToggle }: VisibleUsersFieldProps) {
  const { t } = useTranslation()
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{t(`${prefix}.visibleToLabel`)}</label>
      <PillChecklist
        items={users.map((u) => ({ id: u.id, label: u.username }))}
        selectedIds={selectedIds}
        onToggle={onToggle}
        emptyMessage={t(`${prefix}.noOtherUsers`)}
      />
    </div>
  )
}
