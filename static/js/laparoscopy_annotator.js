/**
 * laparoscopy_annotator.js
 *
 * Video frame-by-frame annotation tool using Konva.js.
 *
 * ── Zoom / pan ──────────────────────────────────────────────────────────────
 * Zoom is CSS transform (translate + scale) on a shared inner wrapper (wrapEl)
 * that holds both the <video> and the Konva canvas container.  Konva is NOT
 * scaled internally for zoom; only the layer scale (video-px → display-px) is
 * applied to each layer.  _pointerPos() divides Konva's pointer position only
 * by the layer scale — NOT by the zoom factor, which Konva already corrects.
 *
 * ── Event pipeline ──────────────────────────────────────────────────────────
 * Three non-overlapping layers, each with a single responsibility:
 *
 *   Konva stage  mousedown / mousemove / mouseleave
 *                  → start drawing, continue stroke, stop stroke on canvas-exit
 *   outerEl      mousedown / wheel
 *                  → start pan, zoom
 *   window       mousemove / mouseup
 *                  → continue pan, universal stop (drawing + pan)
 *
 * Using stage.on('mouseleave') rather than outerEl mouseleave means the stop
 * fires exactly at the canvas boundary, not the outer container boundary.
 * window mouseup guarantees drawing/pan always terminates even when the mouse
 * button is released outside the browser window.
 *
 * ── Per-frame annotations ───────────────────────────────────────────────────
 * Every shape stores frameTime = video.currentTime at draw time.
 * _updateShapeVisibility() shows/hides shapes based on FRAME_TOLERANCE.
 */
(function () {
    'use strict';

    try {
        const patientId = JSON.parse(document.getElementById('django-data').textContent).scanId;
        const subsampledVideoId =
            typeof window.subsampledVideoId !== 'undefined' && window.subsampledVideoId !== null
                ? String(window.subsampledVideoId)
                : '';
        const videoId = subsampledVideoId ? `lap-${patientId}-${subsampledVideoId}` : `lap-${patientId}`;

        let file_source = null;
        if (typeof window.subsampledVideoPath === 'string' && window.subsampledVideoPath) {
            file_source = window.subsampledVideoPath.replace(
                '/dataset',
                '/media/raid0/tootfairy_dataset'
            );
        }
        window.__med = { patientId: patientId, videoSource: file_source, videoId: videoId };
        const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
        const workerWsHost = window.workerWsHost || 'zip-dgx.ing.unimore.it';

        window.__ws = new WebSocket(
            `${wsProto}://${workerWsHost}/ws/session/${encodeURIComponent(window.__med.videoId)}/`
        );

        var _maskOverlayCanvas = null;
        var _maskOverlayCtx = null;
        var _maskFrameCache = [];
        var _maskSyncBound = false;
        var _lastRenderedMaskKey = null;
        var _maskStoreSeq = 0;
        var MAX_MASK_CACHE_ITEMS = 300;

        function _getVideoEl() {
            return window.__laparoscopyVideoEl || null;
        }

        function _ensureMaskOverlay() {
            var videoEl = _getVideoEl();
            if (!videoEl) return null;

            if (!_maskOverlayCanvas) {
                var parent = videoEl.parentElement;
                if (!parent) return null;

                _maskOverlayCanvas = document.createElement('canvas');
                _maskOverlayCanvas.id = 'ws-mask-overlay-canvas';
                _maskOverlayCanvas.style.cssText =
                    'position:absolute;top:0;left:0;width:100%;height:100%;' +
                    'pointer-events:none;z-index:12;';
                parent.appendChild(_maskOverlayCanvas);
                _maskOverlayCtx = _maskOverlayCanvas.getContext('2d');
            }

            if (!_maskOverlayCtx) return null;

            var w = Math.max(1, Math.round(videoEl.clientWidth || 0));
            var h = Math.max(1, Math.round(videoEl.clientHeight || 0));
            if (_maskOverlayCanvas.width !== w || _maskOverlayCanvas.height !== h) {
                _maskOverlayCanvas.width = w;
                _maskOverlayCanvas.height = h;
            }

            return {
                videoEl: videoEl,
                canvas: _maskOverlayCanvas,
                ctx: _maskOverlayCtx,
            };
        }

        function _decodeB64ToBytes(maskB64) {
            var raw = atob(maskB64 || '');
            var out = new Uint8Array(raw.length);
            for (var i = 0; i < raw.length; i++) {
                out[i] = raw.charCodeAt(i);
            }
            return out;
        }

        function _maskCacheKey(maskEntry) {
            if (maskEntry && isFinite(maskEntry.cache_seq)) {
                return 'seq:' + String(maskEntry.cache_seq);
            }
            return String(maskEntry.timestamp) + '|' + String(maskEntry.frame_index);
        }

        function _clearMaskOverlay() {
            var overlay = _ensureMaskOverlay();
            if (!overlay) return;
            overlay.ctx.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
            _lastRenderedMaskKey = null;
        }

        function _normalizeTimestamp(value) {
            var n = Number(value);
            if (!isFinite(n) || n < 0) return null;
            return n;
        }

        function _storeMaskFrame(frameResult) {
            if (!frameResult || !frameResult.mask_b64 || !Array.isArray(frameResult.mask_shape)) {
                return;
            }

            var ts = _normalizeTimestamp(frameResult.timestamp);
            if (ts === null) {
                var videoEl = _getVideoEl();
                ts = videoEl && isFinite(videoEl.currentTime) ? Number(videoEl.currentTime) : 0;
            }

            var entry = {
                timestamp: ts,
                frame_index: Number(frameResult.frame_index || -1),
                mask_b64: frameResult.mask_b64,
                mask_shape: frameResult.mask_shape,
                cache_seq: ++_maskStoreSeq,
            };

            _maskFrameCache.push(entry);

            if (_maskFrameCache.length > MAX_MASK_CACHE_ITEMS) {
                _maskFrameCache = _maskFrameCache.slice(_maskFrameCache.length - MAX_MASK_CACHE_ITEMS);
            }
        }

        function _pickMaskFrameForVideoTime(videoTime) {
            if (!_maskFrameCache.length) return null;

            var best = null;
            var bestDelta = Infinity;
            for (var i = _maskFrameCache.length - 1; i >= 0; i--) {
                var item = _maskFrameCache[i];
                var delta = Math.abs(Number(item.timestamp) - Number(videoTime));
                if (delta < bestDelta) {
                    best = item;
                    bestDelta = delta;
                }
            }

            if (!best) return null;
            if (bestDelta > 0.6) return null;
            return best;
        }

        function _drawMaskOverlay(frameResult) {
            if (!frameResult || !frameResult.mask_b64 || !Array.isArray(frameResult.mask_shape)) {
                return;
            }

            var overlay = _ensureMaskOverlay();
            if (!overlay) return;

            var shape = frameResult.mask_shape;
            if (shape.length < 2) return;

            var maskH = Number(shape[shape.length - 2]);
            var maskW = Number(shape[shape.length - 1]);
            if (!isFinite(maskH) || !isFinite(maskW) || maskH <= 0 || maskW <= 0) return;

            var bytes = _decodeB64ToBytes(frameResult.mask_b64);
            var pixelCount = maskW * maskH;
            if (!pixelCount || !bytes.length) return;

            var stride = Math.max(1, Math.floor(bytes.length / pixelCount));
            var isFloat32 = stride === 4;
            var view = isFloat32 ? new DataView(bytes.buffer) : null;

            var imageData = new ImageData(maskW, maskH);
            for (var pi = 0; pi < pixelCount; pi++) {
                var maskValue;
                if (isFloat32 && view) {
                    maskValue = view.getFloat32(pi * 4, true);
                } else {
                    maskValue = bytes[pi * stride] || 0;
                }

                if (maskValue > 0) {
                    var di = pi * 4;
                    imageData.data[di] = 0;
                    imageData.data[di + 1] = 255;
                    imageData.data[di + 2] = 80;
                    imageData.data[di + 3] = 110;
                }
            }

            var tmp = document.createElement('canvas');
            tmp.width = maskW;
            tmp.height = maskH;
            var tmpCtx = tmp.getContext('2d');
            if (!tmpCtx) return;
            tmpCtx.putImageData(imageData, 0, 0);

            overlay.ctx.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
            overlay.ctx.drawImage(tmp, 0, 0, overlay.canvas.width, overlay.canvas.height);
            _lastRenderedMaskKey = _maskCacheKey(frameResult);
        }

        function _syncMaskToCurrentVideoTime() {
            var videoEl = _getVideoEl();
            if (!videoEl) return;

            var t = isFinite(videoEl.currentTime) ? Number(videoEl.currentTime) : 0;
            var frame = _pickMaskFrameForVideoTime(t);
            if (!frame) {
                _clearMaskOverlay();
                return;
            }

            var key = _maskCacheKey(frame);
            if (key === _lastRenderedMaskKey) return;
            _drawMaskOverlay(frame);
        }

        function _bindMaskSyncEvents() {
            if (_maskSyncBound) return;
            var videoEl = _getVideoEl();
            if (!videoEl) return;

            _maskSyncBound = true;
            videoEl.addEventListener('timeupdate', _syncMaskToCurrentVideoTime);
            videoEl.addEventListener('seeked', _syncMaskToCurrentVideoTime);
            videoEl.addEventListener('loadedmetadata', _syncMaskToCurrentVideoTime);
            window.addEventListener('resize', _syncMaskToCurrentVideoTime);
        }

        window.__ws.onopen = function () {
            console.log('[WS] open');
            _bindMaskSyncEvents();

            if (!window.__med.videoSource) {
                console.warn('[WS] session ready skipped: missing video source');
                return;
            }

            fetch('/laparoscopy/api/worker/session-ready/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    patientId: String(window.__med.patientId),
                    video_source: window.__med.videoSource,
                    video_id: window.__med.videoId,
                }),
            })
                .then(function (resp) {
                    return resp.text().then(function (text) {
                        if (!resp.ok) {
                            console.error('[WS] session ready failed', resp.status, text);
                            return;
                        }
                        try {
                            console.log('[WS] session ready', JSON.parse(text));
                        } catch (_err) {
                            console.log('[WS] session ready', text);
                        }
                    });
                })
                .catch(function (err) {
                    console.error('[WS] session ready error', err);
                });
        };
        window.__ws.onmessage = function (e) {
            try {
                var parsed = JSON.parse(e.data);
                console.log('[WS]', parsed);
                if (parsed && parsed.type === 'frame_result') {
                    _storeMaskFrame(parsed);
                    _syncMaskToCurrentVideoTime();
                }
            } catch (_err) {
                console.log('[WS raw]', e.data);
            }
        };
        window.__ws.onerror = function (e) {
            console.error('[WS] error', e);
        };
        window.__ws.onclose = function (e) {
            console.log('[WS] close', e.code, e.reason);
        };

        function _magicPromptPayload() {
            var prompts = Array.isArray(window.__magicPrompts) ? window.__magicPrompts : [];
            var videoEl = window.__laparoscopyVideoEl;
            var currentTime =
                videoEl && typeof videoEl.currentTime === 'number' && isFinite(videoEl.currentTime)
                    ? videoEl.currentTime
                    : 0;
            var frameTimestamp = Math.max(0, currentTime);

            var promptTimeTolerance = 0.5;
            var activePrompts = prompts.filter(function (p) {
                var t = Number(p && p.frame_time);
                if (!isFinite(t)) return false;
                return Math.abs(t - currentTime) <= promptTimeTolerance;
            });
            var promptsToSend = activePrompts.length ? activePrompts : prompts;

            var points = [];
            var pointLabels = [];
            promptsToSend.forEach(function (p) {
                var label = Number(p && p.point_label === 0 ? 0 : 1);
                var x = Number(p && p.x);
                var y = Number(p && p.y);
                if (!isFinite(x) || !isFinite(y)) return;
                x = Math.max(0, Math.min(1, x));
                y = Math.max(0, Math.min(1, y));
                points.push([x, y]);
                pointLabels.push(label);
            });

            var windowSeconds = 5.0;
            var windowSecondsInput = document.getElementById('magic-window-seconds-input');
            if (windowSecondsInput) {
                var parsedWindow = Number(windowSecondsInput.value);
                if (isFinite(parsedWindow) && parsedWindow > 0) {
                    windowSeconds = parsedWindow;
                }
            }

            return {
                patientId: window.__med.patientId,
                video_id: window.__med.videoId,
                frame_timestamp: frameTimestamp,
                points: points,
                point_labels: pointLabels,
                window_seconds: windowSeconds,
                normalized: true,
            };
        }

        function _sendMagicPrompts() {
            var payload = _magicPromptPayload();
            if (!payload.points.length) {
                console.warn('[WS] prompt skipped: no points');
                return;
            }

            var sendBtn = document.getElementById('magic-send-prompts-btn');
            if (sendBtn) sendBtn.disabled = true;

            fetch('/laparoscopy/api/worker/session-prompt/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload),
            })
                .then(function (resp) {
                    return resp.text().then(function (text) {
                        if (!resp.ok) {
                            console.error('[WS] session prompt failed', resp.status, text);
                            return;
                        }
                        try {
                            console.log('[WS] session prompt', JSON.parse(text));
                        } catch (_err) {
                            console.log('[WS] session prompt', text);
                        }
                    });
                })
                .catch(function (err) {
                    console.error('[WS] session prompt error', err);
                })
                .finally(function () {
                    if (sendBtn) sendBtn.disabled = false;
                });
        }

        window.__sendMagicPrompts = _sendMagicPrompts;
        var magicSendBtn = document.getElementById('magic-send-prompts-btn');
        if (magicSendBtn) {
            magicSendBtn.addEventListener('click', _sendMagicPrompts);
        }
    } catch (e) {
        console.error('[WS] bootstrap error', e);
    }

    /* ====================================================================== */
    /* Constants & palette                                                      */
    /* ====================================================================== */

    var FRAME_TOLERANCE = 0.020;   // seconds — just over half a 30fps frame
    var FRAME_STEP_S    = 0.033;   // seconds per step (~1 frame at 30fps)

    var PALETTE = [
        '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
        '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
        '#e91e63', '#00bcd4', '#8bc34a', '#ff5722',
    ];

    /* ====================================================================== */
    /* Helpers                                                                  */
    /* ====================================================================== */

    function _el(id) { return document.getElementById(id); }

    function _on(id, event, fn) {
        var el = _el(id);
        if (el) el.addEventListener(event, fn);
    }

    function _openColorPicker(initialColor, onChange) {
        var colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = initialColor;
        colorInput.style.position = 'absolute';
        colorInput.style.left = '-9999px';
        colorInput.style.top = '-9999px';
        document.body.appendChild(colorInput);

        colorInput.addEventListener('change', function () {
            onChange(colorInput.value);
            if (colorInput.parentNode) colorInput.parentNode.removeChild(colorInput);
        });
        colorInput.addEventListener('cancel', function () {
            if (colorInput.parentNode) colorInput.parentNode.removeChild(colorInput);
        });
        colorInput.click();
    }

    /* ====================================================================== */
    /* Constructor                                                              */
    /* ====================================================================== */

    /**
     * @param {Object}            cfg
     * @param {HTMLVideoElement}  cfg.videoEl
     * @param {HTMLElement}       cfg.wrapEl        inner zoom container
     * @param {HTMLElement}       cfg.outerEl        fixed outer container (overflow:hidden)
     * @param {HTMLElement}       cfg.toolbarEl
     * @param {HTMLElement}       cfg.regionListEl
     * @param {HTMLElement}       cfg.shapesListEl
     * @param {HTMLButtonElement} cfg.toggleBtn
     * @param {HTMLElement}       cfg.timestampEl
     * @param {HTMLInputElement}  cfg.brushSizeInput
     * @param {HTMLElement}       cfg.brushSizeLabel
     * @param {HTMLElement}       [cfg.polygonHintEl]  shown while drawing a polygon
     * @param {HTMLElement}       [cfg.timelineTrackWrapEl]
     * @param {HTMLElement}       [cfg.timelineTrackEl]
     * @param {HTMLElement}       [cfg.timelineSegmentsLayerEl]
     * @param {HTMLElement}       [cfg.timelinePinsLayerEl]
     * @param {HTMLButtonElement} [cfg.timelinePlayheadEl]
     * @param {HTMLElement}       [cfg.timelineClassListEl]
     * @param {HTMLElement}       [cfg.timelineCurrentTimeEl]
     * @param {HTMLElement}       [cfg.timelineDurationEl]
     * @param {HTMLElement}       [cfg.timelineActiveClassEl]
     * @param {HTMLButtonElement} [cfg.timelineAddPinBtnEl]
     * @param {HTMLButtonElement} [cfg.timelineAddClassBtnEl]
     */
    function VideoAnnotator(cfg) {
        /* DOM references */
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

        /* Temporal classification timeline */
        this.timelineTrackWrapEl       = cfg.timelineTrackWrapEl || null;
        this.timelineTrackEl           = cfg.timelineTrackEl || null;
        this.timelineSegmentsLayerEl   = cfg.timelineSegmentsLayerEl || null;
        this.timelinePinsLayerEl       = cfg.timelinePinsLayerEl || null;
        this.timelinePlayheadEl        = cfg.timelinePlayheadEl || null;
        this.timelineClassListEl       = cfg.timelineClassListEl || null;
        this.timelineCurrentTimeEl     = cfg.timelineCurrentTimeEl || null;
        this.timelineDurationEl        = cfg.timelineDurationEl || null;
        this.timelineActiveClassEl     = cfg.timelineActiveClassEl || null;
        this.timelineAddPinBtnEl       = cfg.timelineAddPinBtnEl || null;
        this.timelineAddClassBtnEl     = cfg.timelineAddClassBtnEl || null;

        /* Admin / API */
        this.isAdmin   = cfg.isAdmin   || false;
        this.csrfToken = cfg.csrfToken || '';
        this.patientId = cfg.patientId || null;

        /* Tool state */
        this.annotationMode = false;
        this.currentTool    = 'brush';
        this.brushSize      = parseInt(cfg.brushSizeInput.value, 10) || 8;

        /* Regions */
        this.regions          = [];
        this.activeRegionId   = null;
        this.paletteIdx       = 0;
        this._editingRegionId = null;

        /* Shapes */
        this.shapes           = [];
        this._selectedShapeId = null;
        this._filterShapesCurrentFrame = false;

        /* In-progress polygon */
        this._polyPoints = [];
        this._polyLine   = null;
        this._polyGuide  = null;
        this._polyDots   = [];

        /* Polygon vertex handles (editing an existing polygon) */
        this._polyVertexHandles = [];
        this._polyVertexShapeId = null;
        this._draggingVertex    = false;

        /* Freehand drawing */
        this._drawing     = false;
        this._currentLine = null;

        /* Zoom / pan */
        this._zoom         = 1.0;
        this._panX         = 0;
        this._panY         = 0;
        this._spaceDown    = false;
        this._ctrlDown     = false;
        this._isPanning    = false;
        this._panStartX    = 0;
        this._panStartY    = 0;
        this._panStartPanX = 0;
        this._panStartPanY = 0;

        /* Seek coalescing */
        this._seekPending  = null;
        this._seekInFlight = false;

        /* Temporal classification state */
        this.timelineClasses = [];
        this.timelinePins = [];
        this.activeTimelineClassId = null;
        this._editingTimelineClassId = null;
        this._timelinePaletteIdx = 0;
        this._selectedTimelinePinId = null;
        this._timelineDrag = null;
        this._timelineListeners = {};
        this._timelinePinMenuEl = null;
        this._timelinePinMenuCloser = null;
        this._timelineSyncTimer = null;
        this._timelineSyncInFlight = false;
        this._timelineSyncQueued = false;

        /* Bound event listeners (stored for cleanup) */
        this._L = {};

        /* Konva */
        this.stage       = null;
        this.cursorLayer = null;
        this._cursorCircle = null;

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

        var _self = this;
        this.videoEl.addEventListener('timeupdate', function () {
            _self._updateShapeVisibility();
            if (_self._filterShapesCurrentFrame) _self._renderShapesList();
            _self._updateTemporalTimelineUI();
        });
        this.videoEl.addEventListener('seeked', function () {
            _self._updateShapeVisibility();
            if (_self._filterShapesCurrentFrame) _self._renderShapesList();
            _self._updateTemporalTimelineUI();
        });
        this._updateTimestamp();
        this._updateTemporalTimelineUI();

        /* Load persisted types from DB (replaces defaults when API responds) */
        var self = this;
        var regionTypesPromise = this._loadRegionTypes();
        var quadrantTypesPromise = this._loadQuadrantTypes();
        if (regionTypesPromise && typeof regionTypesPromise.then === 'function') {
            regionTypesPromise
                .then(function () { self._loadRegionAnnotations(); })
                .catch(function () { self._loadRegionAnnotations(); });
        } else {
            this._loadRegionAnnotations();
        }

        if (quadrantTypesPromise && typeof quadrantTypesPromise.then === 'function') {
            quadrantTypesPromise
                .then(function () { self._loadTimelineMarkers(); })
                .catch(function () { self._loadTimelineMarkers(); });
        } else {
            this._loadTimelineMarkers();
        }
    }

    /* ====================================================================== */
    /* Konva initialisation                                                     */
    /* ====================================================================== */

    VideoAnnotator.prototype._initKonva = function () {
        var container = document.createElement('div');
        container.id  = 'annotator-canvas-container';
        container.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:10;';
        this.wrapEl.appendChild(container);
        this._container = container;

        this.stage = new Konva.Stage({ container: container, width: 1, height: 1 });
        this.cursorLayer = new Konva.Layer();
        this.stage.add(this.cursorLayer);
    };

    VideoAnnotator.prototype._syncStageSize = function () {
        var dw = this.videoEl.clientWidth;
        var dh = this.videoEl.clientHeight;
        var vw = this.videoEl.videoWidth  || dw;
        var vh = this.videoEl.videoHeight || dh;

        this._container.style.left   = '0px';
        this._container.style.top    = '0px';
        this._container.style.width  = dw + 'px';
        this._container.style.height = dh + 'px';

        var scaleX = dw / (vw || dw);
        var scaleY = dh / (vh || dh);

        this.stage.width(dw);
        this.stage.height(dh);

        this.regions.forEach(function (r) {
            r.layer.scaleX(scaleX);
            r.layer.scaleY(scaleY);
        });
        this.cursorLayer.scaleX(scaleX);
        this.cursorLayer.scaleY(scaleY);
        this.stage.draw();
        this._resetZoom();
    };

    /* ====================================================================== */
    /* Zoom & pan (CSS-transform based)                                         */
    /* ====================================================================== */

    VideoAnnotator.prototype._applyZoom = function (delta, cx, cy) {
        var oldZoom = this._zoom;
        this._zoom  = Math.min(8, Math.max(1.0, oldZoom * delta));
        var factor  = this._zoom / oldZoom;
        if (cx !== undefined) {
            this._panX = cx - (cx - this._panX) * factor;
            this._panY = cy - (cy - this._panY) * factor;
        }
        this._applyTransform();
    };

    VideoAnnotator.prototype._resetZoom = function () {
        this._zoom = 1.0;
        this._panX = 0;
        this._panY = 0;
        this._applyTransform();
    };

    VideoAnnotator.prototype._applyTransform = function () {
        this.wrapEl.style.transform =
            'translate(' + this._panX + 'px,' + this._panY + 'px) scale(' + this._zoom + ')';
    };

    /* ====================================================================== */
    /* Coordinate conversion                                                    */
    /* ====================================================================== */

    /**
     * Convert Konva raw pointer → video-pixel drawing coordinates.
     * Konva's getPointerPosition() already corrects for CSS zoom (via
     * getBoundingClientRect), so we only divide by the layer scale here.
     */
    VideoAnnotator.prototype._pointerPos = function () {
        var raw = this.stage.getPointerPosition();
        if (!raw) return null;
        var sx = this.cursorLayer.scaleX() || 1;
        var sy = this.cursorLayer.scaleY() || 1;
        return { x: raw.x / sx, y: raw.y / sy };
    };

    /* ====================================================================== */
    /* Region management                                                        */
    /* ====================================================================== */

    VideoAnnotator.prototype._addDefaultRegion = function () {
        this.addRegion('Region 1');
    };

    VideoAnnotator.prototype.addRegion = function (name, color, dbId) {
        var actualColor;
        if (color) {
            actualColor = color;
        } else {
            actualColor = PALETTE[this.paletteIdx % PALETTE.length];
            this.paletteIdx++;
        }

        var layer = new Konva.Layer();
        layer.scaleX(this.cursorLayer.scaleX() || 1);
        layer.scaleY(this.cursorLayer.scaleY() || 1);
        this.stage.add(layer);
        this.cursorLayer.moveToTop();

        var id = 'region-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        var region = { id: id, dbId: dbId || null, name: name, color: actualColor, visible: true, layer: layer };
        this.regions.push(region);
        if (!this.activeRegionId) this.activeRegionId = id;

        this._renderRegionList();
        return region;
    };

    VideoAnnotator.prototype._activeRegion = function () {
        var id = this.activeRegionId;
        return this.regions.find(function (r) { return r.id === id; }) || null;
    };

    VideoAnnotator.prototype._startRegionEdit = function (regionId) {
        if (!this.isAdmin) return;
        this.activeRegionId   = regionId;
        this._editingRegionId = regionId;
        this._renderRegionList();
    };

    VideoAnnotator.prototype._commitRegionEdit = function (regionId, nextValue) {
        if (!this.isAdmin) return;
        var region = this.regions.find(function (r) { return r.id === regionId; });
        if (!region) return;
        var trimmed = (nextValue || '').trim();
        if (trimmed) region.name = trimmed;
        this._editingRegionId = null;
        this._renderRegionList();
        this._renderShapesList();
        if (this.isAdmin && region.dbId && trimmed) {
            this._requestVoid('/laparoscopy/api/region-types/' + region.dbId + '/', {
                method: 'PATCH',
                headers: this._jsonHeaders(),
                body: JSON.stringify({ name: trimmed }),
            });
        }
    };

    VideoAnnotator.prototype._cancelRegionEdit = function () {
        this._editingRegionId = null;
        this._renderRegionList();
    };

    VideoAnnotator.prototype._applyRegionStyleToShape = function (shape, region) {
        if (!shape || !region || !shape.konvaNode) return;

        if (shape.type === 'polygon') {
            shape.konvaNode.stroke(region.color);
            shape.konvaNode.fill(region.color + '55');
            return;
        }

        if (shape.type === 'eraser') {
            shape.konvaNode.stroke('rgba(0,0,0,1)');
            shape.konvaNode.globalCompositeOperation('destination-out');
            return;
        }

        shape.konvaNode.stroke(region.color);
    };

    VideoAnnotator.prototype._changeRegionColor = function (regionId, newColor) {
        var self = this;
        var region = this.regions.find(function (r) { return r.id === regionId; });
        if (!region) return;
        region.color = newColor;

        this.shapes.forEach(function (shape) {
            if (shape.regionId !== regionId) return;
            self._applyRegionStyleToShape(shape, region);
        });

        region.layer.draw();
        this._syncSelectedPolygonHandles();
        this._renderRegionList();
        this._renderShapesList();
        if (region.dbId) {
            this._requestVoid('/laparoscopy/api/region-types/' + region.dbId + '/', {
                method: 'PATCH',
                headers: this._jsonHeaders(),
                body: JSON.stringify({ color: newColor }),
            });
        }
    };

    VideoAnnotator.prototype._renderRegionList = function () {
        var self = this;
        this.regionListEl.innerHTML = '';

        this.regions.forEach(function (r) {
            var li = document.createElement('li');
            li.className   = 'list-group-item py-1 px-2';
            li.style.cssText = 'cursor:pointer;flex:1 1 calc(50% - 0.25rem);min-width:0;' +
                'border-left:4px solid ' + (r.id === self.activeRegionId ? r.color : 'transparent') + ';' +
                (r.id === self.activeRegionId ? 'background:rgba(255,193,7,0.12);' : '');
            li.addEventListener('click', function () {
                if (self._editingRegionId === r.id) return;
                self.activeRegionId = r.id;
                self._renderRegionList();
            });

            var row = document.createElement('div');
            row.className = 'd-flex align-items-center gap-1';
            li.appendChild(row);

            /* colour dot — clickable to edit */
            var dot = document.createElement('span');
            dot.style.cssText = 'display:inline-block;width:11px;height:11px;border-radius:50%;flex-shrink:0;background:' + r.color + ';cursor:pointer;';
            dot.title = 'Click to change color';
            dot.addEventListener('click', function (e) {
                e.stopPropagation();
                _openColorPicker(r.color, function (nextColor) {
                    self._changeRegionColor(r.id, nextColor);
                });
            });
            row.appendChild(dot);

            /* name or inline edit */
            var nameWrap = document.createElement('div');
            nameWrap.className = 'flex-grow-1';
            nameWrap.style.minWidth = '0';
            row.appendChild(nameWrap);

            if (self.isAdmin && self._editingRegionId === r.id) {
                var nameInput = document.createElement('input');
                nameInput.type      = 'text';
                nameInput.value     = r.name;
                nameInput.className = 'form-control form-control-sm';
                nameInput.style.cssText = 'padding:0.1rem 0.35rem;';
                nameInput.setAttribute('data-region-edit', r.id);
                nameInput.addEventListener('click', function (e) { e.stopPropagation(); });
                nameInput.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter')  { e.preventDefault(); self._commitRegionEdit(r.id, this.value); }
                    if (e.key === 'Escape') { e.preventDefault(); self._cancelRegionEdit(); }
                });
                nameWrap.appendChild(nameInput);
            } else {
                var nameLabel = document.createElement('span');
                nameLabel.className   = 'small fw-semibold d-block text-truncate';
                nameLabel.style.lineHeight = '1.2';
                nameLabel.textContent = r.name;
                nameWrap.appendChild(nameLabel);
            }

            /* action buttons */
            var actions = document.createElement('div');
            actions.className = 'd-flex align-items-center gap-1 flex-shrink-0';
            row.appendChild(actions);

            var btnCss = 'padding:0.1rem 0.3rem;';

            if (self.isAdmin) {
                if (self._editingRegionId === r.id) {
                    var saveBtn = document.createElement('button');
                    saveBtn.className = 'btn btn-sm btn-outline-success';
                    saveBtn.style.cssText = btnCss;
                    saveBtn.innerHTML = '<i class="fas fa-check"></i>';
                    saveBtn.title     = 'Save';
                    saveBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        var inp = self.regionListEl.querySelector('input[data-region-edit="' + r.id + '"]');
                        self._commitRegionEdit(r.id, inp ? inp.value : r.name);
                    });
                    actions.appendChild(saveBtn);

                    var cancelBtn = document.createElement('button');
                    cancelBtn.className = 'btn btn-sm btn-outline-secondary';
                    cancelBtn.style.cssText = btnCss;
                    cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
                    cancelBtn.title     = 'Cancel';
                    cancelBtn.addEventListener('click', function (e) { e.stopPropagation(); self._cancelRegionEdit(); });
                    actions.appendChild(cancelBtn);
                } else {
                    var editBtn = document.createElement('button');
                    editBtn.className = 'btn btn-sm btn-outline-secondary';
                    editBtn.style.cssText = btnCss;
                    editBtn.innerHTML = '<i class="fas fa-pen"></i>';
                    editBtn.title     = 'Rename';
                    editBtn.addEventListener('click', function (e) { e.stopPropagation(); self._startRegionEdit(r.id); });
                    actions.appendChild(editBtn);
                }
            }

            var eyeBtn = document.createElement('button');
            eyeBtn.className = 'btn btn-sm btn-outline-secondary';
            eyeBtn.style.cssText = btnCss;
            eyeBtn.innerHTML = '<i class="fas fa-eye' + (r.visible ? '' : '-slash') + '"></i>';
            eyeBtn.title     = r.visible ? 'Hide' : 'Show';
            eyeBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                r.visible = !r.visible;
                r.layer.visible(r.visible);
                r.layer.draw();
                self._syncSelectedPolygonHandles();
                self._renderRegionList();
            });
            actions.appendChild(eyeBtn);

            if (self.isAdmin && self.regions.length > 1) {
                var delBtn = document.createElement('button');
                delBtn.className = 'btn btn-sm btn-outline-danger';
                delBtn.style.cssText = btnCss;
                delBtn.innerHTML = '<i class="fas fa-times"></i>';
                delBtn.title     = 'Remove region';
                delBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var removedSelected = self.shapes.some(function (s) {
                        return s.regionId === r.id && s.id === self._selectedShapeId;
                    });
                    self.shapes = self.shapes.filter(function (s) {
                        if (s.regionId === r.id) { s.konvaNode.destroy(); return false; }
                        return true;
                    });
                    if (removedSelected) {
                        self._selectedShapeId = null;
                        self._clearPolygonVertexHandles();
                    }
                    if (self._editingRegionId === r.id) self._editingRegionId = null;
                    var deletedDbId = r.dbId;
                    r.layer.destroy();
                    self.regions = self.regions.filter(function (x) { return x.id !== r.id; });
                    if (self.activeRegionId === r.id) {
                        self.activeRegionId = self.regions[0] ? self.regions[0].id : null;
                    }
                    self._renderRegionList();
                    self._renderShapesList();
                    if (self.isAdmin && deletedDbId) {
                        self._requestVoid('/laparoscopy/api/region-types/' + deletedDbId + '/', {
                            method: 'DELETE',
                            headers: self._csrfHeaders(),
                        });
                    }
                });
                actions.appendChild(delBtn);
            }

            self.regionListEl.appendChild(li);
        });

        if (this._editingRegionId) {
            var activeInput = this.regionListEl.querySelector(
                'input[data-region-edit="' + this._editingRegionId + '"]'
            );
            if (activeInput) { activeInput.focus(); activeInput.select(); }
        }
    };

    /* ====================================================================== */
    /* Frame navigation                                                         */
    /* ====================================================================== */

    VideoAnnotator.prototype._bindFrameNav = function () {
        var self = this;

        _on('frame-first',  'click', function () {
            self.videoEl.pause();
            self._seekPending = null; self._seekInFlight = false;
            self.videoEl.currentTime = 0;
        });
        _on('frame-prev10', 'click', function () { self._stepBack(10); });
        _on('frame-prev',   'click', function () { self._stepBack(1); });
        _on('frame-play',   'click', function () { self._togglePlay(); });
        _on('frame-next',   'click', function () { self._stepForward(1); });
        _on('frame-next10', 'click', function () { self._stepForward(10); });
        _on('frame-last',   'click', function () {
            self.videoEl.pause();
            self._seekPending = null; self._seekInFlight = false;
            if (isFinite(self.videoEl.duration)) self.videoEl.currentTime = self.videoEl.duration;
        });

        this.videoEl.addEventListener('timeupdate', function () { self._updateTimestamp(); });
        this.videoEl.addEventListener('seeked', function () {
            self._seekInFlight = false;
            self._flushSeek();
            self._updateTimestamp();
        });
        this.videoEl.addEventListener('play',  function () { self._updatePlayBtn(); });
        this.videoEl.addEventListener('pause', function () { self._updatePlayBtn(); });
    };

    /**
     * Seek coalescing: rapid clicks accumulate into _seekPending.
     * Only one seek is in-flight at a time; on 'seeked', any pending offset
     * is applied immediately — no serial drain of queued seeks.
     */
    VideoAnnotator.prototype._flushSeek = function () {
        if (this._seekInFlight || this._seekPending === null) return;
        this._seekInFlight = true;
        this.videoEl.currentTime = this._seekPending;
        this._seekPending = null;
    };

    VideoAnnotator.prototype._stepForward = function (frames) {
        this.videoEl.pause();
        var base = this._seekPending !== null ? this._seekPending : this.videoEl.currentTime;
        var max  = isFinite(this.videoEl.duration) ? this.videoEl.duration : Infinity;
        this._seekPending = Math.min(max, base + FRAME_STEP_S * frames);
        this._flushSeek();
    };

    VideoAnnotator.prototype._stepBack = function (frames) {
        this.videoEl.pause();
        var base = this._seekPending !== null ? this._seekPending : this.videoEl.currentTime;
        this._seekPending = Math.max(0, base - FRAME_STEP_S * frames);
        this._flushSeek();
    };

    VideoAnnotator.prototype._togglePlay = function () {
        if (this.annotationMode) return;
        if (this.videoEl.paused) { this.videoEl.play(); } else { this.videoEl.pause(); }
    };

    VideoAnnotator.prototype._updatePlayBtn = function () {
        var btn = _el('frame-play');
        if (!btn) return;
        btn.innerHTML = this.videoEl.paused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
    };

    VideoAnnotator.prototype._updateTimestamp = function () {
        if (!this.timestampEl) return;
        var t  = this.videoEl.currentTime || 0;
        var hh = Math.floor(t / 3600);
        var mm = Math.floor((t % 3600) / 60);
        var ss = Math.floor(t % 60);
        var ms = Math.floor((t % 1) * 1000);
        this.timestampEl.textContent =
            (hh ? String(hh).padStart(2, '0') + ':' : '') +
            String(mm).padStart(2, '0') + ':' +
            String(ss).padStart(2, '0') + '.' +
            String(ms).padStart(3, '0');
    };

    /* ====================================================================== */
    /* Keyboard shortcuts                                                        */
    /* ====================================================================== */

    VideoAnnotator.prototype._bindKeyboard = function () {
        var self = this;

        document.addEventListener('keydown', function (e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.key) {
                case ' ':
                    if (self.annotationMode) { e.preventDefault(); self._spaceDown = true; self._updateCursor(); }
                    break;
                case 'Control':
                    if (self.annotationMode) { e.preventDefault(); self._ctrlDown = true; self._updateCursor(); }
                    break;
                case 'ArrowLeft':
                    if (self.annotationMode) { e.preventDefault(); self._stepBack(e.shiftKey ? 10 : 1); }
                    break;
                case 'ArrowRight':
                    if (self.annotationMode) { e.preventDefault(); self._stepForward(e.shiftKey ? 10 : 1); }
                    break;
                case 'b': case 'B': if (self.annotationMode) self._setTool('brush');   break;
                case 'e': case 'E': if (self.annotationMode) self._setTool('eraser');  break;
                case 'p': case 'P': if (self.annotationMode) self._setTool('polygon'); break;
                case 'h': case 'H': if (self.annotationMode) self._setTool('pan');     break;
                case '[':
                    if (self.annotationMode) {
                        self.brushSize = Math.max(1, self.brushSize - 2);
                        if (self.brushSizeInput) self.brushSizeInput.value = self.brushSize;
                        if (self.brushSizeLabel) self.brushSizeLabel.textContent = self.brushSize;
                        if (self._cursorCircle)  self._cursorCircle.radius(self.brushSize / 2);
                    }
                    break;
                case ']':
                    if (self.annotationMode) {
                        self.brushSize = Math.min(100, self.brushSize + 2);
                        if (self.brushSizeInput) self.brushSizeInput.value = self.brushSize;
                        if (self.brushSizeLabel) self.brushSizeLabel.textContent = self.brushSize;
                        if (self._cursorCircle)  self._cursorCircle.radius(self.brushSize / 2);
                    }
                    break;
                case 'Escape':
                    if (self.annotationMode) self._cancelPolygon();
                    break;
                case 'Enter':
                    if (self.annotationMode && self.currentTool === 'polygon' && self._polyPoints.length >= 6) {
                        e.preventDefault();
                        self._polyClose();
                    }
                    break;
            }
        });

        document.addEventListener('keyup', function (e) {
            if (e.key === ' ')       { self._spaceDown = false; self._updateCursor(); }
            if (e.key === 'Control') { self._ctrlDown  = false; self._updateCursor(); }
        });
    };

    /* ====================================================================== */
    /* Export                                                                   */
    /* ====================================================================== */

    if (
        window.LaparoscopyAnnotatorMixins &&
        typeof window.LaparoscopyAnnotatorMixins.shapes === 'function'
    ) {
        window.LaparoscopyAnnotatorMixins.shapes(VideoAnnotator);
    }

    if (
        window.LaparoscopyAnnotatorMixins &&
        typeof window.LaparoscopyAnnotatorMixins.timeline === 'function'
    ) {
        window.LaparoscopyAnnotatorMixins.timeline(VideoAnnotator);
    }

    if (
        window.LaparoscopyAnnotatorMixins &&
        typeof window.LaparoscopyAnnotatorMixins.api === 'function'
    ) {
        window.LaparoscopyAnnotatorMixins.api(VideoAnnotator);
    }

    window.VideoAnnotator = VideoAnnotator;

})();
