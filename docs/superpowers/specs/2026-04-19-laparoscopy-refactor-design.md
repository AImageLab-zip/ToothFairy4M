# Laparoscopy Refactor & Feature Completion — Design Spec

**Date:** 2026-04-19  
**Scope:** `laparoscopy/` app, `static/js/src/laparoscopy/`, `templates/laparoscopy/`  
**Constraint:** Zero breaking changes outside the laparoscopy-specific files (maxillo, common, brain remain stable).

---

## 1. Goals

1. Restructure the monolithic `laparoscopy/views.py` (1,139 lines) into a `views/` package.
2. Migrate the 4 JS mixin files (3,029 lines total) to proper ES6 modules bundled with esbuild.
3. Extract the WebSocket/mask/worker bootstrap from `annotator.js` into a dedicated `worker.js` module.
4. Complete the Magic Toolbox feature: region-aware prompts, frame-local points, Accept-mask-to-shape, smaller markers.
5. Add fps-flexible frame snapping: video pauses snap to nearest subsampled frame boundary.

---

## 2. Backend Restructuring

### 2.1 `laparoscopy/views/` package

Split `laparoscopy/views.py` into:

| File | Responsibility |
|------|---------------|
| `__init__.py` | Re-exports all view functions so `urls.py` import is unchanged |
| `patient.py` | `patient_list`, `patient_detail`, `set_laparoscopy`, `_patient_model`, `_patient_permissions` helpers |
| `annotations.py` | `region_annotations`, `region_annotation_detail` (CRUD for drawn shapes) |
| `types.py` | `region_types`, `region_type_detail`, `quadrant_types`, `quadrant_type_detail`, `_handle_type_list`, `_handle_type_detail`, `_types_payload` generic helpers |
| `worker.py` | `worker_session_ready`, `worker_session_prompt`, `_worker_url` |
| `file_serving.py` | `serve_video` |

Shared helpers (`_get_profile`, `_parse_json_body`, `_patient_model`) move to a `_helpers.py` file imported by each submodule.

### 2.2 Subsampled video fps in FileRegistry metadata

In `laparoscopy/file_utils.py`, when creating a `video_subsampled` FileRegistry entry, store the fps:

```python
registry.metadata = {"fps": SUBSAMPLE_FPS}  # currently 1
registry.save()
```

The patient detail view reads this and passes it to the template:

```python
subsampled_fps = (subsampled_file.metadata or {}).get("fps", 1) if subsampled_file else 1
context["subsampled_fps"] = subsampled_fps
```

Template exposes it as:

```js
window.subsampledVideoFps = {{ subsampled_fps|default:1 }};
```

---

## 3. Frontend Build Setup

### 3.1 Directory structure

```
static/
  js/
    src/laparoscopy/
      core.js        ← VideoAnnotator class + mixin wiring + entry point
      shapes.js      ← brush/eraser/polygon drawing, shape list UI
      api.js         ← REST CRUD for annotations, types, timeline markers
      timeline.js    ← classification pin timeline UI
      worker.js      ← WebSocket lifecycle, mask overlay, Magic Toolbox (NEW)
    dist/
      laparoscopy_annotator.bundle.js  ← esbuild output, loaded by template
```

### 3.2 Build configuration

`package.json` added at project root with a single dev dependency:

```json
{
  "scripts": {
    "build:lap": "esbuild static/js/src/laparoscopy/core.js --bundle --outfile=static/js/dist/laparoscopy_annotator.bundle.js --minify",
    "watch:lap": "esbuild static/js/src/laparoscopy/core.js --bundle --outfile=static/js/dist/laparoscopy_annotator.bundle.js --watch"
  },
  "devDependencies": {
    "esbuild": "^0.25"
  }
}
```

`Makefile` gains two targets:

```makefile
js-build:
    npm run build:lap

js-watch:
    npm run watch:lap
```

The `dist/` bundle is committed to the repo (no build step required in the Docker container).

### 3.3 Module interface

Each mixin file exports a single function:

```js
// shapes.js
export function applyShapesMixin(proto) { ... }

// api.js
export function applyApiMixin(proto) { ... }

// timeline.js
export function applyTimelineMixin(proto) { ... }

// worker.js
export function applyWorkerMixin(proto) { ... }
```

`core.js` imports and applies all mixins, then exports:

```js
import { applyShapesMixin }   from './shapes.js';
import { applyApiMixin }      from './api.js';
import { applyTimelineMixin } from './timeline.js';
import { applyWorkerMixin }   from './worker.js';

function VideoAnnotator(cfg) { ... }

applyShapesMixin(VideoAnnotator.prototype);
applyApiMixin(VideoAnnotator.prototype);
applyTimelineMixin(VideoAnnotator.prototype);
applyWorkerMixin(VideoAnnotator.prototype);

export default VideoAnnotator;
```

The template inline script shrinks to minimal wiring:

```js
const annotator = new VideoAnnotator({ ...domRefs, patientId, isAdmin, csrfToken });
```

---

## 4. `worker.js` Module

Moves all of the following from the current procedural IIFE at the top of `annotator.js`:

- WebSocket connection lifecycle (`_wsConnect`, `_wsOnOpen`, `_wsOnMessage`, `_wsOnClose`)
- Session-ready POST to `/laparoscopy/api/worker/session-ready/`
- Mask frame cache (`_maskFrameCache`, `_storeMaskFrame`, `_pickMaskFrameForVideoTime`)
- Mask overlay canvas rendering (`_ensureMaskOverlay`, `_drawMaskOverlay`, `_syncMaskToCurrentVideoTime`)
- Magic Toolbox state and interaction (see §5)
- Frame snap on video pause (see §6)

Constructor config additions:

```js
{
  magicPanelEl,          // #magic-toolbox-panel
  magicPointToolBtnEl,   // #magic-tool-point-btn
  magicSendBtnEl,        // #magic-send-prompts-btn
  magicClearFrameBtnEl,  // #magic-clear-frame-btn
  magicClearAllBtnEl,    // #magic-clear-all-btn
  magicPromptsListEl,    // #magic-prompts-list
  magicPromptsCountEl,   // #magic-prompts-count
  subsampledVideoFps,    // number, from window.subsampledVideoFps
  workerWsHost,          // string, from window.workerWsHost
  workerVideoId,         // string, from window.workerVideoId
  workerVideoSource,     // string, from window.workerVideoPath
}
```

---

## 5. Magic Toolbox — Completed Feature

### 5.1 Point data model

```js
{
  id:         string,   // local unique id
  x:          number,   // normalized 0–1
  y:          number,   // normalized 0–1
  frame_time: number,   // snapped to subsampled fps boundary
  region_id:  string,   // annotator's activeRegionId at time of placement
}
```

### 5.2 Frame-local visibility

Points are shown/hidden on the overlay using the same rule as annotation shapes:

```js
visible = Math.abs(point.frame_time - video.currentTime) <= (0.5 / subsampledVideoFps)
```

Tolerance is always half a subsampled frame interval — scales automatically with fps.

### 5.3 Interaction model

- **Point Tool active + click** → place a point for the currently active region at the current (snapped) frame time.
- **Point Tool active + click on existing marker** → remove that point.
- Point markers: **10px** circles, colored with the active region's color.
- Point Tool works inside and outside annotation mode — they are independent modes. The Magic Toolbox panel is always visible whenever a video is loaded (not gated by annotation mode).

### 5.4 Send flow

1. User clicks **Send** in the Magic Toolbox panel.
2. Client collects all points for the **current frame** that belong to the **active region**.
3. Sends a single POST to `/laparoscopy/api/worker/session-prompt/` with:
   - `frame_timestamp`: current snapped time
   - `points`: the collected points (all treated as foreground, `point_label: 1`)
   - `window_seconds`: from the input
4. Worker responds asynchronously via WebSocket with `frame_result` messages.
5. Mask overlay renders in the active region's color (replacing the current fixed green).

### 5.5 Accept mask → shape

When a mask result is visible, an **Accept** button appears overlaid on the video (bottom-right corner, colored with the active region's color):

```
✓ Accept — <region name>
```

Clicking Accept:
1. Takes the current mask's binary pixel data.
2. Finds the largest contiguous region using a simple flood-fill contour trace.
3. Simplifies the contour to a polygon (Ramer–Douglas–Peucker, epsilon ≈ 3px).
4. Creates a Konva `Line` (closed polygon) with the region's fill/stroke.
5. Calls `_registerShape('polygon', konvaNode)` → persists via the existing API.
6. Hides the mask overlay and Accept button.

The Accept button also disappears automatically when the user seeks to a different frame (the mask cache miss clears the overlay).

### 5.6 Sidebar panel

The prompt list groups points by frame time. The current frame's group is highlighted with a green border. Buttons:

- **Send** (scoped to current frame + active region)
- **Clear frame** (removes all points on current frame)  
- **Clear all** (removes all points across all frames)

---

## 6. Frame Snap

### 6.1 When snap fires

- `video.addEventListener('pause', ...)` → snap on user pause
- When the Point Tool places a prompt point → snap before recording `frame_time`

### 6.2 Snap formula

```js
function snapToSubsampledFrame(t, fps) {
  return Math.round(t * fps) / fps;
}
```

Applied to `video.currentTime` after pause. If `window.subsampledVideoFps` is not available, defaults to 1.

### 6.3 Frame indicator

The timestamp display (`#frame-timestamp`) is updated to show the subsampled frame index alongside time:

```
00:03.000  [Frame 3 / 183]
```

Frame index = `Math.round(currentTime * fps)`. Total frames = `Math.round(video.duration * fps)`.

---

## 7. Template Changes

The inline script in `patient_detail_content.html` is reduced to:

1. Read file data from `_pf_raw` / `_pf_processed` JSON tags.
2. Build video element and zoom wrapper.
3. Expose `window.subsampledVideoFps`, `window.workerVideoId`, `window.workerVideoPath`.
4. Call `new VideoAnnotator(cfg)` once video metadata is loaded.
5. Wire the enter/exit annotation mode panel toggles (the existing pattern).

All Magic Toolbox setup, WebSocket bootstrap, and mask overlay code moves into `worker.js`.

---

## 8. Files Changed

### New files
- `laparoscopy/views/__init__.py`
- `laparoscopy/views/_helpers.py`
- `laparoscopy/views/patient.py`
- `laparoscopy/views/annotations.py`
- `laparoscopy/views/types.py`
- `laparoscopy/views/worker.py`
- `laparoscopy/views/file_serving.py`
- `static/js/src/laparoscopy/core.js`
- `static/js/src/laparoscopy/shapes.js`
- `static/js/src/laparoscopy/api.js`
- `static/js/src/laparoscopy/timeline.js`
- `static/js/src/laparoscopy/worker.js`
- `static/js/dist/laparoscopy_annotator.bundle.js` (generated)
- `package.json`

### Modified files
- `laparoscopy/file_utils.py` — store fps in FileRegistry.metadata
- `laparoscopy/views.py` → **deleted** (replaced by views/ package)
- `laparoscopy/urls.py` — import from `laparoscopy.views` unchanged
- `templates/laparoscopy/patient_detail_content.html` — slimmed inline script
- `Makefile` — add js-build / js-watch targets

### Untouched
- `maxillo/`, `common/`, `brain/`, `toothfairy/` — no changes required
- `laparoscopy/models.py`, `laparoscopy/admin.py`, `laparoscopy/urls.py` body — unchanged

---

## 9. Out of Scope

- Mask Accept contour algorithm: polygon simplification uses client-side JS only, no new backend endpoints.
- Multi-object segmentation in a single prompt call (one region per call is sufficient for now).
- Persistent storage of magic prompt points across page reloads (ephemeral, in-memory only).
- Background (label=0) exclusion points — all placed points are foreground for the active region.
