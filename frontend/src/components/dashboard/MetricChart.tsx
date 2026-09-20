"use client";

/**
 * MetricChart — Reusable area chart for one or two metric series.
 *
 * Supports:
 *   - Percentage metrics (CPU, Memory, Disk) → 0-100% Y axis
 *   - Absolute metrics (e.g. network KB/s)   → auto Y axis
 *   - Optional secondary series (e.g. Network In alongside Out)
 *
 * Uses Recharts (MIT).
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format } from "date-fns";

interface SeriesConfig {
  /** Key on each data point holding the numeric value */
  dataKey: string;
  label: string;
  color: string;
}

interface MetricChartProps {
  metrics: ReadonlyArray<{ timestamp: string }>;
  dataKey: string;
  label: string;
  color: string;
  /** Optional second series drawn on the same axes */
  secondary?: SeriesConfig;
  /** Unit suffix shown in tooltip / axis (e.g. "%" or " KB/s") */
  unit?: string;
  /** If true, Y axis is clamped 0-100. Default true. */
  percentAxis?: boolean;
  /** Optional threshold reference line (host's configured limit) */
  threshold?: number;
  /** date-fns format for the X axis / tooltip. Default "HH:mm:ss". */
  timeFormat?: string;
  title: string;
}

function CustomTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card px-4 py-3 shadow-xl text-sm">
      <p className="text-surface-muted mb-1 text-xs">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full flex-shrink-0"
            style={{ background: p.color }}
          />
          <span className="text-surface-muted text-xs">{p.name}</span>
          <span className="text-white font-mono font-semibold">
            {typeof p.value === "number" ? p.value.toFixed(1) : "—"}
            {unit ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function lastValue(data: Record<string, unknown>[], key: string): number | null {
  const v = data.length ? data[data.length - 1][key] : null;
  return typeof v === "number" ? v : null;
}

export function MetricChart({
  metrics,
  dataKey,
  label,
  color,
  secondary,
  unit = "%",
  percentAxis = true,
  threshold,
  timeFormat = "HH:mm:ss",
  title,
}: MetricChartProps) {
  const data = metrics.map((m) => {
    const row = m as unknown as Record<string, unknown>;
    return {
      time: format(new Date(m.timestamp), timeFormat),
      value: (row[dataKey] as number | null | undefined) ?? null,
      value2: secondary
        ? ((row[secondary.dataKey] as number | null | undefined) ?? null)
        : null,
    };
  });

  const latest = lastValue(data, "value");
  const latest2 = secondary ? lastValue(data, "value2") : null;

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          {title}
        </h3>
        <div className="flex items-baseline gap-3 font-mono tabular-nums">
          {latest !== null && (
            <span className="text-lg font-bold" style={{ color }}>
              {latest.toFixed(1)}{unit}
            </span>
          )}
          {secondary && latest2 !== null && (
            <span className="text-lg font-bold" style={{ color: secondary.color }}>
              {latest2.toFixed(1)}{unit}
            </span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            {secondary && (
              <linearGradient id={`grad-${secondary.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={secondary.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={secondary.color} stopOpacity={0} />
              </linearGradient>
            )}
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1f2130" vertical={false} />

          <XAxis
            dataKey="time"
            tick={{ fill: "#6b7280", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />

          <YAxis
            domain={percentAxis ? [0, 100] : [0, "auto"]}
            tick={{ fill: "#6b7280", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${Math.round(v)}${unit}`}
          />

          <Tooltip
            content={<CustomTooltip unit={unit} />}
            cursor={{ stroke: color, strokeWidth: 1, strokeOpacity: 0.4 }}
          />

          {threshold !== undefined && (
            <ReferenceLine
              y={threshold}
              stroke="#ef4444"
              strokeDasharray="4 3"
              strokeOpacity={0.7}
              label={{
                value: `Limit ${threshold}${unit}`,
                fill: "#ef4444",
                fontSize: 10,
                position: "insideTopRight",
              }}
            />
          )}

          <Area
            type="monotone"
            dataKey="value"
            name={label}
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad-${dataKey})`}
            dot={false}
            activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
            connectNulls
            isAnimationActive={false}
          />

          {secondary && (
            <Area
              type="monotone"
              dataKey="value2"
              name={secondary.label}
              stroke={secondary.color}
              strokeWidth={2}
              fill={`url(#grad-${secondary.dataKey})`}
              dot={false}
              activeDot={{ r: 4, fill: secondary.color, strokeWidth: 0 }}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
