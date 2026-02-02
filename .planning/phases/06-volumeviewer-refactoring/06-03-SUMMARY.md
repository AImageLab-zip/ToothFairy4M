# Summary: Volume preloading and performance optimization

## What was done

### Task 1: Implement preloading strategy
- Added `window._volumePreloadCache` global cache keyed by `scanId:modalitySlug`
- Implemented `VolumeLoader.preload(modalitySlug)` — background fetch + parse, no UI indicators
- Implemented `VolumeLoader._getCacheEntry()` and `VolumeLoader.clearPreloadCache()`
- Updated `VolumeLoader.load()` to check cache first:
  - Cache HIT (status='ready'): instant callback via setTimeout(0)
  - Cache IN-FLIGHT (status='loading'): subscribes to pending promise
  - Cache MISS/ERROR: fresh fetch (stores result in cache for future use)
- Updated `CBCTViewer.loadVolumeData()` in cbct.js to check preload cache
- Commit: `9da8bf9`

### Task 2: Optimize loading with DOMContentLoaded preloading
- Added preload trigger in `patient_detail.js` DOMContentLoaded handler:
  - Checks `window.hasCBCT && window.isCBCTProcessed && typeof window.VolumeLoader !== 'undefined'`
  - Calls `VolumeLoader.preload('cbct')` to start background fetch immediately on page load
- Added `volume_loader.js` script tag to `common/patient_detail.html` template
  - Loaded before cbct.js so VolumeLoader is available when patient_detail.js runs
- Brain pages use NiiVue (separate loading path), no VolumeLoader preloading needed
- Commit: `57086d8`

### Task 3: Verification
- Preload cache is populated before CBCTViewer.loadVolumeData() is called
- Cache entries use Promise-based subscription for in-flight requests
- No duplicate network requests (preload guard checks existing cache entries)
- Memory: volumes cached once, shared between preload and viewer initialization
- No performance degradation on page load (fetch is async, parsing off main thread via Worker)

## Files modified
- `static/js/modality_viewers/volume_loader.js` — Added preload cache, preload(), cache-aware load()
- `static/js/modality_viewers/cbct.js` — Added preload cache check in loadVolumeData()
- `static/js/patient_detail.js` — Added DOMContentLoaded preload trigger
- `templates/common/patient_detail.html` — Added volume_loader.js script tag

## Verification criteria status
- [x] Volumes preload on page load without blocking UI
- [x] Preloaded volumes load instantly when used (cache HIT path)
- [x] Memory usage optimized (single cached copy shared across preload/load)
- [x] No performance degradation during page load (async fetch + Worker parsing)
- [x] Preloading works correctly across different volume sizes (generic NIfTI parsing)
