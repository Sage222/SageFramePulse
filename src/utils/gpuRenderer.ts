import { ShaderSceneType } from '../types/benchmark';

export interface GpuHardwareInfo {
  renderer: string;
  vendor: string;
  backend: 'WebGL2' | 'WebGL1' | 'Canvas2D';
}

const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Carefully calibrated fragment shader that stresses GPU ALU & SFU (Special Function Units)
// with configurable iteration count and a hard ceiling of 60 steps so OS compositor stays responsive.
const FRAGMENT_SHADER_SOURCE = `
  precision highp float;
  varying vec2 v_uv;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform int u_iterations;
  uniform int u_scene;
  uniform int u_subdivisions;

  mat2 rot(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
  }

  // Signed Distance Field for Scene 0: Volumetric Gyroid Lattice
  float mapLattice(vec3 p, float t) {
    vec3 q = p;
    q.xy *= rot(t * 0.15);
    q.yz *= rot(t * 0.11);
    float scale = 2.4;
    float gyroid = abs(dot(sin(q * scale), cos(q.zxy * scale))) / scale;
    float box = length(max(abs(fract(q * 0.5) - 0.5) - 0.16, 0.0));
    return mix(gyroid - 0.08, box, 0.35);
  }

  // Signed Distance Field for Scene 2: Geometric Matrix Prisms
  float mapMatrix(vec3 p, float t) {
    vec3 q = p;
    q.xz *= rot(t * 0.12);
    vec3 id = floor(q * 1.25);
    vec3 local = fract(q * 1.25) - 0.5;
    float wave = sin(id.x * 1.7 + id.z * 1.3 + t * 2.2) * 0.12;
    vec3 b = abs(local) - vec3(0.22 + wave * 0.3, 0.28, 0.22 - wave * 0.3);
    float d = length(max(b, 0.0)) + min(max(b.x, max(b.y, b.z)), 0.0);
    return d / 1.25;
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.y, u_resolution.x);
    float t = u_time;

    // Scene 1: Plasma Manifold (ALU & Trigonometric FBM Heavy Stress)
    if (u_scene == 1) {
      vec3 accColor = vec3(0.0);
      vec2 p = uv * 2.2;
      float amp = 0.65;
      float freq = 1.8;

      for (int i = 0; i < 60; i++) {
        if (i >= u_iterations) break;
        float fi = float(i);
        p += vec2(
          sin(p.y * freq + t * 1.1 + fi * 0.37),
          cos(p.x * freq - t * 0.9 + fi * 0.53)
        ) * (amp / freq);

        float harmonic = sin(dot(p, vec2(cos(fi * 0.4), sin(fi * 0.4))) * 2.5 + t);
        vec3 layerCol = 0.5 + 0.5 * cos(vec3(0.15, 0.45, 0.85) * fi * 0.25 + harmonic + vec3(0.0, 1.8, 3.6));
        accColor += layerCol * exp(-abs(harmonic) * 1.6);
        freq *= 1.035;
        amp *= 0.965;
      }

      accColor /= max(float(u_iterations) * 0.32, 1.0);
      // Subtle grid calibration overlay
      float grid = smoothstep(0.97, 0.995, max(cos(uv.x * float(u_subdivisions) * 0.15), cos(uv.y * float(u_subdivisions) * 0.15)));
      accColor = mix(accColor, vec3(0.02, 0.71, 0.83), grid * 0.12);
      gl_FragColor = vec4(pow(clamp(accColor, 0.0, 1.0), vec3(0.92)), 1.0);
      return;
    }

    // Scene 0 & 2: Ray-Marched 3D Shader Workload
    vec3 ro = vec3(0.0, 0.0, -3.2 + sin(t * 0.4) * 0.3);
    vec3 rd = normalize(vec3(uv, 1.15));
    rd.xy *= rot(sin(t * 0.2) * 0.15);

    float totalDist = 0.0;
    vec3 glow = vec3(0.0);
    float hit = 0.0;

    for (int i = 0; i < 60; i++) {
      if (i >= u_iterations) break;
      vec3 p = ro + rd * totalDist;
      float d = (u_scene == 0) ? mapLattice(p, t) : mapMatrix(p, t);

      // Accumulate volumetric energy per step (forces ALU evaluation every step)
      float fi = float(i);
      vec3 stepTint = (u_scene == 0)
        ? vec3(0.03, 0.68, 0.88) + 0.25 * cos(vec3(1.0, 2.0, 3.0) + p.z * 0.8 + t)
        : vec3(0.18, 0.55, 0.95) + 0.25 * sin(vec3(2.5, 1.2, 0.4) + p.y * 1.1 - t);

      glow += stepTint * (0.014 / (0.025 + d * d * 4.5));

      if (abs(d) < 0.0025) {
        hit = 1.0 - fi / float(u_iterations);
        break;
      }
      totalDist += max(abs(d) * 0.62, 0.018);
      if (totalDist > 14.0) break;
    }

    vec3 pHit = ro + rd * totalDist;
    // Normal estimation
    vec2 e = vec2(0.004, 0.0);
    vec3 n;
    if (u_scene == 0) {
      n = normalize(vec3(
        mapLattice(pHit + e.xyy, t) - mapLattice(pHit - e.xyy, t),
        mapLattice(pHit + e.yxy, t) - mapLattice(pHit - e.yxy, t),
        mapLattice(pHit + e.yyx, t) - mapLattice(pHit - e.yyx, t)
      ));
    } else {
      n = normalize(vec3(
        mapMatrix(pHit + e.xyy, t) - mapMatrix(pHit - e.xyy, t),
        mapMatrix(pHit + e.yxy, t) - mapMatrix(pHit - e.yxy, t),
        mapMatrix(pHit + e.yyx, t) - mapMatrix(pHit - e.yyx, t)
      ));
    }

    vec3 lightDir = normalize(vec3(sin(t * 0.7), 0.8, -0.9));
    float diff = max(dot(n, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 24.0);

    vec3 baseCol = vec3(0.03, 0.05, 0.09);
    vec3 surfCol = (u_scene == 0)
      ? vec3(0.06, 0.52, 0.78) * diff + vec3(0.35, 0.88, 1.0) * spec
      : vec3(0.15, 0.38, 0.82) * diff + vec3(0.96, 0.62, 0.04) * spec * 0.8;

    vec3 finalCol = mix(baseCol, surfCol, hit) + glow * 0.55;

    // Fine telemetry reticle overlay inside shader
    float ring = abs(length(uv) - 0.38);
    float reticle = smoothstep(0.003, 0.0005, ring) * 0.14;
    finalCol += vec3(0.02, 0.71, 0.83) * reticle;

    // Tone mapping
    finalCol = finalCol / (1.0 + finalCol * 0.45);
    gl_FragColor = vec4(pow(clamp(finalCol, 0.0, 1.0), vec3(0.9)), 1.0);
  }
`;

export class GpuBenchmarkRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private program: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private uResolution: WebGLUniformLocation | null = null;
  private uTime: WebGLUniformLocation | null = null;
  private uIterations: WebGLUniformLocation | null = null;
  private uScene: WebGLUniformLocation | null = null;
  private uSubdivisions: WebGLUniformLocation | null = null;
  private hardwareInfo: GpuHardwareInfo = {
    renderer: 'Detecting GPU...',
    vendor: 'Standard Display Adapter',
    backend: 'WebGL2',
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initContext();
  }

  private initContext(): void {
    const glAttribs: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    };

    let gl: WebGLRenderingContext | WebGL2RenderingContext | null =
      this.canvas.getContext('webgl2', glAttribs);
    let backend: 'WebGL2' | 'WebGL1' | 'Canvas2D' = 'WebGL2';

    if (!gl) {
      gl = this.canvas.getContext('webgl', glAttribs);
      backend = 'WebGL1';
    }

    if (gl) {
      this.gl = gl;
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      let renderer = gl.getParameter(gl.RENDERER) || 'WebGL Hardware Renderer';
      let vendor = gl.getParameter(gl.VENDOR) || 'GPU Vendor';
      if (debugInfo) {
        const unmaskedRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        const unmaskedVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        if (unmaskedRenderer) renderer = unmaskedRenderer;
        if (unmaskedVendor) vendor = unmaskedVendor;
      }

      this.hardwareInfo = {
        renderer: String(renderer),
        vendor: String(vendor),
        backend,
      };

      this.initShaders(gl);
    } else {
      this.ctx2d = this.canvas.getContext('2d');
      this.hardwareInfo = {
        renderer: 'HTML5 Canvas 2D Software/Compositor Fallback',
        vendor: 'Browser 2D Engine',
        backend: 'Canvas2D',
      };
    }
  }

  private compileShader(
    gl: WebGLRenderingContext,
    type: number,
    source: string
  ): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private initShaders(gl: WebGLRenderingContext): void {
    const vs = this.compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return;
    }

    this.program = program;
    gl.useProgram(program);

    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    this.positionBuffer = buffer;

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    this.uResolution = gl.getUniformLocation(program, 'u_resolution');
    this.uTime = gl.getUniformLocation(program, 'u_time');
    this.uIterations = gl.getUniformLocation(program, 'u_iterations');
    this.uScene = gl.getUniformLocation(program, 'u_scene');
    this.uSubdivisions = gl.getUniformLocation(program, 'u_subdivisions');
  }

  public getHardwareInfo(): GpuHardwareInfo {
    return this.hardwareInfo;
  }

  public resize(displayWidth: number, displayHeight: number, resolutionScale: number): { width: number; height: number } {
    const clampedScale = Math.max(0.25, Math.min(1.5, resolutionScale));
    const targetW = Math.max(320, Math.floor(displayWidth * clampedScale));
    const targetH = Math.max(200, Math.floor(displayHeight * clampedScale));

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    if (this.gl) {
      this.gl.viewport(0, 0, targetW, targetH);
    }

    return { width: targetW, height: targetH };
  }

  /**
   * Renders a calm, zero-stress standby frame when the benchmark is STOPPED.
   */
  public renderStandbyFrame(scene: ShaderSceneType, iterations: number): void {
    // Render a single static preview frame at minimal iteration depth (6 steps) so GPU stays idle
    this.renderFrame(2.4, Math.min(8, iterations), scene, 120);
  }

  /**
   * Renders a live GPU benchmark frame.
   */
  public renderFrame(
    timeSeconds: number,
    iterations: number,
    scene: ShaderSceneType,
    subdivisions: number
  ): void {
    const safeIterations = Math.max(4, Math.min(56, Math.round(iterations)));
    const sceneIndex =
      scene === 'volumetric_lattice' ? 0 : scene === 'plasma_manifold' ? 1 : 2;

    if (this.gl && this.program) {
      const gl = this.gl;
      gl.useProgram(this.program);
      gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.uTime, timeSeconds);
      gl.uniform1i(this.uIterations, safeIterations);
      gl.uniform1i(this.uScene, sceneIndex);
      gl.uniform1i(this.uSubdivisions, subdivisions);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return;
    }

    if (this.ctx2d) {
      const ctx = this.ctx2d;
      const w = this.canvas.width;
      const h = this.canvas.height;
      ctx.fillStyle = '#07090E';
      ctx.fillRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.5;
      const rings = safeIterations * 2;
      for (let i = 0; i < rings; i++) {
        const ratio = i / rings;
        const radius = ratio * Math.min(w, h) * 0.45;
        const angleOffset = timeSeconds * (1.2 + ratio * 2.0);
        ctx.strokeStyle = `hsla(${190 + ratio * 45}, 85%, 55%, ${0.35 - ratio * 0.25})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, angleOffset, angleOffset + Math.PI * 1.35);
        ctx.stroke();
      }
    }
  }

  public dispose(): void {
    if (this.gl) {
      if (this.positionBuffer) this.gl.deleteBuffer(this.positionBuffer);
      if (this.program) this.gl.deleteProgram(this.program);
    }
  }
}
