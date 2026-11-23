import React, { useState } from 'react';
import {
  FrameDistributionBuckets,
  FrameTimeHistoryPoint,
} from '../types/benchmark';

interface TelemetryChartsProps {
  history: FrameTimeHistoryPoint[];
  referenceTargetFps: number | null;
  buckets: FrameDistributionBuckets;
  totalFrames: number;
  currentFps: number;
  frameTimeMs: number;
}

export const TelemetryCharts: React.FC<TelemetryChartsProps> = ({
  history,
  referenceTargetFps,
  buckets,
  totalFrames,
  currentFps,
  frameTimeMs,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [chartMetric, setChartMetric] = useState<'fps' | 'frametime'>('fps');

  // Determine vertical scale dynamically
  const maxObservedFps = history.reduce((m, p) => Math.max(m, p.fps), 0);
  const maxFpsScale = Math.max(
    120,
    referenceTargetFps ? referenceTargetFps * 1.25 : 144,
    Math.ceil((maxObservedFps * 1.15) / 30) * 30
  );

  const maxObservedMs = history.reduce((m, p) => Math.max(m, p.frameTimeMs), 0);
  const maxMsScale = Math.max(35, Math.ceil((maxObservedMs * 1.2) / 10) * 10);

  const width = 680;
  const height = 165;
  const padLeft = 44;
  const padRight = 16;
  const padTop = 14;
  const padBottom = 24;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getPointCoords = (pt: FrameTimeHistoryPoint, idx: number, count: number) => {
    const x =
      padLeft + (count <= 1 ? plotW : (idx / (count - 1)) * plotW);
    const val = chartMetric === 'fps' ? pt.fps : pt.frameTimeMs;
    const maxScale = chartMetric === 'fps' ? maxFpsScale : maxMsScale;
    const clamped = Math.max(0, Math.min(maxScale, val));
    const y = padTop + plotH - (clamped / maxScale) * plotH;
    return { x, y };
  };

  const pathD =
    history.length > 1
      ? history
          .map((pt, idx) => {
            const { x, y } = getPointCoords(pt, idx, history.length);
            return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(' ')
      : '';

  const areaD =
    history.length > 1
      ? `${pathD} L ${(padLeft + plotW).toFixed(1)} ${(padTop + plotH).toFixed(
          1
        )} L ${padLeft.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : '';

  // Reference line y-coordinate
  let referenceY: number | null = null;
  let referenceLabel = '';
  if (referenceTargetFps && referenceTargetFps > 0) {
    if (chartMetric === 'fps') {
      if (referenceTargetFps <= maxFpsScale) {
        referenceY =
          padTop + plotH - (referenceTargetFps / maxFpsScale) * plotH;
        referenceLabel = `TARGET CAP: ${referenceTargetFps} FPS`;
      }
    } else {
      const targetMs = 1000 / referenceTargetFps;
      if (targetMs <= maxMsScale) {
        referenceY = padTop + plotH - (targetMs / maxMsScale) * plotH;
        referenceLabel = `TARGET PACE: ${targetMs.toFixed(2)} ms`;
      }
    }
  }

  const bucketList = [
    {
      label: '< 4.0 ms',
      sub: '> 250 FPS',
      count: buckets.under4ms,
      barClass: 'bg-cyan-400',
    },
    {
      label: '4.0 – 8.0 ms',
      sub: '125 – 250 FPS',
      count: buckets.ms4to8,
      barClass: 'bg-cyan-500',
    },
    {
      label: '8.0 – 16.7 ms',
      sub: '60 – 125 FPS',
      count: buckets.ms8to16_7,
      barClass: 'bg-blue-500',
    },
    {
      label: '16.7 – 33.3 ms',
      sub: '30 – 60 FPS',
      count: buckets.ms16_7to33_3,
      barClass: 'bg-amber-500',
    },
    {
      label: '> 33.3 ms',
      sub: '< 30 FPS (Lag)',
      count: buckets.over33_3ms,
      barClass: 'bg-rose-500',
    },
  ];

  const activeHoverPoint =
    hoverIndex !== null && history[hoverIndex] ? history[hoverIndex] : null;
  const activeHoverCoords =
    hoverIndex !== null && history[hoverIndex]
      ? getPointCoords(history[hoverIndex], hoverIndex, history.length)
      : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Left 8 cols: Real-time Oscilloscope Trace */}
      <div className="lg:col-span-8 bg-[#0B0E17] border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Real-Time Frame Pacing Oscilloscope
            </h3>
            <p className="text-xs text-slate-400">
              Rolling telemetry trace ({history.length} samples)
              {referenceTargetFps
                ? ` · 3rd-Party Limiter Reference: ${referenceTargetFps} FPS (${(
                    1000 / referenceTargetFps
                  ).toFixed(2)} ms)`
                : ' · No FPS Cap Reference Selected'}
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-md">
            <button
              type="button"
              onClick={() => setChartMetric('fps')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                chartMetric === 'fps'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Frame Rate (FPS)
            </button>
            <button
              type="button"
              onClick={() => setChartMetric('frametime')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                chartMetric === 'frametime'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Frame Time (ms)
            </button>
          </div>
        </div>

        {/* SVG Chart Stage */}
        <div className="relative w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-44 select-none cursor-crosshair overflow-visible"
            onMouseLeave={() => setHoverIndex(null)}
            onMouseMove={(e) => {
              if (history.length === 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = ((e.clientX - rect.left) / rect.width) * width;
              const ratio = Math.max(
                0,
                Math.min(1, (relX - padLeft) / plotW)
              );
              const idx = Math.round(ratio * (history.length - 1));
              setHoverIndex(idx);
            }}
          >
            <defs>
              <linearGradient id="traceFillFps" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="traceFillMs" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((step) => {
              const y = padTop + plotH - step * plotH;
              const maxScale =
                chartMetric === 'fps' ? maxFpsScale : maxMsScale;
              const labelVal = Math.round(step * maxScale);
              return (
                <g key={step}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={padLeft + plotW}
                    y2={y}
                    stroke="#1E293B"
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-500 text-[10px] font-mono"
                  >
                    {labelVal}
                  </text>
                </g>
              );
            })}

            {/* Target FPS Reference Line */}
            {referenceY !== null && (
              <g>
                <line
                  x1={padLeft}
                  y1={referenceY}
                  x2={padLeft + plotW}
                  y2={referenceY}
                  stroke="#10B981"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                />
                <rect
                  x={padLeft + 6}
                  y={Math.max(2, referenceY - 16)}
                  width={142}
                  height={15}
                  rx="2"
                  fill="#07090E"
                  stroke="#10B981"
                  strokeWidth="0.75"
                />
                <text
                  x={padLeft + 11}
                  y={Math.max(12, referenceY - 5)}
                  className="fill-emerald-400 text-[9.5px] font-mono font-semibold"
                >
                  {referenceLabel}
                </text>
              </g>
            )}

            {/* Area & Line Path */}
            {history.length > 1 && (
              <>
                <path
                  d={areaD}
                  fill={
                    chartMetric === 'fps'
                      ? 'url(#traceFillFps)'
                      : 'url(#traceFillMs)'
                  }
                />
                <path
                  d={pathD}
                  fill="none"
                  stroke={chartMetric === 'fps' ? '#06B6D4' : '#F59E0B'}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </>
            )}

            {/* Empty State inside SVG */}
            {history.length <= 1 && (
              <text
                x={padLeft + plotW / 2}
                y={padTop + plotH / 2 + 4}
                textAnchor="middle"
                className="fill-slate-500 text-xs font-mono"
              >
                STANDBY — Press Start to capture real-time frame pacing telemetry
              </text>
            )}

            {/* Hover Crosshair */}
            {activeHoverPoint && activeHoverCoords && (
              <g>
                <line
                  x1={activeHoverCoords.x}
                  y1={padTop}
                  x2={activeHoverCoords.x}
                  y2={padTop + plotH}
                  stroke="#94A3B8"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={activeHoverCoords.x}
                  cy={activeHoverCoords.y}
                  r="4"
                  fill={chartMetric === 'fps' ? '#06B6D4' : '#F59E0B'}
                  stroke="#07090E"
                  strokeWidth="1.5"
                />
              </g>
            )}
          </svg>

          {/* Bottom live readout bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-xs font-mono text-slate-400">
            <div>
              {activeHoverPoint ? (
                <span className="text-slate-200">
                  INSPECT [T+{activeHoverPoint.timeSec.toFixed(1)}s]:{' '}
                  <strong className="text-cyan-400">
                    {activeHoverPoint.fps.toFixed(1)} FPS
                  </strong>{' '}
                  ·{' '}
                  <strong className="text-amber-400">
                    {activeHoverPoint.frameTimeMs.toFixed(2)} ms
                  </strong>{' '}
                  · Shader Depth: {activeHoverPoint.effectiveSteps} steps
                </span>
              ) : (
                <span>
                  Hover waveform to inspect point-in-time frame delta & shader depth
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 tabular-nums">
              <span>
                LIVE:{' '}
                <strong className="text-cyan-400">
                  {currentFps.toFixed(1)} FPS
                </strong>
              </span>
              <span>·</span>
              <span>
                DELTA:{' '}
                <strong className="text-amber-400">
                  {frameTimeMs.toFixed(2)} ms
                </strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right 4 cols: Frame Time Distribution Histogram */}
      <div className="lg:col-span-4 bg-[#0B0E17] border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-slate-100">
              Frame Pacing Distribution
            </h3>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {totalFrames.toLocaleString()} frames
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Frame-time consistency breakdown for verifying 3rd-party limiter lock
          </p>

          <div className="space-y-2.5">
            {bucketList.map((b) => {
              const pct =
                totalFrames > 0 ? (b.count / totalFrames) * 100 : 0;
              return (
                <div key={b.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-200">
                      {b.label}{' '}
                      <span className="text-slate-500">({b.sub})</span>
                    </span>
                    <span className="text-slate-300 tabular-nums">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#111827] rounded-sm overflow-hidden">
                    <div
                      className={`h-full ${b.barClass} transition-all duration-150`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>60 Hz Budget: 16.67 ms</span>
          <span>144 Hz Budget: 6.94 ms</span>
        </div>
      </div>
    </div>
  );
};
