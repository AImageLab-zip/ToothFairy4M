'use strict';

import { applyShapesMixin }   from './shapes.js';
import { applyApiMixin }      from './api.js';
import { applyTimelineMixin } from './timeline.js';
import { applyWorkerMixin }   from './worker.js';

/* ====================================================================== */
/* Module-level constants                                                   */
/* ====================================================================== */

var FRAME_STEP_S = 1.0;   // seconds per step

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
 * @param {HTMLVideoElement}  [cfg.subsampledVideoEl]
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
 * @param {string}            [cfg.workerWsHost]
 * @param {string}            [cfg.workerVideoId]
 * @param {string}            [cfg.workerVideoSource]
 * @param {number}            [cfg.subsampledVideoFps]
 * @param {HTMLElement}       [cfg.magicPanelEl]
 * @param {HTMLButtonElement} [cfg.magicPointToolBtnEl]
 * @param {HTMLButtonElement} [cfg.magicPointPositiveBtnEl]
 * @param {HTMLButtonElement} [cfg.magicPointNegativeBtnEl]
 * @param {HTMLButtonElement} [cfg.magicSendBtnEl]
 * @param {HTMLButtonElement} [cfg.magicClearFrameBtnEl]
 * @param {HTMLButtonElement} [cfg.magicClearAllBtnEl]
 * @param {HTMLElement}       [cfg.magicPromptsListEl]
 * @param {HTMLElement}       [cfg.magicPromptsCountEl]
 * @param {HTMLInputElement}  [cfg.magicWindowInputEl]
 */
function VideoAnnotator(cfg) {
    /* DOM references */
    this.videoEl        = cfg.videoEl;
    this._subsampledVideoEl = cfg.subsampledVideoEl || null;
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

    /* Paused/scrub preview source */
    this._subsampledPreviewActive = false;
    this._pendingSubsampledSeekTime = null;
    this._detachedPreviewTime = null;
    this._pendingMainSyncTime = null;

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

    /* Worker config — NEW */
    this._workerWsHost       = cfg.workerWsHost      || (window.workerWsHost || '');
    this._workerVideoId      = cfg.workerVideoId     || (window.workerVideoId || '');
    this._workerVideoSource  = cfg.workerVideoSource || (window.workerVideoPath || null);
    this._subsampledVideoFps = cfg.subsampledVideoFps || (window.subsampledVideoFps || 1);

    /* Magic Toolbox DOM refs — NEW */
    this._magicPanelEl         = cfg.magicPanelEl         || document.getElementById('magic-toolbox-panel');
    this._magicPointToolBtnEl  = cfg.magicPointToolBtnEl  || document.getElementById('magic-tool-point-btn');
    this._magicPointPositiveBtnEl = cfg.magicPointPositiveBtnEl || document.getElementById('magic-point-positive-btn');
    this._magicPointNegativeBtnEl = cfg.magicPointNegativeBtnEl || document.getElementById('magic-point-negative-btn');
    this._magicSendBtnEl       = cfg.magicSendBtnEl       || document.getElementById('magic-send-prompts-btn');
    this._magicClearFrameBtnEl = cfg.magicClearFrameBtnEl || document.getElementById('magic-clear-frame-btn');
    this._magicClearAllBtnEl   = cfg.magicClearAllBtnEl   || document.getElementById('magic-clear-all-btn');
    this._magicPromptsListEl   = cfg.magicPromptsListEl   || document.getElementById('magic-prompts-list');
    this._magicPromptsCountEl  = cfg.magicPromptsCountEl  || document.getElementById('magic-prompts-count');
    this._magicWindowInputEl   = cfg.magicWindowInputEl   || document.getElementById('magic-window-seconds-input');

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
        if (_self._subsampledPreviewActive) _self._syncSubsampledPreviewFrame();
    });
    this.videoEl.addEventListener('seeked', function () {
        _self._updateShapeVisibility();
        if (_self._filterShapesCurrentFrame) _self._renderShapesList();
        _self._updateTemporalTimelineUI();
        _self._updateSubsampledPreviewMode();
    });
    this.videoEl.addEventListener('play', function () { _self._updateSubsampledPreviewMode(); });
    this.videoEl.addEventListener('pause', function () { _self._updateSubsampledPreviewMode(); });

    if (this._subsampledVideoEl) {
        this._subsampledVideoEl.addEventListener('loadedmetadata', function () {
            if (_self._pendingSubsampledSeekTime !== null) {
                try {
                    _self._subsampledVideoEl.currentTime = _self._pendingSubsampledSeekTime;
                } catch (_) {
                    // ignore metadata race; next sync will retry
                }
                _self._pendingSubsampledSeekTime = null;
            }
            if (_self._subsampledPreviewActive) _self._syncSubsampledPreviewFrame();
        });
    }

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

    this._initWorker();
    this._initFrameSnap();
    this._updateSubsampledPreviewMode();
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

VideoAnnotator.prototype._clampVideoTime = function (targetTime) {
    var t = Number(targetTime);
    if (!isFinite(t) || t < 0) t = 0;

    var duration = this.videoEl.duration;
    if (isFinite(duration) && duration >= 0 && t > duration) t = duration;
    return t;
};

VideoAnnotator.prototype._currentVideoTime = function () {
    if (this._detachedPreviewTime !== null && isFinite(this._detachedPreviewTime)) {
        var actualTime = this._clampVideoTime(this.videoEl.currentTime || 0);
        var syncTarget = this._pendingMainSyncTime;
        if (syncTarget !== null && Math.abs(actualTime - Number(syncTarget)) <= 0.001) {
            this._detachedPreviewTime = null;
            this._pendingMainSyncTime = null;
        } else {
            return this._clampVideoTime(this._detachedPreviewTime);
        }
    }

    return this._clampVideoTime(this.videoEl.currentTime || 0);
};

VideoAnnotator.prototype._canUseDetachedPreviewSeek = function () {
    return !!(this._subsampledVideoEl && this.annotationMode && this.videoEl.paused);
};

VideoAnnotator.prototype._syncMainVideoToDisplayedTime = function () {
    if (this._detachedPreviewTime === null || !isFinite(this._detachedPreviewTime)) return;

    var targetTime = this._clampVideoTime(this._detachedPreviewTime);
    var actualTime = this._clampVideoTime(this.videoEl.currentTime || 0);
    if (Math.abs(actualTime - targetTime) <= 0.001) {
        this._detachedPreviewTime = null;
        this._pendingMainSyncTime = null;
        return;
    }

    this._pendingMainSyncTime = targetTime;
    this._seekPending = null;
    this._seekInFlight = false;
    this.videoEl.currentTime = targetTime;
};

VideoAnnotator.prototype._applyDisplayedSeekState = function (targetTime) {
    this._detachedPreviewTime = this._clampVideoTime(targetTime);
    this._pendingMainSyncTime = null;

    this._syncSubsampledPreviewFrame(this._detachedPreviewTime);
    this._updateTimestamp();
    this._updateShapeVisibility();
    if (this._filterShapesCurrentFrame) this._renderShapesList();
    this._updateTemporalTimelineUI();
    if (typeof this._syncMaskToCurrentVideoTime === 'function') {
        this._syncMaskToCurrentVideoTime();
    }
    if (typeof this._renderMagicOverlay === 'function') this._renderMagicOverlay();
    if (typeof this._renderMagicPromptList === 'function') this._renderMagicPromptList();
};

VideoAnnotator.prototype._requestSeekTo = function (targetTime) {
    var clampedTime = this._clampVideoTime(targetTime);

    if (this._canUseDetachedPreviewSeek()) {
        this._seekPending = null;
        this._seekInFlight = false;
        this._applyDisplayedSeekState(clampedTime);
        return;
    }

    this._detachedPreviewTime = null;
    this._pendingMainSyncTime = null;
    this._seekPending = clampedTime;
    this._flushSeek();
};

VideoAnnotator.prototype._setSubsampledPreviewActive = function (active) {
    if (!this._subsampledVideoEl) return;

    if (active) this._syncSubsampledPreviewFrame();
    if (this._subsampledPreviewActive === active) return;

    this._subsampledPreviewActive = active;
    this.videoEl.style.visibility = active ? 'hidden' : 'visible';
    this._subsampledVideoEl.style.display = active ? 'block' : 'none';

    if (!active && !this._subsampledVideoEl.paused) {
        this._subsampledVideoEl.pause();
    }
};

VideoAnnotator.prototype._syncSubsampledPreviewFrame = function (targetTime) {
    if (!this._subsampledVideoEl) return;

    if (!isFinite(targetTime)) {
        targetTime = this._currentVideoTime();
    }
    targetTime = this._snapToSubsampledFrame
        ? this._snapToSubsampledFrame(targetTime)
        : targetTime;

    var subDuration = this._subsampledVideoEl.duration;
    if (isFinite(subDuration) && subDuration > 0 && targetTime > subDuration) {
        targetTime = subDuration;
    }
    if (targetTime < 0 || !isFinite(targetTime)) targetTime = 0;

    if (this._subsampledVideoEl.readyState < 1) {
        this._pendingSubsampledSeekTime = targetTime;
        return;
    }

    if (Math.abs((this._subsampledVideoEl.currentTime || 0) - targetTime) > 0.001) {
        this._subsampledVideoEl.currentTime = targetTime;
    }
    if (!this._subsampledVideoEl.paused) this._subsampledVideoEl.pause();
};

VideoAnnotator.prototype._updateSubsampledPreviewMode = function () {
    if (!this._subsampledVideoEl) return;
    var shouldUse = !!(this.annotationMode && this.videoEl.paused);
    this._setSubsampledPreviewActive(shouldUse);
    if (shouldUse) this._syncSubsampledPreviewFrame();
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
    if (typeof this._syncMaskToCurrentVideoTime === 'function') {
        this._syncMaskToCurrentVideoTime();
    }
    if (typeof this._updateMagicAcceptButton === 'function') {
        this._updateMagicAcceptButton();
    }
    if (region.dbId) {
        this._requestVoid('/laparoscopy/api/region-types/' + region.dbId + '/', {
            method: 'PATCH',
            headers: this._jsonHeaders(),
            body: JSON.stringify({ color: newColor }),
        });
    }
};

VideoAnnotator.prototype._hasVisibleRegions = function () {
    return this.regions.some(function (r) { return r.visible !== false; });
};

VideoAnnotator.prototype._updateRegionVisibilityToggleBtn = function () {
    var btn = document.getElementById('toggle-regions-visibility-btn');
    if (!btn) return;

    var anyVisible = this._hasVisibleRegions();
    btn.disabled = this.regions.length === 0;
    btn.innerHTML = anyVisible
        ? '<i class="fas fa-eye-slash me-1"></i>Hide all'
        : '<i class="fas fa-eye me-1"></i>Show all';
    btn.title = anyVisible ? 'Hide all regions' : 'Show all regions';
};

VideoAnnotator.prototype._applyRegionVisibilityRefresh = function () {
    this.regions.forEach(function (r) { r.layer.draw(); });
    this._syncSelectedPolygonHandles();
    this._renderRegionList();
    if (typeof this._syncMaskToCurrentVideoTime === 'function') {
        this._syncMaskToCurrentVideoTime();
    }
};

VideoAnnotator.prototype._setRegionVisibility = function (region, visible) {
    if (!region) return;
    region.visible = visible !== false;
    region.layer.visible(region.visible);
};

VideoAnnotator.prototype._toggleAllRegionsVisibility = function () {
    if (!this.regions.length) return;
    var nextVisible = !this._hasVisibleRegions();
    this.regions.forEach(function (region) {
        region.visible = nextVisible;
        region.layer.visible(nextVisible);
    });
    this._applyRegionVisibilityRefresh();
};

VideoAnnotator.prototype._renderRegionList = function () {
    var self = this;
    this.regionListEl.innerHTML = '';
    this._updateRegionVisibilityToggleBtn();

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
            if (typeof self._syncMaskToCurrentVideoTime === 'function') {
                self._syncMaskToCurrentVideoTime();
            }
            if (typeof self._updateMagicAcceptButton === 'function') {
                self._updateMagicAcceptButton();
            }
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
            self._setRegionVisibility(r, !r.visible);
            self._applyRegionVisibilityRefresh();
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
        self._requestSeekTo(0);
    });
    _on('frame-prev10', 'click', function () { self._stepBack(10); });
    _on('frame-prev',   'click', function () { self._stepBack(1); });
    _on('frame-play',   'click', function () { self._togglePlay(); });
    _on('frame-next',   'click', function () { self._stepForward(1); });
    _on('frame-next10', 'click', function () { self._stepForward(10); });
    _on('frame-last',   'click', function () {
        self.videoEl.pause();
        if (isFinite(self.videoEl.duration)) self._requestSeekTo(self.videoEl.duration);
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
 * In paused annotation mode with a subsampled preview, seeks update the
 * visible preview immediately and the hidden main video catches up later.
 */
VideoAnnotator.prototype._flushSeek = function () {
    if (this._seekInFlight || this._seekPending === null) return;
    this._seekInFlight = true;
    this.videoEl.currentTime = this._seekPending;
    this._seekPending = null;
};

VideoAnnotator.prototype._stepForward = function (frames) {
    this.videoEl.pause();
    var base = this._seekPending !== null ? this._seekPending : this._currentVideoTime();
    var max  = isFinite(this.videoEl.duration) ? this.videoEl.duration : Infinity;
    this._requestSeekTo(Math.min(max, base + FRAME_STEP_S * frames));
};

VideoAnnotator.prototype._stepBack = function (frames) {
    this.videoEl.pause();
    var base = this._seekPending !== null ? this._seekPending : this._currentVideoTime();
    this._requestSeekTo(Math.max(0, base - FRAME_STEP_S * frames));
};

VideoAnnotator.prototype._togglePlay = function () {
    if (this.annotationMode) return;
    if (this.videoEl.paused) {
        this._syncMainVideoToDisplayedTime();
        this.videoEl.play();
    } else {
        this.videoEl.pause();
    }
};

VideoAnnotator.prototype._updatePlayBtn = function () {
    var btn = _el('frame-play');
    if (!btn) return;
    btn.innerHTML = this.videoEl.paused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
};

VideoAnnotator.prototype._updateTimestamp = function () {
    if (!this.timestampEl) return;
    var t   = this._currentVideoTime();
    var fps = this._subsampledVideoFps || 1;
    var frameIdx    = Math.round(t * fps);
    var totalFrames = isFinite(this.videoEl.duration) ? Math.round(this.videoEl.duration * fps) : '?';
    var mm = String(Math.floor(t / 60)).padStart(2, '0');
    var ss = String(Math.floor(t % 60)).padStart(2, '0');
    var ms = String(Math.floor((t % 1) * 1000)).padStart(3, '0');
    this.timestampEl.textContent = mm + ':' + ss + '.' + ms +
        '  [Frame ' + frameIdx + ' / ' + totalFrames + ']';
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
/* Mixin application                                                        */
/* ====================================================================== */

applyShapesMixin(VideoAnnotator.prototype);
applyApiMixin(VideoAnnotator.prototype);
applyTimelineMixin(VideoAnnotator.prototype);
applyWorkerMixin(VideoAnnotator.prototype);

window.VideoAnnotator = VideoAnnotator;
