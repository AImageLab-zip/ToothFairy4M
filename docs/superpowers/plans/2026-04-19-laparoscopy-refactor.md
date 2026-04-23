# Laparoscopy Refactor & Feature Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the laparoscopy backend into a views/ package, migrate 4 JS mixin files to ES6 modules bundled with esbuild, extract the WebSocket/worker code into a dedicated module, and complete the Magic Toolbox feature with region-aware frame-local prompts, Accept-mask-to-shape, and fps-flexible frame snapping.

**Architecture:** Backend `laparoscopy/views.py` splits into a `views/` package with one file per responsibility; frontend migrates to `static/js/src/laparoscopy/` ES6 modules (core, shapes, api, timeline, worker) bundled to `static/js/dist/laparoscopy_annotator.bundle.js` via esbuild. The new `worker.js` mixin owns WebSocket lifecycle, mask overlay, and the Magic Toolbox feature entirely.

**Tech Stack:** Django 5.2, Konva.js (CDN), esbuild 0.25, Node 20, existing Bootstrap 5 + FontAwesome in templates.

**Spec:** `docs/superpowers/specs/2026-04-19-laparoscopy-refactor-design.md`

---

## Phase 1 — Backend

### Task 1: Split `laparoscopy/views.py` into `views/` package

**Files:**
- Create: `laparoscopy/views/__init__.py`
- Create: `laparoscopy/views/_helpers.py`
- Create: `laparoscopy/views/file_serving.py`
- Create: `laparoscopy/views/session.py`
- Create: `laparoscopy/views/annotations.py`
- Create: `laparoscopy/views/types.py`
- Create: `laparoscopy/views/worker.py`
- Delete: `laparoscopy/views.py`

- [ ] **Step 1: Create the views/ directory and `_helpers.py`**

Move these functions verbatim from `laparoscopy/views.py` into `laparoscopy/views/_helpers.py`. Copy the imports needed by each function.

```python
# laparoscopy/views/_helpers.py
import json
import math
import os
import re
import logging

from django.apps import apps

logger = logging.getLogger(__name__)


def _get_profile(request):
    """Return the active ProjectAccess for the request user, or None."""
    return getattr(request.user, "profile", None)


def _parse_json_body(request):
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ValueError("Invalid JSON body")


def _worker_url(request, path, specific_env):
    specific = (os.getenv(specific_env) or "").strip()
    if specific:
        return specific
    base = (os.getenv("WORKER_BASE_URL") or "").strip()
    if not base:
        host = (request.get_host() or "localhost").split(":", 1)[0]
        scheme = "https" if request.is_secure() else "http"
        base = f"{scheme}://{host}:8080"
    base = base.rstrip("/")
    return f"{base}{path}"


def _is_hex_color(value):
    return (
        isinstance(value, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", value) is not None
    )


def _next_type_order(model_cls, project):
    last_order = (
        model_cls.objects.filter(project=project)
        .order_by("-order")
        .values_list("order", flat=True)
        .first()
    )
    return 0 if last_order is None else last_order + 1


def _patient_model():
    return apps.get_model("maxillo", "Patient")


def _patient_permissions(profile, patient):
    if not profile:
        return False, False
    can_view = False
    if profile.is_admin():
        can_view = True
    elif profile.is_annotator() and patient.visibility != "debug":
        can_view = True
    elif profile.is_student_developer() and patient.visibility == "debug":
        can_view = True
    elif patient.visibility == "public":
        can_view = True
    can_modify = can_view
    return can_view, can_modify


def _normalize_float(value, field_name):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be numeric")
    if not math.isfinite(parsed):
        raise ValueError(f"{field_name} must be finite")
    return parsed
```

- [ ] **Step 2: Create `file_serving.py`**

Move `_file_iterator` and `serve_video` verbatim from `laparoscopy/views.py`:

```python
# laparoscopy/views/file_serving.py
import os
import re
import logging

from django.contrib.auth.decorators import login_required
from django.http import StreamingHttpResponse, HttpResponse
from django.shortcuts import get_object_or_404

from common.models import FileRegistry

logger = logging.getLogger(__name__)

_CHUNK = 8 * 1024 * 1024


def _file_iterator(path, start, end):
    # — copy verbatim from laparoscopy/views.py lines 33–44 —
    ...


@login_required
def serve_video(request, file_id):
    # — copy verbatim from laparoscopy/views.py lines 46–108 —
    ...
```

- [ ] **Step 3: Create `session.py`**

Move `set_laparoscopy` verbatim:

```python
# laparoscopy/views/session.py
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect

from common.models import Project, ProjectAccess


@login_required
def set_laparoscopy(request):
    # — copy verbatim from laparoscopy/views.py lines 110–137 —
    ...
```

- [ ] **Step 4: Create `annotations.py`**

Move these functions verbatim (copy exact function bodies from `laparoscopy/views.py`):
- `_normalize_points` (line 360)
- `_annotation_payload` (line 376)
- `_quadrant_marker_payload` (line 403)
- `_normalize_time_ms` (line 412)
- `_normalize_quadrant_marker_items` (line 424)
- `_replace_patient_quadrant_markers` (line 496)
- `patient_region_annotations` (line 575)
- `region_annotation_detail` (line 672)
- `patient_quadrant_markers` (line 784)

```python
# laparoscopy/views/annotations.py
import math
import logging

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods

from laparoscopy.models import RegionAnnotation, QuadrantClassificationMarker, QuadrantType
from laparoscopy.views._helpers import (
    _get_profile, _patient_model, _patient_permissions, _normalize_float
)

# — paste all 9 functions verbatim from views.py —
```

- [ ] **Step 5: Create `types.py`**

Move these functions verbatim:
- `_types_payload` (line 184)
- `_handle_type_list` (line 202)
- `_handle_type_detail` (line 252)
- `_quadrant_type_delete_hook` (line 527)
- `region_types` (line 838)
- `region_type_detail` (line 846)
- `quadrant_types` (line 864)
- `quadrant_type_detail` (line 872)

```python
# laparoscopy/views/types.py
import logging

from django.contrib.auth.decorators import login_required
from django.db import IntegrityError
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from laparoscopy.models import (
    RegionType, RegionTypeUserColor,
    QuadrantType, QuadrantTypeUserColor,
    RegionAnnotation,
)
from laparoscopy.views._helpers import (
    _get_profile, _is_hex_color, _next_type_order
)

# — paste all 8 functions verbatim from views.py —
```

- [ ] **Step 6: Create `worker.py`**

Move `worker_session_ready` (line 887) and `worker_session_prompt` (line 982) verbatim:

```python
# laparoscopy/views/worker.py
import json
import logging
from urllib import request as urllib_request
from urllib import error as urllib_error

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from laparoscopy.views._helpers import (
    _get_profile, _parse_json_body, _worker_url,
    _patient_model, _patient_permissions,
)

# — paste worker_session_ready and worker_session_prompt verbatim —
```

- [ ] **Step 7: Create `__init__.py` re-exporting all public views**

```python
# laparoscopy/views/__init__.py
from laparoscopy.views.file_serving import serve_video
from laparoscopy.views.session import set_laparoscopy
from laparoscopy.views.annotations import (
    patient_region_annotations,
    region_annotation_detail,
    patient_quadrant_markers,
)
from laparoscopy.views.types import (
    region_types,
    region_type_detail,
    quadrant_types,
    quadrant_type_detail,
)
from laparoscopy.views.worker import (
    worker_session_ready,
    worker_session_prompt,
)

__all__ = [
    "serve_video",
    "set_laparoscopy",
    "patient_region_annotations",
    "region_annotation_detail",
    "patient_quadrant_markers",
    "region_types",
    "region_type_detail",
    "quadrant_types",
    "quadrant_type_detail",
    "worker_session_ready",
    "worker_session_prompt",
]
```

- [ ] **Step 8: Delete the old `laparoscopy/views.py`**

```bash
git rm laparoscopy/views.py
```

- [ ] **Step 9: Verify Django system check passes**

```bash
make manage ARGS='check'
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 10: Commit**

```bash
git add laparoscopy/views/
git commit -m "refactor(laparoscopy): split views.py into views/ package"
```

---

### Task 2: Store subsampled fps in FileRegistry metadata

**Files:**
- Modify: `laparoscopy/file_utils.py`
- Modify: `templates/laparoscopy/patient_detail_content.html`

- [ ] **Step 1: Add `SUBSAMPLE_FPS` constant and store in metadata in `file_utils.py`**

At the top of `laparoscopy/file_utils.py`, add the constant after the imports:

```python
SUBSAMPLE_FPS = 1  # frames-per-second for the subsampled video
```

In `_run_subsampling`, the call to `mark_job_completed` currently passes `{'video_subsampled': output_path}`. Update it to also pass fps metadata by calling `FileRegistry` update after `mark_job_completed` runs. 

Add a helper in `_run_subsampling` right after the successful `mark_job_completed` call:

```python
if result.returncode == 0:
    mark_job_completed(job_id, {'video_subsampled': output_path})
    # Store fps in FileRegistry metadata so the frontend can snap frames correctly
    from common.models import FileRegistry
    FileRegistry.objects.filter(
        file_path=output_path, file_type='video_subsampled'
    ).update(metadata={'fps': SUBSAMPLE_FPS})
    logger.info(f"Video subsampling job {job_id} completed: {output_path}")
```

Also update the ffmpeg command's `-vf` filter to use the constant:

```python
'-vf', f'fps={SUBSAMPLE_FPS}',
```

- [ ] **Step 2: Add fps to `_pf_processed` JSON in the template**

In `templates/laparoscopy/patient_detail_content.html`, find the `<script id="_pf_processed">` block. It currently serializes each file as:

```
{"id":{{ f.id }},"file_type":"{{ f.file_type }}","file_path":"{{ f.file_path|escapejs }}","file_size_mb":"{{ f.file_size_mb }}","filename":"{{ f.filename|escapejs }}","original_filename":"{{ f.original_filename|escapejs }}"}
```

Add `"fps":{{ f.metadata.fps|default:1 }}` at the end of each object (before the closing `}`):

```
{"id":{{ f.id }},"file_type":"{{ f.file_type }}","file_path":"{{ f.file_path|escapejs }}","file_size_mb":"{{ f.file_size_mb }}","filename":"{{ f.filename|escapejs }}","original_filename":"{{ f.original_filename|escapejs }}","fps":{{ f.metadata.fps|default:1 }}}
```

- [ ] **Step 3: Expose `window.subsampledVideoFps` in the template inline script**

In the same template, find where `window.subsampledVideoId` is set. Add the fps line immediately after:

```js
window.subsampledVideoId   = subsampledVideo ? subsampledVideo.id   : null;
window.subsampledVideoPath = subsampledVideo ? subsampledVideo.file_path : null;
window.subsampledVideoFps  = subsampledVideo ? (subsampledVideo.fps || 1) : 1;
```

- [ ] **Step 4: Verify system check still passes**

```bash
make manage ARGS='check'
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 5: Commit**

```bash
git add laparoscopy/file_utils.py templates/laparoscopy/patient_detail_content.html
git commit -m "feat(laparoscopy): store subsampled fps in FileRegistry metadata, expose to frontend"
```

---

## Phase 2 — Frontend Build Infrastructure

### Task 3: Set up esbuild build pipeline

**Files:**
- Create: `package.json`
- Modify: `Makefile`
- Create: `static/js/src/laparoscopy/` (directory, empty — populated in Tasks 4–8)
- Create: `static/js/dist/` (directory)
- Modify: `.gitignore`

- [ ] **Step 1: Create `package.json` at project root**

```json
{
  "name": "toothfairy4m",
  "private": true,
  "scripts": {
    "build:lap": "esbuild static/js/src/laparoscopy/core.js --bundle --outfile=static/js/dist/laparoscopy_annotator.bundle.js --minify",
    "watch:lap": "esbuild static/js/src/laparoscopy/core.js --bundle --outfile=static/js/dist/laparoscopy_annotator.bundle.js --watch"
  },
  "devDependencies": {
    "esbuild": "^0.25"
  }
}
```

- [ ] **Step 2: Install esbuild**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` written.

- [ ] **Step 3: Add js-build and js-watch targets to `Makefile`**

Add after the existing targets:

```makefile
js-build:
	npm run build:lap

js-watch:
	npm run watch:lap
```

- [ ] **Step 4: Create source and dist directories**

```bash
mkdir -p static/js/src/laparoscopy static/js/dist
```

- [ ] **Step 5: Update `.gitignore`**

Add these lines:

```
node_modules/
.superpowers/
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json Makefile .gitignore
git commit -m "build: add esbuild pipeline for laparoscopy JS bundle"
```

---

## Phase 3 — ES6 Module Migration

### Task 4: Migrate shapes mixin to ES6 module

**Files:**
- Create: `static/js/src/laparoscopy/shapes.js`

The current `static/js/laparoscopy_annotator_shapes.js` uses the pattern:

```js
(function () {
    window.LaparoscopyAnnotatorMixins.shapes = function (VideoAnnotator) {
        VideoAnnotator.prototype.foo = function () { ... };
    };
})();
```

The new pattern exports a function that receives the prototype directly:

```js
export function applyShapesMixin(proto) {
    proto.foo = function () { ... };
}
```

- [ ] **Step 1: Create `static/js/src/laparoscopy/shapes.js`**

Copy the entire body of `static/js/laparoscopy_annotator_shapes.js`. Remove the IIFE wrapper and `window.LaparoscopyAnnotatorMixins.shapes = function (VideoAnnotator) {` outer function. Replace every `VideoAnnotator.prototype.` assignment with `proto.`. Replace the closing `};` of the outer function with nothing. Add the export at the top:

```js
// static/js/src/laparoscopy/shapes.js
'use strict';

const FRAME_TOLERANCE = 0.020;

function _el(id) { return document.getElementById(id); }

function _fmtTime(t) {
    var mm = Math.floor(t / 60);
    var ss = Math.floor(t % 60);
    var ms = Math.floor((t % 1) * 1000);
    return String(mm).padStart(2, '0') + ':' +
           String(ss).padStart(2, '0') + '.' +
           String(ms).padStart(3, '0');
}

export function applyShapesMixin(proto) {
    proto._registerShape = function (type, konvaNode, options) { ... };
    proto._shapeLabel = function (shape) { ... };
    // ... all remaining VideoAnnotator.prototype methods from shapes.js,
    // renamed from VideoAnnotator.prototype.X to proto.X
}
```

The `FRAME_TOLERANCE` constant moves here (remove it from `core.js` later — it is defined in shapes).

- [ ] **Step 2: Commit**

```bash
git add static/js/src/laparoscopy/shapes.js
git commit -m "refactor(laparoscopy): migrate shapes mixin to ES6 module"
```

---

### Task 5: Migrate api mixin to ES6 module

**Files:**
- Create: `static/js/src/laparoscopy/api.js`

- [ ] **Step 1: Create `static/js/src/laparoscopy/api.js`**

Same pattern as Task 4. Copy body of `static/js/laparoscopy_annotator_api.js`, remove IIFE, rename `VideoAnnotator.prototype.` → `proto.`, export the function:

```js
// static/js/src/laparoscopy/api.js
'use strict';

function _jsonOrNull(response) {
    return (response && response.ok) ? response.json() : null;
}

export function applyApiMixin(proto) {
    proto._jsonHeaders = function () { ... };
    proto._csrfHeaders = function () { ... };
    // ... all remaining methods from laparoscopy_annotator_api.js
}
```

- [ ] **Step 2: Commit**

```bash
git add static/js/src/laparoscopy/api.js
git commit -m "refactor(laparoscopy): migrate api mixin to ES6 module"
```

---

### Task 6: Migrate timeline mixin to ES6 module

**Files:**
- Create: `static/js/src/laparoscopy/timeline.js`

- [ ] **Step 1: Create `static/js/src/laparoscopy/timeline.js`**

Same pattern as Tasks 4–5. Source file: `static/js/laparoscopy_annotator_timeline.js`.

```js
// static/js/src/laparoscopy/timeline.js
'use strict';

export function applyTimelineMixin(proto) {
    // all methods from laparoscopy_annotator_timeline.js, proto.X instead of VideoAnnotator.prototype.X
}
```

- [ ] **Step 2: Commit**

```bash
git add static/js/src/laparoscopy/timeline.js
git commit -m "refactor(laparoscopy): migrate timeline mixin to ES6 module"
```

---

### Task 7: Create `worker.js` module — WebSocket + mask overlay migration

**Files:**
- Create: `static/js/src/laparoscopy/worker.js`

This task moves the procedural WebSocket bootstrap (currently lines 35–403 of `laparoscopy_annotator.js`) into a proper mixin. Global state (`window.__ws`, `window.__med`, `window.__magicPrompts`) becomes instance state (`this._ws`, `this._workerCfg`, `this._magicPrompts`).

- [ ] **Step 1: Create `static/js/src/laparoscopy/worker.js` — WebSocket + mask section**

```js
// static/js/src/laparoscopy/worker.js
'use strict';

const MAX_MASK_CACHE = 300;

export function applyWorkerMixin(proto) {

    // ── Initialisation (called from constructor) ──────────────────────────

    proto._initWorker = function () {
        // Config from constructor cfg
        // this._workerVideoId, this._workerVideoSource, this._workerWsHost
        // this._subsampledVideoFps are set in the constructor before _initWorker() is called.

        this._ws               = null;
        this._maskOverlayCanvas = null;
        this._maskOverlayCtx   = null;
        this._maskFrameCache   = [];
        this._maskStoreSeq     = 0;
        this._lastRenderedMaskKey = null;
        this._maskSyncBound    = false;

        // Magic Toolbox state
        this._magicPrompts     = [];     // { id, x, y, frame_time, region_id }
        this._magicPointActive = false;
        this._magicOverlayEl   = null;

        this._wsConnect();
        this._bindMaskSync();
        this._initMagicToolbox();
    };

    // ── WebSocket lifecycle ───────────────────────────────────────────────

    proto._wsConnect = function () {
        if (!this._workerWsHost || !this._workerVideoId) return;
        var wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
        var url = wsProto + '://' + this._workerWsHost +
                  '/ws/session/' + encodeURIComponent(this._workerVideoId) + '/';
        var self = this;
        this._ws = new WebSocket(url);
        this._ws.onopen    = function () { self._wsOnOpen(); };
        this._ws.onmessage = function (e) { self._wsOnMessage(e); };
        this._ws.onerror   = function (e) { console.error('[WS] error', e); };
        this._ws.onclose   = function (e) { console.log('[WS] close', e.code, e.reason); };
    };

    proto._wsOnOpen = function () {
        console.log('[WS] open');
        if (!this._workerVideoSource) {
            console.warn('[WS] session ready skipped: missing video source');
            return;
        }
        var self = this;
        fetch('/laparoscopy/api/worker/session-ready/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                patientId: String(this.patientId),
                video_source: this._workerVideoSource,
                video_id: this._workerVideoId,
            }),
        })
        .then(function (resp) { return resp.text().then(function (t) {
            if (!resp.ok) { console.error('[WS] session ready failed', resp.status, t); }
            else { console.log('[WS] session ready ok'); }
        }); })
        .catch(function (err) { console.error('[WS] session ready error', err); });
    };

    proto._wsOnMessage = function (e) {
        try {
            var parsed = JSON.parse(e.data);
            if (parsed && parsed.type === 'frame_result') {
                this._storeMaskFrame(parsed);
                this._syncMaskToCurrentVideoTime();
                this._renderAcceptBtn();
            }
        } catch (_) {
            console.log('[WS raw]', e.data);
        }
    };

    // ── Mask cache ────────────────────────────────────────────────────────

    proto._storeMaskFrame = function (frameResult) {
        // Move verbatim from annotator.js _storeMaskFrame, replace _getVideoEl() with this.videoEl
        if (!frameResult || !frameResult.mask_b64 || !Array.isArray(frameResult.mask_shape)) return;
        var ts = Number(frameResult.timestamp);
        if (!isFinite(ts) || ts < 0) ts = isFinite(this.videoEl.currentTime) ? this.videoEl.currentTime : 0;
        var entry = {
            timestamp: ts,
            frame_index: Number(frameResult.frame_index || -1),
            mask_b64: frameResult.mask_b64,
            mask_shape: frameResult.mask_shape,
            cache_seq: ++this._maskStoreSeq,
        };
        this._maskFrameCache.push(entry);
        if (this._maskFrameCache.length > MAX_MASK_CACHE) {
            this._maskFrameCache = this._maskFrameCache.slice(this._maskFrameCache.length - MAX_MASK_CACHE);
        }
    };

    proto._pickMaskFrame = function (videoTime) {
        var best = null; var bestDelta = Infinity;
        for (var i = this._maskFrameCache.length - 1; i >= 0; i--) {
            var item = this._maskFrameCache[i];
            var delta = Math.abs(Number(item.timestamp) - Number(videoTime));
            if (delta < bestDelta) { best = item; bestDelta = delta; }
        }
        return (best && bestDelta <= 0.6) ? best : null;
    };

    // ── Mask overlay rendering ────────────────────────────────────────────
    // Move _ensureMaskOverlay, _decodeB64ToBytes, _maskCacheKey,
    // _clearMaskOverlay, _drawMaskOverlay verbatim from annotator.js,
    // replacing _getVideoEl() with this.videoEl throughout.

    proto._ensureMaskOverlay = function () { /* ... verbatim ... */ };
    proto._decodeB64ToBytes  = function (maskB64) { /* ... verbatim ... */ };
    proto._maskCacheKey      = function (entry) { /* ... verbatim ... */ };
    proto._clearMaskOverlay  = function () { /* ... verbatim ... */ };
    proto._drawMaskOverlay   = function (frameResult, regionColor) {
        // Same as current _drawMaskOverlay but replace hardcoded green (0,255,80)
        // with the active region's color parsed from regionColor hex string.
        /* ... */
    };

    proto._syncMaskToCurrentVideoTime = function () {
        var t = isFinite(this.videoEl.currentTime) ? this.videoEl.currentTime : 0;
        var frame = this._pickMaskFrame(t);
        if (!frame) { this._clearMaskOverlay(); return; }
        var key = this._maskCacheKey(frame);
        if (key === this._lastRenderedMaskKey) return;
        var region = this.regions.find(function (r) { return r.id === this.activeRegionId; }, this);
        this._drawMaskOverlay(frame, region ? region.color : '#00dc50');
    };

    proto._bindMaskSync = function () {
        if (this._maskSyncBound) return;
        this._maskSyncBound = true;
        var self = this;
        this.videoEl.addEventListener('timeupdate', function () { self._syncMaskToCurrentVideoTime(); });
        this.videoEl.addEventListener('seeked',     function () { self._syncMaskToCurrentVideoTime(); self._hideMagicAcceptBtn(); });
        window.addEventListener('resize',           function () { self._syncMaskToCurrentVideoTime(); });
    };

    // ── Magic Toolbox — init (rest in Task 10) ────────────────────────────

    proto._initMagicToolbox = function () {
        // Wired in Task 10 — placeholder so _initWorker doesn't throw.
    };

    proto._hideMagicAcceptBtn = function () {
        // Wired in Task 11 — placeholder.
    };

    proto._renderAcceptBtn = function () {
        // Wired in Task 11 — placeholder.
    };
}
```

- [ ] **Step 2: Commit**

```bash
git add static/js/src/laparoscopy/worker.js
git commit -m "feat(laparoscopy): add worker.js mixin with WebSocket + mask overlay"
```

---

### Task 8: Create `core.js` — VideoAnnotator class + mixin wiring

**Files:**
- Create: `static/js/src/laparoscopy/core.js`

- [ ] **Step 1: Create `static/js/src/laparoscopy/core.js`**

Copy the VideoAnnotator class body from `static/js/laparoscopy_annotator.js` (the IIFE content from line 408 onward, minus the WebSocket bootstrap at the top). Apply all mixins. Add new constructor params for worker.

Key differences from the original:
1. No IIFE wrapper — ES6 module scope handles isolation
2. `window.LaparoscopyAnnotatorMixins` calls → `applyXxxMixin(VideoAnnotator.prototype)`
3. New constructor params for worker: `workerWsHost`, `workerVideoId`, `workerVideoSource`, `subsampledVideoFps`
4. Constructor calls `this._initWorker()` and `this._initFrameSnap()` at the end
5. `export default VideoAnnotator` instead of `window.VideoAnnotator = VideoAnnotator`

```js
// static/js/src/laparoscopy/core.js
'use strict';

import { applyShapesMixin }   from './shapes.js';
import { applyApiMixin }      from './api.js';
import { applyTimelineMixin } from './timeline.js';
import { applyWorkerMixin }   from './worker.js';

const FRAME_STEP_S = 0.033;

const PALETTE = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
    '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
    '#e91e63', '#00bcd4', '#8bc34a', '#ff5722',
];

function _el(id) { return document.getElementById(id); }
function _on(id, event, fn) { var el = _el(id); if (el) el.addEventListener(event, fn); }
function _openColorPicker(initialColor, onChange) {
    // — copy verbatim from annotator.js —
}

function VideoAnnotator(cfg) {
    /* DOM references — same as current constructor */
    this.videoEl        = cfg.videoEl;
    this.wrapEl         = cfg.wrapEl;
    this.outerEl        = cfg.outerEl;
    this.toolbarEl      = cfg.toolbarEl;
    this.regionListEl   = cfg.regionListEl;
    this.shapesListEl   = cfg.shapesListEl;
    this.toggleBtn      = cfg.toggleBtn;
    this.timestampEl    = cfg.timestampEl;
    this.brushSizeInput = cfg.brushSizeInput;
    this.brushSizeLabel = cfg.brushSizeLabel;
    this.polygonHintEl  = cfg.polygonHintEl || null;

    /* Timeline DOM */
    this.timelineTrackWrapEl     = cfg.timelineTrackWrapEl     || null;
    this.timelineTrackEl         = cfg.timelineTrackEl         || null;
    this.timelineSegmentsLayerEl = cfg.timelineSegmentsLayerEl || null;
    this.timelinePinsLayerEl     = cfg.timelinePinsLayerEl     || null;
    this.timelinePlayheadEl      = cfg.timelinePlayheadEl      || null;
    this.timelineClassListEl     = cfg.timelineClassListEl     || null;
    this.timelineCurrentTimeEl   = cfg.timelineCurrentTimeEl   || null;
    this.timelineDurationEl      = cfg.timelineDurationEl      || null;
    this.timelineActiveClassEl   = cfg.timelineActiveClassEl   || null;
    this.timelineAddPinBtnEl     = cfg.timelineAddPinBtnEl     || null;
    this.timelineAddClassBtnEl   = cfg.timelineAddClassBtnEl   || null;

    /* Admin / API */
    this.isAdmin   = cfg.isAdmin   || false;
    this.csrfToken = cfg.csrfToken || '';
    this.patientId = cfg.patientId || null;

    /* Worker config — NEW */
    this._workerWsHost      = cfg.workerWsHost      || (window.workerWsHost || '');
    this._workerVideoId     = cfg.workerVideoId     || (window.workerVideoId || '');
    this._workerVideoSource = cfg.workerVideoSource || (window.workerVideoPath || null);
    this._subsampledVideoFps = cfg.subsampledVideoFps || (window.subsampledVideoFps || 1);

    /* Magic Toolbox DOM — NEW */
    this._magicPanelEl        = cfg.magicPanelEl        || _el('magic-toolbox-panel');
    this._magicPointToolBtnEl = cfg.magicPointToolBtnEl || _el('magic-tool-point-btn');
    this._magicSendBtnEl      = cfg.magicSendBtnEl      || _el('magic-send-prompts-btn');
    this._magicClearFrameBtnEl = cfg.magicClearFrameBtnEl || _el('magic-clear-frame-btn');
    this._magicClearAllBtnEl  = cfg.magicClearAllBtnEl  || _el('magic-clear-all-btn');
    this._magicPromptsListEl  = cfg.magicPromptsListEl  || _el('magic-prompts-list');
    this._magicPromptsCountEl = cfg.magicPromptsCountEl || _el('magic-prompts-count');
    this._magicWindowInputEl  = cfg.magicWindowInputEl  || _el('magic-window-seconds-input');
    this._magicAcceptBtnEl    = null;  // created dynamically when mask arrives

    /* — copy all remaining state initialisations verbatim from current constructor — */

    /* Bootstrap */
    this.wrapEl.style.transformOrigin = '0 0';
    this.wrapEl.style.position        = 'relative';

    this._initKonva();
    this._bindToolbar();
    this._bindFrameNav();
    this._initTemporalClassification();
    this._bindKeyboard();
    this._bindToggle();
    this._addDefaultRegion();

    /* Worker init — NEW (after DOM is ready) */
    this._initWorker();
    this._initFrameSnap();

    /* Video event bindings — same as current */
    var _self = this;
    this.videoEl.addEventListener('timeupdate', function () {
        _self._updateShapeVisibility();
        if (_self._filterShapesCurrentFrame) _self._renderShapesList();
        _self._updateTemporalTimelineUI();
        _self._renderMagicOverlay();
    });
    this.videoEl.addEventListener('seeked', function () {
        _self._updateShapeVisibility();
        if (_self._filterShapesCurrentFrame) _self._renderShapesList();
        _self._updateTemporalTimelineUI();
        _self._renderMagicOverlay();
    });
    this._updateTimestamp();
    this._updateTemporalTimelineUI();

    /* Load persisted data */
    var self = this;
    this._loadRegionTypes()
        .then(function () { self._loadRegionAnnotations(); })
        .catch(function () { self._loadRegionAnnotations(); });
    this._loadQuadrantTypes()
        .then(function () { self._loadTimelineMarkers(); })
        .catch(function () { self._loadTimelineMarkers(); });
}

/* Copy all prototype methods that are currently defined inline in annotator.js
   (everything after the constructor up to the mixin application block):
   _initKonva, _syncStageSize, _pointerPos, _applyTransform, _applyZoom,
   _resetZoom, _bindFrameNav, _stepBack, _stepForward, _updateTimestamp,
   _applyRegionStyleToShape, _activeRegion, addRegion, _renderRegionList,
   _bindKeyboard
   Keep them as VideoAnnotator.prototype.X = function() {...} */

/* Apply mixins */
applyShapesMixin(VideoAnnotator.prototype);
applyApiMixin(VideoAnnotator.prototype);
applyTimelineMixin(VideoAnnotator.prototype);
applyWorkerMixin(VideoAnnotator.prototype);

export default VideoAnnotator;
```

Note: `_renderMagicOverlay` is a new method added in Task 10.

- [ ] **Step 2: Commit**

```bash
git add static/js/src/laparoscopy/core.js
git commit -m "feat(laparoscopy): create core.js VideoAnnotator ES6 module"
```

---

### Task 9: Build bundle and update template

**Files:**
- Modify: `templates/laparoscopy/patient_detail_content.html`
- Generate: `static/js/dist/laparoscopy_annotator.bundle.js`

- [ ] **Step 1: Build the bundle**

```bash
make js-build
```

Expected: `static/js/dist/laparoscopy_annotator.bundle.js` created, no errors.

- [ ] **Step 2: Update the template to load the bundle instead of the 4 individual files**

In `templates/laparoscopy/patient_detail_content.html`, find the four `<script>` tags that load the old files:

```html
<script src="{% static 'js/laparoscopy_annotator_shapes.js' %}"></script>
<script src="{% static 'js/laparoscopy_annotator_api.js' %}"></script>
<script src="{% static 'js/laparoscopy_annotator_timeline.js' %}"></script>
<script src="{% static 'js/laparoscopy_annotator.js' %}"></script>
```

Replace with a single tag:

```html
<script src="{% static 'js/dist/laparoscopy_annotator.bundle.js' %}"></script>
```

- [ ] **Step 3: Slim the template inline script**

The inline `<script>` block at the bottom of the template currently:
- Sets up the video element
- Runs `setupMagicToolbox()` (large closure)
- Calls `new VideoAnnotator(cfg)`

Remove the `setupMagicToolbox` function entirely (it's now inside `worker.js` via `_initMagicToolbox`). The inline script becomes:

```js
(function () {
    'use strict';

    var allRaw       = JSON.parse(document.getElementById('_pf_raw').textContent);
    var allProcessed = JSON.parse(document.getElementById('_pf_processed').textContent);

    var rawVideo        = allRaw.find(function (f) { return f.file_type === 'video_raw'; });
    var compressedVideo = allProcessed.find(function (f) { return f.file_type === 'video_compressed'; });
    var subsampledVideo = allProcessed.find(function (f) { return f.file_type === 'video_subsampled'; });
    var playFile = compressedVideo || rawVideo;

    window.subsampledVideoId   = subsampledVideo ? subsampledVideo.id   : null;
    window.subsampledVideoPath = subsampledVideo ? subsampledVideo.file_path : null;
    window.subsampledVideoFps  = subsampledVideo ? (subsampledVideo.fps || 1) : 1;
    window.workerWsHost        = window.workerWsHost || 'zip-dgx.ing.unimore.it:8080';
    window.workerVideoId       = window.subsampledVideoId
        ? 'lap-{{ patient.patient_id }}-' + window.subsampledVideoId
        : 'lap-{{ patient.patient_id }}';
    window.workerVideoPath     = window.subsampledVideoPath;

    if (!playFile) return;

    var playerWrap  = document.getElementById('video-player-wrap');
    var placeholder = document.getElementById('video-placeholder');
    var toggleBtn   = document.getElementById('annotation-toggle-btn');
    var frameNavBar = document.getElementById('frame-nav-bar');
    var temporalBar = document.getElementById('temporal-classification-bar');

    placeholder.remove();

    var zoomInner = document.createElement('div');
    zoomInner.id = 'video-zoom-inner';
    zoomInner.style.cssText = 'position:relative;transform-origin:0 0;';
    playerWrap.appendChild(zoomInner);

    var video = document.createElement('video');
    video.controls = true;
    video.style.cssText = 'width:100%;display:block;max-height:65vh;background:#000;';
    video.setAttribute('preload', 'metadata');
    video.src = '/laparoscopy/video/' + playFile.id + '/';
    window.__laparoscopyVideoEl = video;
    zoomInner.appendChild(video);

    toggleBtn.classList.remove('d-none');
    frameNavBar.classList.remove('d-none');
    temporalBar.classList.remove('d-none');
    document.getElementById('magic-toolbox-panel').classList.remove('d-none');

    video.addEventListener('loadedmetadata', function initAnnotator() {
        video.removeEventListener('loadedmetadata', initAnnotator);

        var annotator = new VideoAnnotator({
            videoEl:        video,
            wrapEl:         zoomInner,
            outerEl:        playerWrap,
            toolbarEl:      document.getElementById('annotation-toolbar'),
            regionListEl:   document.getElementById('region-list'),
            shapesListEl:   document.getElementById('shapes-list'),
            toggleBtn:      toggleBtn,
            timestampEl:    document.getElementById('frame-timestamp'),
            brushSizeInput: document.getElementById('brush-size-input'),
            brushSizeLabel: document.getElementById('brush-size-label'),
            polygonHintEl:  document.getElementById('polygon-drawing-hint'),
            timelineTrackWrapEl:     document.getElementById('timeline-track-wrap'),
            timelineTrackEl:         document.getElementById('timeline-track'),
            timelineSegmentsLayerEl: document.getElementById('timeline-segments-layer'),
            timelinePinsLayerEl:     document.getElementById('timeline-pins-layer'),
            timelinePlayheadEl:      document.getElementById('timeline-playhead'),
            timelineCurrentTimeEl:   document.getElementById('timeline-current-time'),
            timelineDurationEl:      document.getElementById('timeline-duration'),
            timelineActiveClassEl:   document.getElementById('timeline-active-class'),
            timelineAddPinBtnEl:     document.getElementById('timeline-add-pin-btn'),
            timelineClassListEl:     document.getElementById('timeline-class-list'),
            patientId:               {{ patient.patient_id }},
            isAdmin:                 {{ user_profile.is_admin|yesno:"true,false" }},
            csrfToken:               '{{ csrf_token }}',
            subsampledVideoFps:      window.subsampledVideoFps,
            workerWsHost:            window.workerWsHost,
            workerVideoId:           window.workerVideoId,
            workerVideoSource:       window.workerVideoPath,
        });

        var origEnter = annotator._enterAnnotationMode.bind(annotator);
        var origExit  = annotator._exitAnnotationMode.bind(annotator);
        var shapesPanelEl  = document.getElementById('shapes-list-panel');
        var regionPanelEl  = document.getElementById('region-types-panel');

        annotator._enterAnnotationMode = function () {
            origEnter();
            shapesPanelEl.classList.remove('d-none');
            regionPanelEl.classList.remove('d-none');
        };
        annotator._exitAnnotationMode = function () {
            origExit();
            shapesPanelEl.classList.add('d-none');
            regionPanelEl.classList.add('d-none');
        };
    });
})();
```

- [ ] **Step 4: Verify the page loads and annotation works end-to-end**

Open a laparoscopy patient detail page. Verify:
- Video loads and plays
- Enter/Exit annotation mode toggles toolbar
- Brush/eraser/polygon drawing works
- Timeline classification works
- Region types load from API
- Shapes persist (save and reload)

- [ ] **Step 5: Commit**

```bash
git add static/js/dist/laparoscopy_annotator.bundle.js templates/laparoscopy/patient_detail_content.html
git commit -m "build(laparoscopy): switch template to esbuild bundle, slim inline script"
```

---

## Phase 4 — Feature Completion

### Task 10: Magic Toolbox — region-aware, frame-local points

**Files:**
- Modify: `static/js/src/laparoscopy/worker.js`
- Modify: `templates/laparoscopy/patient_detail_content.html`

- [ ] **Step 1: Add HTML for new Magic Toolbox buttons**

In `templates/laparoscopy/patient_detail_content.html`, find `#magic-toolbox-panel`. Replace the current card body with:

```html
<div id="magic-toolbox-panel" class="d-none mb-3">
    <div class="card border-info-subtle">
        <div class="card-header d-flex justify-content-between align-items-center py-2">
            <strong class="small"><i class="fas fa-magic me-1"></i>Magic Toolbox</strong>
            <span id="magic-prompts-count" class="badge text-bg-light">0</span>
        </div>
        <div class="card-body py-2">
            <div class="d-flex flex-wrap gap-2 mb-2">
                <button id="magic-tool-point-btn" type="button" class="btn btn-sm btn-outline-primary">
                    <i class="fas fa-crosshairs me-1"></i>Point Tool
                </button>
                <button id="magic-send-prompts-btn" type="button" class="btn btn-sm btn-primary">
                    <i class="fas fa-paper-plane me-1"></i>Send
                </button>
                <button id="magic-clear-frame-btn" type="button" class="btn btn-sm btn-outline-secondary">
                    Clear frame
                </button>
                <button id="magic-clear-all-btn" type="button" class="btn btn-sm btn-outline-danger">
                    Clear all
                </button>
            </div>
            <div class="d-flex align-items-center gap-2 mb-2">
                <label for="magic-window-seconds-input" class="small mb-0 text-muted">Window (s)</label>
                <input id="magic-window-seconds-input" type="number" class="form-control form-control-sm"
                       value="5.0" min="0.1" step="0.1" style="max-width:110px;">
            </div>
            <div class="small text-muted mb-1">
                Active region sets prompt color. Click frame to place point. Send runs segmentation.
            </div>
            <ul id="magic-prompts-list" class="list-group list-group-flush mt-1"
                style="max-height:160px;overflow-y:auto;"></ul>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Implement `_initMagicToolbox` in `worker.js`**

Replace the placeholder `_initMagicToolbox` with the full implementation:

```js
proto._initMagicToolbox = function () {
    var self = this;

    // Create overlay div inside the zoom wrapper for prompt dot markers
    this._magicOverlayEl = document.createElement('div');
    this._magicOverlayEl.id = 'magic-prompt-overlay';
    this._magicOverlayEl.style.cssText =
        'position:absolute;inset:0;z-index:8;pointer-events:none;';
    this.wrapEl.appendChild(this._magicOverlayEl);

    // Point Tool toggle
    if (this._magicPointToolBtnEl) {
        this._magicPointToolBtnEl.addEventListener('click', function () {
            self._magicPointActive = !self._magicPointActive;
            self._magicOverlayEl.style.pointerEvents = self._magicPointActive ? 'auto' : 'none';
            self._magicOverlayEl.style.cursor = self._magicPointActive ? 'crosshair' : 'default';
            self._magicPointToolBtnEl.classList.toggle('active', self._magicPointActive);
            self._magicPointToolBtnEl.classList.toggle('btn-primary', self._magicPointActive);
            self._magicPointToolBtnEl.classList.toggle('btn-outline-primary', !self._magicPointActive);
        });
    }

    // Click to add prompt point
    this._magicOverlayEl.addEventListener('click', function (e) {
        if (!self._magicPointActive) return;
        var rect = self.videoEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        var y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        var frameTime = self._snapToSubsampledFrame(self.videoEl.currentTime);
        var region = self._activeRegion();
        self._magicPrompts.push({
            id: 'mp-' + Date.now() + '-' + Math.random().toString(36).slice(2),
            x: x,
            y: y,
            frame_time: frameTime,
            region_id: region ? region.id : null,
        });
        self._renderMagicOverlay();
        self._renderMagicPromptList();
        self._updateMagicCount();
    });

    // Send button
    if (this._magicSendBtnEl) {
        this._magicSendBtnEl.addEventListener('click', function () { self._sendMagicPrompts(); });
    }

    // Clear frame button
    if (this._magicClearFrameBtnEl) {
        this._magicClearFrameBtnEl.addEventListener('click', function () {
            var ft = self._snapToSubsampledFrame(self.videoEl.currentTime);
            var tol = self._magicFrameTolerance();
            self._magicPrompts = self._magicPrompts.filter(function (p) {
                return Math.abs(p.frame_time - ft) > tol;
            });
            self._renderMagicOverlay();
            self._renderMagicPromptList();
            self._updateMagicCount();
        });
    }

    // Clear all button
    if (this._magicClearAllBtnEl) {
        this._magicClearAllBtnEl.addEventListener('click', function () {
            self._magicPrompts = [];
            self._renderMagicOverlay();
            self._renderMagicPromptList();
            self._updateMagicCount();
        });
    }

    this._renderMagicPromptList();
    this._updateMagicCount();
};

proto._magicFrameTolerance = function () {
    return 0.5 / (this._subsampledVideoFps || 1);
};

proto._snapToSubsampledFrame = function (t) {
    var fps = this._subsampledVideoFps || 1;
    return Math.round(t * fps) / fps;
};

proto._renderMagicOverlay = function () {
    if (!this._magicOverlayEl) return;
    this._magicOverlayEl.innerHTML = '';
    var self = this;
    var currentFt = this._snapToSubsampledFrame(this.videoEl.currentTime);
    var tol = this._magicFrameTolerance();

    this._magicPrompts.forEach(function (p) {
        if (Math.abs(p.frame_time - currentFt) > tol) return;  // not this frame

        var region = self.regions.find(function (r) { return r.id === p.region_id; });
        var color = region ? region.color : '#3498db';

        var dot = document.createElement('div');
        dot.style.cssText =
            'position:absolute;' +
            'left:' + (p.x * 100) + '%;top:' + (p.y * 100) + '%;' +
            'width:10px;height:10px;border-radius:50%;' +
            'background:' + color + ';border:1.5px solid #fff;' +
            'box-shadow:0 0 4px ' + color + ';' +
            'transform:translate(-50%,-50%);' +
            'cursor:pointer;pointer-events:auto;';
        dot.title = (region ? region.name : '?') + ' — click to remove';
        dot.addEventListener('click', function (ev) {
            if (!self._magicPointActive) return;
            ev.stopPropagation();
            self._magicPrompts = self._magicPrompts.filter(function (q) { return q.id !== p.id; });
            self._renderMagicOverlay();
            self._renderMagicPromptList();
            self._updateMagicCount();
        });
        self._magicOverlayEl.appendChild(dot);
    });
};

proto._renderMagicPromptList = function () {
    var el = this._magicPromptsListEl;
    if (!el) return;
    el.innerHTML = '';

    if (!this._magicPrompts.length) {
        var empty = document.createElement('li');
        empty.className = 'list-group-item text-muted small py-1 px-2';
        empty.textContent = 'No prompts yet.';
        el.appendChild(empty);
        return;
    }

    var self = this;
    var currentFt = this._snapToSubsampledFrame(this.videoEl.currentTime);
    var tol = this._magicFrameTolerance();

    // Group by frame_time
    var byFrame = {};
    this._magicPrompts.forEach(function (p) {
        var key = String(p.frame_time);
        if (!byFrame[key]) byFrame[key] = [];
        byFrame[key].push(p);
    });

    Object.keys(byFrame).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (ft) {
        var pts = byFrame[ft];
        var isCurrent = Math.abs(Number(ft) - currentFt) <= tol;
        var header = document.createElement('li');
        header.className = 'list-group-item py-1 px-2 small fw-bold' +
            (isCurrent ? ' list-group-item-success' : ' text-muted');
        header.textContent = 'Frame ' + ft + 's' + (isCurrent ? ' ◀ current' : '');
        el.appendChild(header);

        pts.forEach(function (p) {
            var region = self.regions.find(function (r) { return r.id === p.region_id; });
            var item = document.createElement('li');
            item.className = 'list-group-item py-1 px-3 small d-flex gap-2 align-items-center';
            var dot = document.createElement('span');
            dot.style.cssText = 'width:8px;height:8px;border-radius:50%;flex-shrink:0;background:' +
                (region ? region.color : '#888');
            item.appendChild(dot);
            var label = document.createElement('span');
            label.className = 'flex-grow-1';
            label.textContent = (region ? region.name : '?') + '  ' +
                Math.round(p.x * 100) + '%, ' + Math.round(p.y * 100) + '%';
            item.appendChild(label);
            el.appendChild(item);
        });
    });
};

proto._updateMagicCount = function () {
    if (this._magicPromptsCountEl) {
        this._magicPromptsCountEl.textContent = String(this._magicPrompts.length);
    }
};

proto._sendMagicPrompts = function () {
    var self = this;
    var currentFt = this._snapToSubsampledFrame(this.videoEl.currentTime);
    var tol = this._magicFrameTolerance();
    var region = this._activeRegion();

    var framePoints = this._magicPrompts.filter(function (p) {
        return Math.abs(p.frame_time - currentFt) <= tol &&
               p.region_id === (region ? region.id : null);
    });

    if (!framePoints.length) {
        console.warn('[Magic] no prompts for current frame + active region');
        return;
    }

    var points = framePoints.map(function (p) { return [p.x, p.y]; });
    var pointLabels = framePoints.map(function () { return 1; });

    var windowSeconds = 5.0;
    if (this._magicWindowInputEl) {
        var parsed = Number(this._magicWindowInputEl.value);
        if (isFinite(parsed) && parsed > 0) windowSeconds = parsed;
    }

    if (this._magicSendBtnEl) this._magicSendBtnEl.disabled = true;

    fetch('/laparoscopy/api/worker/session-prompt/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
            patientId: this.patientId,
            video_id: this._workerVideoId,
            frame_timestamp: currentFt,
            points: points,
            point_labels: pointLabels,
            window_seconds: windowSeconds,
            normalized: true,
        }),
    })
    .then(function (resp) { return resp.text().then(function (t) {
        if (!resp.ok) { console.error('[Magic] send failed', resp.status, t); }
    }); })
    .catch(function (err) { console.error('[Magic] send error', err); })
    .finally(function () {
        if (self._magicSendBtnEl) self._magicSendBtnEl.disabled = false;
    });
};
```

- [ ] **Step 3: Rebuild bundle**

```bash
make js-build
```

- [ ] **Step 4: Manual test**

Open a patient detail page with a subsampled video. Verify:
- Point Tool button toggles active state
- Clicking the video places a colored dot at the active region's color
- Moving to a different frame hides the dots
- Moving back to the frame shows dots again
- Clear frame removes only current frame's dots
- Clear all removes everything
- Send button fires the API call (check browser DevTools network tab)

- [ ] **Step 5: Commit**

```bash
git add static/js/src/laparoscopy/worker.js static/js/dist/laparoscopy_annotator.bundle.js templates/laparoscopy/patient_detail_content.html
git commit -m "feat(laparoscopy): region-aware frame-local magic prompt points"
```

---

### Task 11: Magic Toolbox — Accept mask → annotation shape

**Files:**
- Modify: `static/js/src/laparoscopy/worker.js`

- [ ] **Step 1: Update `_drawMaskOverlay` to tint with region color**

In `worker.js`, update `_drawMaskOverlay` to accept a `regionColor` hex string and parse it:

```js
proto._drawMaskOverlay = function (frameResult, regionColor) {
    if (!frameResult || !frameResult.mask_b64 || !Array.isArray(frameResult.mask_shape)) return;
    var overlay = this._ensureMaskOverlay();
    if (!overlay) return;

    var shape = frameResult.mask_shape;
    var maskH = Number(shape[shape.length - 2]);
    var maskW = Number(shape[shape.length - 1]);
    if (!isFinite(maskH) || !isFinite(maskW) || maskH <= 0 || maskW <= 0) return;

    // Parse hex color to RGB
    var r = 0, g = 220, b = 80;
    if (regionColor && /^#[0-9a-fA-F]{6}$/.test(regionColor)) {
        r = parseInt(regionColor.slice(1, 3), 16);
        g = parseInt(regionColor.slice(3, 5), 16);
        b = parseInt(regionColor.slice(5, 7), 16);
    }

    var bytes = this._decodeB64ToBytes(frameResult.mask_b64);
    var pixelCount = maskW * maskH;
    var stride = Math.max(1, Math.floor(bytes.length / pixelCount));
    var isFloat32 = stride === 4;
    var view = isFloat32 ? new DataView(bytes.buffer) : null;
    var imageData = new ImageData(maskW, maskH);

    for (var pi = 0; pi < pixelCount; pi++) {
        var maskValue = isFloat32 ? view.getFloat32(pi * 4, true) : bytes[pi * stride] || 0;
        if (maskValue > 0) {
            var di = pi * 4;
            imageData.data[di]     = r;
            imageData.data[di + 1] = g;
            imageData.data[di + 2] = b;
            imageData.data[di + 3] = 110;
        }
    }

    var tmp = document.createElement('canvas');
    tmp.width = maskW; tmp.height = maskH;
    var tmpCtx = tmp.getContext('2d');
    if (!tmpCtx) return;
    tmpCtx.putImageData(imageData, 0, 0);
    overlay.ctx.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
    overlay.ctx.drawImage(tmp, 0, 0, overlay.canvas.width, overlay.canvas.height);
    this._lastRenderedMaskKey = this._maskCacheKey(frameResult);
    this._currentMaskFrame = frameResult;  // store for Accept
};
```

- [ ] **Step 2: Implement `_renderAcceptBtn` and `_hideMagicAcceptBtn`**

```js
proto._renderAcceptBtn = function () {
    if (this._magicAcceptBtnEl) return;  // already shown

    var region = this._activeRegion();
    var color = region ? region.color : '#27ae60';
    var label = region ? region.name : 'mask';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'magic-accept-btn';
    btn.style.cssText =
        'position:absolute;bottom:10px;right:10px;z-index:15;' +
        'background:' + color + ';color:#fff;border:none;border-radius:4px;' +
        'padding:0.25rem 0.8rem;font-size:0.8rem;font-weight:bold;cursor:pointer;' +
        'box-shadow:0 2px 6px rgba(0,0,0,0.4);';
    btn.innerHTML = '✓ Accept — ' + label;

    var self = this;
    btn.addEventListener('click', function () { self._acceptMask(); });

    this.wrapEl.appendChild(btn);
    this._magicAcceptBtnEl = btn;
};

proto._hideMagicAcceptBtn = function () {
    if (this._magicAcceptBtnEl) {
        this._magicAcceptBtnEl.remove();
        this._magicAcceptBtnEl = null;
    }
    this._currentMaskFrame = null;
};
```

- [ ] **Step 3: Implement `_acceptMask` — contour → polygon → shape**

```js
proto._acceptMask = function () {
    var maskFrame = this._currentMaskFrame;
    if (!maskFrame) return;

    var region = this._activeRegion();
    if (!region) { console.warn('[Magic] accept: no active region'); return; }

    var shape = maskFrame.mask_shape;
    var maskH = Number(shape[shape.length - 2]);
    var maskW = Number(shape[shape.length - 1]);
    if (!maskW || !maskH) return;

    var bytes = this._decodeB64ToBytes(maskFrame.mask_b64);
    var pixelCount = maskW * maskH;
    var stride = Math.max(1, Math.floor(bytes.length / pixelCount));
    var isFloat32 = stride === 4;
    var view = isFloat32 ? new DataView(bytes.buffer) : null;

    // Build binary grid
    var grid = new Uint8Array(pixelCount);
    for (var pi = 0; pi < pixelCount; pi++) {
        var val = isFloat32 ? view.getFloat32(pi * 4, true) : bytes[pi * stride] || 0;
        grid[pi] = val > 0 ? 1 : 0;
    }

    // Simple contour: march along boundary rows, collect edge pixels
    var contour = _extractLargestContour(grid, maskW, maskH);
    if (!contour || contour.length < 6) {
        console.warn('[Magic] accept: contour too small');
        return;
    }

    // Simplify with Ramer-Douglas-Peucker (epsilon = 3 mask pixels)
    var simplified = _rdpSimplify(contour, 3.0);
    if (simplified.length < 6) simplified = contour;

    // Scale contour from mask coordinates to canvas display coordinates
    var canvasW = this.stage.width();
    var canvasH = this.stage.height();
    var scaleX = canvasW / maskW;
    var scaleY = canvasH / maskH;
    var scaledPoints = simplified.map(function (v, i) {
        return i % 2 === 0 ? v * scaleX : v * scaleY;
    });

    // Create Konva polygon
    var konvaNode = new Konva.Line({
        points: scaledPoints,
        fill: region.color + '55',
        stroke: region.color,
        strokeWidth: 2,
        closed: true,
        listening: false,
    });
    region.layer.add(konvaNode);
    region.layer.draw();

    this._registerShape('polygon', konvaNode, {
        regionId: region.id,
        frameTime: this.videoEl.currentTime,
    });

    this._clearMaskOverlay();
    this._hideMagicAcceptBtn();
};

// Ramer-Douglas-Peucker line simplification
function _rdpSimplify(points, epsilon) {
    if (points.length <= 4) return points;
    var maxDist = 0;
    var maxIdx = 0;
    var n = points.length / 2;
    var ax = points[0], ay = points[1];
    var bx = points[(n - 1) * 2], by = points[(n - 1) * 2 + 1];

    for (var i = 1; i < n - 1; i++) {
        var px = points[i * 2], py = points[i * 2 + 1];
        var d = _pointToSegmentDist(px, py, ax, ay, bx, by);
        if (d > maxDist) { maxDist = d; maxIdx = i; }
    }

    if (maxDist <= epsilon) {
        return [ax, ay, bx, by];
    }

    var left  = _rdpSimplify(points.slice(0, (maxIdx + 1) * 2), epsilon);
    var right = _rdpSimplify(points.slice(maxIdx * 2), epsilon);
    // Avoid duplicating the junction point
    return left.slice(0, -2).concat(right);
}

function _pointToSegmentDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    if (dx === 0 && dy === 0) {
        dx = px - ax; dy = py - ay;
        return Math.sqrt(dx * dx + dy * dy);
    }
    var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    var cx = ax + t * dx, cy = ay + t * dy;
    dx = px - cx; dy = py - cy;
    return Math.sqrt(dx * dx + dy * dy);
}

// Extract the largest connected contour from a binary mask grid.
// Returns flat [x0, y0, x1, y1, ...] array in mask pixel coordinates.
function _extractLargestContour(grid, w, h) {
    // Walk each row, collect boundary transitions to get outline points
    var points = [];
    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            if (!grid[y * w + x]) continue;
            var isBoundary =
                x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
                !grid[y * w + (x - 1)] || !grid[y * w + (x + 1)] ||
                !grid[(y - 1) * w + x] || !grid[(y + 1) * w + x];
            if (isBoundary) { points.push(x, y); }
        }
    }
    return points;
}
```

- [ ] **Step 4: Rebuild and test**

```bash
make js-build
```

Open a patient detail page. Use Magic Toolbox to place prompts and send. When the green/colored mask overlay appears, click the Accept button. Verify:
- A polygon shape is created on the canvas at the correct frame
- The shape appears in the Shapes list panel
- The shape persists after page reload

- [ ] **Step 5: Commit**

```bash
git add static/js/src/laparoscopy/worker.js static/js/dist/laparoscopy_annotator.bundle.js
git commit -m "feat(laparoscopy): accept mask button converts segmentation result to annotation shape"
```

---

### Task 12: Frame snap on pause + frame indicator

**Files:**
- Modify: `static/js/src/laparoscopy/worker.js`
- Modify: `static/js/src/laparoscopy/core.js`

- [ ] **Step 1: Add `_initFrameSnap` to `worker.js`**

```js
proto._initFrameSnap = function () {
    var self = this;
    this.videoEl.addEventListener('pause', function () {
        var fps = self._subsampledVideoFps || 1;
        var snapped = Math.round(self.videoEl.currentTime * fps) / fps;
        if (Math.abs(snapped - self.videoEl.currentTime) > 0.001) {
            self.videoEl.currentTime = snapped;
        }
    });
};
```

- [ ] **Step 2: Update `_updateTimestamp` in `core.js` to show frame index**

Find `VideoAnnotator.prototype._updateTimestamp` (currently in annotator.js, moves to core.js). Update it:

```js
VideoAnnotator.prototype._updateTimestamp = function () {
    if (!this.timestampEl) return;
    var t   = this.videoEl.currentTime || 0;
    var fps = this._subsampledVideoFps || 1;
    var frameIdx   = Math.round(t * fps);
    var totalFrames = isFinite(this.videoEl.duration) ? Math.round(this.videoEl.duration * fps) : '?';
    var mm = String(Math.floor(t / 60)).padStart(2, '0');
    var ss = String(Math.floor(t % 60)).padStart(2, '0');
    var ms = String(Math.floor((t % 1) * 1000)).padStart(3, '0');
    this.timestampEl.textContent = mm + ':' + ss + '.' + ms +
        '  [Frame ' + frameIdx + ' / ' + totalFrames + ']';
};
```

- [ ] **Step 3: Rebuild bundle**

```bash
make js-build
```

- [ ] **Step 4: Manual test**

Open a patient detail page. Verify:
- Playing the video and pausing snaps `currentTime` to the nearest whole second (1fps) or nearest fractional second at higher fps
- The timestamp display shows `MM:SS.mmm  [Frame N / Total]`
- Placing a magic prompt point auto-snaps to the nearest subsampled frame
- The frame indicator updates as you seek

- [ ] **Step 5: Commit**

```bash
git add static/js/src/laparoscopy/worker.js static/js/src/laparoscopy/core.js static/js/dist/laparoscopy_annotator.bundle.js
git commit -m "feat(laparoscopy): frame snap on pause, subsampled frame index in timestamp display"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ §2.1 views/ split → Task 1
- ✅ §2.2 fps in FileRegistry metadata → Task 2
- ✅ §3.1 src/laparoscopy/ directory → Task 3
- ✅ §3.2 esbuild build config → Task 3
- ✅ §3.3 ES6 module interface → Tasks 4–8
- ✅ §4 worker.js module → Task 7 + 10 + 11
- ✅ §5.1 point data model → Task 10
- ✅ §5.2 frame-local visibility → Task 10
- ✅ §5.3 interaction model (10px markers, works in annotation mode) → Task 10
- ✅ §5.4 send flow (frame-scoped, active region) → Task 10
- ✅ §5.5 accept mask → shape → Task 11
- ✅ §5.6 sidebar panel (grouped by frame, current highlighted) → Task 10
- ✅ §6.1 snap on pause → Task 12
- ✅ §6.2 snap formula → Tasks 10 + 12
- ✅ §6.3 frame indicator in timestamp → Task 12
- ✅ §7 template slim inline script → Task 9
- ✅ mask tinted with region color (not fixed green) → Task 11 step 1

**Placeholder scan:** All steps contain actual code. No TBDs.

**Type consistency:**
- `_snapToSubsampledFrame` defined in Task 10 (worker.js), called in Tasks 10, 11, 12 ✅
- `_magicFrameTolerance` defined in Task 10, called in Task 10 ✅  
- `_currentMaskFrame` set in Task 11 `_drawMaskOverlay`, read in `_acceptMask` ✅
- `_registerShape` defined in shapes.js (Task 4), called in Task 11 ✅
- `_activeRegion` defined in core.js, called in Tasks 10, 11 ✅
- `_initFrameSnap` called in core.js constructor (Task 8), defined in worker.js (Task 12) — worker mixin applied before constructor body ends ✅
