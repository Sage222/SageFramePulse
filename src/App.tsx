import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Square,
  RotateCcw,
  Timer,
  ShieldCheck,
  Sliders,
  Gauge,
  Download,
} from 'lucide-react';
import {
  BenchmarkConfig,
  BenchmarkMode,
  BenchmarkRunRecord,
  BenchmarkStatus,
  FrameDistributionBuckets,
  FrameTimeHistoryPoint,
  LiveTelemetry,
  ShaderSceneType,
  WorkloadPreset,
} from './types/benchmark';
import { GpuBenchmarkRenderer } from './utils/gpuRenderer';
import { TelemetryCharts } from './components/TelemetryCharts';
import { BenchmarkRunHistory } from './components/BenchmarkRunHistory';
import { buildStandaloneBenchmarkHtml } from './utils/standaloneHtmlBuilder';

const INITIAL_BUCKETS: FrameDistributionBuckets = {
  under4ms: 0,
  ms4to8: 0,
  ms8to16_7: 0,
  ms16_7to33_3: 0,
  over33_3ms: 0,
};

const PRESET_CONFIGS: Record<
  Exclude<WorkloadPreset, 'custom'>,
  { shaderIterations: number; resolutionScale: number; geometrySubdivisions: number; description: string }
> = {
  light: {
    shaderIterations: 10,
    resolutionScale: 0.75,
    geometrySubdivisions: 150,
    description: 'High-FPS headroom (240+ FPS) ideal for testing external 3rd-party frame rate limiters.',
  },
  balanced: {
    shaderIterations: 26,
    resolutionScale: 1.0,
    geometrySubdivisions: 320,
    description: 'Sustained WebGL2 shader load that stresses GPU clocks while keeping desktop UI silky smooth.',
  },
  heavy: {
    shaderIterations: 44,
    resolutionScale: 1.0,
    geometrySubdivisions: 600,
    description: 'Intensive 44-step ALU/FBM shader stress for 60s GPU overclock stability testing with watchdog protection.',
  },
};

const COMMON_FPS_CAPS: (number | null)[] = [null, 30, 60, 90, 120, 144, 165, 240];

export default function App() {
  // Always open in a STOPPED state as required
  const [status, setStatus] = useState<BenchmarkStatus>('stopped');

  const [config, setConfig] = useState<BenchmarkConfig>({
    mode: 'free_run',
    preset: 'balanced',
    scene: 'volumetric_lattice',
    shaderIterations: PRESET_CONFIGS.balanced.shaderIterations,
    resolutionScale: PRESET_CONFIGS.balanced.resolutionScale,
    geometrySubdivisions: PRESET_CONFIGS.balanced.geometrySubdivisions,
    referenceTargetFps: 144,
    watchdogEnabled: true,
    clockProfileLabel: 'Stock GPU Profile',
  });

  const [customCapInput, setCustomCapInput] = useState<string>('144');

  const [telemetry, setTelemetry] = useState<LiveTelemetry>({
    currentFps: 0,
    instantFps: 0,
    frameTimeMs: 0,
    avgFps: 0,
    minFps: 0,
    maxFps: 0,
    low1PercentFps: 0,
    low01PercentFps: 0,
    frameJitterMs: 0,
    limiterDeviationFps: null,
    limiterPacingStatus: 'Unset',
    totalFrames: 0,
    stutterEvents: 0,
    elapsedSeconds: 0,
    remainingSeconds: 60,
    effectiveShaderSteps: PRESET_CONFIGS.balanced.shaderIterations,
    watchdogTriggeredCount: 0,
    watchdogActiveNow: false,
    gpuRendererInfo: 'Initializing WebGL2 Adapter...',
    gpuVendorInfo: 'Hardware Probe',
    renderBackend: 'WebGL2',
    renderWidth: 1280,
    renderHeight: 720,
    buckets: { ...INITIAL_BUCKETS },
  });

  const [history, setHistory] = useState<FrameTimeHistoryPoint[]>([]);
  const [runRecords, setRunRecords] = useState<BenchmarkRunRecord[]>(() => {
    try {
      const saved = localStorage.getItem('framepulse_run_records_v1');
      return saved ? (JSON.parse(saved) as BenchmarkRunRecord[]) : [];
    } catch {
      return [];
    }
  });
  const [lastCompletedBanner, setLastCompletedBanner] = useState<BenchmarkRunRecord | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('framepulse_run_records_v1', JSON.stringify(runRecords));
    } catch {
      // Ignore storage quota errors in restricted environments
    }
  }, [runRecords]);

  // Refs for precision animation loop without React state closure lag
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportContainerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<GpuBenchmarkRenderer | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const isRunningRef = useRef<boolean>(false);
  const configRef = useRef<BenchmarkConfig>(config);
  configRef.current = config;

  // Frame timing accumulator refs
  const startTimeMsRef = useRef<number>(0);
  const lastFrameTimestampRef = useRef<number>(0);
  const lastUiSyncMsRef = useRef<number>(0);
  const allFrameDeltasRef = useRef<number[]>([]);
  const recentDeltasWindowRef = useRef<number[]>([]);
  const bucketsRef = useRef<FrameDistributionBuckets>({ ...INITIAL_BUCKETS });
  const stutterCountRef = useRef<number>(0);
  const effectiveStepsRef = useRef<number>(config.shaderIterations);
  const consecutiveSlowFramesRef = useRef<number>(0);
  const watchdogCountRef = useRef<number>(0);
  const watchdogActiveRef = useRef<boolean>(false);
  const historyRef = useRef<FrameTimeHistoryPoint[]>([]);
  const renderDimensionsRef = useRef<{ width: number; height: number }>({
    width: 1280,
    height: 720,
  });

  // Initialize WebGL renderer once on mount and draw static standby frame (STOPPED state)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = viewportContainerRef.current;
    if (!canvas || !container) return;

    const renderer = new GpuBenchmarkRenderer(canvas);
    rendererRef.current = renderer;

    const rect = container.getBoundingClientRect();
    const dims = renderer.resize(
      rect.width || 960,
      rect.height || 460,
      configRef.current.resolutionScale
    );
    renderDimensionsRef.current = dims;

    // Render single static frame in stopped state
    renderer.renderStandbyFrame(
      configRef.current.scene,
      configRef.current.shaderIterations
    );

    const hw = renderer.getHardwareInfo();
    setTelemetry((prev) => ({
      ...prev,
      gpuRendererInfo: hw.renderer,
      gpuVendorInfo: hw.vendor,
      renderBackend: hw.backend,
      renderWidth: dims.width,
      renderHeight: dims.height,
      effectiveShaderSteps: configRef.current.shaderIterations,
    }));

    const handleResize = () => {
      if (!viewportContainerRef.current || !rendererRef.current) return;
      const r = viewportContainerRef.current.getBoundingClientRect();
      const updatedDims = rendererRef.current.resize(
        r.width || 960,
        r.height || 460,
        configRef.current.resolutionScale
      );
      renderDimensionsRef.current = updatedDims;
      if (!isRunningRef.current) {
        rendererRef.current.renderStandbyFrame(
          configRef.current.scene,
          configRef.current.shaderIterations
        );
      }
      setTelemetry((prev) => ({
        ...prev,
        renderWidth: updatedDims.width,
        renderHeight: updatedDims.height,
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      renderer.dispose();
    };
  }, []);

  // Re-render static standby preview whenever scene or resolution changes while stopped
  useEffect(() => {
    if (status !== 'running' && rendererRef.current && viewportContainerRef.current) {
      const r = viewportContainerRef.current.getBoundingClientRect();
      const dims = rendererRef.current.resize(
        r.width || 960,
        r.height || 460,
        config.resolutionScale
      );
      renderDimensionsRef.current = dims;
      rendererRef.current.renderStandbyFrame(config.scene, config.shaderIterations);
      setTelemetry((prev) => ({
        ...prev,
        renderWidth: dims.width,
        renderHeight: dims.height,
        effectiveShaderSteps: config.shaderIterations,
      }));
    }
  }, [config.scene, config.resolutionScale, config.shaderIterations, status]);

  // Helper to compute 1% low, 0.1% low, jitter, and averages from collected frame deltas
  const calculateMetrics = useCallback((deltas: number[], recentDeltas: number[]) => {
    if (deltas.length === 0) {
      return {
        currentFps: 0,
        instantFps: 0,
        frameTimeMs: 0,
        avgFps: 0,
        minFps: 0,
        maxFps: 0,
        low1PercentFps: 0,
        low01PercentFps: 0,
        frameJitterMs: 0,
      };
    }

    const lastDelta = deltas[deltas.length - 1];
    const instantFps = lastDelta > 0 ? 1000 / lastDelta : 0;

    // Rolling window (~30 recent frames) for smooth readable current FPS
    const recentSum = recentDeltas.reduce((a, b) => a + b, 0);
    const recentAvgMs = recentDeltas.length > 0 ? recentSum / recentDeltas.length : lastDelta;
    const currentFps = recentAvgMs > 0 ? 1000 / recentAvgMs : 0;

    // Jitter = standard deviation of recent frame deltas in ms
    let varianceSum = 0;
    for (let i = 0; i < recentDeltas.length; i++) {
      const diff = recentDeltas[i] - recentAvgMs;
      varianceSum += diff * diff;
    }
    const frameJitterMs =
      recentDeltas.length > 1 ? Math.sqrt(varianceSum / recentDeltas.length) : 0;

    // Session totals
    let totalMs = 0;
    let minDelta = Infinity;
    let maxDelta = 0;
    for (let i = 0; i < deltas.length; i++) {
      const d = deltas[i];
      totalMs += d;
      if (d < minDelta) minDelta = d;
      if (d > maxDelta) maxDelta = d;
    }

    const avgMs = totalMs / deltas.length;
    const avgFps = avgMs > 0 ? 1000 / avgMs : 0;
    const maxFps = minDelta > 0 ? 1000 / minDelta : 0;
    const minFps = maxDelta > 0 ? 1000 / maxDelta : 0;

    // 1% Low and 0.1% Low FPS (average of the slowest 1% and 0.1% frame deltas)
    const sortedDesc = [...deltas].sort((a, b) => b - a);
    const count1Pct = Math.max(1, Math.ceil(sortedDesc.length * 0.01));
    const count01Pct = Math.max(1, Math.ceil(sortedDesc.length * 0.001));

    let sumSlow1 = 0;
    for (let i = 0; i < count1Pct; i++) sumSlow1 += sortedDesc[i];
    const low1PercentFps = 1000 / (sumSlow1 / count1Pct);

    let sumSlow01 = 0;
    for (let i = 0; i < count01Pct; i++) sumSlow01 += sortedDesc[i];
    const low01PercentFps = 1000 / (sumSlow01 / count01Pct);

    return {
      currentFps,
      instantFps,
      frameTimeMs: recentAvgMs,
      avgFps,
      minFps,
      maxFps,
      low1PercentFps,
      low01PercentFps,
      frameJitterMs,
    };
  }, []);

  // Finalize and record a benchmark run
  const finalizeRun = useCallback(
    (completedFull60s: boolean, elapsedSec: number) => {
      isRunningRef.current = false;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      const deltas = allFrameDeltasRef.current;
      const recent = recentDeltasWindowRef.current;
      const metrics = calculateMetrics(deltas, recent);
      const activeConfig = configRef.current;

      // Return canvas to low-power standby frame
      if (rendererRef.current) {
        rendererRef.current.renderStandbyFrame(
          activeConfig.scene,
          activeConfig.shaderIterations
        );
      }

      if (deltas.length >= 15 && elapsedSec >= 1.0) {
        const avgFrameTimeMs =
          metrics.avgFps > 0 ? 1000 / metrics.avgFps : 0;
        const consistencyRatio =
          metrics.avgFps > 0
            ? Math.min(100, (metrics.low1PercentFps / metrics.avgFps) * 100)
            : 0;

        const newRecord: BenchmarkRunRecord = {
          id: `run-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          mode: activeConfig.mode,
          durationSeconds: elapsedSec,
          completedFull60s,
          clockProfileLabel:
            activeConfig.clockProfileLabel.trim() || 'Stock GPU Profile',
          preset: activeConfig.preset,
          scene: activeConfig.scene,
          shaderIterations: activeConfig.shaderIterations,
          resolutionScale: activeConfig.resolutionScale,
          referenceTargetFps: activeConfig.referenceTargetFps,
          avgFps: metrics.avgFps,
          minFps: metrics.minFps,
          maxFps: metrics.maxFps,
          low1PercentFps: metrics.low1PercentFps,
          low01PercentFps: metrics.low01PercentFps,
          avgFrameTimeMs,
          frameJitterMs: metrics.frameJitterMs,
          totalFrames: deltas.length,
          stutterEvents: stutterCountRef.current,
          watchdogTriggers: watchdogCountRef.current,
          pacingConsistencyPercent: consistencyRatio,
        };

        setRunRecords((prev) => [newRecord, ...prev]);
        setLastCompletedBanner(newRecord);
      }

      setStatus(completedFull60s ? 'completed' : 'stopped');
    },
    [calculateMetrics]
  );

  // Stop benchmark handler
  const handleStopBenchmark = useCallback(() => {
    if (!isRunningRef.current) {
      setStatus('stopped');
      return;
    }
    const elapsedSec =
      startTimeMsRef.current > 0
        ? (performance.now() - startTimeMsRef.current) / 1000
        : 0;
    finalizeRun(false, elapsedSec);
  }, [finalizeRun]);

  // Start benchmark handler (can be launched in current mode or explicitly override mode)
  const handleStartBenchmark = useCallback(
    (overrideMode?: BenchmarkMode) => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      const targetMode = overrideMode ?? configRef.current.mode;
      if (overrideMode && overrideMode !== configRef.current.mode) {
        setConfig((prev) => ({ ...prev, mode: overrideMode }));
        configRef.current = { ...configRef.current, mode: overrideMode };
      }

      // Reset accumulators
      const now = performance.now();
      startTimeMsRef.current = now;
      lastFrameTimestampRef.current = now;
      lastUiSyncMsRef.current = now;
      allFrameDeltasRef.current = [];
      recentDeltasWindowRef.current = [];
      bucketsRef.current = { ...INITIAL_BUCKETS };
      stutterCountRef.current = 0;
      effectiveStepsRef.current = configRef.current.shaderIterations;
      consecutiveSlowFramesRef.current = 0;
      watchdogCountRef.current = 0;
      watchdogActiveRef.current = false;
      historyRef.current = [];

      setHistory([]);
      setLastCompletedBanner(null);
      isRunningRef.current = true;
      setStatus('running');

      const loop = (timestamp: number) => {
        if (!isRunningRef.current) return;

        const dt = timestamp - lastFrameTimestampRef.current;
        lastFrameTimestampRef.current = timestamp;
        const elapsedSec = (timestamp - startTimeMsRef.current) / 1000;
        const activeCfg = configRef.current;

        // Ignore the very first 0ms initialization tick or tab-switch spikes > 1000ms
        if (dt > 0.2 && dt < 1000) {
          allFrameDeltasRef.current.push(dt);
          recentDeltasWindowRef.current.push(dt);
          if (recentDeltasWindowRef.current.length > 35) {
            recentDeltasWindowRef.current.shift();
          }

          // Classify frame time bucket
          if (dt < 4.0) bucketsRef.current.under4ms++;
          else if (dt < 8.0) bucketsRef.current.ms4to8++;
          else if (dt <= 16.75) bucketsRef.current.ms8to16_7++;
          else if (dt <= 33.4) bucketsRef.current.ms16_7to33_3++;
          else bucketsRef.current.over33_3ms++;

          // Stutter detection: frame delta > 2.1x rolling window average (after warmup)
          if (allFrameDeltasRef.current.length > 20) {
            const recentAvg =
              recentDeltasWindowRef.current.reduce((a, b) => a + b, 0) /
              recentDeltasWindowRef.current.length;
            if (dt > Math.max(22, recentAvg * 2.1)) {
              stutterCountRef.current++;
            }
          }

          // Desktop Responsiveness Watchdog:
          // Ensures GPU stress never locks up the user's PC or mouse cursor
          if (activeCfg.watchdogEnabled) {
            if (dt > 58.0) {
              // Below ~17.2 FPS
              consecutiveSlowFramesRef.current++;
              if (
                consecutiveSlowFramesRef.current >= 3 &&
                effectiveStepsRef.current > 8
              ) {
                effectiveStepsRef.current = Math.max(
                  8,
                  effectiveStepsRef.current - 6
                );
                watchdogCountRef.current++;
                watchdogActiveRef.current = true;
                consecutiveSlowFramesRef.current = 0;
              }
            } else if (dt < 28.0) {
              consecutiveSlowFramesRef.current = 0;
            }
          } else {
            effectiveStepsRef.current = activeCfg.shaderIterations;
            watchdogActiveRef.current = false;
          }
        }

        // Render WebGL2 GPU stress pass
        if (rendererRef.current) {
          rendererRef.current.renderFrame(
            elapsedSec,
            effectiveStepsRef.current,
            activeCfg.scene,
            activeCfg.geometrySubdivisions
          );
        }

        // Check if 60-second benchmark mode completed
        if (targetMode === 'benchmark_60s' && elapsedSec >= 60.0) {
          finalizeRun(true, 60.0);
          return;
        }

        // Throttle React UI state sync to ~10 Hz (every 100ms) so React DOM updates
        // never interfere with browser frame pacing or 3rd-party FPS limiters
        if (timestamp - lastUiSyncMsRef.current >= 100) {
          lastUiSyncMsRef.current = timestamp;
          const m = calculateMetrics(
            allFrameDeltasRef.current,
            recentDeltasWindowRef.current
          );

          const refCap = activeCfg.referenceTargetFps;
          let limiterDeviationFps: number | null = null;
          let limiterPacingStatus: LiveTelemetry['limiterPacingStatus'] = 'Unset';

          if (refCap && refCap > 0) {
            limiterDeviationFps = m.currentFps - refCap;
            const tolerance = Math.max(2.0, refCap * 0.035);
            if (Math.abs(limiterDeviationFps) <= tolerance) {
              limiterPacingStatus = 'Locked';
            } else if (limiterDeviationFps > tolerance) {
              limiterPacingStatus = 'Uncapped / Above Target';
            } else {
              limiterPacingStatus = 'GPU Bound / Below Target';
            }
          }

          const newPoint: FrameTimeHistoryPoint = {
            timeSec: elapsedSec,
            fps: m.currentFps,
            frameTimeMs: m.frameTimeMs,
            effectiveSteps: effectiveStepsRef.current,
          };

          const updatedHistory = [...historyRef.current, newPoint].slice(-150);
          historyRef.current = updatedHistory;
          setHistory(updatedHistory);

          setTelemetry((prev) => ({
            ...prev,
            ...m,
            limiterDeviationFps,
            limiterPacingStatus,
            totalFrames: allFrameDeltasRef.current.length,
            stutterEvents: stutterCountRef.current,
            elapsedSeconds: elapsedSec,
            remainingSeconds:
              targetMode === 'benchmark_60s'
                ? Math.max(0, 60.0 - elapsedSec)
                : 0,
            effectiveShaderSteps: effectiveStepsRef.current,
            watchdogTriggeredCount: watchdogCountRef.current,
            watchdogActiveNow: watchdogActiveRef.current,
            buckets: { ...bucketsRef.current },
          }));
        }

        rafIdRef.current = requestAnimationFrame(loop);
      };

      rafIdRef.current = requestAnimationFrame(loop);
    },
    [calculateMetrics, finalizeRun]
  );

  // Reset current telemetry counters without starting
  const handleResetMetrics = () => {
    if (isRunningRef.current) {
      handleStopBenchmark();
    }
    allFrameDeltasRef.current = [];
    recentDeltasWindowRef.current = [];
    bucketsRef.current = { ...INITIAL_BUCKETS };
    historyRef.current = [];
    setHistory([]);
    setLastCompletedBanner(null);
    setStatus('stopped');
    setTelemetry((prev) => ({
      ...prev,
      currentFps: 0,
      instantFps: 0,
      frameTimeMs: 0,
      avgFps: 0,
      minFps: 0,
      maxFps: 0,
      low1PercentFps: 0,
      low01PercentFps: 0,
      frameJitterMs: 0,
      limiterDeviationFps: null,
      limiterPacingStatus: 'Unset',
      totalFrames: 0,
      stutterEvents: 0,
      elapsedSeconds: 0,
      remainingSeconds: 60,
      effectiveShaderSteps: config.shaderIterations,
      watchdogTriggeredCount: 0,
      watchdogActiveNow: false,
      buckets: { ...INITIAL_BUCKETS },
    }));
  };

  // Apply workload preset
  const handleSelectPreset = (preset: WorkloadPreset) => {
    if (preset === 'custom') {
      setConfig((prev) => ({ ...prev, preset: 'custom' }));
      return;
    }
    const p = PRESET_CONFIGS[preset];
    effectiveStepsRef.current = p.shaderIterations;
    watchdogActiveRef.current = false;
    setConfig((prev) => ({
      ...prev,
      preset,
      shaderIterations: p.shaderIterations,
      resolutionScale: p.resolutionScale,
      geometrySubdivisions: p.geometrySubdivisions,
    }));
  };

  // Export run history as CSV
  const handleExportCsv = () => {
    if (runRecords.length === 0) return;
    const headers = [
      'Timestamp',
      'Clock_Profile',
      'Mode',
      'Duration_Sec',
      'Completed_60s',
      'Workload_Preset',
      'Shader_Iterations',
      'Resolution_Scale',
      'Target_FPS_Cap',
      'Avg_FPS',
      '1Pct_Low_FPS',
      '0.1Pct_Low_FPS',
      'Min_FPS',
      'Max_FPS',
      'Avg_FrameTime_ms',
      'Jitter_ms',
      'Total_Frames',
      'Stutters',
      'Watchdog_Throttles',
    ];
    const rows = runRecords.map((r) => [
      `"${r.timestamp}"`,
      `"${r.clockProfileLabel.replace(/"/g, '""')}"`,
      r.mode,
      r.durationSeconds.toFixed(2),
      r.completedFull60s,
      r.preset,
      r.shaderIterations,
      r.resolutionScale,
      r.referenceTargetFps ?? 'Uncapped',
      r.avgFps.toFixed(2),
      r.low1PercentFps.toFixed(2),
      r.low01PercentFps.toFixed(2),
      r.minFps.toFixed(2),
      r.maxFps.toFixed(2),
      r.avgFrameTimeMs.toFixed(3),
      r.frameJitterMs.toFixed(3),
      r.totalFrames,
      r.stutterEvents,
      r.watchdogTriggers,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `framepulse-benchmark-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download self-contained standalone HTML benchmark file for Windows 10/11 double-click usage
  const handleDownloadStandaloneHtml = () => {
    const htmlString = buildStandaloneBenchmarkHtml();
    const blob = new Blob([htmlString], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'FramePulse-Standalone.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const progress60sPercent =
    config.mode === 'benchmark_60s'
      ? Math.min(100, (telemetry.elapsedSeconds / 60.0) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0B0E17] border-b border-slate-800">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#viewport"
          className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          FramePulse
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <a
            href="#viewport"
            className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Stress Viewport
          </a>
          <a
            href="#oscilloscope"
            className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Oscilloscope
          </a>
          <a
            href="#run-log"
            className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Overclock Log
          </a>
          <a
            href="#calibration-guide"
            className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Calibration Guide
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          {status === 'running' ? (
            <button
              type="button"
              onClick={handleStopBenchmark}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop Benchmark
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleStartBenchmark()}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Start Benchmark
            </button>
          )}
        </div>
      </header>

      {/* Sub-header Instrument Telemetry Ribbon */}
      <div className="bg-[#0B0E17]/70 border-b border-slate-800/80 px-6 py-2 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-2 text-slate-400">
          <span>STATE:</span>
          {status === 'running' ? (
            <span className="text-emerald-400 font-semibold">
              ● RUNNING ({config.mode === 'benchmark_60s' ? '60s OVERCLOCK TEST' : 'CONTINUOUS FREE RUN'})
            </span>
          ) : status === 'completed' ? (
            <span className="text-cyan-400 font-semibold">
              ■ COMPLETED (GPU IDLE)
            </span>
          ) : (
            <span className="text-amber-400 font-semibold">
              ■ STOPPED (STANDBY · 0% GPU LOAD)
            </span>
          )}
          <span aria-hidden="true">·</span>
          <span className="text-slate-300 truncate max-w-md" title={telemetry.gpuRendererInfo}>
            GPU: {telemetry.gpuRendererInfo}
          </span>
        </div>

        <div className="flex items-center gap-3 text-slate-400 tabular-nums">
          <span>
            BACKEND: <strong className="text-slate-200">{telemetry.renderBackend}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            BUFFER:{' '}
            <strong className="text-slate-200">
              {telemetry.renderWidth}×{telemetry.renderHeight}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            WATCHDOG:{' '}
            <strong
              className={
                telemetry.watchdogActiveNow
                  ? 'text-amber-400'
                  : config.watchdogEnabled
                  ? 'text-emerald-400'
                  : 'text-slate-500'
              }
            >
              {telemetry.watchdogActiveNow
                ? `THROTTLED (${telemetry.effectiveShaderSteps} STEPS)`
                : config.watchdogEnabled
                ? 'ARMED (<60ms SAFE)'
                : 'DISABLED'}
            </strong>
          </span>
        </div>
      </div>

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-5 space-y-5">
        {/* Asymmetric Split Console: Left Control Column + Right Viewport & Live FPS Stage */}
        <section
          id="viewport"
          className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch"
        >
          {/* Left Control & Parameter Column (4 cols on lg) */}
          <div className="lg:col-span-4 bg-[#0B0E17] border border-slate-800 rounded-lg p-5 flex flex-col justify-between space-y-5">
            <div className="space-y-5">
              {/* Primary Execution Controls (Start / Stop / 60s Trigger) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                    Execution Control
                  </span>
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    {status === 'running'
                      ? `T+${telemetry.elapsedSeconds.toFixed(1)}s`
                      : 'Idle / Ready'}
                  </span>
                </div>

                {/* Big Start & Stop Buttons side by side */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleStartBenchmark()}
                    disabled={status === 'running'}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold rounded-md bg-cyan-400 hover:bg-cyan-300 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Start
                  </button>

                  <button
                    type="button"
                    onClick={handleStopBenchmark}
                    disabled={status !== 'running'}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold rounded-md bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800/80 disabled:text-slate-500 text-white transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    Stop
                  </button>
                </div>

                {/* Quick 1-Click 60-Second Overclock Benchmark Trigger + Reset */}
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleStartBenchmark('benchmark_60s')}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-md bg-[#111827] hover:bg-slate-800 text-amber-300 border border-amber-500/40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Timer className="w-3.5 h-3.5" />
                    {status === 'running' && config.mode === 'benchmark_60s'
                      ? `Restart 60s Pass (${telemetry.remainingSeconds.toFixed(0)}s left)`
                      : 'Run 60s Overclock Benchmark'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetMetrics}
                    title="Reset telemetry counters"
                    className="p-2 text-xs font-medium rounded-md bg-[#111827] hover:bg-slate-800 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Mode Selector */}
              <div className="pt-4 border-t border-slate-800/80">
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
                  Benchmark Operating Mode
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#111827] border border-slate-800 rounded-md">
                  <button
                    type="button"
                    onClick={() =>
                      setConfig((prev) => ({ ...prev, mode: 'free_run' }))
                    }
                    className={`py-1.5 px-2.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      config.mode === 'free_run'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Continuous FPS Probe
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfig((prev) => ({ ...prev, mode: 'benchmark_60s' }))
                    }
                    className={`py-1.5 px-2.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      config.mode === 'benchmark_60s'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    60s Overclock Stress
                  </button>
                </div>
              </div>

              {/* 3rd-Party FPS Limiter Target Reference */}
              <div className="pt-4 border-t border-slate-800/80">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                    3rd-Party FPS Limiter Reference
                  </label>
                  <span className="text-xs font-mono text-cyan-400 tabular-nums">
                    {config.referenceTargetFps
                      ? `${config.referenceTargetFps} FPS (${(
                          1000 / config.referenceTargetFps
                        ).toFixed(2)} ms)`
                      : 'No Reference'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-2.5">
                  Select the FPS cap configured in your external tool (RTSS, NVIDIA/AMD Driver, Special K) to verify lock accuracy:
                </p>

                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {COMMON_FPS_CAPS.map((cap) => {
                    const isSelected = config.referenceTargetFps === cap;
                    return (
                      <button
                        key={cap ?? 'none'}
                        type="button"
                        onClick={() => {
                          setConfig((prev) => ({
                            ...prev,
                            referenceTargetFps: cap,
                          }));
                          if (cap) setCustomCapInput(String(cap));
                        }}
                        className={`py-1.5 px-2 text-xs font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
                          isSelected
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-semibold'
                            : 'bg-[#111827] text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {cap === null ? 'Off' : `${cap}`}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    Custom Target FPS:
                  </span>
                  <input
                    type="number"
                    min={15}
                    max={1000}
                    value={customCapInput}
                    onChange={(e) => {
                      setCustomCapInput(e.target.value);
                      const parsed = parseInt(e.target.value, 10);
                      if (!isNaN(parsed) && parsed >= 10 && parsed <= 1000) {
                        setConfig((prev) => ({
                          ...prev,
                          referenceTargetFps: parsed,
                        }));
                      }
                    }}
                    className="w-24 px-2.5 py-1 text-xs font-mono bg-[#111827] border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-cyan-400 tabular-nums"
                  />
                </div>
              </div>

              {/* GPU Workload Intensity & Responsiveness Guard */}
              <div className="pt-4 border-t border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                    GPU Stress Intensity
                  </label>
                  <span className="text-xs font-mono text-slate-300">
                    {config.shaderIterations} Shader Steps · {Math.round(config.resolutionScale * 100)}%
                  </span>
                </div>

                {/* Preset buttons */}
                <div className="grid grid-cols-3 gap-1.5">
                  {(['light', 'balanced', 'heavy'] as const).map((presetKey) => (
                    <button
                      key={presetKey}
                      type="button"
                      onClick={() => handleSelectPreset(presetKey)}
                      className={`py-1.5 px-2.5 text-xs font-medium capitalize rounded border transition-colors whitespace-nowrap shrink-0 ${
                        config.preset === presetKey
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                          : 'bg-[#111827] text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {presetKey}
                    </button>
                  ))}
                </div>

                {config.preset !== 'custom' && (
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {PRESET_CONFIGS[config.preset].description}
                  </p>
                )}

                {/* Shader Scene Selector */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Shader Compute Kernel
                  </label>
                  <select
                    value={config.scene}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        scene: e.target.value as ShaderSceneType,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-[#111827] border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-cyan-400"
                  >
                    <option value="volumetric_lattice">
                      Volumetric Gyroid Lattice (Ray-Marched 3D + Specular)
                    </option>
                    <option value="plasma_manifold">
                      Trigonometric Plasma Manifold (Heavy ALU Sin/Cos/Exp)
                    </option>
                    <option value="geometric_matrix">
                      Infinite Prism Matrix (Distance Field + Normal Probes)
                    </option>
                  </select>
                </div>

                {/* Fine-grained Shader Iteration Slider (capped at 56 to guarantee responsiveness) */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-400">
                      Shader Ray/FBM Iterations (Safe Cap: 56)
                    </span>
                    <span className="font-mono text-cyan-400 tabular-nums">
                      {config.shaderIterations} steps
                    </span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={56}
                    step={2}
                    value={config.shaderIterations}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      effectiveStepsRef.current = val;
                      setConfig((prev) => ({
                        ...prev,
                        preset: 'custom',
                        shaderIterations: val,
                      }));
                    }}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                {/* Resolution Scale Selector */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-400">Internal Resolution Scale</span>
                    <span className="font-mono text-slate-300 tabular-nums">
                      {Math.round(config.resolutionScale * 100)}% ({telemetry.renderWidth}×{telemetry.renderHeight})
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[0.5, 0.75, 1.0, 1.25].map((scale) => (
                      <button
                        key={scale}
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            preset: 'custom',
                            resolutionScale: scale,
                          }))
                        }
                        className={`py-1 px-2 text-xs font-mono rounded border transition-colors ${
                          config.resolutionScale === scale
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                            : 'bg-[#111827] text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {Math.round(scale * 100)}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Overclock Profile Tag & Responsiveness Watchdog Toggle */}
              <div className="pt-4 border-t border-slate-800/80 space-y-3">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                    Overclock / Limiter Profile Label
                  </label>
                  <input
                    type="text"
                    value={config.clockProfileLabel}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        clockProfileLabel: e.target.value,
                      }))
                    }
                    placeholder="e.g. +150 MHz Core / +500 MHz VRAM"
                    className="w-full px-3 py-1.5 text-xs bg-[#111827] border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {[
                      'Stock GPU Profile',
                      '+125 MHz Core / +400 MHz Mem',
                      'Undervolt 925mV',
                      'RTSS 144 FPS Cap',
                    ].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            clockProfileLabel: tag,
                          }))
                        }
                        className="text-[11px] text-slate-400 hover:text-cyan-300 bg-[#111827] hover:bg-slate-800 border border-slate-800 rounded px-2 py-0.5 transition-colors whitespace-nowrap shrink-0"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* PC Responsiveness Watchdog */}
                <label className="flex items-start gap-2.5 p-2.5 rounded-md bg-[#111827]/90 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.watchdogEnabled}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        watchdogEnabled: e.target.checked,
                      }))
                    }
                    className="mt-0.5 accent-cyan-400"
                  />
                  <div className="text-xs">
                    <div className="font-medium text-slate-200 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      PC Responsiveness Guard (Anti-Freeze Watchdog)
                    </div>
                    <p className="text-slate-400 mt-0.5 leading-relaxed">
                      Automatically steps down shader depth if frame delta exceeds 58 ms (&lt;17 FPS), preventing desktop lag or driver timeouts.
                    </p>
                  </div>
                </label>

                {/* Windows 10 / 11 Portable Double-Clickable Standalone HTML Export */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleDownloadStandaloneHtml}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-md bg-[#111827] hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Standalone .HTML (Double-Clickable)
                  </button>
                  <p className="text-[11px] text-slate-500 mt-1 text-center">
                    Zero-dependency single file · Opens directly on Windows 10/11 without Node.js
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right 8 cols: Live FPS Readout Strip + WebGL2 Stress Viewport Canvas */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {/* Primary FPS & Frame Pacing Readout Deck */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Dominant Anchor: Current FPS */}
              <div className="col-span-2 sm:col-span-1 bg-[#0B0E17] border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  CURRENT FPS
                </div>
                <div className="mt-1 flex items-baseline">
                  <span
                    className={`text-4xl font-mono font-bold tabular-nums tracking-tight ${
                      status === 'running' ? 'text-cyan-400' : 'text-slate-500'
                    }`}
                  >
                    {status === 'running'
                      ? telemetry.currentFps.toFixed(1)
                      : '0.0'}
                  </span>
                  <span className="text-xs uppercase font-mono text-slate-400 ml-1.5">
                    FPS
                  </span>
                </div>
                <div className="mt-1.5 text-xs font-mono text-slate-400 tabular-nums">
                  {status === 'running' ? (
                    <span>
                      DELTA:{' '}
                      <strong className="text-amber-400">
                        {telemetry.frameTimeMs.toFixed(2)} ms
                      </strong>
                    </span>
                  ) : (
                    <span>STANDBY (STOPPED)</span>
                  )}
                </div>
              </div>

              {/* 3rd-Party Limiter Lock & Deviation */}
              <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  LIMITER ACCURACY
                </div>
                <div className="mt-1 flex items-baseline">
                  <span className="text-2xl font-mono font-bold text-slate-100 tabular-nums">
                    {status === 'running' &&
                    telemetry.limiterDeviationFps !== null
                      ? `${
                          telemetry.limiterDeviationFps >= 0 ? '+' : ''
                        }${telemetry.limiterDeviationFps.toFixed(1)}`
                      : '—'}
                  </span>
                  {config.referenceTargetFps && (
                    <span className="text-xs font-mono text-slate-400 ml-1.5">
                      vs {config.referenceTargetFps}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 text-xs font-mono truncate">
                  {status !== 'running' ? (
                    <span className="text-slate-500">Awaiting Start</span>
                  ) : telemetry.limiterPacingStatus === 'Locked' ? (
                    <span className="text-emerald-400">● Locked to Cap</span>
                  ) : telemetry.limiterPacingStatus ===
                    'Uncapped / Above Target' ? (
                    <span className="text-amber-400">▲ Above Target Cap</span>
                  ) : telemetry.limiterPacingStatus ===
                    'GPU Bound / Below Target' ? (
                    <span className="text-cyan-300">▼ GPU Bound</span>
                  ) : (
                    <span className="text-slate-500">No Cap Selected</span>
                  )}
                </div>
              </div>

              {/* Average & Min/Max FPS */}
              <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  AVERAGE FPS
                </div>
                <div className="mt-1 flex items-baseline">
                  <span className="text-2xl font-mono font-bold text-slate-100 tabular-nums">
                    {telemetry.totalFrames > 0
                      ? telemetry.avgFps.toFixed(1)
                      : '0.0'}
                  </span>
                  <span className="text-xs uppercase font-mono text-slate-400 ml-1.5">
                    FPS
                  </span>
                </div>
                <div className="mt-1.5 text-xs font-mono text-slate-400 tabular-nums">
                  MIN {telemetry.minFps.toFixed(0)} · MAX{' '}
                  {telemetry.maxFps.toFixed(0)}
                </div>
              </div>

              {/* 1% Low / 0.1% Low & Jitter */}
              <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  1% / 0.1% LOWS
                </div>
                <div className="mt-1 flex items-baseline">
                  <span className="text-2xl font-mono font-bold text-slate-100 tabular-nums">
                    {telemetry.totalFrames > 0
                      ? telemetry.low1PercentFps.toFixed(1)
                      : '0.0'}
                  </span>
                  <span className="text-xs font-mono text-slate-400 ml-1.5 tabular-nums">
                    / {telemetry.low01PercentFps.toFixed(1)}
                  </span>
                </div>
                <div className="mt-1.5 text-xs font-mono text-slate-400 tabular-nums">
                  JITTER: ±{telemetry.frameJitterMs.toFixed(2)} ms
                </div>
              </div>
            </div>

            {/* 60-Second Benchmark Progress Bar (always visible when 60s mode is active or running) */}
            {config.mode === 'benchmark_60s' && (
              <div className="bg-[#0B0E17] border border-slate-800 rounded-lg px-4 py-3">
                <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                  <span className="text-amber-300 font-semibold">
                    60-SECOND OVERCLOCK STABILITY PASS —{' '}
                    {config.clockProfileLabel || 'Default Profile'}
                  </span>
                  <span className="text-slate-300 tabular-nums">
                    {status === 'running'
                      ? `${telemetry.elapsedSeconds.toFixed(1)}s / 60.0s (${telemetry.remainingSeconds.toFixed(
                          1
                        )}s remaining)`
                      : status === 'completed'
                      ? '60.0s / 60.0s (COMPLETE)'
                      : '0.0s / 60.0s (READY)'}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-[#111827] rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-100"
                    style={{
                      width: `${
                        status === 'completed' ? 100 : progress60sPercent
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Completed 60s Run Summary Banner */}
            {lastCompletedBanner && status !== 'running' && (
              <div className="bg-[#0B0E17] border border-cyan-500/50 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-mono text-cyan-400 uppercase">
                    {lastCompletedBanner.completedFull60s
                      ? '● 60-Second Overclock Benchmark Completed'
                      : '● Benchmark Session Logged'}
                  </div>
                  <div className="text-sm font-semibold text-slate-100 mt-0.5">
                    {lastCompletedBanner.clockProfileLabel} — Avg:{' '}
                    <span className="font-mono text-cyan-300">
                      {lastCompletedBanner.avgFps.toFixed(1)} FPS
                    </span>{' '}
                    · 1% Low:{' '}
                    <span className="font-mono text-slate-200">
                      {lastCompletedBanner.low1PercentFps.toFixed(1)} FPS
                    </span>{' '}
                    · Frame Time:{' '}
                    <span className="font-mono text-amber-300">
                      {lastCompletedBanner.avgFrameTimeMs.toFixed(2)} ms
                    </span>{' '}
                    · Jitter: ±{lastCompletedBanner.frameJitterMs.toFixed(2)} ms
                  </div>
                </div>
                <a
                  href="#run-log"
                  className="px-3 py-1.5 text-xs font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded hover:bg-cyan-500/30 transition-colors whitespace-nowrap shrink-0"
                >
                  View in Comparison Log
                </a>
              </div>
            )}

            {/* WebGL2 Hardware Stress Canvas Stage */}
            <div
              ref={viewportContainerRef}
              className="relative flex-1 min-h-[380px] bg-[#05070B] border border-slate-800 rounded-lg overflow-hidden flex items-center justify-center"
            >
              <canvas
                ref={canvasRef}
                className="w-full h-full block object-cover"
              />

              {/* Top-left In-Viewport Telemetry HUD Overlay */}
              <div className="absolute top-3 left-3 bg-[#07090E]/85 border border-slate-800 rounded px-3 py-2 text-xs font-mono pointer-events-none space-y-0.5 tabular-nums">
                <div className="text-slate-200 font-semibold">
                  FPS:{' '}
                  <span className="text-cyan-400">
                    {status === 'running'
                      ? telemetry.currentFps.toFixed(1)
                      : '0.0 (STOPPED)'}
                  </span>{' '}
                  ·{' '}
                  <span className="text-amber-400">
                    {status === 'running'
                      ? `${telemetry.frameTimeMs.toFixed(2)} ms`
                      : '0.00 ms'}
                  </span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  SHADER: {telemetry.effectiveShaderSteps} steps ·{' '}
                  {telemetry.renderWidth}×{telemetry.renderHeight} · FRAMES:{' '}
                  {telemetry.totalFrames.toLocaleString()}
                </div>
              </div>

              {/* Center Standby Modal Overlay when STOPPED */}
              {status !== 'running' && (
                <div className="absolute inset-0 bg-[#07090E]/75 flex items-center justify-center p-6">
                  <div className="max-w-md w-full bg-[#0B0E17] border border-slate-800 rounded-lg p-6 text-center space-y-4">
                    <div className="text-xs font-mono uppercase tracking-wider text-amber-400">
                      ■ BENCHMARK STOPPED — GPU IDLE (0% LOAD)
                    </div>
                    <h2 className="text-xl font-bold text-slate-100 text-balance">
                      Ready for Frame Limiter & Overclock Testing
                    </h2>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      The WebGL2 shader loop is paused so your system uses zero GPU resources until started. Choose a continuous run to test your 3rd-party FPS limiter or a timed 60-second pass to validate GPU overclock stability.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleStartBenchmark('free_run')}
                        className="flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold rounded-md bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Start Free Run
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartBenchmark('benchmark_60s')}
                        className="flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold rounded-md bg-[#111827] hover:bg-slate-800 text-amber-300 border border-amber-500/50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Timer className="w-3.5 h-3.5" />
                        Start 60s Benchmark
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Bottom Time-Series Oscilloscope & Frame Pacing Histogram */}
        <section id="oscilloscope">
          <TelemetryCharts
            history={history}
            referenceTargetFps={config.referenceTargetFps}
            buckets={telemetry.buckets}
            totalFrames={telemetry.totalFrames}
            currentFps={status === 'running' ? telemetry.currentFps : 0}
            frameTimeMs={status === 'running' ? telemetry.frameTimeMs : 0}
          />
        </section>

        {/* Overclock & Frame Limiter Run Comparison Log */}
        <section id="run-log">
          <BenchmarkRunHistory
            runs={runRecords}
            onClearRuns={() => setRunRecords([])}
            onExportCsv={handleExportCsv}
            onDeleteRun={(id) =>
              setRunRecords((prev) => prev.filter((r) => r.id !== id))
            }
          />
        </section>

        {/* Practical Calibration Guide for 3rd-Party FPS Limiters & Overclocking */}
        <section
          id="calibration-guide"
          className="bg-[#0B0E17] border border-slate-800 rounded-lg p-5"
        >
          <h3 className="text-sm font-semibold text-slate-100 mb-3">
            Methodology: Testing 3rd-Party FPS Limiters & 60s GPU Overclock Settings
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-400 leading-relaxed">
            <div>
              <div className="font-semibold text-slate-200 mb-1">
                01. Verifying 3rd-Party Frame Limiters
              </div>
              <p>
                To test tools such as RivaTuner Statistics Server (RTSS), NVIDIA Control Panel Max Frame Rate, or AMD Radeon Chill, target your browser executable or global profile, select your desired FPS cap in the left panel, and switch GPU Stress Intensity to <strong className="text-slate-200">Light</strong>. Check that Current FPS locks within ±0.5 FPS of your target and Frame Jitter stays below ±0.25 ms.
              </p>
            </div>
            <div>
              <div className="font-semibold text-slate-200 mb-1">
                02. 60-Second GPU Overclock Stability Pass
              </div>
              <p>
                Select <strong className="text-slate-200">Balanced</strong> or <strong className="text-slate-200">Heavy</strong> workload intensity, enter your core/memory offset in the Overclock Profile Label box, and click <strong className="text-slate-200">Run 60s Overclock Benchmark</strong>. Compare Average FPS, 1% Lows, and Stutter count against your baseline stock run in the Overclock Log table.
              </p>
            </div>
            <div>
              <div className="font-semibold text-slate-200 mb-1">
                03. Desktop Responsiveness Protection
              </div>
              <p>
                Unlike unbounded shader loops that starve the OS desktop compositor (DWM) and freeze the mouse cursor, FramePulse bounds per-frame ray-marching steps to a safe ceiling of 56 iterations and uses an active <strong className="text-slate-200">58 ms Frame-Delta Watchdog</strong> to step down load automatically if frame rate drops below 17 FPS.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
