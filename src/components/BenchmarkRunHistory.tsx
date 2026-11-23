import React from 'react';
import { Download, Trash2 } from 'lucide-react';
import { BenchmarkRunRecord } from '../types/benchmark';

interface BenchmarkRunHistoryProps {
  runs: BenchmarkRunRecord[];
  onClearRuns: () => void;
  onExportCsv: () => void;
  onDeleteRun: (id: string) => void;
}

export const BenchmarkRunHistory: React.FC<BenchmarkRunHistoryProps> = ({
  runs,
  onClearRuns,
  onExportCsv,
  onDeleteRun,
}) => {
  // Baseline run (oldest or first 60s run) for relative delta percentage calculation
  const baselineRun = runs.length > 0 ? runs[runs.length - 1] : null;

  return (
    <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Overclock & Frame Limiter Benchmark Log ({runs.length})
          </h3>
          <p className="text-xs text-slate-400">
            Compare 60-second overclock stability runs and 3rd-party FPS limiter accuracy across clock profiles
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExportCsv}
            disabled={runs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#111827] hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none text-slate-200 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={onClearRuns}
            disabled={runs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#111827] hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-800/60 disabled:opacity-40 disabled:pointer-events-none text-slate-400 border border-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Log
          </button>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="py-8 px-4 text-center border border-dashed border-slate-800 rounded-md bg-[#07090E]/50">
          <p className="text-xs font-mono text-slate-400">
            No completed benchmark runs recorded in this session yet.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Label your GPU clock profile in the left panel (e.g., &ldquo;Stock Clock&rdquo; or &ldquo;+150 MHz Core&rdquo;) and run a 60-Second Benchmark or Stop a Free Run to log results.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400">
                <th className="py-2.5 pr-3 font-medium">Profile / Notes</th>
                <th className="py-2.5 px-3 font-medium">Mode & Load</th>
                <th className="py-2.5 px-3 font-medium text-right">Target Cap</th>
                <th className="py-2.5 px-3 font-medium text-right">Avg FPS</th>
                <th className="py-2.5 px-3 font-medium text-right">1% Low</th>
                <th className="py-2.5 px-3 font-medium text-right">0.1% Low</th>
                <th className="py-2.5 px-3 font-medium text-right">Avg Delta</th>
                <th className="py-2.5 px-3 font-medium text-right">Jitter (σ)</th>
                <th className="py-2.5 px-3 font-medium text-right">Stutters</th>
                <th className="py-2.5 pl-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs font-mono tabular-nums">
              {runs.map((run) => {
                const deltaPercent =
                  baselineRun && baselineRun.id !== run.id && baselineRun.avgFps > 0
                    ? ((run.avgFps - baselineRun.avgFps) / baselineRun.avgFps) * 100
                    : null;

                return (
                  <tr
                    key={run.id}
                    className="hover:bg-[#111827]/70 transition-colors"
                  >
                    <td className="py-2.5 pr-3 font-sans">
                      <div className="font-medium text-slate-100">
                        {run.clockProfileLabel || 'Default Profile'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {run.timestamp} · {run.durationSeconds.toFixed(1)}s
                        {run.completedFull60s ? ' · 60s Verified' : ''}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      <div>
                        {run.mode === 'benchmark_60s'
                          ? '60s OC Stress'
                          : 'Free Run'}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {run.shaderIterations} steps · {Math.round(run.resolutionScale * 100)}% res
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {run.referenceTargetFps
                        ? `${run.referenceTargetFps} FPS`
                        : 'Uncapped'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="font-semibold text-cyan-400">
                        {run.avgFps.toFixed(1)}
                      </span>
                      {deltaPercent !== null && (
                        <span
                          className={`ml-1.5 text-[10px] ${
                            deltaPercent >= 0
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {deltaPercent >= 0 ? '+' : ''}
                          {deltaPercent.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200">
                      {run.low1PercentFps.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {run.low01PercentFps.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-300">
                      {run.avgFrameTimeMs.toFixed(2)} ms
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      ±{run.frameJitterMs.toFixed(2)} ms
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span
                        className={
                          run.stutterEvents === 0
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }
                      >
                        {run.stutterEvents}
                      </span>
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteRun(run.id)}
                        className="text-slate-500 hover:text-rose-400 transition-colors px-1.5 py-0.5"
                        title="Remove run from log"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
