'use strict';

const MAX_MASK_CACHE = 300;

function _rdpSimplify(points, epsilon) {
    if (points.length <= 4) return points;
    var n  = points.length / 2;
    var ax = points[0],           ay = points[1];
    var bx = points[(n-1)*2],     by = points[(n-1)*2+1];
    var maxDist = 0, maxIdx = 0;
    for (var i = 1; i < n - 1; i++) {
        var d = _pointToSegDist(points[i*2], points[i*2+1], ax, ay, bx, by);
        if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist <= epsilon) return [ax, ay, bx, by];
    var left  = _rdpSimplify(points.slice(0, (maxIdx+1)*2), epsilon);
    var right = _rdpSimplify(points.slice(maxIdx*2),        epsilon);
    return left.slice(0, -2).concat(right);
}

function _pointToSegDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    if (dx === 0 && dy === 0) {
        dx = px - ax; dy = py - ay;
        return Math.sqrt(dx*dx + dy*dy);
    }
    var t  = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / (dx*dx + dy*dy)));
    var cx = ax + t*dx, cy = ay + t*dy;
    dx = px - cx; dy = py - cy;
    return Math.sqrt(dx*dx + dy*dy);
}

function _polygonArea(flatPoints) {
    var n = flatPoints.length / 2;
    if (n < 3) return 0;
    var area = 0;
    for (var i = 0; i < n; i++) {
        var j = (i + 1) % n;
        var xi = flatPoints[i * 2];
        var yi = flatPoints[i * 2 + 1];
        var xj = flatPoints[j * 2];
        var yj = flatPoints[j * 2 + 1];
        area += xi * yj - xj * yi;
    }
    return area * 0.5;
}

function _traceComponentOuterContour(componentMap, component, w, h) {
    var compId = component.id;
    var minx = component.minx;
    var maxx = component.maxx;
    var miny = component.miny;
    var maxy = component.maxy;
    var w1 = w + 1;
    var maxEdges = 50000;
    var edgeCount = 0;
    var overflow = false;
    var outgoing = new Map();

    function edgeToken(a, b) { return String(a) + '>' + String(b); }

    function pointId(x, y) {
        return y * w1 + x;
    }

    function directionIndex(fromId, toId) {
        var fy = (fromId / w1) | 0;
        var fx = fromId - fy * w1;
        var ty = (toId / w1) | 0;
        var tx = toId - ty * w1;
        if (tx > fx) return 0; // E
        if (ty > fy) return 1; // S
        if (tx < fx) return 2; // W
        return 3; // N
    }

    function addEdge(x1, y1, x2, y2) {
        if (overflow) return;
        edgeCount += 1;
        if (edgeCount > maxEdges) {
            overflow = true;
            return;
        }
        var a = pointId(x1, y1);
        var b = pointId(x2, y2);
        var arr = outgoing.get(a);
        if (!arr) {
            arr = [];
            outgoing.set(a, arr);
        }
        arr.push(b);
    }

    for (var y = miny; y <= maxy; y++) {
        var rowBase = y * w;
        for (var x = minx; x <= maxx; x++) {
            var idx = rowBase + x;
            if (componentMap[idx] !== compId) continue;

            var topSame = y > 0 && componentMap[idx - w] === compId;
            var rightSame = x < w - 1 && componentMap[idx + 1] === compId;
            var bottomSame = y < h - 1 && componentMap[idx + w] === compId;
            var leftSame = x > 0 && componentMap[idx - 1] === compId;

            if (!topSame) addEdge(x, y, x + 1, y);
            if (!rightSame) addEdge(x + 1, y, x + 1, y + 1);
            if (!bottomSame) addEdge(x + 1, y + 1, x, y + 1);
            if (!leftSame) addEdge(x, y + 1, x, y);
        }
    }

    if (overflow || !edgeCount) return [];

    var visited = new Set();
    var bestLoop = [];
    var bestArea = 0;

    outgoing.forEach(function (targets, startId) {
        for (var i = 0; i < targets.length; i++) {
            var firstTarget = targets[i];
            var startToken = edgeToken(startId, firstTarget);
            if (visited.has(startToken)) continue;

            var loop = [startId, firstTarget];
            visited.add(startToken);

            var prev = startId;
            var curr = firstTarget;
            var maxSteps = maxEdges + 32;

            for (var step = 0; step < maxSteps; step++) {
                if (curr === startId) break;

                var outs = outgoing.get(curr);
                if (!outs || !outs.length) break;

                var dir = directionIndex(prev, curr);
                var pref = [
                    (dir + 1) % 4, // right turn
                    dir,           // straight
                    (dir + 3) % 4, // left turn
                    (dir + 2) % 4, // backtrack
                ];

                var next = null;
                for (var p = 0; p < pref.length && next === null; p++) {
                    var wantDir = pref[p];
                    for (var oi = 0; oi < outs.length; oi++) {
                        var cand = outs[oi];
                        var tok = edgeToken(curr, cand);
                        if (visited.has(tok)) continue;
                        if (directionIndex(curr, cand) === wantDir) {
                            next = cand;
                            break;
                        }
                    }
                }

                if (next === null) {
                    for (var oi2 = 0; oi2 < outs.length; oi2++) {
                        var cand2 = outs[oi2];
                        var tok2 = edgeToken(curr, cand2);
                        if (!visited.has(tok2)) {
                            next = cand2;
                            break;
                        }
                    }
                }

                if (next === null) break;

                visited.add(edgeToken(curr, next));
                prev = curr;
                curr = next;
                loop.push(curr);
            }

            if (loop.length < 4 || loop[loop.length - 1] !== startId) continue;

            var flat = [];
            for (var li = 0; li < loop.length - 1; li++) {
                var id = loop[li];
                var py = (id / w1) | 0;
                var px = id - py * w1;
                flat.push(px, py);
            }
            if (flat.length < 6) continue;

            var area = Math.abs(_polygonArea(flat));
            if (area > bestArea) {
                bestArea = area;
                bestLoop = flat;
            }
        }
    });

    return bestLoop;
}

function _extractComponentContours(grid, w, h, promptPixels) {
    var pixelCount = w * h;
    if (!pixelCount) return [];

    var componentMap = new Int32Array(pixelCount);
    var queue = new Int32Array(pixelCount);
    var components = [];
    var compId = 0;

    for (var start = 0; start < pixelCount; start++) {
        if (!grid[start] || componentMap[start] !== 0) continue;

        compId += 1;
        var head = 0;
        var tail = 0;
        queue[tail++] = start;
        componentMap[start] = compId;

        var size = 0;
        var minx = w, maxx = 0, miny = h, maxy = 0;

        while (head < tail) {
            var idx = queue[head++];
            var x = idx % w;
            var y = (idx / w) | 0;
            size += 1;

            if (x < minx) minx = x;
            if (x > maxx) maxx = x;
            if (y < miny) miny = y;
            if (y > maxy) maxy = y;

            if (x > 0) {
                var left = idx - 1;
                if (grid[left] && componentMap[left] === 0) {
                    componentMap[left] = compId;
                    queue[tail++] = left;
                }
            }
            if (x < w - 1) {
                var right = idx + 1;
                if (grid[right] && componentMap[right] === 0) {
                    componentMap[right] = compId;
                    queue[tail++] = right;
                }
            }
            if (y > 0) {
                var up = idx - w;
                if (grid[up] && componentMap[up] === 0) {
                    componentMap[up] = compId;
                    queue[tail++] = up;
                }
            }
            if (y < h - 1) {
                var down = idx + w;
                if (grid[down] && componentMap[down] === 0) {
                    componentMap[down] = compId;
                    queue[tail++] = down;
                }
            }
        }

        components.push({
            id: compId,
            size: size,
            minx: minx,
            maxx: maxx,
            miny: miny,
            maxy: maxy,
            promptHits: 0,
        });
    }

    if (!components.length) return [];

    if (Array.isArray(promptPixels) && promptPixels.length) {
        var usedPromptIdx = new Set();
        for (var p = 0; p < promptPixels.length; p++) {
            var pp = promptPixels[p];
            if (!pp) continue;
            var px = Math.max(0, Math.min(w - 1, Math.round(Number(pp.x) || 0)));
            var py = Math.max(0, Math.min(h - 1, Math.round(Number(pp.y) || 0)));
            var pi = py * w + px;
            if (usedPromptIdx.has(pi)) continue;
            usedPromptIdx.add(pi);
            var hitId = componentMap[pi];
            if (hitId > 0) {
                components[hitId - 1].promptHits += 1;
            }
        }
    }

    components.sort(function (a, b) { return b.size - a.size; });

    var largestSize = components[0].size;
    var minAreaAbs = Math.max(2, Math.floor(pixelCount * 0.000001));
    var minAreaRel = Math.max(minAreaAbs, Math.floor(largestSize * 0.015));
    var maxComponents = 18;
    var selected = [];
    var selectedById = {};

    function selectComp(c) {
        if (!c || selectedById[c.id]) return;
        selectedById[c.id] = true;
        selected.push(c);
    }

    for (var i = 0; i < components.length; i++) {
        var withPrompt = components[i];
        if (withPrompt.promptHits > 0) {
            selectComp(withPrompt);
        }
    }

    for (var j = 0; j < components.length; j++) {
        var c = components[j];
        if (c.promptHits > 0) continue;
        if (c.size >= minAreaRel) selectComp(c);
    }

    if (!selected.length) {
        for (var k = 0; k < components.length; k++) {
            if (components[k].size >= minAreaRel) selectComp(components[k]);
        }
    }

    if (!selected.length) selectComp(components[0]);

    selected.sort(function (a, b) {
        if (b.promptHits !== a.promptHits) return b.promptHits - a.promptHits;
        return b.size - a.size;
    });
    if (selected.length > maxComponents) {
        selected = selected.slice(0, maxComponents);
    }

    var contours = [];
    for (var s = 0; s < selected.length; s++) {
        var contour = _traceComponentOuterContour(componentMap, selected[s], w, h);
        if (contour && contour.length >= 6) contours.push(contour);
    }
    return contours;
}

export function applyWorkerMixin(proto) {

    // ── Initialisation ────────────────────────────────────────────────────

    proto._initWorker = function () {
        this._ws                  = null;
        this._wsReconnectTimer    = null;
        this._wsReconnectAttempts = 0;
        this._maskOverlayCanvas   = null;
        this._maskOverlayCtx      = null;
        this._maskFrameCache      = [];
        this._maskStoreSeq        = 0;
        this._lastRenderedMaskKey = null;
        this._maskSyncBound       = false;
        this._currentMaskFrames   = [];
        this._currentMaskFrame    = null;
        this._maskHoverCacheSeq   = null;
        this._maskHoverComponentIndex = null;
        this._lastPromptSigByScope = {};
        this._pendingUpdateScopesByJob = {};
        this._pendingUpdateScopesFIFO = [];
        this._rejectedTrackCutoffByKey = {};
        this._suppressAutoMaskDeletion = false;

        // Auto-accepted mask -> annotation bookkeeping
        this._autoMaskTrackStateByGroup = {};
        this._autoShapeMetaById = {};
        this._autoShapeIdsByScope = {};
        this._autoShapeIdsByTrack = {};
        this._autoShapeIdByEntryComponent = {};

        // Magic Toolbox state (populated in Task 10)
        this._magicPrompts        = [];
        this._magicPointActive    = false;
        this._magicPointLabel     = 1;
        this._magicOverlayEl      = null;
        this._maskDecisionLayerEl = null;
        this._magicStatusEl       = null;
        this._workerConnected     = false;

        this._wsConnect();
        this._bindMaskSync();
        this._initMagicToolbox();
    };

    // ── WebSocket lifecycle ───────────────────────────────────────────────

    proto._wsConnect = function () {
        if (!this._workerWsHost || !this._workerVideoId) {
            this._workerConnected = false;
            this._setMagicStatus('Worker connection unavailable: missing worker video/session config.', 'warning');
            this._setMagicControlsEnabled(false);
            return;
        }

        var wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
        var url = wsProto + '://' + this._workerWsHost +
                  '/ws/session/' + encodeURIComponent(this._workerVideoId) + '/';
        var self = this;

        this._setMagicStatus('Connecting to worker...', 'muted');
        this._setMagicControlsEnabled(false);
        this._ws = new WebSocket(url);
        this._ws.onopen    = function () { self._wsOnOpen(); };
        this._ws.onmessage = function (e) { self._wsOnMessage(e); };
        this._ws.onerror   = function (e) { console.error('[WS] error', e); };
        this._ws.onclose   = function (e) {
            console.log('[WS] close', e.code, e.reason);
            self._ws = null;
            self._workerConnected = false;
            self._setMagicControlsEnabled(false);
            self._setMagicStatus('Worker disconnected. Reconnecting...', 'warning');
            self._scheduleWsReconnect();
        };
    };

    proto._scheduleWsReconnect = function () {
        if (this._wsReconnectTimer) return;
        var self = this;
        var delay = Math.min(10000, 1000 * Math.pow(2, Math.min(this._wsReconnectAttempts, 3)));
        this._wsReconnectAttempts += 1;
        this._wsReconnectTimer = setTimeout(function () {
            self._wsReconnectTimer = null;
            self._wsConnect();
        }, delay);
    };

    proto._wsOnOpen = function () {
        console.log('[WS] open');
        this._workerConnected = true;
        this._wsReconnectAttempts = 0;
        this._setMagicStatus('Worker connected.', 'success');
        this._setMagicControlsEnabled(true);

        if (!this._workerVideoSource) {
            console.warn('[WS] session ready skipped: missing video source');
            this._setMagicStatus('Worker connected, but missing subsampled video source.', 'warning');
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
            if (!resp.ok) {
                console.error('[WS] session ready failed', resp.status, t);
                self._setMagicStatus('Worker ready failed (' + resp.status + ').', 'danger');
            } else {
                console.log('[WS] session ready ok');
                self._setMagicStatus('Worker session ready.', 'success');
            }
        }); })
        .catch(function (err) {
            console.error('[WS] session ready error', err);
            self._setMagicStatus('Worker session setup error.', 'danger');
        });
    };

    proto._wsOnMessage = function (e) {
        try {
            var parsed = JSON.parse(e.data);
            if (!parsed || !parsed.type) return;

            if (parsed.type === 'inference_done') {
                console.info('[Magic][WS] inference_done', { job_id: parsed.job_id || null });
                this._finalizePendingUpdateJob(parsed.job_id || null);
                return;
            }

            if (parsed && parsed.type === 'frame_result') {
                if (this._shouldIgnoreIncomingMask(parsed)) {
                    console.info('[Magic][WS] frame_result ignored by reject cutoff', {
                        frame_index: parsed.frame_index,
                        timestamp: parsed.timestamp,
                        region_id: parsed.region_id,
                    });
                    return;
                }

                console.info('[Magic][WS] frame_result', {
                    frame_index: parsed.frame_index,
                    timestamp: parsed.timestamp,
                    region_id: parsed.region_id,
                    class_name: parsed.class_name,
                    mask_shape: parsed.mask_shape,
                    mask_encoding: parsed.mask_encoding || null,
                    mask_b64_len: parsed.mask_b64 ? parsed.mask_b64.length : 0,
                });
                var entry = this._storeMaskFrame(parsed);
                this._markPendingScopeFrame(entry);
                if (!entry) {
                    this._syncMaskToCurrentVideoTime();
                    this._updateMagicAcceptButton();
                    this._setMagicStatus('Mask update ignored (rejected lineage or empty mask).', 'muted');
                    return;
                }
                if (entry && entry.region_id != null) {
                    this._removeFramePrompts(entry.frame_key, entry.region_id);
                }
                this._syncMaskToCurrentVideoTime();
                this._updateMagicAcceptButton();
                this._setMagicStatus('Mask received (auto-accepted) for frame ' + String(parsed.frame_index), 'success');
            }
        } catch (_) {
            console.log('[WS raw]', e.data);
        }
    };

    // ── Mask cache ────────────────────────────────────────────────────────

    proto._storeMaskFrame = function (frameResult) {
        if (!frameResult || !frameResult.mask_b64 || !Array.isArray(frameResult.mask_shape)) return null;
        var ts = Number(frameResult.timestamp);
        if (!isFinite(ts) || ts < 0) ts = this._currentVideoTime();
        var frameKey = this._frameKey(ts);
        var entry = {
            timestamp:   ts,
            frame_key:   frameKey,
            frame_index: Number(frameResult.frame_index || -1),
            region_id:   frameResult.region_id != null ? String(frameResult.region_id) : null,
            class_name:  frameResult.class_name || null,
            class_id:    frameResult.class_id != null ? String(frameResult.class_id) : null,
            object_id:   frameResult.object_id != null ? String(frameResult.object_id) : null,
            mask_b64:    frameResult.mask_b64,
            mask_encoding: frameResult.mask_encoding || null,
            mask_shape:  frameResult.mask_shape,
            prepared_contours: [],
            prepared_mask_w: null,
            prepared_mask_h: null,
            cache_seq:   ++this._maskStoreSeq,
        };

        this._prepareMaskContours(entry);

        var pendingScope = this._findPendingScopeForEntry(entry);
        if (pendingScope && !pendingScope.replaced_frame_keys) {
            pendingScope.replaced_frame_keys = {};
        }
        if (pendingScope && !pendingScope.replaced_frame_keys[entry.frame_key]) {
            this._clearPriorCanonicalStateForFrameRegion(
                entry.frame_key,
                entry.region_id,
                Number(pendingScope.start_seq || 0)
            );
            pendingScope.replaced_frame_keys[entry.frame_key] = true;
        }

        var regionGroup = this._regionGroupKey(entry);
        var previousEntry = this._findCachedEntryByFrameRegion(entry.frame_key, entry.region_id, entry.object_id);
        this._assignComponentTrackIds(entry, previousEntry);
        this._filterRejectedComponentsInEntry(entry);

        // Replace previous mask for the same frame+region so refreshed
        // prompts update the proposal instead of stacking on top.
        this._maskFrameCache = this._maskFrameCache.filter(function (existing) {
            return !(
                existing.frame_key === entry.frame_key &&
                this._regionGroupKey(existing) === regionGroup
            );
        }, this);

        if (!Array.isArray(entry.prepared_contours) || !entry.prepared_contours.length) {
            console.info('[Magic] dropped frame_result after track filtering', {
                frame_index: entry.frame_index,
                frame_key: entry.frame_key,
                region_id: entry.region_id,
            });
            return null;
        }

        this._maskFrameCache.push(entry);
        if (this._maskFrameCache.length > MAX_MASK_CACHE) {
            this._maskFrameCache = this._maskFrameCache.slice(this._maskFrameCache.length - MAX_MASK_CACHE);
        }

        this._syncAutoAcceptedShapesForEntry(entry);

        console.info('[Magic] stored mask frame', {
            frame_index: entry.frame_index,
            frame_key: entry.frame_key,
            region_id: entry.region_id,
            region_group: regionGroup,
            component_tracks: entry.component_track_ids,
            prepared_contours: entry.prepared_contours ? entry.prepared_contours.length : 0,
            prepared_size: [entry.prepared_mask_w, entry.prepared_mask_h],
        });

        return entry;
    };

    proto._buildBinaryMaskGrid = function (maskFrame) {
        if (!maskFrame || !Array.isArray(maskFrame.mask_shape) || !maskFrame.mask_b64) return null;

        var encoding = String(maskFrame.mask_encoding || '');
        if (encoding !== 'bitpack_u1_v1') return null;

        var shape = maskFrame.mask_shape;
        var maskH = Number(shape[shape.length - 2]);
        var maskW = Number(shape[shape.length - 1]);
        if (!maskW || !maskH) return null;

        var bytes = this._decodeB64ToBytes(maskFrame.mask_b64);
        var pixelCount = maskW * maskH;
        if (!pixelCount) return null;

        var expectedBytes = Math.ceil(pixelCount / 8);
        if (bytes.length !== expectedBytes) return null;
        var grid = new Uint8Array(pixelCount);

        for (var pi = 0; pi < pixelCount; pi++) {
            var byteVal = bytes[pi >> 3] || 0;
            grid[pi] = ((byteVal >> (pi & 7)) & 1) ? 1 : 0;
        }

        return {
            grid: grid,
            maskW: maskW,
            maskH: maskH,
            pixelCount: pixelCount,
        };
    };

    proto._prepareMaskContours = function (maskFrame) {
        var built = this._buildBinaryMaskGrid(maskFrame);
        if (!built) {
            maskFrame.prepared_contours = [];
            maskFrame.prepared_mask_w = null;
            maskFrame.prepared_mask_h = null;
            return;
        }

        var rawContours = _extractComponentContours(built.grid, built.maskW, built.maskH, null);
        var prepared = [];

        for (var ci = 0; ci < rawContours.length; ci++) {
            var contour = rawContours[ci];
            if (!contour || contour.length < 6) continue;

            if (contour.length > 1800 * 2) {
                var downsampled = [];
                var dsStride = Math.max(1, Math.floor((contour.length / 2) / 1800));
                for (var di = 0; di < contour.length; di += dsStride * 2) {
                    downsampled.push(contour[di], contour[di + 1]);
                }
                contour = downsampled;
            }

            var simplified = _rdpSimplify(contour, 1.5);
            if (simplified.length < 6) simplified = contour;
            if (simplified.length < 6) continue;
            prepared.push(simplified);
        }

        maskFrame.prepared_contours = prepared;
        maskFrame.prepared_mask_w = built.maskW;
        maskFrame.prepared_mask_h = built.maskH;
    };

    proto._pickMaskFrames = function (videoTime) {
        var key = this._frameKey(videoTime);
        var selected = [];
        var seen = {};

        for (var i = this._maskFrameCache.length - 1; i >= 0; i--) {
            var item = this._maskFrameCache[i];
            if (item.frame_key !== key) continue;
            if (!this._isMaskFrameRegionVisible(item)) continue;

            var hasIdentity = item.region_id != null || item.object_id != null;
            var dedupeKey = hasIdentity
                ? (String(item.region_id || 'region?') + '::' + String(item.object_id || 'obj?'))
                : ('seq::' + String(item.cache_seq));
            if (seen[dedupeKey]) continue;

            seen[dedupeKey] = true;
            selected.push(item);
        }

        selected.sort(function (a, b) {
            var ar = String(a.region_id || '');
            var br = String(b.region_id || '');
            if (ar !== br) return ar < br ? -1 : 1;
            return Number(a.cache_seq) - Number(b.cache_seq);
        });

        return selected;
    };

    proto._discardMaskFrames = function (predicate) {
        if (typeof predicate !== 'function') return;
        var kept = [];
        for (var i = 0; i < this._maskFrameCache.length; i++) {
            var entry = this._maskFrameCache[i];
            if (!predicate(entry)) {
                kept.push(entry);
            }
        }
        this._maskFrameCache = kept;
        this._lastRenderedMaskKey = null;
    };

    proto._clearAllMaskFrames = function () {
        var allScopeKeys = Object.keys(this._autoShapeIdsByScope || {});
        for (var i = 0; i < allScopeKeys.length; i++) {
            this._removeAutoShapesForScope(allScopeKeys[i]);
        }

        this._maskFrameCache = [];
        this._lastRenderedMaskKey = null;
        this._currentMaskFrames = [];
        this._currentMaskFrame = null;
        this._autoMaskTrackStateByGroup = {};
        this._autoShapeMetaById = {};
        this._autoShapeIdsByScope = {};
        this._autoShapeIdsByTrack = {};
        this._autoShapeIdByEntryComponent = {};
        this._rejectedTrackCutoffByKey = {};
    };

    // ── Mask overlay rendering ────────────────────────────────────────────

    proto._ensureMaskOverlay = function () {
        // Look up the CURRENT video element dimensions each time (handles resize)
        var video = this.videoEl;
        var rect  = video.getBoundingClientRect();
        var w = rect.width  || video.clientWidth  || 640;
        var h = rect.height || video.clientHeight || 360;

        if (!this._maskOverlayCanvas) {
            var canvas = document.createElement('canvas');
            canvas.style.cssText =
                'position:absolute;top:0;left:0;width:100%;height:100%;' +
                'pointer-events:none;z-index:5;';
            this.wrapEl.appendChild(canvas);
            this._maskOverlayCanvas = canvas;
            this._maskOverlayCtx    = canvas.getContext('2d');
        }
        this._maskOverlayCanvas.width  = w;
        this._maskOverlayCanvas.height = h;
        return { canvas: this._maskOverlayCanvas, ctx: this._maskOverlayCtx };
    };

    proto._decodeB64ToBytes = function (maskB64) {
        var binary = atob(maskB64);
        var bytes  = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
        return bytes;
    };

    proto._encodeBytesToB64 = function (bytes) {
        if (!bytes || !bytes.length) return '';
        var chunkSize = 0x4000;
        var parts = [];
        for (var i = 0; i < bytes.length; i += chunkSize) {
            var chunk = bytes.subarray(i, Math.min(bytes.length, i + chunkSize));
            parts.push(String.fromCharCode.apply(null, chunk));
        }
        return btoa(parts.join(''));
    };

    proto._buildPolygonMaskPrompt = function (polygons, maskW, maskH, regionId) {
        if (!Array.isArray(polygons) || !polygons.length) return null;
        if (!isFinite(maskW) || !isFinite(maskH) || maskW <= 0 || maskH <= 0) return null;

        maskW = Math.round(maskW);
        maskH = Math.round(maskH);
        if (maskW <= 0 || maskH <= 0) return null;

        var canvas = document.createElement('canvas');
        canvas.width = maskW;
        canvas.height = maskH;
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;

        ctx.clearRect(0, 0, maskW, maskH);
        ctx.fillStyle = '#ffffff';

        var drewAny = false;
        for (var pi = 0; pi < polygons.length; pi++) {
            var pts = polygons[pi];
            if (!Array.isArray(pts) || pts.length < 6) continue;

            var moveX = Number(pts[0]);
            var moveY = Number(pts[1]);
            if (!isFinite(moveX) || !isFinite(moveY)) continue;

            moveX = Math.max(0, Math.min(maskW - 1, moveX));
            moveY = Math.max(0, Math.min(maskH - 1, moveY));

            ctx.beginPath();
            ctx.moveTo(moveX, moveY);

            var validVertices = 1;
            for (var i = 2; i < pts.length; i += 2) {
                var x = Number(pts[i]);
                var y = Number(pts[i + 1]);
                if (!isFinite(x) || !isFinite(y)) continue;
                x = Math.max(0, Math.min(maskW - 1, x));
                y = Math.max(0, Math.min(maskH - 1, y));
                ctx.lineTo(x, y);
                validVertices += 1;
            }

            if (validVertices < 3) continue;
            ctx.closePath();
            ctx.fill();
            drewAny = true;
        }

        if (!drewAny) return null;

        var imageData = ctx.getImageData(0, 0, maskW, maskH);
        var alpha = imageData.data;
        var pixelCount = maskW * maskH;
        var packed = new Uint8Array(Math.ceil(pixelCount / 8));
        var hasForeground = false;

        for (var pixel = 0, ai = 3; pixel < pixelCount; pixel++, ai += 4) {
            if (alpha[ai] <= 0) continue;
            hasForeground = true;
            packed[pixel >> 3] |= (1 << (pixel & 7));
        }

        if (!hasForeground) return null;

        return {
            mask_b64: this._encodeBytesToB64(packed),
            mask_shape: [maskH, maskW],
            mask_encoding: 'bitpack_u1_v1',
            cache_seq: 0,
            source: 'polygon',
            region_id: regionId != null ? String(regionId) : null,
        };
    };

    proto._shapeMatchesFrameRegion = function (shape, frameKey, regionId) {
        if (!shape) return false;
        if (this._frameKey(shape.frameTime || 0) !== String(frameKey || '')) return false;
        return String(shape.regionId || '') === String(regionId || '');
    };

    proto._annotationShapesForFrameRegion = function (frameKey, regionId) {
        var matches = [];
        var shapes = Array.isArray(this.shapes) ? this.shapes : [];
        for (var i = 0; i < shapes.length; i++) {
            if (this._shapeMatchesFrameRegion(shapes[i], frameKey, regionId)) {
                matches.push(shapes[i]);
            }
        }
        return matches;
    };

    proto._buildAnnotationMaskPrompt = function (annotationShapes, maskW, maskH, regionId) {
        if (!Array.isArray(annotationShapes) || !annotationShapes.length) return null;
        if (!isFinite(maskW) || !isFinite(maskH) || maskW <= 0 || maskH <= 0) return null;

        maskW = Math.round(maskW);
        maskH = Math.round(maskH);
        if (maskW <= 0 || maskH <= 0) return null;

        var canvas = document.createElement('canvas');
        canvas.width = maskW;
        canvas.height = maskH;
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;

        ctx.clearRect(0, 0, maskW, maskH);
        var drewAny = false;

        for (var si = 0; si < annotationShapes.length; si++) {
            var shape = annotationShapes[si];
            if (!shape || !shape.konvaNode || typeof shape.konvaNode.points !== 'function') continue;

            var pts = shape.konvaNode.points();
            if (!Array.isArray(pts) || pts.length < 4) continue;

            if (shape.type === 'polygon') {
                if (pts.length < 6) continue;
                ctx.save();
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.moveTo(Number(pts[0]) || 0, Number(pts[1]) || 0);
                for (var pi = 2; pi < pts.length; pi += 2) {
                    ctx.lineTo(Number(pts[pi]) || 0, Number(pts[pi + 1]) || 0);
                }
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                drewAny = true;
                continue;
            }

            if (shape.type !== 'brush' && shape.type !== 'eraser') continue;

            var strokeWidth = (typeof shape.konvaNode.strokeWidth === 'function')
                ? Number(shape.konvaNode.strokeWidth())
                : Number(this.brushSize || 1);
            if (!isFinite(strokeWidth) || strokeWidth <= 0) strokeWidth = 1;

            ctx.save();
            ctx.globalCompositeOperation = shape.type === 'eraser' ? 'destination-out' : 'source-over';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = strokeWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(Number(pts[0]) || 0, Number(pts[1]) || 0);
            for (var li = 2; li < pts.length; li += 2) {
                ctx.lineTo(Number(pts[li]) || 0, Number(pts[li + 1]) || 0);
            }
            ctx.stroke();
            ctx.restore();
            drewAny = true;
        }

        if (!drewAny) return null;

        var imageData = ctx.getImageData(0, 0, maskW, maskH);
        var alpha = imageData.data;
        var pixelCount = maskW * maskH;
        var packed = new Uint8Array(Math.ceil(pixelCount / 8));
        var hasForeground = false;

        for (var pixel = 0, ai = 3; pixel < pixelCount; pixel++, ai += 4) {
            if (alpha[ai] <= 0) continue;
            hasForeground = true;
            packed[pixel >> 3] |= (1 << (pixel & 7));
        }

        if (!hasForeground) return null;

        return {
            mask_b64: this._encodeBytesToB64(packed),
            mask_shape: [maskH, maskW],
            mask_encoding: 'bitpack_u1_v1',
            cache_seq: 0,
            source: 'annotations',
            region_id: regionId != null ? String(regionId) : null,
        };
    };

    proto._collectAnnotationMaskPromptsForFrame = function (frameKey) {
        var maskW = Number(this.videoEl && this.videoEl.videoWidth ? this.videoEl.videoWidth : 0);
        var maskH = Number(this.videoEl && this.videoEl.videoHeight ? this.videoEl.videoHeight : 0);
        if (!isFinite(maskW) || maskW <= 0) maskW = Number(this.stage && this.stage.width ? this.stage.width() : 0);
        if (!isFinite(maskH) || maskH <= 0) maskH = Number(this.stage && this.stage.height ? this.stage.height() : 0);

        if (!isFinite(maskW) || !isFinite(maskH) || maskW <= 0 || maskH <= 0) {
            return {};
        }

        var shapes = Array.isArray(this.shapes) ? this.shapes : [];
        var groupedShapes = {};
        for (var i = 0; i < shapes.length; i++) {
            var shape = shapes[i];
            if (!shape || this._frameKey(shape.frameTime || 0) !== frameKey) continue;

            var regionId = shape.regionId != null ? String(shape.regionId) : '';
            if (!regionId) continue;

            if (!groupedShapes[regionId]) groupedShapes[regionId] = [];
            groupedShapes[regionId].push(shape);
        }

        var promptsByRegion = {};
        var regionIds = Object.keys(groupedShapes);
        for (var ri = 0; ri < regionIds.length; ri++) {
            var rid = regionIds[ri];
            var prompt = this._buildAnnotationMaskPrompt(groupedShapes[rid], maskW, maskH, rid);
            if (!prompt) continue;
            promptsByRegion[rid] = prompt;
        }

        return promptsByRegion;
    };

    proto._maskCacheKey = function (entryOrEntries) {
        if (Array.isArray(entryOrEntries)) {
            if (!entryOrEntries.length) return '';
            return entryOrEntries.map(function (entry) {
                var contourCount = Array.isArray(entry.prepared_contours)
                    ? entry.prepared_contours.length
                    : 0;
                return (
                    String(entry.cache_seq) + ':' +
                    String(entry.timestamp) + ':' +
                    String(entry.region_id || '') + ':' +
                    String(contourCount)
                );
            }).join('|');
        }

        var entry = entryOrEntries;
        if (!entry) return '';
        var contourCount = Array.isArray(entry.prepared_contours)
            ? entry.prepared_contours.length
            : 0;
        return (
            String(entry.cache_seq) + ':' +
            String(entry.timestamp) + ':' +
            String(entry.region_id || '') + ':' +
            String(contourCount)
        );
    };

    proto._clearMaskOverlay = function () {
        if (this._maskOverlayCtx && this._maskOverlayCanvas) {
            this._maskOverlayCtx.clearRect(
                0, 0,
                this._maskOverlayCanvas.width,
                this._maskOverlayCanvas.height
            );
        }
        this._lastRenderedMaskKey = null;
        this._currentMaskFrames   = [];
        this._currentMaskFrame    = null;
        this._maskHoverCacheSeq   = null;
        this._maskHoverComponentIndex = null;
        this._updateMagicAcceptButton();
    };

    proto._drawMaskOverlay = function (frameResults) {
        var frames = Array.isArray(frameResults)
            ? frameResults
            : (frameResults ? [frameResults] : []);
        if (!frames.length) {
            this._clearMaskOverlay();
            return;
        }

        var overlay = this._ensureMaskOverlay();
        if (!overlay) return;
        var ctx = overlay.ctx;
        var cw = overlay.canvas.width;
        var ch = overlay.canvas.height;
        ctx.clearRect(0, 0, cw, ch);

        var hoverSeq = this._maskHoverCacheSeq;
        var hoverComponent = this._maskHoverComponentIndex;
        var hasHoverTarget = false;
        if (hoverSeq != null && hoverComponent != null) {
            for (var hfi = 0; hfi < frames.length; hfi++) {
                var hf = frames[hfi];
                if (!hf) continue;
                if (Number(hf.cache_seq) !== Number(hoverSeq)) continue;
                var hContours = Array.isArray(hf.prepared_contours) ? hf.prepared_contours : [];
                if (Number(hoverComponent) >= 0 && Number(hoverComponent) < hContours.length) {
                    hasHoverTarget = true;
                    break;
                }
            }
            if (!hasHoverTarget) {
                this._maskHoverCacheSeq = null;
                this._maskHoverComponentIndex = null;
            }
        }

        var renderedFrames = [];
        var renderedAny = false;

        for (var fi = 0; fi < frames.length; fi++) {
            var frameResult = frames[fi];
            if (!frameResult || !frameResult.mask_b64 || !Array.isArray(frameResult.mask_shape)) continue;
            if (!this._isMaskFrameRegionVisible(frameResult)) continue;

            var shape = frameResult.mask_shape;
            var maskH = Number(frameResult.prepared_mask_h || shape[shape.length - 2]);
            var maskW = Number(frameResult.prepared_mask_w || shape[shape.length - 1]);
            if (!isFinite(maskH) || !isFinite(maskW) || maskH <= 0 || maskW <= 0) continue;

            var region = this._resolveMaskRegion(frameResult);
            var regionColor = region ? region.color : '#00dc50';

            // Parse hex color to RGB (default: green)
            var r = 0, g = 220, b = 80;
            if (regionColor && /^#[0-9a-fA-F]{6}$/.test(regionColor)) {
                r = parseInt(regionColor.slice(1, 3), 16);
                g = parseInt(regionColor.slice(3, 5), 16);
                b = parseInt(regionColor.slice(5, 7), 16);
            }

            var contours = Array.isArray(frameResult.prepared_contours) ? frameResult.prepared_contours : [];
            if (!contours.length) {
                this._prepareMaskContours(frameResult);
                contours = Array.isArray(frameResult.prepared_contours) ? frameResult.prepared_contours : [];
            }

            renderedFrames.push(frameResult);

            if (contours.length) {
                ctx.save();
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';

                for (var ci = 0; ci < contours.length; ci++) {
                    var contour = contours[ci];
                    if (!contour || contour.length < 6) continue;

                    var isHovered =
                        hasHoverTarget &&
                        Number(hoverSeq) === Number(frameResult.cache_seq) &&
                        Number(hoverComponent) === Number(ci);

                    var alpha = 0.20 + Math.min(0.12, ci * 0.025);
                    var strokeAlpha = 0.95;
                    var strokeWidth = 1.4;
                    if (hasHoverTarget && !isHovered) {
                        alpha = 0.08;
                        strokeAlpha = 0.45;
                        strokeWidth = 1.0;
                    }
                    if (isHovered) {
                        alpha = Math.max(0.45, alpha + 0.12);
                        strokeAlpha = 1.0;
                        strokeWidth = 2.8;
                    }

                    ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + String(alpha) + ')';
                    ctx.strokeStyle = isHovered
                        ? 'rgba(255,255,255,' + String(strokeAlpha) + ')'
                        : 'rgba(' + r + ',' + g + ',' + b + ',' + String(strokeAlpha) + ')';
                    ctx.lineWidth = strokeWidth;

                    ctx.beginPath();
                    ctx.moveTo((contour[0] / maskW) * cw, (contour[1] / maskH) * ch);
                    for (var pi = 2; pi < contour.length; pi += 2) {
                        ctx.lineTo((contour[pi] / maskW) * cw, (contour[pi + 1] / maskH) * ch);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    renderedAny = true;
                }
                ctx.restore();
                continue;
            }

            var builtGrid = this._buildBinaryMaskGrid(frameResult);
            if (!builtGrid) continue;
            var pixelCount = builtGrid.pixelCount;
            var imageData  = new ImageData(maskW, maskH);

            for (var pi2 = 0; pi2 < pixelCount; pi2++) {
                if (builtGrid.grid[pi2] > 0) {
                    var di = pi2 * 4;
                    imageData.data[di]     = r;
                    imageData.data[di + 1] = g;
                    imageData.data[di + 2] = b;
                    imageData.data[di + 3] = 100;
                    renderedAny = true;
                }
            }

            var tmp = document.createElement('canvas');
            tmp.width = maskW;
            tmp.height = maskH;
            var tmpCtx = tmp.getContext('2d');
            if (!tmpCtx) continue;
            tmpCtx.putImageData(imageData, 0, 0);
            ctx.drawImage(tmp, 0, 0, cw, ch);
        }

        if (!renderedFrames.length || !renderedAny) {
            this._clearMaskOverlay();
            return;
        }

        this._lastRenderedMaskKey = this._maskCacheKey(renderedFrames);
        this._currentMaskFrames = renderedFrames;
        this._currentMaskFrame = renderedFrames[0] || null;
    };

    proto._syncMaskToCurrentVideoTime = function () {
        if (!this.annotationMode) {
            this._clearMaskOverlay();
            return;
        }

        var t = this._currentVideoTime();
        var frames = this._pickMaskFrames(t);
        if (!frames.length) { this._clearMaskOverlay(); return; }
        var key = this._maskCacheKey(frames);
        if (key === this._lastRenderedMaskKey) {
            this._currentMaskFrames = frames;
            this._currentMaskFrame = frames[0] || null;
            this._updateMagicAcceptButton();
            return;
        }
        this._drawMaskOverlay(frames);
        this._updateMagicAcceptButton();
    };

    proto._bindMaskSync = function () {
        if (this._maskSyncBound) return;
        this._maskSyncBound = true;
        var self = this;
        this.videoEl.addEventListener('timeupdate', function () { self._syncMaskToCurrentVideoTime(); });
        this.videoEl.addEventListener('seeked',     function () { self._syncMaskToCurrentVideoTime(); });
        window.addEventListener('resize', function () { self._syncMaskToCurrentVideoTime(); });
    };

    // ── Frame snap ────────────────────────────────────────────────────────

    proto._initFrameSnap = function () {
        var self = this;
        this.videoEl.addEventListener('pause', function () {
            var fps     = self._subsampledVideoFps || 1;
            var snapped = Math.round(self.videoEl.currentTime * fps) / fps;
            if (Math.abs(snapped - self.videoEl.currentTime) > 0.001) {
                self.videoEl.currentTime = snapped;
            }
        });
    };

    // ── Snap helpers (used by Magic Toolbox in Task 10) ───────────────────

    proto._snapToSubsampledFrame = function (t) {
        var fps = this._subsampledVideoFps || 1;
        return Math.round(t * fps) / fps;
    };

    proto._frameKey = function (t) {
        return this._snapToSubsampledFrame(t).toFixed(6);
    };

    proto._magicFrameTolerance = function () {
        return 0.5 / (this._subsampledVideoFps || 1);
    };

    proto._syncMagicPointLabelButtons = function () {
        var isPositive = this._magicPointLabel !== 0;

        if (this._magicPointPositiveBtnEl) {
            this._magicPointPositiveBtnEl.classList.toggle('active', isPositive);
            this._magicPointPositiveBtnEl.classList.toggle('btn-success', isPositive);
            this._magicPointPositiveBtnEl.classList.toggle('btn-outline-success', !isPositive);
        }

        if (this._magicPointNegativeBtnEl) {
            this._magicPointNegativeBtnEl.classList.toggle('active', !isPositive);
            this._magicPointNegativeBtnEl.classList.toggle('btn-danger', !isPositive);
            this._magicPointNegativeBtnEl.classList.toggle('btn-outline-danger', isPositive);
        }
    };

    // ── Magic Toolbox — placeholders (Task 10 + 11 fill these in) ─────────

    proto._initMagicToolbox = function () {
        var self = this;

        this._magicOverlayEl = document.createElement('div');
        this._magicOverlayEl.id = 'magic-prompt-overlay';
        this._magicOverlayEl.style.cssText =
            'position:absolute;inset:0;z-index:20;pointer-events:none;';
        this.wrapEl.appendChild(this._magicOverlayEl);

        this._maskDecisionLayerEl = document.createElement('div');
        this._maskDecisionLayerEl.id = 'magic-mask-decision-layer';
        this._maskDecisionLayerEl.style.cssText =
            'position:absolute;inset:0;z-index:26;pointer-events:none;display:none;';
        this.wrapEl.appendChild(this._maskDecisionLayerEl);

        if (this._magicPanelEl) {
            this._magicStatusEl = document.createElement('div');
            this._magicStatusEl.className = 'small text-muted mb-2';
            this._magicStatusEl.textContent = 'Magic Tool ready.';
            var body = this._magicPanelEl.querySelector('.card-body');
            if (body) body.insertBefore(this._magicStatusEl, body.firstChild);
        }

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

        if (this._magicPointPositiveBtnEl) {
            this._magicPointPositiveBtnEl.addEventListener('click', function () {
                self._magicPointLabel = 1;
                self._syncMagicPointLabelButtons();
            });
        }

        if (this._magicPointNegativeBtnEl) {
            this._magicPointNegativeBtnEl.addEventListener('click', function () {
                self._magicPointLabel = 0;
                self._syncMagicPointLabelButtons();
            });
        }

        this._syncMagicPointLabelButtons();

        this._magicOverlayEl.addEventListener('click', function (e) {
            if (!self._magicPointActive) return;
            var rect = self.videoEl.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            var x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            var y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            var frameTime = self._snapToSubsampledFrame(self._currentVideoTime());
            var region = self._activeRegion();
            self._magicPrompts.push({
                id: 'mp-' + Date.now() + '-' + Math.random().toString(36).slice(2),
                x: x,
                y: y,
                frame_time: frameTime,
                region_id: region ? region.id : null,
                point_label: self._magicPointLabel,
            });
            delete self._lastPromptSigByScope[
                self._scopeKey(self._frameKey(frameTime), region ? region.id : null)
            ];
            self._renderMagicOverlay();
            self._renderMagicPromptList();
            self._updateMagicCount();
        });

        if (this._magicSendBtnEl) {
            this._magicSendBtnEl.addEventListener('click', function () { self._sendMagicPrompts(); });
        }

        if (this._magicClearFrameBtnEl) {
            this._magicClearFrameBtnEl.addEventListener('click', function () {
                var ft  = self._snapToSubsampledFrame(self._currentVideoTime());
                var tol = self._magicFrameTolerance();
                self._magicPrompts = self._magicPrompts.filter(function (p) {
                    return Math.abs(p.frame_time - ft) > tol;
                });
                var frameKey = self._frameKey(ft);
                Object.keys(self._lastPromptSigByScope).forEach(function (k) {
                    if (k.indexOf(frameKey + '::') === 0) delete self._lastPromptSigByScope[k];
                });
                self._renderMagicOverlay();
                self._renderMagicPromptList();
                self._updateMagicCount();
            });
        }

        if (this._magicClearAllBtnEl) {
            this._magicClearAllBtnEl.addEventListener('click', function () {
                self._magicPrompts = [];
                self._lastPromptSigByScope = {};
                self._renderMagicOverlay();
                self._renderMagicPromptList();
                self._updateMagicCount();
            });
        }

        // Re-render overlay when video time changes
        this.videoEl.addEventListener('timeupdate', function () { self._renderMagicOverlay(); self._renderMagicPromptList(); });
        this.videoEl.addEventListener('seeked',     function () { self._renderMagicOverlay(); self._renderMagicPromptList(); });

        this._renderMagicPromptList();
        this._updateMagicCount();
    };

    proto._renderMagicOverlay = function () {
        if (!this._magicOverlayEl) return;
        if (!this.annotationMode) {
            this._magicOverlayEl.innerHTML = '';
            return;
        }
        this._magicOverlayEl.innerHTML = '';
        var self = this;
        var currentFt = this._snapToSubsampledFrame(this._currentVideoTime());
        var tol = this._magicFrameTolerance();

        this._magicPrompts.forEach(function (p) {
            if (Math.abs(p.frame_time - currentFt) > tol) return;
            var region = (self.regions || []).find(function (r) { return r.id === p.region_id; });
            var color = region ? region.color : '#3498db';
            var isNegative = Number(p.point_label) === 0;
            var dot = document.createElement('div');
            if (isNegative) {
                dot.style.cssText =
                    'position:absolute;' +
                    'left:' + (p.x * 100) + '%;top:' + (p.y * 100) + '%;' +
                    'width:14px;height:14px;border-radius:50%;' +
                    'background:rgba(255,77,79,0.15);border:2px solid #ff4d4f;' +
                    'box-shadow:0 0 5px rgba(255,77,79,0.8);' +
                    'transform:translate(-50%,-50%);' +
                    'cursor:pointer;pointer-events:auto;color:#ff4d4f;' +
                    'display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;';
                dot.textContent = '-';
            } else {
                dot.style.cssText =
                    'position:absolute;' +
                    'left:' + (p.x * 100) + '%;top:' + (p.y * 100) + '%;' +
                    'width:10px;height:10px;border-radius:50%;' +
                    'background:' + color + ';border:1.5px solid #fff;' +
                    'box-shadow:0 0 4px ' + color + ';' +
                    'transform:translate(-50%,-50%);' +
                    'cursor:pointer;pointer-events:auto;';
            }
            dot.title = (region ? region.name : '?') + ' — ' + (isNegative ? 'negative' : 'positive') + ' — click to remove';
            dot.addEventListener('click', function (ev) {
                ev.stopPropagation();
                self._magicPrompts = self._magicPrompts.filter(function (q) { return q.id !== p.id; });
                delete self._lastPromptSigByScope[
                    self._scopeKey(self._frameKey(p.frame_time), p.region_id)
                ];
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
        var currentFt = this._snapToSubsampledFrame(this._currentVideoTime());
        var tol = this._magicFrameTolerance();

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
                var region = (self.regions || []).find(function (r) { return r.id === p.region_id; });
                var isNegative = Number(p.point_label) === 0;
                var item = document.createElement('li');
                item.className = 'list-group-item py-1 px-3 small d-flex gap-2 align-items-center';
                var dot = document.createElement('span');
                dot.style.cssText = isNegative
                    ? 'width:10px;height:10px;border-radius:50%;flex-shrink:0;border:2px solid #ff4d4f;background:rgba(255,77,79,0.15);'
                    : 'width:8px;height:8px;border-radius:50%;flex-shrink:0;background:' +
                        (region ? region.color : '#888');
                item.appendChild(dot);
                var label = document.createElement('span');
                label.className = 'flex-grow-1';
                label.textContent = (isNegative ? '[−] ' : '[+] ') + (region ? region.name : '?') + '  ' +
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
        if (!this._workerConnected) {
            this._setMagicStatus('Worker is not connected. Wait for reconnect.', 'warning');
            return;
        }
        var currentFt = this._snapToSubsampledFrame(this._currentVideoTime());
        var currentKey = this._frameKey(currentFt);

        var framePoints = this._magicPrompts.filter(function (p) {
            return self._frameKey(p.frame_time) === currentKey;
        });

        if (!framePoints.length) {
            console.warn('[Magic] no prompts for current frame');
            this._setMagicStatus('No prompts for current frame.', 'warning');
            return;
        }

        var regionsById = {};
        var regionMaskSeqById = {};
        framePoints.forEach(function (p) {
            var label = Number(p.point_label) === 0 ? 0 : 1;
            var regionId = p.region_id != null ? String(p.region_id) : '1';
            var regionMeta = (self.regions || []).find(function (r) { return String(r.id) === regionId; }) || null;
            if (!regionsById[regionId]) {
                regionsById[regionId] = {
                    region_id: regionId,
                    class_name: regionMeta ? regionMeta.name : 'unknown',
                    points: [],
                    point_labels: [],
                    normalized: true,
                };
                if (regionMeta && regionMeta.dbId != null) {
                    regionsById[regionId].class_id = String(regionMeta.dbId);
                }
            }
            regionsById[regionId].points.push([p.x, p.y]);
            regionsById[regionId].point_labels.push(label);
        });

        var maskPromptsByRegion = this._collectMaskPromptsForFrame(currentKey);
        Object.keys(maskPromptsByRegion).forEach(function (regionIdForMask) {
            var maskPrompt = maskPromptsByRegion[regionIdForMask];
            if (!maskPrompt) return;

            var regionPayload = regionsById[regionIdForMask];
            var regionMeta = (self.regions || []).find(function (r) {
                return String(r.id) === String(regionIdForMask);
            }) || null;

            if (!regionPayload) {
                regionPayload = {
                    region_id: regionIdForMask,
                    class_name: regionMeta
                        ? regionMeta.name
                        : String(maskPrompt.class_name || 'unknown'),
                    normalized: true,
                };
                if (regionMeta && regionMeta.dbId != null) {
                    regionPayload.class_id = String(regionMeta.dbId);
                } else if (maskPrompt.class_id != null) {
                    regionPayload.class_id = String(maskPrompt.class_id);
                }
                regionsById[regionIdForMask] = regionPayload;
            }

            regionPayload.mask_b64 = maskPrompt.mask_b64;
            regionPayload.mask_shape = maskPrompt.mask_shape;
            regionPayload.mask_encoding = maskPrompt.mask_encoding;
            regionMaskSeqById[regionIdForMask] = Number(maskPrompt.cache_seq || 0);
        });

        var regionsPayload = Object.keys(regionsById).map(function (rid) { return regionsById[rid]; });
        if (!regionsPayload.length) {
            this._setMagicStatus('No region prompts could be built for current frame.', 'warning');
            return;
        }

        var changedRegionsPayload = [];
        var pendingScopes = [];
        for (var ri = 0; ri < regionsPayload.length; ri++) {
            var regionPayload = regionsPayload[ri];
            var regionId = String(regionPayload.region_id || '');
            var scopeKey = this._scopeKey(currentKey, regionId);
            var signature = this._buildRegionPromptSignature(
                regionPayload,
                regionMaskSeqById[regionId] || 0
            );
            var previousSignature = this._lastPromptSigByScope[scopeKey] || null;

            var hasMaskPrompt = Boolean(
                regionPayload.mask_b64 &&
                Array.isArray(regionPayload.mask_shape) &&
                String(regionPayload.mask_encoding || '') === 'bitpack_u1_v1'
            );
            if (!hasMaskPrompt && previousSignature === signature) continue;

            changedRegionsPayload.push(regionPayload);
            pendingScopes.push({
                frame_key: currentKey,
                frame_ts: currentFt,
                start_ts: currentFt,
                end_ts: currentFt,
                region_id: regionId,
                signature: signature,
                touched: {},
                start_seq: Number(this._maskStoreSeq || 0),
                latest_cache_seq: Number(this._maskStoreSeq || 0),
                completed: false,
            });
        }

        if (!changedRegionsPayload.length) {
            this._setMagicStatus('No prompt changes detected for current frame.', 'muted');
            return;
        }

        var windowSeconds = 5.0;
        if (this._magicWindowInputEl) {
            var parsed = Number(this._magicWindowInputEl.value);
            if (isFinite(parsed) && parsed > 0) windowSeconds = parsed;
        }

        pendingScopes.forEach(function (scope) {
            scope.end_ts = scope.start_ts + windowSeconds + (0.5 / (self._subsampledVideoFps || 1));
            if (scope.region_id) {
                self._clearRejectedTracksForRegion(scope.region_id);
            }
        });

        var scopeGroup = this._registerPendingUpdateScopes(null, pendingScopes);

        if (this._magicSendBtnEl) this._magicSendBtnEl.disabled = true;
        this._setMagicStatus(
            'Sending prompts to worker (' + String(changedRegionsPayload.length) + ' region' +
            (changedRegionsPayload.length === 1 ? '' : 's') + ')...',
            'muted'
        );

        fetch('/laparoscopy/api/worker/session-prompt/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                patientId:       this.patientId,
                video_id:        this._workerVideoId,
                frame_timestamp: currentFt,
                regions:         changedRegionsPayload,
                window_seconds:  windowSeconds,
                normalized:      true,
            }),
        })
        .then(function (resp) { return resp.text().then(function (t) {
            if (!resp.ok) {
                console.error('[Magic] send failed', resp.status, t);
                if (scopeGroup) {
                    scopeGroup.completed = true;
                    self._pendingUpdateScopesFIFO = self._pendingUpdateScopesFIFO.filter(function (g) {
                        return g !== scopeGroup;
                    });
                    if (scopeGroup.job_id) {
                        delete self._pendingUpdateScopesByJob[String(scopeGroup.job_id)];
                    }
                }
                self._setMagicStatus('Prompt request failed (' + resp.status + ').', 'danger');
                return;
            }

            var parsed = {};
            try { parsed = t ? JSON.parse(t) : {}; } catch (_) { parsed = {}; }
            var workerResponse = parsed && parsed.worker_response ? parsed.worker_response : {};
            var jobId = workerResponse && workerResponse.job_id ? String(workerResponse.job_id) : null;

            pendingScopes.forEach(function (scope) {
                var key = self._scopeKey(scope.frame_key, scope.region_id);
                self._lastPromptSigByScope[key] = scope.signature;
            });

            if (scopeGroup && jobId) {
                scopeGroup.job_id = jobId;
                self._pendingUpdateScopesByJob[jobId] = scopeGroup;
            }

            self._setMagicStatus(
                'Prompt sent. Waiting for updated masks for ' +
                String(changedRegionsPayload.length) + ' region' +
                (changedRegionsPayload.length === 1 ? '' : 's') + '.',
                'success'
            );
        }); })
        .catch(function (err) {
            console.error('[Magic] send error', err);
            if (scopeGroup) {
                scopeGroup.completed = true;
                self._pendingUpdateScopesFIFO = self._pendingUpdateScopesFIFO.filter(function (g) {
                    return g !== scopeGroup;
                });
                if (scopeGroup.job_id) {
                    delete self._pendingUpdateScopesByJob[String(scopeGroup.job_id)];
                }
            }
            self._setMagicStatus('Prompt request error.', 'danger');
        })
        .finally(function () {
            if (self._magicSendBtnEl) self._magicSendBtnEl.disabled = false;
        });
    };

    proto._hideMaskDecisionBox = function () {
        if (!this._maskDecisionLayerEl) return;
        this._maskDecisionLayerEl.innerHTML = '';
        this._maskDecisionLayerEl.style.display = 'none';
        this._clearMaskHoverTarget();
    };

    proto._setMaskHoverTarget = function (cacheSeq, componentIndex) {
        var nextCacheSeq = cacheSeq != null ? Number(cacheSeq) : null;
        var nextComponent = componentIndex != null ? Number(componentIndex) : null;
        if (
            this._maskHoverCacheSeq === nextCacheSeq &&
            this._maskHoverComponentIndex === nextComponent
        ) {
            return;
        }

        this._maskHoverCacheSeq = nextCacheSeq;
        this._maskHoverComponentIndex = nextComponent;
        if (Array.isArray(this._currentMaskFrames) && this._currentMaskFrames.length) {
            this._drawMaskOverlay(this._currentMaskFrames);
        }
    };

    proto._clearMaskHoverTarget = function () {
        if (this._maskHoverCacheSeq == null && this._maskHoverComponentIndex == null) return;
        this._maskHoverCacheSeq = null;
        this._maskHoverComponentIndex = null;
        if (Array.isArray(this._currentMaskFrames) && this._currentMaskFrames.length) {
            this._drawMaskOverlay(this._currentMaskFrames);
        }
    };

    proto._isMaskFrameRegionVisible = function (maskFrame) {
        if (!maskFrame || maskFrame.region_id == null) return true;
        var regionId = String(maskFrame.region_id);
        var region = (this.regions || []).find(function (r) {
            return String(r.id) === regionId;
        }) || null;
        if (!region) return true;
        return region.visible !== false;
    };

    proto._resolveMaskRegion = function (maskFrame, fallbackRegionId) {
        var regionId = maskFrame && maskFrame.region_id ? String(maskFrame.region_id) : null;
        if (!regionId && fallbackRegionId) regionId = String(fallbackRegionId);
        var region = (this.regions || []).find(function (r) { return String(r.id) === String(regionId); }) || null;
        if (!region) region = this._activeRegion();
        return region;
    };

    proto._findMaskFrameBySeq = function (cacheSeq) {
        if (cacheSeq == null) return null;
        for (var i = this._maskFrameCache.length - 1; i >= 0; i--) {
            if (Number(this._maskFrameCache[i].cache_seq) === Number(cacheSeq)) {
                return this._maskFrameCache[i];
            }
        }
        return null;
    };

    proto._removeFramePrompts = function (frameKey, regionId) {
        this._magicPrompts = this._magicPrompts.filter(function (p) {
            if (this._frameKey(p.frame_time) !== frameKey) return true;
            if (regionId == null) return false;
            return String(p.region_id || '') !== String(regionId || '');
        }, this);

        if (regionId == null) {
            var prefix = String(frameKey || '') + '::';
            Object.keys(this._lastPromptSigByScope).forEach(function (k) {
                if (k.indexOf(prefix) === 0) delete this._lastPromptSigByScope[k];
            }, this);
        } else {
            delete this._lastPromptSigByScope[this._scopeKey(frameKey, regionId)];
        }

        this._renderMagicOverlay();
        this._renderMagicPromptList();
        this._updateMagicCount();
    };

    proto._scopeKey = function (frameKey, regionId) {
        return String(frameKey || '') + '::' + String(regionId || '');
    };

    proto._regionGroupKey = function (entryOrRegionId, objectId) {
        if (entryOrRegionId && typeof entryOrRegionId === 'object') {
            var rid = entryOrRegionId.region_id != null ? entryOrRegionId.region_id : '';
            var oid = entryOrRegionId.object_id != null ? entryOrRegionId.object_id : '';
            return String(rid) + '::' + String(oid);
        }
        var regionVal = entryOrRegionId != null ? entryOrRegionId : '';
        var objectVal = objectId != null ? objectId : '';
        return String(regionVal) + '::' + String(objectVal);
    };

    proto._autoScopeKey = function (frameKey, regionGroupKey) {
        return String(frameKey || '') + '::' + String(regionGroupKey || '');
    };

    proto._trackStorageKey = function (regionGroupKey, trackId) {
        return String(regionGroupKey || '') + '::' + String(trackId || '');
    };

    proto._findCachedEntryByFrameRegion = function (frameKey, regionId, objectId) {
        var regionGroup = this._regionGroupKey(regionId, objectId);
        for (var i = this._maskFrameCache.length - 1; i >= 0; i--) {
            var entry = this._maskFrameCache[i];
            if (entry.frame_key !== frameKey) continue;
            if (this._regionGroupKey(entry) !== regionGroup) continue;
            return entry;
        }
        return null;
    };

    proto._collectLatestMaskEntriesForFrame = function (frameKey) {
        var byRegionId = {};
        for (var i = this._maskFrameCache.length - 1; i >= 0; i--) {
            var entry = this._maskFrameCache[i];
            if (entry.frame_key !== frameKey) continue;

            var regionId = entry.region_id != null ? String(entry.region_id) : '';
            if (!regionId) continue;
            if (byRegionId[regionId]) continue;
            if (!entry.mask_b64 || !Array.isArray(entry.mask_shape)) continue;

            byRegionId[regionId] = entry;
        }
        return byRegionId;
    };

    proto._buildMaskPromptFromCacheEntry = function (maskEntry, regionId) {
        if (!maskEntry || !maskEntry.mask_b64 || !Array.isArray(maskEntry.mask_shape)) {
            return null;
        }

        var maskEncoding = String(maskEntry.mask_encoding || '');
        if (maskEncoding !== 'bitpack_u1_v1') return null;

        var maskH = Number(maskEntry.mask_shape[0]);
        var maskW = Number(maskEntry.mask_shape[1]);
        if (!isFinite(maskH) || !isFinite(maskW) || maskH <= 0 || maskW <= 0) {
            return null;
        }
        maskH = Math.round(maskH);
        maskW = Math.round(maskW);

        var bytes;
        try {
            bytes = this._decodeB64ToBytes(String(maskEntry.mask_b64));
        } catch (_) {
            return null;
        }

        var expectedBytes = Math.ceil((maskH * maskW) / 8);
        if (!bytes || bytes.length !== expectedBytes) {
            console.warn('[Magic] skipping cached mask due invalid bitpack size', {
                region_id: regionId,
                frame_key: maskEntry.frame_key,
                mask_shape: [maskH, maskW],
                expected_bytes: expectedBytes,
                actual_bytes: bytes ? bytes.length : 0,
            });
            return null;
        }

        return {
            mask_b64: String(maskEntry.mask_b64),
            mask_shape: [maskH, maskW],
            mask_encoding: 'bitpack_u1_v1',
            cache_seq: Number(maskEntry.cache_seq || 0),
            source: 'cache',
            class_name: maskEntry.class_name != null ? String(maskEntry.class_name) : null,
            class_id: maskEntry.class_id != null ? String(maskEntry.class_id) : null,
            region_id: regionId != null ? String(regionId) : null,
        };
    };

    proto._collectPolygonMaskPromptsForFrame = function (frameKey) {
        var groupedPolygons = {};
        var shapes = Array.isArray(this.shapes) ? this.shapes : [];

        for (var i = 0; i < shapes.length; i++) {
            var shape = shapes[i];
            if (!shape || shape.type !== 'polygon') continue;
            if (this._frameKey(shape.frameTime || 0) !== frameKey) continue;

            var regionId = shape.regionId != null ? String(shape.regionId) : '';
            if (!regionId) continue;

            var node = shape.konvaNode;
            if (!node || typeof node.points !== 'function') continue;

            var pts = node.points();
            if (!Array.isArray(pts) || pts.length < 6) continue;

            if (!groupedPolygons[regionId]) groupedPolygons[regionId] = [];
            groupedPolygons[regionId].push(pts.slice());
        }

        var maskW = Number(this.videoEl && this.videoEl.videoWidth ? this.videoEl.videoWidth : 0);
        var maskH = Number(this.videoEl && this.videoEl.videoHeight ? this.videoEl.videoHeight : 0);
        if (!isFinite(maskW) || maskW <= 0) maskW = Number(this.stage && this.stage.width ? this.stage.width() : 0);
        if (!isFinite(maskH) || maskH <= 0) maskH = Number(this.stage && this.stage.height ? this.stage.height() : 0);

        if (!isFinite(maskW) || !isFinite(maskH) || maskW <= 0 || maskH <= 0) {
            return {};
        }

        var promptsByRegion = {};
        var regionIds = Object.keys(groupedPolygons);
        for (var ri = 0; ri < regionIds.length; ri++) {
            var rid = regionIds[ri];
            var prompt = this._buildPolygonMaskPrompt(groupedPolygons[rid], maskW, maskH, rid);
            if (!prompt) continue;
            promptsByRegion[rid] = prompt;
        }

        return promptsByRegion;
    };

    proto._collectMaskPromptsForFrame = function (frameKey) {
        return this._collectAnnotationMaskPromptsForFrame(frameKey);
    };

    proto._bboxIoU = function (a, b) {
        var ix1 = Math.max(a.minx, b.minx);
        var iy1 = Math.max(a.miny, b.miny);
        var ix2 = Math.min(a.maxx, b.maxx);
        var iy2 = Math.min(a.maxy, b.maxy);
        var iw = Math.max(0, ix2 - ix1);
        var ih = Math.max(0, iy2 - iy1);
        var inter = iw * ih;
        if (inter <= 0) return 0;

        var areaA = Math.max(1, (a.maxx - a.minx) * (a.maxy - a.miny));
        var areaB = Math.max(1, (b.maxx - b.minx) * (b.maxy - b.miny));
        var union = areaA + areaB - inter;
        return union > 0 ? (inter / union) : 0;
    };

    proto._contourDescriptor = function (contour) {
        if (!Array.isArray(contour) || contour.length < 6) return null;

        var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
        var sumX = 0;
        var sumY = 0;
        var n = contour.length / 2;

        for (var i = 0; i < contour.length; i += 2) {
            var x = Number(contour[i]);
            var y = Number(contour[i + 1]);
            if (!isFinite(x) || !isFinite(y)) continue;
            if (x < minx) minx = x;
            if (x > maxx) maxx = x;
            if (y < miny) miny = y;
            if (y > maxy) maxy = y;
            sumX += x;
            sumY += y;
        }

        if (!isFinite(minx) || !isFinite(miny) || !isFinite(maxx) || !isFinite(maxy)) return null;

        return {
            minx: minx,
            miny: miny,
            maxx: maxx,
            maxy: maxy,
            cx: sumX / n,
            cy: sumY / n,
            area: Math.max(1, Math.abs(_polygonArea(contour))),
        };
    };

    proto._entryComponentsWithTrack = function (entry) {
        if (!entry) return [];
        var contours = Array.isArray(entry.prepared_contours) ? entry.prepared_contours : [];
        var trackIds = Array.isArray(entry.component_track_ids) ? entry.component_track_ids : [];
        var out = [];
        for (var i = 0; i < contours.length; i++) {
            var descriptor = this._contourDescriptor(contours[i]);
            if (!descriptor) continue;
            descriptor.track_id = trackIds[i] != null ? Number(trackIds[i]) : null;
            out.push(descriptor);
        }
        return out;
    };

    proto._nextTrackIdForGroup = function (regionGroupKey) {
        var key = String(regionGroupKey || '');
        if (!this._autoMaskTrackStateByGroup[key]) {
            this._autoMaskTrackStateByGroup[key] = {
                nextTrackId: 1,
                lastTimestamp: null,
                lastComponents: [],
            };
        }
        var state = this._autoMaskTrackStateByGroup[key];
        var next = Number(state.nextTrackId || 1);
        state.nextTrackId = next + 1;
        return next;
    };

    proto._assignComponentTrackIds = function (entry, seedEntry) {
        if (!entry) return;
        var contours = Array.isArray(entry.prepared_contours) ? entry.prepared_contours : [];
        if (!contours.length) {
            entry.component_track_ids = [];
            return;
        }

        var regionGroup = this._regionGroupKey(entry);
        if (!this._autoMaskTrackStateByGroup[regionGroup]) {
            this._autoMaskTrackStateByGroup[regionGroup] = {
                nextTrackId: 1,
                lastTimestamp: null,
                lastComponents: [],
            };
        }
        var state = this._autoMaskTrackStateByGroup[regionGroup];

        var prevComponents = this._entryComponentsWithTrack(seedEntry);
        if (!prevComponents.length) {
            prevComponents = Array.isArray(state.lastComponents)
                ? state.lastComponents.slice()
                : [];
        }

        var descriptors = [];
        for (var i = 0; i < contours.length; i++) {
            var desc = this._contourDescriptor(contours[i]);
            if (!desc) {
                descriptors.push(null);
                continue;
            }
            descriptors.push(desc);
        }

        var assigned = new Array(contours.length);
        var usedPrev = {};
        var diag = Math.sqrt(
            Math.pow(Number(entry.prepared_mask_w || 1), 2) +
            Math.pow(Number(entry.prepared_mask_h || 1), 2)
        );

        for (var ci = 0; ci < descriptors.length; ci++) {
            var current = descriptors[ci];
            if (!current) {
                assigned[ci] = this._nextTrackIdForGroup(regionGroup);
                continue;
            }

            var bestIdx = -1;
            var bestScore = -Infinity;
            for (var pi = 0; pi < prevComponents.length; pi++) {
                var prev = prevComponents[pi];
                if (!prev || prev.track_id == null || usedPrev[pi]) continue;

                var iou = this._bboxIoU(current, prev);
                var dx = current.cx - prev.cx;
                var dy = current.cy - prev.cy;
                var dist = Math.sqrt(dx * dx + dy * dy);
                var distScore = 1 - Math.min(1, dist / Math.max(1, diag * 0.35));
                var areaRatio = Math.min(current.area, prev.area) / Math.max(current.area, prev.area);
                var score = iou * 2.0 + distScore * 0.7 + areaRatio * 0.5;

                if (score > bestScore) {
                    bestScore = score;
                    bestIdx = pi;
                }
            }

            if (bestIdx >= 0 && bestScore >= 0.42) {
                assigned[ci] = Number(prevComponents[bestIdx].track_id);
                usedPrev[bestIdx] = true;
            } else {
                assigned[ci] = this._nextTrackIdForGroup(regionGroup);
            }
        }

        entry.component_track_ids = assigned;

        var entryTs = Number(entry.timestamp || 0);
        if (
            state.lastTimestamp == null ||
            !isFinite(state.lastTimestamp) ||
            entryTs >= Number(state.lastTimestamp) - 1e-6
        ) {
            state.lastTimestamp = entryTs;
            state.lastComponents = [];
            for (var si = 0; si < descriptors.length; si++) {
                if (!descriptors[si]) continue;
                state.lastComponents.push({
                    track_id: assigned[si],
                    minx: descriptors[si].minx,
                    miny: descriptors[si].miny,
                    maxx: descriptors[si].maxx,
                    maxy: descriptors[si].maxy,
                    cx: descriptors[si].cx,
                    cy: descriptors[si].cy,
                    area: descriptors[si].area,
                });
            }
        }
    };

    proto._isTrackRejected = function (regionGroupKey, trackId, timestamp) {
        if (trackId == null) return false;
        var trackKey = this._trackStorageKey(regionGroupKey, trackId);
        var cutoff = this._rejectedTrackCutoffByKey[trackKey];
        if (!isFinite(cutoff)) return false;
        return Number(timestamp) >= Number(cutoff) - 1e-6;
    };

    proto._filterRejectedComponentsInEntry = function (entry) {
        if (!entry) return;
        var contours = Array.isArray(entry.prepared_contours) ? entry.prepared_contours : [];
        var trackIds = Array.isArray(entry.component_track_ids) ? entry.component_track_ids : [];
        if (!contours.length || !trackIds.length) return;

        var regionGroup = this._regionGroupKey(entry);
        var keptContours = [];
        var keptTrackIds = [];

        for (var i = 0; i < contours.length; i++) {
            var trackId = trackIds[i];
            if (this._isTrackRejected(regionGroup, trackId, entry.timestamp)) continue;
            keptContours.push(contours[i]);
            keptTrackIds.push(trackId);
        }

        entry.prepared_contours = keptContours;
        entry.component_track_ids = keptTrackIds;
    };

    proto._forgetAutoShapeMeta = function (shapeId, providedMeta) {
        var sid = String(shapeId || '');
        if (!sid) return;
        var meta = providedMeta || this._autoShapeMetaById[sid] || null;
        if (!meta) {
            delete this._autoShapeMetaById[sid];
            return;
        }

        delete this._autoShapeMetaById[sid];

        if (meta.scope_key) {
            var scopeList = this._autoShapeIdsByScope[meta.scope_key] || [];
            scopeList = scopeList.filter(function (id) { return String(id) !== sid; });
            if (scopeList.length) this._autoShapeIdsByScope[meta.scope_key] = scopeList;
            else delete this._autoShapeIdsByScope[meta.scope_key];
        }

        if (meta.track_key) {
            var trackList = this._autoShapeIdsByTrack[meta.track_key] || [];
            trackList = trackList.filter(function (id) { return String(id) !== sid; });
            if (trackList.length) this._autoShapeIdsByTrack[meta.track_key] = trackList;
            else delete this._autoShapeIdsByTrack[meta.track_key];
        }

        if (meta.entry_component_key) {
            if (String(this._autoShapeIdByEntryComponent[meta.entry_component_key] || '') === sid) {
                delete this._autoShapeIdByEntryComponent[meta.entry_component_key];
            }
        }
    };

    proto._removeShapesForFrameRegion = function (frameKey, regionId) {
        var matchingIds = [];
        var matchingMeta = {};
        for (var i = 0; i < this.shapes.length; i++) {
            var shape = this.shapes[i];
            if (!this._shapeMatchesFrameRegion(shape, frameKey, regionId)) continue;
            var shapeId = String(shape.id || '');
            if (!shapeId) continue;
            matchingIds.push(shapeId);
            matchingMeta[shapeId] = shape._autoMaskMeta || this._autoShapeMetaById[shapeId] || null;
        }
        if (!matchingIds.length) return;

        var previousSuppression = this._suppressAutoMaskDeletion;
        this._suppressAutoMaskDeletion = true;
        try {
            for (var mi = 0; mi < matchingIds.length; mi++) {
                var sid = matchingIds[mi];
                this._deleteShape(sid);
                this._forgetAutoShapeMeta(sid, matchingMeta[sid]);
            }
        } finally {
            this._suppressAutoMaskDeletion = previousSuppression;
        }
    };

    proto._clearPriorCanonicalStateForFrameRegion = function (frameKey, regionId, maxCacheSeq) {
        var rid = String(regionId || '');
        var maxSeq = Number(maxCacheSeq);

        this._maskFrameCache = this._maskFrameCache.filter(function (entry) {
            if (String(entry.frame_key || '') !== String(frameKey || '')) return true;
            if (String(entry.region_id || '') !== rid) return true;
            if (!isFinite(maxSeq)) return false;
            return Number(entry.cache_seq || 0) > maxSeq;
        });

        this._removeShapesForFrameRegion(frameKey, regionId);
        this._lastRenderedMaskKey = null;
    };

    proto._entriesForFrameRegion = function (frameKey, regionId) {
        var rid = String(regionId || '');
        return this._maskFrameCache.filter(function (entry) {
            return String(entry.frame_key || '') === String(frameKey || '') &&
                String(entry.region_id || '') === rid;
        }).sort(function (a, b) {
            return Number(a.cache_seq || 0) - Number(b.cache_seq || 0);
        });
    };

    proto._removeAutoMaskComponent = function (meta) {
        if (!meta) return;

        var targetCacheSeq = Number(meta.cache_seq);
        if (!isFinite(targetCacheSeq)) return;

        var targetTrackId = Number(meta.track_id);
        var hasTrackId = isFinite(targetTrackId);
        var targetIndex = Number(meta.component_index);
        var hasIndex = isFinite(targetIndex);
        var targetFrameKey = meta.frame_key != null ? String(meta.frame_key) : null;
        var removedAny = false;

        this._maskFrameCache = this._maskFrameCache.filter(function (entry) {
            if (Number(entry.cache_seq) !== targetCacheSeq) return true;
            if (targetFrameKey !== null && String(entry.frame_key || '') !== targetFrameKey) return true;

            var contours = Array.isArray(entry.prepared_contours) ? entry.prepared_contours : [];
            var trackIds = Array.isArray(entry.component_track_ids) ? entry.component_track_ids : [];
            if (!contours.length || !trackIds.length) return true;

            var keptContours = [];
            var keptTrackIds = [];

            for (var i = 0; i < contours.length; i++) {
                var match = false;
                if (hasTrackId) match = Number(trackIds[i]) === targetTrackId;
                else if (hasIndex) match = i === targetIndex;

                if (match) {
                    removedAny = true;
                    continue;
                }

                keptContours.push(contours[i]);
                keptTrackIds.push(trackIds[i]);
            }

            entry.prepared_contours = keptContours;
            entry.component_track_ids = keptTrackIds;
            return keptContours.length > 0;
        });

        if (removedAny) {
            this._lastRenderedMaskKey = null;
            this._syncMaskToCurrentVideoTime();
        }
    };

    proto._onShapeDeleted = function (shape) {
        if (!shape || !shape.id) return;
        if (this._suppressAutoMaskDeletion) return;
        var sid = String(shape.id);
        var meta = shape._autoMaskMeta || this._autoShapeMetaById[sid] || null;
        if (meta) {
            this._removeAutoMaskComponent(meta);
            this._forgetAutoShapeMeta(sid, meta);
        }
    };

    proto._removeAutoShapeById = function (shapeId) {
        if (!shapeId) return;
        var sid = String(shapeId);
        var exists = this.shapes.some(function (s) { return String(s.id) === sid; });
        if (exists) {
            this._deleteShape(sid);
            return;
        }
        this._forgetAutoShapeMeta(sid, this._autoShapeMetaById[sid] || null);
    };

    proto._removeAutoShapesForScope = function (scopeKey) {
        var ids = (this._autoShapeIdsByScope[scopeKey] || []).slice();
        delete this._autoShapeIdsByScope[scopeKey];
        for (var i = 0; i < ids.length; i++) {
            this._removeAutoShapeById(ids[i]);
        }
    };

    proto._removeAutoShapesForTrackFromTimestamp = function (trackKey, cutoffTs) {
        var ids = (this._autoShapeIdsByTrack[trackKey] || []).slice();
        for (var i = 0; i < ids.length; i++) {
            var sid = String(ids[i]);
            var meta = this._autoShapeMetaById[sid] || null;
            if (!meta) continue;
            if (Number(meta.timestamp || 0) + 1e-6 < Number(cutoffTs)) continue;
            this._removeAutoShapeById(sid);
        }
    };

    proto._syncAutoAcceptedShapesForEntry = function (entry) {
        if (!entry) return;

        var frameKey = entry.frame_key;
        var regionId = entry.region_id != null ? String(entry.region_id) : null;
        if (!frameKey || !regionId) return;

        var region = this._resolveMaskRegion(entry, regionId);
        if (!region) return;

        var regionEntries = this._entriesForFrameRegion(frameKey, regionId);
        this._removeShapesForFrameRegion(frameKey, regionId);

        for (var ei = 0; ei < regionEntries.length; ei++) {
            var currentEntry = regionEntries[ei];
            var contours = Array.isArray(currentEntry.prepared_contours) ? currentEntry.prepared_contours : [];
            var trackIds = Array.isArray(currentEntry.component_track_ids) ? currentEntry.component_track_ids : [];
            var maskW = Number(currentEntry.prepared_mask_w);
            var maskH = Number(currentEntry.prepared_mask_h);
            if (!contours.length || !trackIds.length || !maskW || !maskH) continue;

            var regionGroup = this._regionGroupKey(currentEntry);
            var scopeKey = this._autoScopeKey(currentEntry.frame_key, regionGroup);
            var frameTime = this._snapToSubsampledFrame(
                isFinite(currentEntry.timestamp) ? Number(currentEntry.timestamp) : this._currentVideoTime()
            );
            var videoW = this.videoEl.videoWidth || this.stage.width();
            var videoH = this.videoEl.videoHeight || this.stage.height();
            var scaleX = videoW / maskW;
            var scaleY = videoH / maskH;

            for (var ci = 0; ci < contours.length; ci++) {
                var contour = contours[ci];
                if (!contour || contour.length < 6) continue;
                var trackId = trackIds[ci];
                if (trackId == null) continue;

                var scaledPoints = contour.map(function (v, i) {
                    return i % 2 === 0 ? v * scaleX : v * scaleY;
                });
                if (scaledPoints.length < 6) continue;

                var konvaNode = new Konva.Line({
                    points: scaledPoints,
                    fill: region.color + '55',
                    stroke: region.color,
                    strokeWidth: 2,
                    closed: true,
                    listening: false,
                });
                region.layer.add(konvaNode);

                var shape = this._registerShape('polygon', konvaNode, {
                    regionId: region.id,
                    frameTime: frameTime,
                });
                if (!shape) continue;

                var trackKey = this._trackStorageKey(regionGroup, trackId);
                var entryComponentKey = String(currentEntry.cache_seq) + '::' + String(ci);
                var meta = {
                    scope_key: scopeKey,
                    track_key: trackKey,
                    entry_component_key: entryComponentKey,
                    timestamp: Number(currentEntry.timestamp || 0),
                    frame_key: currentEntry.frame_key,
                    region_group: regionGroup,
                    track_id: Number(trackId),
                    cache_seq: Number(currentEntry.cache_seq),
                    component_index: ci,
                };
                shape._autoMaskMeta = meta;
                this._autoShapeMetaById[String(shape.id)] = meta;

                if (!this._autoShapeIdsByScope[scopeKey]) this._autoShapeIdsByScope[scopeKey] = [];
                this._autoShapeIdsByScope[scopeKey].push(shape.id);

                if (!this._autoShapeIdsByTrack[trackKey]) this._autoShapeIdsByTrack[trackKey] = [];
                this._autoShapeIdsByTrack[trackKey].push(shape.id);

                this._autoShapeIdByEntryComponent[entryComponentKey] = shape.id;
            }
        }

        region.layer.draw();
    };

    proto._removeTrackFromMaskCache = function (regionGroupKey, trackId, cutoffTs) {
        var keepEntries = [];
        for (var i = 0; i < this._maskFrameCache.length; i++) {
            var entry = this._maskFrameCache[i];
            if (this._regionGroupKey(entry) !== regionGroupKey) {
                keepEntries.push(entry);
                continue;
            }
            if (Number(entry.timestamp || 0) + 1e-6 < Number(cutoffTs)) {
                keepEntries.push(entry);
                continue;
            }

            var contours = Array.isArray(entry.prepared_contours) ? entry.prepared_contours : [];
            var trackIds = Array.isArray(entry.component_track_ids) ? entry.component_track_ids : [];
            if (!contours.length || !trackIds.length) continue;

            var keptContours = [];
            var keptTrackIds = [];
            for (var ci = 0; ci < contours.length; ci++) {
                if (Number(trackIds[ci]) === Number(trackId)) continue;
                keptContours.push(contours[ci]);
                keptTrackIds.push(trackIds[ci]);
            }

            entry.prepared_contours = keptContours;
            entry.component_track_ids = keptTrackIds;

            if (entry.prepared_contours.length) keepEntries.push(entry);
            else {
                var scopeKey = this._autoScopeKey(entry.frame_key, regionGroupKey);
                this._removeAutoShapesForScope(scopeKey);
            }
        }

        this._maskFrameCache = keepEntries;
        this._lastRenderedMaskKey = null;
    };

    proto._clearRejectedTracksForRegion = function (regionId) {
        var prefix = this._regionGroupKey(regionId, '');
        Object.keys(this._rejectedTrackCutoffByKey).forEach(function (k) {
            if (k.indexOf(prefix) === 0) delete this._rejectedTrackCutoffByKey[k];
        }, this);
    };

    proto._buildRegionPromptSignature = function (regionPayload, maskCacheSeq) {
        if (!regionPayload) return '';
        var pts = Array.isArray(regionPayload.points) ? regionPayload.points.slice() : [];
        var labels = Array.isArray(regionPayload.point_labels) ? regionPayload.point_labels.slice() : [];
        var pairs = [];
        for (var i = 0; i < pts.length; i++) {
            var p = pts[i] || [0, 0];
            var x = Number(p[0] || 0).toFixed(6);
            var y = Number(p[1] || 0).toFixed(6);
            var l = Number(labels[i] || 0);
            pairs.push(x + ',' + y + ',' + l);
        }
        pairs.sort();

        var boxSig = '';
        if (Array.isArray(regionPayload.box) && regionPayload.box.length === 2) {
            var c1 = regionPayload.box[0] || [0, 0];
            var c2 = regionPayload.box[1] || [0, 0];
            boxSig = [
                Number(c1[0] || 0).toFixed(6),
                Number(c1[1] || 0).toFixed(6),
                Number(c2[0] || 0).toFixed(6),
                Number(c2[1] || 0).toFixed(6),
            ].join(',');
        }

        var maskSig = 'none';
        if (regionPayload.mask_b64 && Array.isArray(regionPayload.mask_shape)) {
            maskSig = [
                String(regionPayload.mask_encoding || ''),
                String(regionPayload.mask_shape[0] || ''),
                String(regionPayload.mask_shape[1] || ''),
                String(Number(maskCacheSeq || 0)),
            ].join(':');
        }

        return [
            String(regionPayload.region_id || ''),
            String(regionPayload.class_id || ''),
            String(regionPayload.class_name || ''),
            pairs.join('|'),
            boxSig,
            maskSig,
        ].join('::');
    };

    proto._registerPendingUpdateScopes = function (jobId, scopes) {
        if (!Array.isArray(scopes) || !scopes.length) return null;

        var group = {
            job_id: jobId || null,
            scopes: scopes,
            completed: false,
        };

        if (jobId) {
            this._pendingUpdateScopesByJob[String(jobId)] = group;
        }
        this._pendingUpdateScopesFIFO.push(group);
        return group;
    };

    proto._findPendingScopeForEntry = function (entry) {
        if (!entry) return null;

        var regionId = String(entry.region_id || '');
        var ts = Number(entry.timestamp || 0);

        for (var gi = 0; gi < this._pendingUpdateScopesFIFO.length; gi++) {
            var group = this._pendingUpdateScopesFIFO[gi];
            if (!group || group.completed || !Array.isArray(group.scopes)) continue;

            for (var si = 0; si < group.scopes.length; si++) {
                var scope = group.scopes[si];
                if (!scope || scope.completed) continue;
                if (String(scope.region_id || '') !== regionId) continue;
                if (ts + 1e-6 < Number(scope.start_ts || 0)) continue;
                if (ts - 1e-6 > Number(scope.end_ts || 0)) continue;
                return scope;
            }
        }

        return null;
    };

    proto._markPendingScopeFrame = function (entry) {
        if (!entry) return;

        var regionId = String(entry.region_id || '');
        var ts = Number(entry.timestamp || 0);
        var frameKey = entry.frame_key;

        for (var gi = 0; gi < this._pendingUpdateScopesFIFO.length; gi++) {
            var group = this._pendingUpdateScopesFIFO[gi];
            if (!group || group.completed || !Array.isArray(group.scopes)) continue;

            var matchedGroup = false;

            for (var si = 0; si < group.scopes.length; si++) {
                var scope = group.scopes[si];
                if (!scope || scope.completed) continue;
                if (String(scope.region_id || '') !== regionId) continue;
                if (ts + 1e-6 < Number(scope.start_ts) || ts - 1e-6 > Number(scope.end_ts)) continue;
                scope.touched[frameKey] = true;
                scope.latest_cache_seq = Math.max(Number(scope.latest_cache_seq || 0), Number(entry.cache_seq || 0));
                matchedGroup = true;
            }

            if (matchedGroup) break;
        }
    };

    proto._finalizePendingUpdateJob = function (jobId) {
        var group = null;

        if (jobId) {
            group = this._pendingUpdateScopesByJob[String(jobId)] || null;
            delete this._pendingUpdateScopesByJob[String(jobId)];
        }

        if (!group) {
            while (this._pendingUpdateScopesFIFO.length) {
                var candidate = this._pendingUpdateScopesFIFO.shift();
                if (!candidate || candidate.completed) continue;
                group = candidate;
                if (candidate.job_id) delete this._pendingUpdateScopesByJob[String(candidate.job_id)];
                break;
            }
        } else {
            this._pendingUpdateScopesFIFO = this._pendingUpdateScopesFIFO.filter(function (g) {
                return g !== group;
            });
        }

        if (!group || !Array.isArray(group.scopes)) return;

        group.completed = true;
        for (var si = 0; si < group.scopes.length; si++) {
            var scope = group.scopes[si];
            if (!scope || scope.completed) continue;
            scope.completed = true;

            var touched = scope.touched || {};
            var regionId = String(scope.region_id || '');
            var startTs = Number(scope.start_ts || 0);
            var endTs = Number(scope.end_ts || startTs);

            this._discardMaskFrames(function (entry) {
                if (String(entry.region_id || '') !== regionId) return false;
                var ets = Number(entry.timestamp || 0);
                if (ets + 1e-6 < startTs || ets - 1e-6 > endTs) return false;
                return !touched[entry.frame_key];
            });
        }

        this._syncMaskToCurrentVideoTime();
    };

    proto._cancelPendingScopesForRegion = function (regionId, cutoffTs) {
        var rid = String(regionId || '');
        var cutoff = Number(cutoffTs || 0);

        Object.keys(this._pendingUpdateScopesByJob).forEach(function (jobKey) {
            var group = this._pendingUpdateScopesByJob[jobKey];
            if (!group || !Array.isArray(group.scopes)) return;
            group.scopes = group.scopes.filter(function (scope) {
                if (String(scope.region_id || '') !== rid) return true;
                return Number(scope.end_ts || 0) < cutoff;
            });
            if (!group.scopes.length) {
                group.completed = true;
                delete this._pendingUpdateScopesByJob[jobKey];
            }
        }, this);

        this._pendingUpdateScopesFIFO = this._pendingUpdateScopesFIFO.filter(function (group) {
            if (!group || !Array.isArray(group.scopes)) return false;
            group.scopes = group.scopes.filter(function (scope) {
                if (String(scope.region_id || '') !== rid) return true;
                return Number(scope.end_ts || 0) < cutoff;
            });
            if (!group.scopes.length) {
                group.completed = true;
                return false;
            }
            return true;
        });
    };

    proto._shouldIgnoreIncomingMask = function (frameResult) {
        // Track-level reject filtering is applied after component tracking,
        // so we keep all incoming frame_result messages here.
        return false;
    };

    proto._showMaskDecisionBox = function () {
        // Per-component reject (X) controls near segmented masks were removed.
        this._hideMaskDecisionBox();
        return;

        if (!this._maskDecisionLayerEl) return;
        if (!this.annotationMode) {
            this._hideMaskDecisionBox();
            return;
        }
        var maskFrames = Array.isArray(this._currentMaskFrames)
            ? this._currentMaskFrames.slice()
            : [];
        if (!maskFrames.length) {
            this._hideMaskDecisionBox();
            return;
        }

        var rect = this.videoEl.getBoundingClientRect();
        var videoW = rect.width || this.videoEl.clientWidth || 0;
        var videoH = rect.height || this.videoEl.clientHeight || 0;
        if (videoW <= 0 || videoH <= 0) {
            this._hideMaskDecisionBox();
            return;
        }

        this._maskDecisionLayerEl.innerHTML = '';
        this._maskDecisionLayerEl.style.display = 'block';

        var self = this;
        var occupiedBoxes = [];

        function overlapsAny(rect) {
            for (var oi = 0; oi < occupiedBoxes.length; oi++) {
                var o = occupiedBoxes[oi];
                var separated =
                    rect.right <= o.left ||
                    rect.left >= o.right ||
                    rect.bottom <= o.top ||
                    rect.top >= o.bottom;
                if (!separated) return true;
            }
            return false;
        }

        function countOverlaps(rect) {
            var count = 0;
            for (var oi = 0; oi < occupiedBoxes.length; oi++) {
                var o = occupiedBoxes[oi];
                var separated =
                    rect.right <= o.left ||
                    rect.left >= o.right ||
                    rect.bottom <= o.top ||
                    rect.top >= o.bottom;
                if (!separated) count += 1;
            }
            return count;
        }

        function clampToBounds(left, top, width, height, pad) {
            return {
                left: Math.max(pad, Math.min(videoW - width - pad, left)),
                top: Math.max(pad, Math.min(videoH - height - pad, top)),
            };
        }

        for (var fi = 0; fi < maskFrames.length; fi++) {
            var maskFrame = maskFrames[fi];
            if (!maskFrame) continue;

            var contours = Array.isArray(maskFrame.prepared_contours) ? maskFrame.prepared_contours : [];
            var maskW = Number(maskFrame.prepared_mask_w);
            var maskH = Number(maskFrame.prepared_mask_h);
            if (!contours.length || !maskW || !maskH) continue;

            for (var ci = 0; ci < contours.length; ci++) {
                var pts = contours[ci];
                if (!pts || pts.length < 6) continue;

                var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
                for (var i = 0; i < pts.length; i += 2) {
                    var x = pts[i];
                    var y = pts[i + 1];
                    if (x < minx) minx = x;
                    if (x > maxx) maxx = x;
                    if (y < miny) miny = y;
                    if (y > maxy) maxy = y;
                }
                if (!isFinite(minx) || !isFinite(miny) || !isFinite(maxx) || !isFinite(maxy)) continue;

                var box = document.createElement('div');
                box.className = 'd-flex align-items-center gap-1';
                box.style.cssText =
                    'position:absolute;z-index:1;pointer-events:auto;' +
                    'padding:0.1rem 0.15rem;border-radius:6px;' +
                    'background:rgba(33,37,41,0.88);border:1px solid rgba(255,255,255,0.25);';

                box.addEventListener('mouseenter', (function (frameSeq, componentIndex) {
                    return function () {
                        self._setMaskHoverTarget(frameSeq, componentIndex);
                    };
                })(maskFrame.cache_seq, ci));
                box.addEventListener('mouseleave', function () {
                    self._clearMaskHoverTarget();
                });

                var rejectBtn = document.createElement('button');
                rejectBtn.type = 'button';
                rejectBtn.className = 'btn btn-sm btn-outline-danger';
                rejectBtn.style.cssText = 'padding:0.05rem 0.25rem;line-height:1;min-width:24px;';
                rejectBtn.innerHTML = '<i class="fas fa-times"></i>';
                rejectBtn.title = 'Reject region from this frame onward';
                rejectBtn.addEventListener('mouseenter', (function (frameSeq, componentIndex) {
                    return function () {
                        self._setMaskHoverTarget(frameSeq, componentIndex);
                    };
                })(maskFrame.cache_seq, ci));
                rejectBtn.addEventListener('mouseleave', function () {
                    self._clearMaskHoverTarget();
                });
                rejectBtn.addEventListener('click', (function (frameSeq, componentIndex) {
                    return function (ev) {
                        ev.stopPropagation();
                        self._rejectMask(componentIndex, frameSeq);
                    };
                })(maskFrame.cache_seq, ci));
                box.appendChild(rejectBtn);

                this._maskDecisionLayerEl.appendChild(box);

                var boxW = box.offsetWidth || 28;
                var boxH = box.offsetHeight || 24;
                var margin = 4;
                var edgePad = 2;

                var pxMinX = (minx / maskW) * videoW;
                var pxMaxX = (maxx / maskW) * videoW;
                var pxMinY = (miny / maskH) * videoH;
                var pxMaxY = (maxy / maskH) * videoH;

                var centroidX = 0;
                var centroidY = 0;
                var npts = pts.length / 2;
                for (var cpi = 0; cpi < pts.length; cpi += 2) {
                    centroidX += pts[cpi];
                    centroidY += pts[cpi + 1];
                }
                centroidX = (centroidX / npts / maskW) * videoW;
                centroidY = (centroidY / npts / maskH) * videoH;

                var candidates = [
                    { left: centroidX + margin, top: centroidY - (boxH / 2) },
                    { left: centroidX - boxW - margin, top: centroidY - (boxH / 2) },
                    { left: centroidX - (boxW / 2), top: pxMinY - boxH - margin },
                    { left: centroidX - (boxW / 2), top: pxMaxY + margin },
                    { left: pxMaxX + margin, top: pxMinY + margin },
                    { left: pxMinX - boxW - margin, top: pxMinY + margin },
                ];

                var chosen = null;
                var fallback = null;
                var bestOverlap = Infinity;

                for (var ciPos = 0; ciPos < candidates.length; ciPos++) {
                    var clamped = clampToBounds(candidates[ciPos].left, candidates[ciPos].top, boxW, boxH, edgePad);
                    var rectBox = {
                        left: clamped.left,
                        top: clamped.top,
                        right: clamped.left + boxW,
                        bottom: clamped.top + boxH,
                    };
                    if (!overlapsAny(rectBox)) {
                        chosen = rectBox;
                        break;
                    }

                    var overlapCount = countOverlaps(rectBox);
                    if (overlapCount < bestOverlap) {
                        bestOverlap = overlapCount;
                        fallback = rectBox;
                    }
                }

                var finalRect = chosen || fallback || {
                    left: edgePad,
                    top: edgePad,
                    right: edgePad + boxW,
                    bottom: edgePad + boxH,
                };
                occupiedBoxes.push(finalRect);

                box.style.left = finalRect.left + 'px';
                box.style.top = finalRect.top + 'px';
            }
        }

        if (!this._maskDecisionLayerEl.childElementCount) {
            this._hideMaskDecisionBox();
        }
    };

    proto._renderAcceptBtn = function () {
        this._showMaskDecisionBox();
    };

    proto._updateMagicAcceptButton = function () {
        if (!this.annotationMode) {
            this._hideMagicAcceptBtn();
            return;
        }

        var hasMask = Array.isArray(this._currentMaskFrames) && this._currentMaskFrames.length > 0;
        if (!hasMask) {
            this._hideMagicAcceptBtn();
            return;
        }
        this._renderAcceptBtn();
    };

    proto._hasPendingMagicMask = function () {
        return Array.isArray(this._currentMaskFrames) && this._currentMaskFrames.length > 0;
    };

    proto._acceptMaskForRegion = function (regionId) {
        this._acceptMask(regionId);
    };

    proto._rejectMaskForRegion = function (regionId) {
        var current = Array.isArray(this._currentMaskFrames) ? this._currentMaskFrames : [];
        var target = null;
        if (regionId != null) {
            for (var i = 0; i < current.length; i++) {
                if (String(current[i].region_id || '') === String(regionId)) {
                    target = current[i];
                    break;
                }
            }
        }
        if (!target && current.length) target = current[0];
        if (target) {
            this._rejectMask(undefined, target.cache_seq);
            return;
        }
        this._rejectMask();
    };

    proto._acceptMask = function (regionIdOverride, componentIndex, targetCacheSeq) {
        var maskFrame = this._findMaskFrameBySeq(targetCacheSeq);
        var currentFrames = Array.isArray(this._currentMaskFrames) ? this._currentMaskFrames : [];
        if (!maskFrame && regionIdOverride != null) {
            for (var cf = 0; cf < currentFrames.length; cf++) {
                if (String(currentFrames[cf].region_id || '') === String(regionIdOverride)) {
                    maskFrame = currentFrames[cf];
                    break;
                }
            }
        }
        if (!maskFrame) {
            maskFrame = this._currentMaskFrame || (currentFrames.length ? currentFrames[0] : null);
        }
        if (!maskFrame) return;

        var region = this._resolveMaskRegion(maskFrame, regionIdOverride);
        if (!region) { console.warn('[Magic] accept: no active region'); return; }

        var contours = Array.isArray(maskFrame.prepared_contours) ? maskFrame.prepared_contours : [];
        var maskW = Number(maskFrame.prepared_mask_w);
        var maskH = Number(maskFrame.prepared_mask_h);
        if (!contours.length || !maskW || !maskH) {
            this._prepareMaskContours(maskFrame);
            contours = Array.isArray(maskFrame.prepared_contours) ? maskFrame.prepared_contours : [];
            maskW = Number(maskFrame.prepared_mask_w);
            maskH = Number(maskFrame.prepared_mask_h);
        }
        if (!contours.length) {
            console.warn('[Magic] accept: no valid component contour');
            return;
        }

        var frameTime = this._snapToSubsampledFrame(
            isFinite(maskFrame.timestamp) ? Number(maskFrame.timestamp) : this._currentVideoTime()
        );

        var selectedContours = [];
        var selectedIndexes = [];
        if (typeof componentIndex === 'number') {
            if (componentIndex >= 0 && componentIndex < contours.length) {
                selectedContours.push(contours[componentIndex]);
                selectedIndexes.push(componentIndex);
            }
        } else {
            selectedContours = contours.slice();
            for (var si = 0; si < contours.length; si++) selectedIndexes.push(si);
        }

        if (!selectedContours.length) {
            console.warn('[Magic] accept: no selected contours');
            return;
        }

        var created = 0;
        for (var ci = 0; ci < selectedContours.length; ci++) {
            var contour = selectedContours[ci];
            if (!contour || contour.length < 6) continue;

            var videoW = this.videoEl.videoWidth || this.stage.width();
            var videoH = this.videoEl.videoHeight || this.stage.height();
            var scaleX = videoW / maskW;
            var scaleY = videoH / maskH;
            var scaledPoints = contour.map(function (v, i) {
                return i % 2 === 0 ? v * scaleX : v * scaleY;
            });
            if (scaledPoints.length < 6) continue;

            var konvaNode = new Konva.Line({
                points:      scaledPoints,
                fill:        region.color + '55',
                stroke:      region.color,
                strokeWidth: 2,
                closed:      true,
                listening:   false,
            });
            region.layer.add(konvaNode);

            this._registerShape('polygon', konvaNode, {
                regionId:  region.id,
                frameTime: frameTime,
            });
            created += 1;
        }

        if (!created) {
            console.warn('[Magic] accept: extracted contours were not usable');
            return;
        }
        region.layer.draw();

        selectedIndexes.sort(function (a, b) { return b - a; });
        selectedIndexes.forEach(function (idx) {
            if (idx >= 0 && idx < contours.length) contours.splice(idx, 1);
        });
        maskFrame.prepared_contours = contours;

        var acceptedFrameKey = maskFrame.frame_key || this._frameKey(maskFrame.timestamp);
        if (!contours.length) {
            this._discardMaskFrames(function (entry) {
                return Number(entry.cache_seq) === Number(maskFrame.cache_seq);
            });
            this._removeFramePrompts(acceptedFrameKey, maskFrame.region_id);
        }

        this._syncMaskToCurrentVideoTime();
        var pendingGroups = Array.isArray(this._currentMaskFrames) ? this._currentMaskFrames.length : 0;
        if (!pendingGroups) {
            this._setMagicStatus(
                'Mask accepted and saved as ' + String(created) + ' polygon' + (created === 1 ? '' : 's') + '.',
                'success'
            );
        } else {
            this._setMagicStatus(
                'Accepted ' + String(created) + ' component' + (created === 1 ? '' : 's') +
                ', ' + String(pendingGroups) + ' mask group' + (pendingGroups === 1 ? '' : 's') + ' pending.',
                'success'
            );
        }
    };

    proto._hideMagicAcceptBtn = function () {
        this._hideMaskDecisionBox();
        this._currentMaskFrames = [];
        this._currentMaskFrame = null;
    };

    proto._rejectMask = function (componentIndex, targetCacheSeq) {
        var maskFrame = this._findMaskFrameBySeq(targetCacheSeq);
        var currentFrames = Array.isArray(this._currentMaskFrames) ? this._currentMaskFrames : [];
        if (!maskFrame) {
            maskFrame = this._currentMaskFrame || (currentFrames.length ? currentFrames[0] : null);
        }
        if (!maskFrame) return;

        var regionId = maskFrame.region_id != null ? String(maskFrame.region_id) : null;
        var cutoffTs = (maskFrame && isFinite(maskFrame.timestamp))
            ? Number(maskFrame.timestamp)
            : this._snapToSubsampledFrame(this._currentVideoTime());

        if (!regionId) {
            this._setMagicStatus('Cannot reject region: missing region id on mask.', 'warning');
            return;
        }

        var regionGroup = this._regionGroupKey(maskFrame);
        var trackIds = Array.isArray(maskFrame.component_track_ids) ? maskFrame.component_track_ids : [];

        if (typeof componentIndex === 'number') {
            if (componentIndex < 0 || componentIndex >= trackIds.length) {
                this._setMagicStatus('Cannot reject component: invalid component index.', 'warning');
                return;
            }

            var trackId = Number(trackIds[componentIndex]);
            if (!isFinite(trackId)) {
                this._setMagicStatus('Cannot reject component: missing lineage id.', 'warning');
                return;
            }

            var trackKey = this._trackStorageKey(regionGroup, trackId);
            this._rejectedTrackCutoffByKey[trackKey] = cutoffTs;

            this._removeTrackFromMaskCache(regionGroup, trackId, cutoffTs);
            this._removeAutoShapesForTrackFromTimestamp(trackKey, cutoffTs);

            delete this._lastPromptSigByScope[
                this._scopeKey(maskFrame.frame_key || this._frameKey(cutoffTs), regionId)
            ];

            this._syncMaskToCurrentVideoTime();
            var pendingGroups = Array.isArray(this._currentMaskFrames) ? this._currentMaskFrames.length : 0;
            this._setMagicStatus(
                pendingGroups
                    ? 'Component lineage rejected from current frame onward. Other masks are unchanged.'
                    : 'Component lineage rejected from current frame onward. Prompt points kept.',
                'warning'
            );
            return;
        }

        // Fallback: reject whole region from the current frame onward.
        this._cancelPendingScopesForRegion(regionId, cutoffTs);
        this._discardMaskFrames(function (entry) {
            if (String(entry.region_id || '') !== String(regionId)) return false;
            return Number(entry.timestamp) >= cutoffTs - 1e-6;
        });

        this._syncMaskToCurrentVideoTime();
        this._setMagicStatus('Region rejected from current frame onward. Prompt points kept.', 'warning');
    };

    proto._setMagicControlsEnabled = function (enabled) {
        var controls = [
            this._magicPointToolBtnEl,
            this._magicPointPositiveBtnEl,
            this._magicPointNegativeBtnEl,
            this._magicSendBtnEl,
            this._magicClearFrameBtnEl,
            this._magicClearAllBtnEl,
            this._magicWindowInputEl,
        ];
        controls.forEach(function (el) {
            if (el) el.disabled = !enabled;
        });

        if (!enabled) {
            this._hideMaskDecisionBox();
        }

        if (!enabled && this._magicPointActive) {
            this._magicPointActive = false;
            if (this._magicOverlayEl) {
                this._magicOverlayEl.style.pointerEvents = 'none';
                this._magicOverlayEl.style.cursor = 'default';
            }
            if (this._magicPointToolBtnEl) {
                this._magicPointToolBtnEl.classList.remove('active', 'btn-primary');
                this._magicPointToolBtnEl.classList.add('btn-outline-primary');
            }
        }
    };

    proto._setMagicStatus = function (message, tone) {
        if (!this._magicStatusEl) return;
        this._magicStatusEl.textContent = message;

        this._magicStatusEl.classList.remove('text-muted', 'text-success', 'text-danger', 'text-warning');
        if (tone === 'success') this._magicStatusEl.classList.add('text-success');
        else if (tone === 'danger') this._magicStatusEl.classList.add('text-danger');
        else if (tone === 'warning') this._magicStatusEl.classList.add('text-warning');
        else this._magicStatusEl.classList.add('text-muted');
    };
}
