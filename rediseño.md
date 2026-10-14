# Percurso — Guía de rediseño UI (especificación completa)

> Documento de implementación para migrar la UI de Percurso al nuevo sistema visual
> "moderno y fluido". Stack actual: React + Vite + React Router v6 + Tailwind CSS +
> `useTranslation` (i18n propio) + `AuthContext`. Todo el texto de UI se mantiene en
> portugués europeo (pt-PT), coherente con las rutas existentes (`/viagens`, `/definicoes`...).
>
> **Regla de oro: no romper nada existente.** Los tokens y componentes nuevos se AÑADEN;
> los antiguos (`.glass`, `primary-500`, `rounded-glass`...) se conservan hasta que todas
> las pantallas estén migradas, y solo entonces se limpian (ver §10, checklist final).

---

## 1. Resumen del nuevo lenguaje visual

| Aspecto | Antes (glassmorphism) | Ahora |
|---|---|---|
| Superficies | `.glass` translúcida con `backdrop-blur` | Blanco sólido `#FFFFFF`, radio 24px, sombra suave cálida |
| Fondo | `#FAF9F8` + degradados radiales | `#FAF7F2` (crema cálido) + 2 blobs ambientales (rosa/púrpura) |
| Color primario | `#C1075D` (se mantiene) | `#C1075D` con degradado marca magenta→coral en CTA y logo |
| Navegación | Sidebar con items planos | Sidebar flotante (24px de margen), item activo = píldora tinte rosa |
| Botones | `rounded-xl` | Píldora completa (`border-radius: 999px`) |
| Tipografía | Sora (display) + Inter (se mantiene) | Igual; jerarquía más marcada (h1 40px bold) |
| Fotos | (según pantalla) | Tarjetas con foto grande, radio interno 14–16px, chip de estado encima |
| Micro-interacción | lift -2px + scale 0.99 | Igual, más sombra hover + animación de ruta discontinua en mapas |

Paleta completa:

```
primary  #C1075D  tint #FBE9F0   (marca, CTA, activos)
coral    #E06F56  tint #FBE7E0   (acentos, degradados, categorías)
amber    #FFD64E  tint #FFF3D0   (estados "planeada", avisos)
plum     #6B21A8  tint #EDE4F7   (categorías, "concluída")
ink      #241F19                 (texto principal)
muted    #8A8177                 (texto secundario)
line     #EDE4D8                 (bordes y divisores)
bg       #FAF7F2                 (fondo de página)
surface  #FFFFFF                 (tarjetas)
```

---

## 2. `tailwind.config.js` — extensión de tema

Conservar TODA la config actual y **añadir** esto dentro de `theme.extend` (fusionar con lo que ya exista; no borrar las escalas `primary-500` etc. mientras haya páginas sin migrar):

```js
// tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#FAF7F2',
        surface: '#FFFFFF',
        ink: '#241F19',
        muted: '#8A8177',
        line: '#EDE4D8',
        coral: { DEFAULT: '#E06F56', tint: '#FBE7E0' },
        amber: { DEFAULT: '#FFD64E', tint: '#FFF3D0', deep: '#8A6A00' },
        plum: { DEFAULT: '#6B21A8', tint: '#EDE4F7' },
        // primary: mantener la escala actual y asegurar estos dos valores:
        // primary.DEFAULT = '#C1075D', primary.tint = '#FBE9F0'
      },
      fontFamily: {
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '24px',
        pill: '999px',
      },
      boxShadow: {
        card: '0 8px 24px rgba(58, 46, 31, 0.07)',
        'card-hover': '0 12px 32px rgba(58, 46, 31, 0.11)',
        brand: '0 6px 16px rgba(193, 7, 93, 0.25)',
        pop: '0 10px 24px rgba(58, 46, 31, 0.15)',
      },
      backgroundImage: {
        brand: 'linear-gradient(45deg, #C1075D, #E06F56)',
      },
      keyframes: {
        'route-dash': { to: { strokeDashoffset: '-14' } },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'route-dash': 'route-dash 1.2s linear infinite',
        'fade-up': 'fade-up 300ms ease-out both',
      },
    },
  },
  plugins: [],
}
```

---

## 3. `index.css` — reemplazo de la capa de componentes

Mantener `@tailwind` y la capa `base` actual (variables, `body::before` ambiental,
`prefers-reduced-motion`, foco visible). Cambios:

### 3.1 Capa `base` (sustituir lo correspondiente)

```css
@layer base {
  :root {
    --color-primary: #C1075D;
    --color-coral: #E06F56;
    --color-amber: #FFD64E;
    --color-plum: #6B21A8;
    --color-bg: #FAF7F2;
    --color-surface: #FFFFFF;
    --color-line: #EDE4D8;
    --color-text: #241F19;
    --color-text-muted: #8A8177;
  }

  .dark {
    --color-bg: #191512;
    --color-surface: #221D18;
    --color-line: #322A23;
    --color-text: #FAF7F2;
    --color-text-muted: #A09A92;
  }

  body {
    @apply bg-bg text-ink dark:bg-[#191512] dark:text-[#FAF7F2];
    font-family: 'Inter', system-ui, sans-serif;
  }

  /* Blobs ambientales (versión simplificada del ::before actual) */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(38rem 24rem at 78% -8%, rgba(236, 61, 128, 0.10), transparent 60%),
      radial-gradient(30rem 20rem at 8% 92%, rgba(107, 33, 168, 0.09), transparent 60%);
  }
}
```

### 3.2 Capa `components` (sustituir `.glass`, `.btn-*`, `.card`)

```css
@layer components {
  /* Tarjeta base — reemplaza .glass/.card */
  .card {
    @apply rounded-card bg-surface p-6 shadow-card transition-shadow duration-200 dark:bg-[#221D18];
  }

  /* Tarjeta interactiva (links/botones): lift suave */
  a.card, button.card {
    @apply transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover active:translate-y-0 active:scale-[0.99] active:duration-100;
  }

  /* Botón primario de marca (degradado píldora) */
  .btn-primary {
    @apply inline-flex items-center gap-2 rounded-pill bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-brand transition-all duration-200 hover:brightness-105 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.97] disabled:opacity-50;
  }

  .btn-outline {
    @apply inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink transition-all duration-200 hover:bg-line/40 focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.97] dark:border-[#322A23] dark:bg-[#221D18] dark:text-[#FAF7F2];
  }

  .input {
    @apply w-full rounded-pill border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-[#322A23] dark:bg-[#221D18] dark:text-[#FAF7F2];
  }

  /* Chip de filtro (páginas de listado) */
  .chip {
    @apply inline-flex items-center rounded-pill border border-line bg-surface px-4 py-2 text-[13px] font-medium text-muted transition-colors hover:text-ink dark:border-[#322A23] dark:bg-[#221D18];
  }
  .chip[data-active='true'] {
    @apply border-ink bg-ink text-white dark:border-[#FAF7F2] dark:bg-[#FAF7F2] dark:text-ink;
  }

  /* Chip de estado sobre fotos de viaje */
  .status-chip {
    @apply inline-flex items-center rounded-pill px-3 py-1 text-[11px] font-bold;
  }

  /* Buscador píldora del header */
  .search-pill {
    @apply flex items-center gap-2.5 rounded-pill bg-surface px-4 py-3 shadow-card dark:bg-[#221D18];
  }

  /* Item de navegación del sidebar */
  .nav-item {
    @apply flex items-center gap-3 rounded-pill px-4 py-3 text-[15px] text-muted transition-colors hover:text-ink dark:hover:text-[#FAF7F2];
  }
  .nav-item[data-active='true'] {
    @apply bg-[#FBE9F0] font-semibold text-primary dark:bg-primary/20;
  }

  /* Timeline vertical (detalle de viaje) */
  .timeline {
    @apply relative ml-2 border-l-2 border-line pl-7 dark:border-[#322A23];
  }
  .timeline-node {
    @apply absolute -left-[9px] top-0.5 h-4 w-4 rounded-full border-[3px] border-surface shadow-pop dark:border-[#221D18];
  }

  /* Ruta discontinua animada para mapas (usar en <path> SVG) */
  .route-line {
    stroke-dasharray: 6 8;
    animation: route-dash 1.2s linear infinite;
  }
}
```

### 3.3 Qué borrar cuando termine la migración

`.glass`, `--glass-*`, las variables `--color-surface(-solid)`, `--color-border`,
`@supports backdrop-filter` y el bloque `max-width: 767px` de `.glass`. NO antes (ver §10).

---

## 4. Assets (imágenes)

Exportar el artefacto kgraphic del canvas a imagen, o copiar los archivos generados a:

```
public/images/map.png        (mapa estilizado claro, 1536×768)
public/images/trips/lisboa.png, kyoto.png, patagonia.png, santorini.png, marrakech.png, islandia.png
```

Uso previsto: `map.png` como fondo del hero del dashboard y del mini-mapa del detalle;
las fotos como portada de las tarjetas de viaje (hasta que haya fotos reales de la API,
usar `trip.coverUrl || '/images/trips/<fallback>.png'`).

> Nota: si el proyecto usa iconos propios, mantener la librería actual. Los ejemplos de
> abajo usan `lucide-react` (`npm i lucide-react`). Si ya usan otra (Heroicons, Font
> Awesome React...), mapear: Home, Briefcase, FolderOpen, MapPin, PieChart, Search,
> Settings, Plus, ArrowRight, ArrowLeft, CalendarDays, Route, Globe, StickyNote.

---

## 5. Componentes compartidos

### 5.1 `components/Sidebar.tsx` (reescritura completa)

Desktop-only (`hidden md:flex`). Flotante: 24px de margen, tarjeta blanca, usuario abajo.

```tsx
import { NavLink } from 'react-router-dom'
import { Home, Briefcase, FolderOpen, MapPin, PieChart, Search, Settings, Route } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/context/AuthContext'

const items = [
  { to: '/', icon: Home, key: 'nav.home', end: true },
  { to: '/viagens', icon: Briefcase, key: 'nav.trips' },
  { to: '/projetos', icon: FolderOpen, key: 'nav.projects' },
  { to: '/lugares', icon: MapPin, key: 'nav.places' },
  { to: '/estatisticas', icon: PieChart, key: 'nav.stats' },
  { to: '/pesquisa', icon: Search, key: 'nav.search' },
  { to: '/definicoes', icon: Settings, key: 'nav.settings' },
]

export function Sidebar() {
  const { t } = useTranslation()
  const { user } = useAuth()

  return (
    <aside className="sticky top-6 m-6 hidden h-[calc(100vh-3rem)] w-[232px] shrink-0 flex-col rounded-card bg-surface p-4 shadow-card md:flex dark:bg-[#221D18]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-2 pt-2">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-white shadow-brand">
          <Route size={20} />
        </div>
        <span className="font-display text-xl font-bold tracking-tight">Percurso</span>
      </div>

      {/* Navegación */}
      <nav className="mt-8 flex flex-col gap-1" aria-label={t('nav.main')}>
        {items.map(({ to, icon: Icon, key, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'bg-[#FBE9F0] font-semibold text-primary dark:bg-primary/20' : ''}`
            }
          >
            <Icon size={18} strokeWidth={isActive ? 2.4 : 2} />
            {t(key)}
          </NavLink>
        ))}
      </nav>

      {/* Usuario */}
      <div className="mt-auto flex items-center gap-3 rounded-2xl bg-bg p-3 dark:bg-[#191512]">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-brand font-display text-[13px] font-bold text-white">
          {user?.name?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{user?.name}</p>
          <p className="text-xs text-muted">{user?.plan ?? 'Explorer'}</p>
        </div>
      </div>
    </aside>
  )
}
```

### 5.2 `components/Header.tsx` (reescritura)

Saludo contextual + buscador píldora + CTA "Nova viagem". El título puede venir de la
ruta activa o de la propia página; versión simple con props y valores por defecto:

```tsx
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/context/AuthContext'

interface HeaderProps {
  title?: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const firstName = user?.name?.split(' ')[0]

  return (
    <header className="flex flex-wrap items-center gap-4 px-2 pt-2 md:px-0">
      <div className="mr-auto">
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight md:text-[40px]">
          {title ?? t('dashboard.greeting', { name: firstName })}
        </h1>
        <p className="mt-1 text-base text-muted">{subtitle ?? t('dashboard.subtitle')}</p>
      </div>

      <Link to="/pesquisa" className="search-pill w-full sm:w-[212px]" aria-label={t('nav.search')}>
        <Search size={16} className="text-muted" />
        <span className="text-sm text-muted">{t('search.placeholder')}</span>
      </Link>

      <Link to="/viagens/novo" className="btn-primary">
        <Plus size={16} strokeWidth={2.5} />
        {t('trips.new')}
      </Link>
    </header>
  )
}
```

Claves i18n a añadir (pt-PT): `dashboard.greeting: "Olá, {name}"`,
`dashboard.subtitle: "Aqui está o resumo dos teus percursos."`,
`search.placeholder: "Pesquisar..."`, `trips.new: "Nova viagem"`,
`trips.viewAll: "Ver todas"`, `trips.viewRoute: "Ver percurso"`,
`trips.recent: "Viagens recentes"`, `stats.yearInNumbers: "O teu ano em números"`.

### 5.3 `components/MobileNav.tsx` (reescritura)

Barra inferior flotante tipo píldora, con el item activo resaltado:

```tsx
import { NavLink } from 'react-router-dom'
import { Home, Briefcase, MapPin, PieChart, Search } from 'lucide-react'
import { useTranslation } from '@/i18n'

const items = [
  { to: '/', icon: Home, key: 'nav.home', end: true },
  { to: '/viagens', icon: Briefcase, key: 'nav.trips' },
  { to: '/pesquisa', icon: Search, key: 'nav.search' },
  { to: '/lugares', icon: MapPin, key: 'nav.places' },
  { to: '/estatisticas', icon: PieChart, key: 'nav.stats' },
]

export function MobileNav() {
  const { t } = useTranslation()
  return (
    <nav
      className="fixed inset-x-4 bottom-4 z-40 flex items-center justify-between rounded-pill bg-surface px-2 py-2 shadow-pop md:hidden dark:bg-[#221D18]"
      aria-label={t('nav.main')}
    >
      {items.map(({ to, icon: Icon, key, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          aria-label={t(key)}
          className={({ isActive }) =>
            `grid h-11 w-11 place-items-center rounded-full transition-colors ${
              isActive ? 'bg-brand text-white shadow-brand' : 'text-muted'
            }`
          }
        >
          <Icon size={20} />
        </NavLink>
      ))}
    </nav>
  )
}
```

### 5.4 `components/Layout.tsx` (ajuste mínimo)

Mantener la estructura actual; solo actualizar espaciados para respirar con el nuevo sistema:

```tsx
<div className="flex min-h-screen">
  <a href="#main-content" className="skip-link">{t('skipToContent')}</a>
  <Sidebar />
  <div className="flex min-w-0 flex-1 flex-col">
    <main id="main-content" className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pt-8 lg:pb-10">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-10">
        <Header />
        <Outlet />
      </div>
    </main>
    <MobileNav />
  </div>
</div>
```

> Detalle: las páginas de detalle (`TripDetailPage`) pueden renderizar su propio hero
> full-bleed y pasar `Header` oculto vía contexto, o simplemente no usar el saludo:
> opción sencilla → `Header` lee `useLocation()` y, en rutas `/viagens/:id`, muestra
> el título de la página en lugar del saludo. Implementación libre para Kimi Code.

### 5.5 `components/PageTransition.tsx` (nuevo, framer-motion)

`npm i framer-motion`. Envolver el `Outlet` para transiciones fluidas entre rutas:

```tsx
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation, useOutlet } from 'react-router-dom'

export function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  )
}
```

Usar `<AnimatedOutlet />` en `Layout.tsx` en lugar de `<Outlet />`. Respetar
`prefers-reduced-motion`: framer-motion lo respeta con `MotionConfig reducedMotion="user"`
(envolver la app en `main.tsx` o `App.tsx`).

---

## 6. Componentes UI nuevos

### 6.1 `components/ui/StatusChip.tsx`

```tsx
type TripStatus = 'concluida' | 'em_curso' | 'planeada'

const styles: Record<TripStatus, string> = {
  concluida: 'bg-plum-tint text-plum',
  em_curso: 'bg-[#FBE9F0] text-primary',
  planeada: 'bg-amber-tint text-amber-deep',
}

const labels: Record<TripStatus, string> = {
  concluida: 'Concluída',
  em_curso: 'Em curso',
  planeada: 'Planeada',
}

export function StatusChip({ status, className = '' }: { status: TripStatus; className?: string }) {
  return <span className={`status-chip ${styles[status]} ${className}`}>{labels[status]}</span>
}
```

### 6.2 `components/ui/TripCard.tsx`

Tarjeta de viaje (grid de listados y "Viagens recentes"):

```tsx
import { Link } from 'react-router-dom'
import { CalendarDays, MapPin, ArrowRight } from 'lucide-react'
import { StatusChip } from './StatusChip'
import type { Trip } from '@/types' // adaptar al tipo real

export function TripCard({ trip }: { trip: Trip }) {
  return (
    <Link to={`/viagens/${trip.id}`} className="card group flex flex-col gap-4 p-3">
      <div className="relative overflow-hidden rounded-2xl">
        <img
          src={trip.coverUrl ?? '/images/trips/lisboa.png'}
          alt={trip.title}
          className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
        />
        <StatusChip status={trip.status} className="absolute right-3 top-3" />
      </div>

      <div className="flex flex-col gap-2 px-2 pb-2">
        <h3 className="font-display text-[17px] font-bold">{trip.title}</h3>
        <div className="flex items-center gap-4 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={13} /> {trip.dateRange}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={13} /> {trip.placeCount} lugares
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          {/* Avatares de participantes (stack) */}
          <div className="flex -space-x-2">
            {trip.participants.slice(0, 3).map((p) => (
              <span
                key={p.id}
                className="grid h-7 w-7 place-items-center rounded-full border-2 border-surface bg-brand text-[11px] font-bold text-white"
                title={p.name}
              >
                {p.name[0]}
              </span>
            ))}
          </div>
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Ver percurso <ArrowRight size={13} />
          </span>
        </div>
      </div>
    </Link>
  )
}
```

### 6.3 `components/ui/StatCard.tsx`

KPI con icono en cuadrado tintado + delta:

```tsx
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  icon: LucideIcon
  value: string
  label: string
  delta?: string
  tone?: 'primary' | 'coral' | 'plum' | 'amber'
}

const tones = {
  primary: 'bg-[#FBE9F0] text-primary',
  coral: 'bg-coral-tint text-coral',
  plum: 'bg-plum-tint text-plum',
  amber: 'bg-amber-tint text-amber-deep',
}

export function StatCard({ icon: Icon, value, label, delta, tone = 'primary' }: StatCardProps) {
  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon size={18} />
        </span>
        {delta && (
          <span className="rounded-pill bg-[#FBE9F0] px-2.5 py-1 text-xs font-bold text-primary">{delta}</span>
        )}
      </div>
      <div>
        <p className="font-display text-[27px] font-bold leading-none">{value}</p>
        <p className="mt-1.5 text-xs text-muted">{label}</p>
      </div>
    </div>
  )
}
```

### 6.4 `components/ui/ProgressGoal.tsx`

Barra de meta anual (dashboard):

```tsx
export function ProgressGoal({ current, total }: { current: number; total: number }) {
  const pct = Math.min(100, Math.round((current / total) * 100))
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-muted">Meta 2025</span>
        <span className="text-[13px] font-bold">{current} / {total}</span>
      </div>
      <div
        className="mt-2 h-2.5 overflow-hidden rounded-pill bg-[#F0E8DC] dark:bg-[#322A23]"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div className="h-full rounded-pill bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">Faltam {total - current} viagens para a meta</p>
    </div>
  )
}
```

### 6.5 `components/map/RouteOverlay.tsx` (nuevo)

Overlay SVG encima del mapa con la ruta discontinua animada. `MapView` actual usa un
`MapViewInner` (Leaflet o similar) con markers/polygons; el rediseño pide polylines
**discontinuas curvas** con animación de marcha. Dos opciones, elegir según la librería
interna:

**Opción A (Leaflet):** en `MapViewInner`, estilizar el `Polyline` así:
```tsx
<Polyline positions={points} pathOptions={{ color: '#C1075D', weight: 3, dashArray: '6 8' }} />
```
y añadir clase `route-line` al path vía `renderer` o CSS global
(`.leaflet-overlay-pane path.route-line { ... }`).

**Opción B (overlay SVG genérico):** para mapas estáticos/hero (sin geodatos), colocar
encima del `<img>` del mapa:

```tsx
export function RouteOverlay({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 180" className={className} aria-hidden="true" fill="none">
      <path
        d="M0,150 C140,60 320,120 480,20"
        stroke="#C1075D"
        strokeWidth="3"
        strokeLinecap="round"
        className="route-line"
      />
    </svg>
  )
}
```

Los marcadores del mapa (`MapMarker`) deben pasar a pins de color marca: magenta `#C1075D`,
coral `#E06F56` y púrpura `#6B21A8` (rotar por orden), con sombra `0 3px 8px` del mismo
color al 35%.

---

## 7. Páginas (composición)

Las páginas mantienen su lógica de datos existente (hooks, llamadas a API, estado).
Solo cambia el **markup visual**. Estructuras objetivo:

### 7.1 `DashboardPage`

```tsx
// Orden de secciones (desktop ≥ lg: grid 12 col; móvil: apilado)
<section className="grid gap-6 lg:grid-cols-12">
  {/* Hero mapa — lg:col-span-8, altura ~390px */}
  <div className="relative overflow-hidden rounded-card shadow-card lg:col-span-8">
    <img src="/images/map.png" alt="" className="h-[300px] w-full object-cover md:h-[390px]" />
    <RouteOverlay className="pointer-events-none absolute inset-x-[8%] top-[18%] w-[65%]" />
    {/* Tarjeta flotante "Próxima viagem", abajo-izquierda */}
    <div className="absolute bottom-4 left-4 flex w-[min(392px,90%)] items-center gap-3 rounded-2xl bg-surface p-3 shadow-pop">
      <img src={nextTrip.coverUrl} alt="" className="h-20 w-24 rounded-xl object-cover" />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-primary">Próxima viagem</p>
        <p className="font-display text-lg font-bold">{nextTrip.title}</p>
        <p className="text-[13px] text-muted">{nextTrip.dateRange} · {nextTrip.placeCount} lugares</p>
      </div>
    </div>
  </div>

  {/* Panel stats — lg:col-span-4 */}
  <aside className="card lg:col-span-4">
    <h2 className="font-display text-lg font-bold">{t('stats.yearInNumbers')}</h2>
    <div className="mt-5 grid grid-cols-2 gap-5">
      <Stat value="24" label="viagens" tone="primary" />
      <Stat value="132" label="lugares" tone="coral" />
      <Stat value="18" label="países" tone="plum" />
      <Stat value="86 mil" label="km percorridos" tone="ink" />
    </div>
    <hr className="my-5 border-line" />
    <ProgressGoal current={24} total={30} />
  </aside>
</section>

<section>
  <div className="mb-5 flex items-center justify-between">
    <h2 className="font-display text-[22px] font-bold">{t('trips.recent')}</h2>
    <Link to="/viagens" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
      {t('trips.viewAll')} <ArrowRight size={14} />
    </Link>
  </div>
  <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
    {recentTrips.map((trip) => <TripCard key={trip.id} trip={trip} />)}
  </div>
</section>
```

(`Stat` inline: `<div><p className="font-display text-3xl font-bold text-{tone}">{value}</p><p className="text-[13px] text-muted">{label}</p></div>`)

### 7.2 `TripsPage`

```tsx
<nav className="flex flex-wrap gap-2" aria-label={t('trips.filters')}>
  {['todas', 'planeadas', 'em_curso', 'concluidas'].map((f) => (
    <button key={f} className="chip" data-active={filter === f} onClick={() => setFilter(f)}>
      {t(`trips.filter.${f}`)}
    </button>
  ))}
</nav>
<div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
  {filteredTrips.map((trip, i) => (
    <div key={trip.id} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
      <TripCard trip={trip} />
    </div>
  ))}
</div>
```

### 7.3 `TripDetailPage`

```tsx
{/* Hero full-bleed */}
<div className="relative overflow-hidden rounded-card shadow-card">
  <img src={trip.coverUrl} alt="" className="h-56 w-full object-cover md:h-72" />
  <div className="absolute inset-0 bg-gradient-to-b from-ink/15 via-transparent to-ink/80" />
  <Link to="/viagens" className="absolute left-6 top-6 inline-flex items-center gap-2 rounded-pill bg-white/90 px-4 py-2 text-[13px] font-semibold text-ink">
    <ArrowLeft size={14} /> {t('nav.trips')}
  </Link>
  <StatusChip status={trip.status} className="absolute right-6 top-6" />
  <div className="absolute bottom-5 left-6 text-white">
    <h1 className="font-display text-[34px] font-bold">{trip.title}</h1>
    <div className="mt-2 flex flex-wrap items-center gap-5 text-sm text-white/85">
      <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} /> {trip.dateRange}</span>
      <span className="inline-flex items-center gap-1.5"><MapPin size={15} /> {trip.placeCount} lugares</span>
      <span className="inline-flex items-center gap-1.5"><Route size={15} /> {trip.distanceKm} km</span>
    </div>
  </div>
</div>

<div className="grid gap-6 lg:grid-cols-12">
  {/* Itinerario — lg:col-span-7 */}
  <section className="card lg:col-span-7">
    <h2 className="font-display text-xl font-bold">{t('trip.itinerary')}</h2>
    <p className="mt-1 text-[13px] text-muted">{trip.days.length} dias · {trip.routeSummary}</p>
    <ol className="timeline mt-8 space-y-9">
      {trip.days.map((day, i) => (
        <li key={day.id} className="relative">
          <span className="timeline-node" style={{ background: DAY_COLORS[i % 4] }} />
          <p className="text-[11px] font-bold uppercase tracking-[1.5px]" style={{ color: DAY_COLORS[i % 4] }}>
            Dia {i + 1}
          </p>
          <h3 className="mt-1 font-display text-base font-bold">{day.title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{day.description}</p>
        </li>
      ))}
    </ol>
  </section>

  {/* Columna derecha — lg:col-span-5: mapa + 3 stats + notas */}
  <div className="flex flex-col gap-6 lg:col-span-5">
    <div className="relative overflow-hidden rounded-card shadow-card">
      <MapView variant="minimal" markers={tripMarkers} height="232px" />
      {/* o img estática + RouteOverlay si no hay geodatos */}
    </div>
    <div className="grid grid-cols-3 gap-4">
      <MiniStat value={trip.days.length} label="dias" />
      <MiniStat value={trip.placeCount} label="lugares" />
      <MiniStat value={trip.distanceKm} label="km" />
    </div>
    <section className="card">
      <h2 className="flex items-center gap-2 font-display text-base font-bold">
        <StickyNote size={16} className="text-amber-deep" /> {t('trip.notes')}
      </h2>
      <div className="notes-content mt-3 text-[13px] text-muted" /* contenido rico existente */ />
    </section>
  </div>
</div>
```

`DAY_COLORS = ['#C1075D', '#E06F56', '#6B21A8', '#FFD64E']`
`MiniStat`: `<div className="card p-4 text-center"><p className="font-display text-[21px] font-bold">{value}</p><p className="text-xs text-muted">{label}</p></div>`

### 7.4 `StatsPage`

Instalar `recharts` (`npm i recharts`) y componer:

1. **Fila KPIs** — 4× `StatCard` (§6.3): Viagens, Lugares, Países, Quilómetros con sus tonos y deltas.
2. **Viagens por ano** (`BarChart`, ancho 7/12): barras con degradado marca vía `<defs><linearGradient id="barGrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#C1075D"/><stop offset="100%" stopColor="#E06F56"/></linearGradient></defs>`, `radius={[6,6,0,0]}`, grid horizontal `#F0E9DE`, ticks `fill: #8A8177, fontSize: 11`.
3. **Como viajas** (`PieChart` donut, ancho 5/12): `innerRadius="68%"`, `paddingAngle={2}`, colores `['#C1075D','#E06F56','#FFD64E','#6B21A8']`, leyenda a la derecha, `stroke="#FFFFFF" strokeWidth={2}`.
4. **Quilómetros por mês** (`AreaChart`, ancho completo): `type="monotone"`, `stroke="#C1075D" strokeWidth={3}`, área con degradado `#C1075D` al 22% → 0%, dots blancos con borde magenta.

Cada gráfico dentro de `.card` con `<h2 className="font-display text-lg font-bold">` arriba. `ResponsiveContainer height={220}`.

---

## 8. Modo oscuro

El `.dark` de §3.1 redefine superficie/fondo/línea. Reglas adicionales:

- Tintes (`bg-[#FBE9F0]` etc.) → en oscuro usar opacidad del color: `dark:bg-primary/20`,
  `dark:bg-plum/25`, `dark:bg-amber/15`. Añadir las variantes `dark:` en cada componente anterior.
- Fotos y mapa: aplicar `dark:brightness-[0.85]` a las `<img>`.
- Gráficos recharts: leer `document.documentElement.classList.contains('dark')` (o el
  `ThemeProvider` existente) y cambiar ticks/grid a `#A09A92` / `#322A23`.
- Sombras: en oscuro sustituir por borde fino: `dark:shadow-none dark:border dark:border-[#322A23]` en `.card`.

---

## 9. Orden de trabajo sugerido para Kimi Code

1. `tailwind.config.js` + `index.css` (§2–3) y `npm i lucide-react framer-motion recharts`.
2. Añadir claves i18n nuevas (pt-PT; y sus equivalentes en los demás idiomas del proyecto).
3. Componentes compartidos (§5): Sidebar → MobileNav → Header → Layout → AnimatedOutlet.
4. Componentes UI (§6).
5. Páginas (§7) en este orden: DashboardPage → TripsPage → TripDetailPage → StatsPage.
6. Modo oscuro (§8) y verificación con `ThemeProvider`.
7. Copiar assets a `public/images/` (§4) y sustituir fallbacks por fotos reales de la API.
8. Limpieza (§3.3) + `grep -r "glass\|rounded-glass" src/` sin resultados.
9. Verificación final: `npm run build` sin errores, Lighthouse ≥ 90 en Performance/Accessibility,
   `prefers-reduced-motion` respetado, foco visible en todos los interactivos.

---

## 10. Checklist de aceptación

- [x] No queda ninguna clase `.glass` ni `rounded-glass` en `src/`
- [x] Sidebar flotante con item activo en píldora rosa; móvil con nav inferior píldora
- [x] CTA "Nova viagem" con degradado magenta→coral y sombra marca
- [x] Tarjetas: blanco sólido, radio 24px, `shadow-card`, hover con lift
- [x] Ruta discontinua animada visible en dashboard y detalle
- [x] Transición fade/slide de 250 ms entre rutas (desactivada con reduced-motion)
- [x] Dark mode coherente en las 4 páginas migradas
- [ ] Todos los textos pasan por `t()` (sin strings hardcodeados) — pendiente: `SettingsPage` (y modales sueltos de Admin/Settings) conservan textos pt-PT hardcodeados heredados; migrarlos a claves i18n queda como deuda
- [x] Las páginas no migradas siguen funcionando con los tokens antiguos hasta su turno