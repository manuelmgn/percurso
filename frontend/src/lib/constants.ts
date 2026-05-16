export const APP_VERSION_MAJOR = 0

declare const __BUILD_TIMESTAMP__: string
export const APP_VERSION = `${APP_VERSION_MAJOR}.${__BUILD_TIMESTAMP__}`
