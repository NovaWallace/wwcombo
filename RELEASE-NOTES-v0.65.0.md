# WW Combo Trainer 0.65

## Optional Modules

- The core Windows portable build now includes the Video Workbench and realtime Buff recognition interface for testing.
- Automatic input execution is separated into the optional `模拟演示 / Simulation Demo` DLC. The core editor and practice features remain available without it.
- FFmpeg video processing and Live2D character assets remain independent DLC packages, so users only install the large modules they need.
- Added a default Cargo binary target so `npm run tauri:dev` reliably starts the main desktop application even though the Simulation Demo DLC has its own executable.
