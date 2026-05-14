import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface RevenueChartPoint {
  day: string;
  valueDa: number;
}

export interface RevenueChartProps {
  title?: string;
  series: readonly RevenueChartPoint[];
  className?: string;
}

const W = 560;
const H = 200;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 32;

function buildSmoothPath(points: [number, number][]): string {
  if (points.length < 2) return "";
  const d: string[] = [];
  d.push(`M ${points[0]![0].toFixed(2)} ${points[0]![1].toFixed(2)}`);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const pPrev = points[i - 1] ?? p0;
    const pNext = points[i + 2] ?? p1;
    const cp1x = p0[0] + (p1[0] - pPrev[0]) / 6;
    const cp1y = p0[1] + (p1[1] - pPrev[1]) / 6;
    const cp2x = p1[0] - (pNext[0] - p0[0]) / 6;
    const cp2y = p1[1] - (pNext[1] - p0[1]) / 6;
    d.push(`C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`);
  }
  return d.join(" ");
}

function formatAxisDa(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1000)}k`;
}

export function RevenueChart({ title = "Weekly Revenue", series, className }: RevenueChartProps) {
  const gid = useId();
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLen, setPathLen] = useState(0);
  const [drawn, setDrawn] = useState(false);

  const chart = useMemo(() => {
    const values = series.map((s) => s.valueDa);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const span = dataMax - dataMin || 1;
    const yMin = Math.max(0, dataMin - span * 0.15);
    const yMax = dataMax + span * 0.12;
    const innerW = W - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;
    const n = series.length;
    const pts: [number, number][] = series.map((s, i) => {
      const x = PAD_L + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
      const t = (s.valueDa - yMin) / (yMax - yMin);
      const y = PAD_T + innerH * (1 - t);
      return [x, y] as [number, number];
    });
    const linePath = buildSmoothPath(pts);
    const areaPath =
      pts.length >= 2
        ? `${linePath} L ${pts[pts.length - 1]![0].toFixed(2)} ${PAD_T + innerH} L ${pts[0]![0].toFixed(2)} ${PAD_T + innerH} Z`
        : "";
    const gridSteps = 4;
    const gridYs: { y: number; label: string }[] = [];
    for (let i = 0; i <= gridSteps; i++) {
      const v = yMin + ((yMax - yMin) * (gridSteps - i)) / gridSteps;
      const t = (v - yMin) / (yMax - yMin);
      const y = PAD_T + innerH * (1 - t);
      gridYs.push({ y, label: formatAxisDa(v) });
    }
    return { linePath, areaPath, points: pts, gridYs, innerH };
  }, [series]);

  useEffect(() => {
    setDrawn(false);
    const el = pathRef.current;
    if (!el) return;
    const len = el.getTotalLength();
    setPathLen(len);
    const t = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(t);
  }, [chart.linePath]);

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-2xl border border-white/[0.08] bg-[#111827] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_16px_48px_-24px_rgba(0,0,0,0.55)] md:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-white md:text-lg">{title}</h2>
          <p className="mt-0.5 text-sm font-medium text-slate-300">Mon–Sun · DA</p>
        </div>
      </div>

      <div className="relative mt-2 min-h-[12rem] flex-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full max-h-[220px] overflow-visible md:max-h-[240px]"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Weekly revenue trend"
        >
          <defs>
            <linearGradient id={`${gid}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="rgb(99 102 241)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${gid}-line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgb(129 140 248)" />
              <stop offset="100%" stopColor="rgb(192 132 252)" />
            </linearGradient>
          </defs>

          {chart.gridYs.map((row, i) => (
            <g key={`g-${i}`}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={row.y}
                y2={row.y}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={PAD_L - 6}
                y={row.y + 4}
                textAnchor="end"
                fill="#94a3b8"
                style={{ fontSize: "10px", fontWeight: 600 }}
              >
                {row.label}
              </text>
            </g>
          ))}

          {chart.areaPath ? (
            <path d={chart.areaPath} fill={`url(#${gid}-area)`} style={{ opacity: drawn ? 1 : 0 }} className="transition-opacity duration-500" />
          ) : null}

          <path
            ref={pathRef}
            d={chart.linePath}
            fill="none"
            stroke={`url(#${gid}-line)`}
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{
              strokeDasharray: pathLen || 800,
              strokeDashoffset: drawn ? 0 : pathLen || 800,
              transition: "stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />

          {chart.points.map(([x, y], i) => (
            <g key={series[i]?.day ?? `p-${i}`} style={{ opacity: drawn ? 1 : 0 }} className="transition-opacity duration-500">
              <circle cx={x} cy={y} r="7" fill="#0f172a" stroke="rgb(167 139 250)" strokeWidth="2" />
              <circle cx={x} cy={y} r="2.5" fill="rgb(241 245 249)" />
            </g>
          ))}

          {series.map((s, i) => {
            const x = chart.points[i]?.[0] ?? 0;
            return (
              <text
                key={s.day}
                x={x}
                y={H - 8}
                textAnchor="middle"
                fill="#cbd5e1"
                style={{ fontSize: "11px", fontWeight: 600 }}
              >
                {s.day}
              </text>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
