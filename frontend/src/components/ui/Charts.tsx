import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'

/**
 * Dependency-free SVG charts (bar, donut, area) replacing the recharts
 * bundle (~430 kB). They take explicit tick/grid colours because SVG
 * attributes cannot use the CSS design tokens directly.
 */

export interface ChartDatum {
  label: string
  value: number
}

interface ThemeStrokes {
  tick: string
  grid: string
}

/** Measure an element's content width so charts can render at pixel size
 *  (keeps text crisp, unlike a stretched viewBox). */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** Floating hover tooltip, styled like the old recharts one but with the
 *  surface/line/ink tokens so it follows the theme automatically. */
function ChartTooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-xl border border-line bg-surface px-2.5 py-1.5 text-xs text-ink shadow-pop"
      style={{ left: x, top: y, transform: 'translate(-50%, calc(-100% - 10px))' }}
    >
      {children}
    </div>
  )
}

interface HoverState {
  index: number
  x: number
  y: number
}

/* ------------------------------------------------------------------ */
/* Bar chart                                                           */
/* ------------------------------------------------------------------ */

const BAR_MARGIN = { top: 8, right: 8, bottom: 22, left: 30 }

export function BarChart({ data, height, tick, grid }: { data: ChartDatum[]; height: number } & ThemeStrokes) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>()
  const gradId = useId()
  const [hover, setHover] = useState<HoverState | null>(null)

  const innerW = width - BAR_MARGIN.left - BAR_MARGIN.right
  const innerH = height - BAR_MARGIN.top - BAR_MARGIN.bottom
  const max = Math.max(1, ...data.map((d) => d.value))
  const step = Math.max(1, Math.ceil(max / 4))
  const yMax = step * 4
  const yTicks = [0, step, step * 2, step * 3, yMax]
  const xEvery = Math.ceil(data.length / 10)

  const band = innerW / data.length
  const barW = Math.min(48, band * 0.6)

  return (
    <div ref={wrapRef} className="relative">
      {width > 0 && (
        <svg width={width} height={height} role="img">
          <defs>
            <linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#C1075D" />
              <stop offset="100%" stopColor="#EC3D80" />
            </linearGradient>
          </defs>
          {/* horizontal grid + y ticks */}
          {yTicks.map((v) => {
            const y = BAR_MARGIN.top + innerH - (v / yMax) * innerH
            return (
              <g key={v}>
                <line x1={BAR_MARGIN.left} x2={width - BAR_MARGIN.right} y1={y} y2={y} stroke={grid} strokeDasharray="3 3" />
                <text x={BAR_MARGIN.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill={tick}>
                  {v}
                </text>
              </g>
            )
          })}
          {/* bars */}
          {data.map((d, i) => {
            const h = (d.value / yMax) * innerH
            const x = BAR_MARGIN.left + i * band + (band - barW) / 2
            const y = BAR_MARGIN.top + innerH - h
            return (
              <rect
                key={d.label}
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, d.value > 0 ? 2 : 0)}
                rx={6}
                fill={`url(#${gradId})`}
                opacity={hover && hover.index !== i ? 0.55 : 1}
                onMouseEnter={() => setHover({ index: i, x: x + barW / 2, y })}
                onMouseLeave={() => setHover(null)}
              />
            )
          })}
          {/* x ticks */}
          {data.map((d, i) =>
            i % xEvery === 0 ? (
              <text
                key={d.label}
                x={BAR_MARGIN.left + i * band + band / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize={11}
                fill={tick}
              >
                {d.label}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {hover && (
        <ChartTooltip x={hover.x} y={hover.y}>
          {data[hover.index].label}: {data[hover.index].value}
        </ChartTooltip>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Donut chart                                                         */
/* ------------------------------------------------------------------ */

const DONUT_COLORS = ['#C1075D', '#E06F56', '#FFD64E', '#6B21A8', '#8A8177']
const DONUT_R = 80
const DONUT_STROKE = 26
const DONUT_PAD_DEG = 2

export function DonutChart({ data }: { data: ChartDatum[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const total = data.reduce((sum, d) => d.value + sum, 0)
  const C = 2 * Math.PI * DONUT_R
  const pad = (DONUT_PAD_DEG / 360) * C
  let acc = 0

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div className="relative">
        <svg width={DONUT_R * 2 + DONUT_STROKE} height={DONUT_R * 2 + DONUT_STROKE} role="img">
          <g transform={`translate(${(DONUT_R * 2 + DONUT_STROKE) / 2}, ${(DONUT_R * 2 + DONUT_STROKE) / 2}) rotate(-90)`}>
            {total > 0 &&
              data.map((d, i) => {
                const frac = d.value / total
                const len = Math.max(0, frac * C - pad)
                const start = acc * C + pad / 2
                acc += frac
                return (
                  <circle
                    key={d.label}
                    r={DONUT_R}
                    fill="none"
                    stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                    strokeWidth={hover === i ? DONUT_STROKE + 4 : DONUT_STROKE}
                    strokeDasharray={`${len} ${C - len}`}
                    strokeDashoffset={-start}
                    opacity={hover !== null && hover !== i ? 0.55 : 1}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  />
                )
              })}
          </g>
          <text textAnchor="middle" dominantBaseline="central" x="50%" y="50%" className="fill-ink font-display text-2xl font-bold">
            {total}
          </text>
        </svg>
      </div>
      <ul className="space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li
            key={d.label}
            className="flex items-center gap-2"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
            />
            <span className="text-muted">{d.label}</span>
            <span className="font-medium text-ink">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Area chart                                                          */
/* ------------------------------------------------------------------ */

const AREA_MARGIN = { top: 8, right: 8, bottom: 22, left: 30 }

function smoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const cx = (prev.x + curr.x) / 2
    d += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`
  }
  return d
}

export function AreaChart({ data, height, tick, grid }: { data: ChartDatum[]; height: number } & ThemeStrokes) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>()
  const gradId = useId()
  const [hover, setHover] = useState<HoverState | null>(null)

  const innerW = width - AREA_MARGIN.left - AREA_MARGIN.right
  const innerH = height - AREA_MARGIN.top - AREA_MARGIN.bottom
  const max = Math.max(1, ...data.map((d) => d.value))
  const step = Math.max(1, Math.ceil(max / 4))
  const yMax = step * 4
  const yTicks = [0, step, step * 2, step * 3, yMax]
  const xEvery = Math.ceil(data.length / 8)

  const points = data.map((d, i) => ({
    x: AREA_MARGIN.left + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2),
    y: AREA_MARGIN.top + innerH - (d.value / yMax) * innerH,
  }))
  const line = smoothPath(points)
  const area =
    points.length > 1
      ? `${line} L ${points[points.length - 1].x} ${AREA_MARGIN.top + innerH} L ${points[0].x} ${AREA_MARGIN.top + innerH} Z`
      : ''

  const onMove = (e: ReactMouseEvent<SVGRectElement>) => {
    if (points.length === 0) return
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
    const mx = e.clientX - rect.left
    const idx = points.length === 1 ? 0 : Math.round(((mx - AREA_MARGIN.left) / innerW) * (points.length - 1))
    const clamped = Math.max(0, Math.min(points.length - 1, idx))
    setHover({ index: clamped, x: points[clamped].x, y: points[clamped].y })
  }

  return (
    <div ref={wrapRef} className="relative">
      {width > 0 && (
        <svg width={width} height={height} role="img">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C1075D" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#C1075D" stopOpacity={0} />
            </linearGradient>
          </defs>
          {yTicks.map((v) => {
            const y = AREA_MARGIN.top + innerH - (v / yMax) * innerH
            return (
              <g key={v}>
                <line x1={AREA_MARGIN.left} x2={width - AREA_MARGIN.right} y1={y} y2={y} stroke={grid} strokeDasharray="3 3" />
                <text x={AREA_MARGIN.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill={tick}>
                  {v}
                </text>
              </g>
            )
          })}
          {area && <path d={area} fill={`url(#${gradId})`} />}
          {points.length > 1 && (
            <path d={line} fill="none" stroke="#C1075D" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          )}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={hover && hover.index === i ? 4 : 3}
              fill="#FFFFFF"
              stroke="#C1075D"
              strokeWidth={2}
            />
          ))}
          {/* x ticks */}
          {data.map((d, i) =>
            i % xEvery === 0 ? (
              <text
                key={`${d.label}-${i}`}
                x={points[i].x}
                y={height - 6}
                textAnchor="middle"
                fontSize={11}
                fill={tick}
              >
                {d.label}
              </text>
            ) : null,
          )}
          {/* hover capture overlay */}
          <rect
            x={AREA_MARGIN.left}
            y={AREA_MARGIN.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hover && (
        <ChartTooltip x={hover.x} y={hover.y}>
          {data[hover.index].label}: {data[hover.index].value}
        </ChartTooltip>
      )}
    </div>
  )
}
