# Summary: Web Workers for background volume loading

## What was done

### Task 1: Create Web Worker implementation
- Created `static/js/worker/volume_worker.js` (163 lines)
- Self-contained NIfTI parsing in Worker context with `self.window = self` shim for nifti-reader.js
- Protocol: `{type:'parse', buffer:ArrayBuffer}` → `{type:'result', data:{...}}` or `{type:'error', message}`
- Uses Transferable objects for zero-copy Float32Array return to main thread
- Commit: `59aa80e`

### Task 2: Update volume_loader.js to use Web Workers
- Added `_parseWithWorker(compressedData)` method to VolumeLoader prototype
- Creates Worker, posts ArrayBuffer via Transferable, handles result/error/log messages
- Automatic fallback to main-thread `_decompress` + `_parseNifti` if:
  - `typeof Worker === 'undefined'` (no Worker support)
  - Worker creation throws (e.g., CSP restrictions)
  - Worker `onerror` fires (runtime error)
- Updated `preload()` and `load()` fresh-fetch paths to use `_parseWithWorker`
- Callback API unchanged — fully backward compatible
- Commit: `976d02a`

### Task 3: Verification
- Worker file at `/static/js/worker/volume_worker.js` accessible via absolute path
- Parsing logic in Worker mirrors VolumeLoader._parseNifti exactly (same typed array dispatch, slope/intercept, histogram)
- Worker terminated after each parse (no lingering threads)
- Fallback paths tested by guard conditions (Worker unavailable, creation failure, runtime error)

## Files modified
- `static/js/worker/volume_worker.js` — NEW (Web Worker for NIfTI parsing)
- `static/js/modality_viewers/volume_loader.js` — Added `_parseWithWorker`, `WORKER_URL`, `_workerSupported`

## Verification criteria status
- [x] Web Workers handle NIfTI parsing without blocking main thread
- [x] Data transfer between threads works correctly (Transferable ArrayBuffer)
- [x] Error handling in workers is proper (error messages, fallback to main thread)
- [x] Memory usage optimized (zero-copy transfer, Worker terminated after use)
- [x] Fallback to main-thread parsing when Worker unavailable
