# FramePulse — HTML5 WebGL2 GPU & FPS Limiter Benchmark

FramePulse is a browser-based HTML5 and WebGL2 GPU benchmark instrument designed for two primary hardware workflows:
1. **Verifying 3rd-Party FPS Limiting Tools** (RivaTuner Statistics Server / RTSS, NVIDIA Control Panel Max Frame Rate, AMD Radeon Chill, Special K, or display V-Sync caps).
2. **60-Second GPU Overclock & Undervolt Stability Testing** with side-by-side run comparison and CSV export, engineered to stress GPU shader units without locking up the OS desktop compositor.

---

## Windows 10 / 11 Quick Start (No Installation Required)

After downloading or cloning this repository to your Windows PC, you do **not** need to install Node.js or run terminal commands:

1. Open the downloaded folder in **Windows File Explorer**.
2. Double-click **`FramePulse-Standalone.html`** (or double-click **`index.html`**, which automatically detects the local `file://` protocol and opens `FramePulse-Standalone.html` for you).
3. It will open immediately in your default web browser (Chrome, Edge, Brave, or Firefox) in a **STOPPED (`0% GPU Load`)** state, ready to test your 3rd-party FPS limiter or run a 60-second overclock stability benchmark.
4. *(Optional)* You can also click **"Download Standalone .HTML"** inside the left control panel of the web app to save a portable single-file copy directly to your Windows Desktop.

---

## Key Features

- **Starts in a Stopped (0% Load) State**: When opened, the WebGL2 render loop is completely paused so your system uses zero GPU resources until you explicitly click **Start** or **Run 60s Overclock Benchmark**.
- **Explicit Start & Stop Controls**: Instantaneous start and stop buttons in both the main execution control deck and the top bar.
- **Real-Time FPS & Frame-Time Telemetry**:
  - **Current FPS** & **Frame Time Delta (`ms`)**
  - **Average FPS**, **Minimum / Maximum FPS**
  - **1% Low** and **0.1% Low FPS**
  - **Frame Pacing Jitter (`± ms` standard deviation)** and **Stutter Event Counter**
- **3rd-Party FPS Limiter Verification Suite**:
  - Select a reference target FPS cap (`30`, `60`, `90`, `120`, `144`, `165`, `240`, or any custom FPS target).
  - Plots a target threshold line on the real-time **Frame Pacing Oscilloscope** (switchable between `FPS` and `Frame Time ms`).
  - Calculates live deviation from your target cap and reports lock status (`Locked to Cap`, `Above Target Cap`, or `GPU Bound`).
  - Displays a 5-band **Frame Pacing Distribution Histogram** (`<4.0 ms`, `4.0–8.0 ms`, `8.0–16.7 ms`, `16.7–33.3 ms`, `>33.3 ms`).
- **60-Second Overclock Stability Benchmark**:
  - Runs an automated 60.0-second timed stress pass with a live elapsed/remaining progress bar.
  - Lets you tag each run with a custom **Overclock / Limiter Profile Label** (e.g., `Stock GPU Profile`, `+125 MHz Core / +400 MHz Mem`, `Undervolt 925mV`).
  - Automatically logs completed passes into the **Overclock & Frame Limiter Benchmark Log**, calculating relative `%` performance deltas against your baseline run and supporting one-click **CSV Export**.
- **PC Responsiveness Guard (Anti-Freeze Watchdog)**:
  - Caps per-pixel shader iterations to a safe hardware ceiling (`8` to `56` steps) across three selectable compute kernels (*Volumetric Gyroid Lattice*, *Trigonometric Plasma Manifold*, and *Infinite Prism Matrix*).
  - Monitors live frame times and automatically steps down shader iteration depth if consecutive frames exceed `58 ms` (`< 17 FPS`), preventing OS desktop window manager freezes or GPU driver timeouts (TDR).

---

## How to Use

### 1. Testing a 3rd-Party FPS Limiter
1. Configure your external frame rate limiter (e.g., RTSS, NVIDIA Control Panel, or AMD Adrenalin) to cap your browser executable or global 3D profile at your desired frame rate (e.g., `144 FPS`).
2. In FramePulse, set **Benchmark Operating Mode** to **Continuous FPS Probe**.
3. Under **3rd-Party FPS Limiter Reference**, select `144` (or enter a custom target).
4. Set **GPU Stress Intensity** to **Light** (ensures your GPU can easily render above the cap so the limiter is the bottleneck).
5. Click **Start** and inspect **Current FPS**, **Limiter Accuracy**, and **Jitter (`± ms`)** on the real-time oscilloscope.

### 2. Testing GPU Overclock Settings (60-Second Pass)
1. Set **GPU Stress Intensity** to **Balanced** or **Heavy** (or customize the shader iteration slider and resolution scale).
2. Enter a descriptive label in **Overclock / Limiter Profile Label** (start with `Stock GPU Profile` for your baseline).
3. Click **Run 60s Overclock Benchmark** and allow the 60-second pass to complete.
4. Apply your GPU core/memory overclock or undervolt in your tuning utility (e.g., MSI Afterburner), update the profile label (e.g., `+150 MHz Core / +500 MHz Mem`), and run another 60-second pass to compare **Avg FPS**, **1% Low**, **0.1% Low**, and **Stutters** in the log table.

---

## Optional Developer Server (Node.js / Vite)

If you are editing the TypeScript source files inside `/src`:

```bash
# Install dependencies
npm install

# Start development server on port 3000
npm run dev

# Type-check and build for production
npm run lint
npm run build
```
