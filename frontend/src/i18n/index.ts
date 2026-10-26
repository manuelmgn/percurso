import ptPT from './pt-PT.json'

type Translations = typeof ptPT

const translations: Translations = ptPT

export function t(key: string, params?: Record<string, string | number>): string {
  let text: string = (translations as Record<string, string>)[key] || key
  if (text === key && import.meta.env.DEV) {
    // Missing translation: warn in dev so typos are caught early.
    console.warn(`[i18n] missing key: ${key}`)
  }
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v))
    })
  }
  return text
}

export function pluralize(count: number, singularKey: string, pluralKey: string): string {
  return count === 1 ? t(singularKey) : t(pluralKey)
}

export function useTranslation() {
  return { t, pluralize }
}
