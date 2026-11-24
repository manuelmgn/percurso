#!/usr/bin/env node
/**
 * Exhaustive frontend + cross-stack integrity check for Percurso.
 *
 * Verifies:
 * 1. i18n: pt-PT.json valid JSON, no empty strings, every static t('key') in
 *    frontend/src exists in pt-PT.json, and every placeholder passed to t()
 *    exists in the translation string.
 * 2. Enum parity: PLACE_TYPES in frontend/src/types.ts matches PlaceType in
 *    backend/app/models/enums.py 1-to-1.
 * 3. API contract parity: every /api/... path referenced in frontend/src/api.ts
 *    maps to a registered FastAPI route (when python backend venv is available).
 * 4. Route integrity: every static internal <Link to="/..."> and navigate('/...')
 *    path matches a route declared in frontend/src/App.tsx.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_DIR = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(FRONTEND_DIR, '..')
const SRC_DIR = path.join(FRONTEND_DIR, 'src')

let failures = 0
let checks = 0

function pass(msg) {
  checks++
  console.log(`PASS: ${msg}`)
}

function fail(msg) {
  checks++
  failures++
  console.error(`FAIL: ${msg}`)
}

function walk(dir, exts = ['.ts', '.tsx']) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, exts))
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full)
  }
  return out
}

// --- 1. i18n integrity ---
const i18nPath = path.join(SRC_DIR, 'i18n', 'pt-PT.json')
const i18nData = JSON.parse(fs.readFileSync(i18nPath, 'utf8'))

function flattenKeys(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenKeys(v, full, out)
    } else {
      out[full] = v
    }
  }
  return out
}

const flatI18n = flattenKeys(i18nData)
const emptyI18nKeys = Object.entries(flatI18n).filter(([, v]) => typeof v !== 'string' || v.trim() === '')
if (emptyI18nKeys.length === 0) {
  pass(`i18n pt-PT.json has ${Object.keys(flatI18n).length} non-empty keys`)
} else {
  fail(`i18n pt-PT.json has empty/non-string keys: ${emptyI18nKeys.map(([k]) => k).join(', ')}`)
}

const sourceFiles = walk(SRC_DIR)
const missingI18nKeys = []
const badPlaceholders = []

// Match t('some.key') or t("some.key", { param: ... })
const T_CALL_RE = /\bt\(\s*(['"])([a-zA-Z0-9_.-]+)\1(?:\s*,\s*\{([^}]*)\})?/g

for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8')
  const rel = path.relative(REPO_ROOT, file)
  for (const m of content.matchAll(T_CALL_RE)) {
    const key = m[2]
    const paramsBlock = m[3]
    if (!(key in flatI18n)) {
      missingI18nKeys.push(`${rel}: t('${key}')`)
      continue
    }
    if (paramsBlock) {
      const value = flatI18n[key]
      for (const pm of paramsBlock.matchAll(/(?:^|,)\s*([a-zA-Z0-9_]+)\s*(?::|,|$)/g)) {
        const paramName = pm[1]
        if (!value.includes(`{${paramName}}`)) {
          badPlaceholders.push(`${rel}: t('${key}') passes '{${paramName}}' not found in "${value}"`)
        }
      }
    }
  }
}

if (missingI18nKeys.length === 0) {
  pass('all static t(...) keys in frontend/src exist in pt-PT.json')
} else {
  fail(`missing i18n keys:\n  ${missingI18nKeys.join('\n  ')}`)
}

if (badPlaceholders.length === 0) {
  pass('all static t(..., { ... }) placeholders match pt-PT.json templates')
} else {
  fail(`mismatched i18n placeholders:\n  ${badPlaceholders.join('\n  ')}`)
}

// --- 2. PlaceType enum parity (frontend <-> backend) ---
const typesSrc = fs.readFileSync(path.join(SRC_DIR, 'types.ts'), 'utf8')
const enumsSrc = fs.readFileSync(path.join(REPO_ROOT, 'backend', 'app', 'models', 'enums.py'), 'utf8')

const fePlaceBlock = typesSrc.match(/export const PLACE_TYPES = \[([\s\S]*?)\] as const/)?.[1] || ''
const fePlaceTypes = [...fePlaceBlock.matchAll(/'([^']+)'/g)].map((m) => m[1])

const bePlaceBlock = enumsSrc.match(/class PlaceType\(str, enum\.Enum\):([\s\S]*?)(?:\nclass |\s*$)/)?.[1] || ''
const bePlaceTypes = [...bePlaceBlock.matchAll(/=\s*"([^"]+)"/g)].map((m) => m[1])

if (fePlaceTypes.length > 0 && JSON.stringify(fePlaceTypes) === JSON.stringify(bePlaceTypes)) {
  pass(`PlaceType enum matches 1-to-1 (${fePlaceTypes.length} values)`)
} else {
  fail(`PlaceType mismatch!\n  frontend: ${JSON.stringify(fePlaceTypes)}\n  backend:  ${JSON.stringify(bePlaceTypes)}`)
}

// --- 3. API contract parity (frontend/src/api.ts <-> FastAPI app.routes) ---
const apiSrc = fs.readFileSync(path.join(SRC_DIR, 'api.ts'), 'utf8')
const apiPaths = new Set()
for (const m of apiSrc.matchAll(/(?:fetchJson|uploadFile|uploadFiles)[^(]*\(\s*(['"`])(\/api\/[^'"`]+)\1/g)) {
  // Strip ternary query suffix like `${cond ? '' : '?foo=bar'}` and `?query`,
  // then normalise path template params `${...}` to `{param}`.
  const cleaned = m[2].replace(/\$\{[^}]*\?[^}]*\}/g, '').split('?')[0]
  const norm = cleaned.replace(/\$\{[^}]+\}/g, '{param}')
  apiPaths.add(norm)
}

try {
  const pyOut = execSync(
    `cd "${path.join(REPO_ROOT, 'backend')}" && source .venv/bin/activate && python -c "import json; from app.main import app; print(json.dumps(sorted({getattr(r, 'path', '') for r in app.routes if getattr(r, 'path', '').startswith('/api/')})))"`,
    { shell: '/bin/zsh', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  )
  const backendRoutes = JSON.parse(pyOut.trim()).map((p) => p.replace(/\{[^}]+\}/g, '{param}'))
  const backendSet = new Set(backendRoutes)
  const unmatched = [...apiPaths].filter((p) => !backendSet.has(p))
  if (unmatched.length === 0) {
    pass(`all ${apiPaths.size} API paths in frontend/src/api.ts exist in FastAPI backend`)
  } else {
    fail(`API paths in frontend/src/api.ts missing from FastAPI backend:\n  ${unmatched.join('\n  ')}`)
  }
} catch (err) {
  fail(`could not introspect FastAPI routes: ${err.message}`)
}

// --- 4. Frontend internal route integrity ---
const appSrc = fs.readFileSync(path.join(SRC_DIR, 'App.tsx'), 'utf8')
const routePatterns = [/^\/$/, /^\/login$/]
for (const m of appSrc.matchAll(/<Route\s+path="([^"]+)"/g)) {
  const raw = m[1]
  if (raw === '*' || raw === '/' || raw === '/login') continue
  const full = raw.startsWith('/') ? raw : `/${raw}`
  const regexStr = '^' + full.replace(/:[^/]+/g, '[^/]+') + '$'
  routePatterns.push(new RegExp(regexStr))
}

const badRoutes = []
const LINK_RE = /(?:\bto=|\bnavigate\()\s*(['"])(\/[^'"?#]*)\1/g
for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8')
  const rel = path.relative(REPO_ROOT, file)
  for (const m of content.matchAll(LINK_RE)) {
    const target = m[2]
    if (target.startsWith('/api/') || target.startsWith('/uploads/') || target.startsWith('/images/')) continue
    if (!routePatterns.some((re) => re.test(target))) {
      badRoutes.push(`${rel}: "${target}"`)
    }
  }
}

if (badRoutes.length === 0) {
  pass('all static internal links/navigate targets match routes in App.tsx')
} else {
  fail(`unmatched internal routes:\n  ${badRoutes.join('\n  ')}`)
}

console.log(`\nFrontend integrity summary: ${checks - failures}/${checks} passed`)
if (failures > 0) process.exit(1)
