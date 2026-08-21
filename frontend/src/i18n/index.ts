import ptPT from './pt-PT.json'

type Translations = typeof ptPT

const translations: Translations = ptPT

export function t(key: keyof Translations, params?: Record<string, string | number>): string {
  let text = translations[key] || key
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v))
    })
  }
  return text
}

export function useTranslation() {
  return { t }
}
