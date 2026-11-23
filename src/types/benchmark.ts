export type BenchmarkMode = 'free_run' | 'benchmark_60s';

export type WorkloadPreset = 'light' | 'balanced' | 'heavy' | 'custom';

export type ShaderSceneType = 'volumetric_lattice' | 'plasma_manifold' | 'geometric_matrix';

export type BenchmarkStatus = 'stopped' | 'running' | 'completed';

export interface BenchmarkConfig {
  mode: BenchmarkMode;
  preset: WorkloadPreset;
  scene: ShaderSceneType;
  shaderIterations: number; // 8 to 56 steps per pixel
  resolutionScale: number; // 0.5 to 1.25
  geometrySubdivisions: number; // 100 to 1200 overlays
  referenceTargetFps: number | null; // Target cap being tested in 3rd-party tool (e.g., 60, 120, 144, 165, 240)
  watchdogEnabled: boolean; // Prevents desktop freeze if frame time > 65ms
  clockProfileLabel: string; // e.g. "Stock Profile" or "+135 MHz Core / +400 MHz Mem"
}

export interface FrameTimeHistoryPoint {
  timeSec: number;
  fps: number;
  frameTimeMs: number;
  effectiveSteps: number;
}

export interface FrameDistributionBuckets {
  under4ms: number;    // > 250 FPS
  ms4to8: number;      // 125 - 250 FPS
  ms8to16_7: number;   // 60 - 125 FPS
  ms16_7to33_3: number;// 30 - 60 FPS
  over33_3ms: number;  // < 30 FPS
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
  limiterDeviationFps: number | null;
  limiterPacingStatus: 'Locked' | 'Uncapped / Above Target' | 'GPU Bound / Below Target' | 'Unset';
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
  durationSeconds: number;
  completedFull60s: boolean;
  clockProfileLabel: string;
  preset: WorkloadPreset;
  scene: ShaderSceneType;
  shaderIterations: number;
  resolutionScale: number;
  referenceTargetFps: number | null;
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
  pacingConsistencyPercent: number;
}
