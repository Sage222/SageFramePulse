export type BenchmarkMode = 'free_run' | 'benchmark_60s';

export type WorkloadPreset = 'ultralight' | 'light' | 'balanced' | 'heavy' | 'custom';

export type ShaderSceneType = 'volumetric_lattice' | 'plasma_manifold' | 'geometric_matrix';

export type BenchmarkStatus = 'stopped' | 'running' | 'completed';

export type LoopTimingEngine = 'uncapped' | 'vsync_raf';

export interface BenchmarkConfig {
  mode: BenchmarkMode;
  loopEngine: LoopTimingEngine; // 'uncapped' uses MessageChannel to bypass 120Hz monitor V-Sync
  preset: WorkloadPreset;
  scene: ShaderSceneType;
  shaderIterations: number; // 1 to 56 steps per pixel
  resolutionScale: number; // 0.25 to 1.0
  geometrySubdivisions: number;
  watchdogEnabled: boolean; // Prevents desktop freeze if frame time > 58ms
  clockProfileLabel: string; // e.g. "Stock Profile" or "+135 MHz Core / +400 MHz Mem"
}

export interface FrameTimeHistoryPoint {
  timeSec: number;
  fps: number;
  frameTimeMs: number;
  effectiveSteps: number;
}

export interface FrameDistributionBuckets {
  under4ms: number;     // > 250 FPS
  ms4to8: number;       // 125 - 250 FPS
  ms8to16_7: number;    // 60 - 125 FPS
  ms16_7to33_3: number; // 30 - 60 FPS
  over33_3ms: number;   // < 30 FPS
}

export interface LiveTelemetry {
  currentFps: number;
  instantFps: number;
  frameTimeMs: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  low1PercentFps: number;
  low01PercentFps: number;
  frameJitterMs: number;
  totalFrames: number;
  stutterEvents: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  effectiveShaderSteps: number;
  watchdogTriggeredCount: number;
  watchdogActiveNow: boolean;
  gpuRendererInfo: string;
  gpuVendorInfo: string;
  renderBackend: 'WebGL2' | 'WebGL1' | 'Canvas2D';
  renderWidth: number;
  renderHeight: number;
  buckets: FrameDistributionBuckets;
}

export interface BenchmarkRunRecord {
  id: string;
  timestamp: string;
  mode: BenchmarkMode;
  loopEngine: LoopTimingEngine;
  durationSeconds: number;
  completedFull60s: boolean;
  clockProfileLabel: string;
  preset: WorkloadPreset;
  scene: ShaderSceneType;
  shaderIterations: number;
  resolutionScale: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  low1PercentFps: number;
  low01PercentFps: number;
  avgFrameTimeMs: number;
  frameJitterMs: number;
  totalFrames: number;
  stutterEvents: number;
  watchdogTriggers: number;
}
