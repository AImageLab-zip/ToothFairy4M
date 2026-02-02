/**
 * VolumeInteraction - Scroll, zoom, pan, and panoramic interaction handlers
 *
 * Responsible for:
 *   - Binding mouse/wheel events to slice viewer canvases
 *   - Scroll-through-slices (standard and fast with Shift)
 *   - Ctrl+scroll zoom with camera projection updates
 *   - Left-click drag pan (only when zoomed in)
 *   - Panoramic image interaction (zoom, pan, double-click reset)
 *   - Panoramic canvas windowing
 *
 * Requires: VolumeWindowing and SliceRenderer to be loaded first.
 *
 * Usage (script-tag, no ES6 modules):
 *   var interaction = new window.VolumeInteraction(viewer);
 *   interaction.bindSliceEvents(canvasElement, 'axial');
 *   interaction.initPanoramicInteraction();
 */

(function () {
    'use strict';

    /**
     * @constructor
     * @param {object} viewer - The parent VolumeViewer instance
     */
    function VolumeInteraction(viewer) {
        this.viewer = viewer;
    }

    // -------------------------------------------------------------------------
    // Slice interaction events
    // -------------------------------------------------------------------------

    /**
     * Bind wheel, mouse drag, and context-menu events to a renderer canvas.
     * @param {HTMLElement} domElement - The renderer canvas
     * @param {string} orientation    - 'axial' | 'sagittal' | 'coronal'
     */
    VolumeInteraction.prototype.bindSliceEvents = function (domElement, orientation) {
        var self = this;

        // Scroll / zoom
        domElement.addEventListener('wheel', function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (event.ctrlKey) {
                self.handleSliceZoom(orientation, event.deltaY > 0 ? -0.1 : 0.1);
            } else {
                var offset = event.shiftKey ? 10 : 1;
                self.handleSliceScroll(orientation, event.deltaY > 0 ? offset : -offset);
            }
        }, { passive: false });

        // Drag-to-pan
        var isDragging = false;
        var lastMouseX = 0;
        var lastMouseY = 0;

        domElement.addEventListener('mousedown', function (event) {
            if (event.button === 0) {
                event.preventDefault();
                event.stopPropagation();
                isDragging = true;
                lastMouseX = event.clientX;
                lastMouseY = event.clientY;
                domElement.style.cursor = 'move';
            }
        });

        domElement.addEventListener('mousemove', function (event) {
            if (isDragging && event.buttons === 1) {
                event.preventDefault();
                event.stopPropagation();
                var dx = event.clientX - lastMouseX;
                var dy = event.clientY - lastMouseY;
                self.handleSlicePan(orientation, dx, dy);
                lastMouseX = event.clientX;
                lastMouseY = event.clientY;
            }
        });

        domElement.addEventListener('mouseup', function (event) {
            if (event.button === 0) {
                event.preventDefault();
                event.stopPropagation();
                isDragging = false;
                domElement.style.cursor = 'crosshair';
            }
        });

        domElement.addEventListener('mouseleave', function () {
            isDragging = false;
            domElement.style.cursor = 'crosshair';
        });

        domElement.addEventListener('contextmenu', function (event) {
            event.preventDefault();
        });
    };

    // -------------------------------------------------------------------------
    // Slice scroll / zoom / pan
    // -------------------------------------------------------------------------

    /**
     * Scroll through slices (standard or fast with Shift key).
     */
    VolumeInteraction.prototype.handleSliceScroll = function (orientation, direction) {
        var v = this.viewer;
        if (!v.initialized || !v.volumeData || !v.dimensions) return;

        var maxSlice;
        if (orientation === 'axial') maxSlice = v.dimensions.z - 1;
        else if (orientation === 'sagittal') maxSlice = v.dimensions.x - 1;
        else maxSlice = v.dimensions.y - 1;

        v.slicePositions[orientation] = Math.max(0, Math.min(maxSlice,
            v.slicePositions[orientation] + direction));

        v.sliceRenderer.updateSlice(orientation);
        v.sliceRenderer.updateSliceLabel(orientation);
        v.sliceRenderer.updateCrosshairs(orientation);
    };

    /**
     * Ctrl+scroll zoom on a slice view.
     */
    VolumeInteraction.prototype.handleSliceZoom = function (orientation, zoomDelta) {
        var v = this.viewer;
        if (!v.initialized || !v.cameras[orientation] || !v.baseCameraBounds[orientation]) return;

        v.zoomLevels[orientation] = Math.max(0.1, Math.min(5.0,
            v.zoomLevels[orientation] + zoomDelta));

        var camera = v.cameras[orientation];
        var baseBounds = v.baseCameraBounds[orientation];
        var zoomLevel = v.zoomLevels[orientation];

        var width = (baseBounds.right - baseBounds.left) / zoomLevel;
        var height = (baseBounds.top - baseBounds.bottom) / zoomLevel;

        if (zoomLevel <= 1.0) {
            v.panOffsets[orientation].x = 0;
            v.panOffsets[orientation].y = 0;
        }

        var panX = v.panOffsets[orientation].x;
        var panY = v.panOffsets[orientation].y;

        camera.left = -width / 2 + panX;
        camera.right = width / 2 + panX;
        camera.top = height / 2 + panY;
        camera.bottom = -height / 2 + panY;
        camera.updateProjectionMatrix();

        if (v.renderFunctions[orientation]) {
            v.renderFunctions[orientation]();
        }
    };

    /**
     * Left-drag pan on a slice view (only when zoomed in).
     */
    VolumeInteraction.prototype.handleSlicePan = function (orientation, deltaX, deltaY) {
        var v = this.viewer;
        if (!v.initialized || !v.cameras[orientation] || !v.baseCameraBounds[orientation]) return;

        var zoomLevel = v.zoomLevels[orientation];
        if (zoomLevel <= 1.0) return;

        var camera = v.cameras[orientation];
        var baseBounds = v.baseCameraBounds[orientation];
        var currentWidth = (baseBounds.right - baseBounds.left) / zoomLevel;
        var currentHeight = (baseBounds.top - baseBounds.bottom) / zoomLevel;
        var container = v.renderers[orientation].domElement;

        var panSensitivityX = currentWidth / container.clientWidth;
        var panSensitivityY = currentHeight / container.clientHeight;

        v.panOffsets[orientation].x -= deltaX * panSensitivityX;
        v.panOffsets[orientation].y += deltaY * panSensitivityY;

        var panX = v.panOffsets[orientation].x;
        var panY = v.panOffsets[orientation].y;

        camera.left = -currentWidth / 2 + panX;
        camera.right = currentWidth / 2 + panX;
        camera.top = currentHeight / 2 + panY;
        camera.bottom = -currentHeight / 2 + panY;
        camera.updateProjectionMatrix();

        if (v.renderFunctions[orientation]) {
            v.renderFunctions[orientation]();
        }
    };

    // -------------------------------------------------------------------------
    // Panoramic interaction (CBCT only)
    // -------------------------------------------------------------------------

    /**
     * Load and display the panoramic image (CBCT modality only).
     */
    VolumeInteraction.prototype.loadPanoramicImage = function () {
        var v = this.viewer;
        if (v.targetModality !== 'cbct') return;

        console.debug('VolumeInteraction: loading panoramic image...');
        var panoramicImg = document.getElementById('panoramicImage');
        var panoramicLoading = document.getElementById('panoramicLoading');
        var panoramicError = document.getElementById('panoramicError');

        if (!panoramicImg || !panoramicLoading || !panoramicError) return;

        panoramicLoading.style.display = 'block';
        panoramicImg.style.display = 'none';
        panoramicError.style.display = 'none';

        var testImg = new Image();
        var self = this;

        testImg.onload = function () {
            console.debug('VolumeInteraction: panoramic image loaded');
            panoramicImg.src = testImg.src;
            panoramicImg.style.display = 'block';
            panoramicLoading.style.display = 'none';
            panoramicError.style.display = 'none';
            v.panoramicLoaded = true;

            self.initPanoramicInteraction();
            try {
                self.initPanoramicCanvases(testImg);
                self.updatePanoramicWindowing();
            } catch (e) {
                console.warn('VolumeInteraction: panoramic canvas init failed:', e);
            }
        };

        testImg.onerror = function () {
            console.error('VolumeInteraction: panoramic image not available');
            panoramicLoading.style.display = 'none';
            panoramicImg.style.display = 'none';
            panoramicError.style.display = 'block';

            var errorElement = panoramicError.querySelector('p');
            if (errorElement) {
                errorElement.textContent = window.isCBCTProcessed
                    ? 'Panoramic view not available'
                    : 'Panoramic available after CBCT processing';
            }
            v.panoramicLoaded = false;
        };

        testImg.src = '/' + window.projectNamespace + '/api/patient/' + window.scanId + '/panoramic/';
    };

    /**
     * Bind zoom/pan/dblclick events on the panoramic view container.
     */
    VolumeInteraction.prototype.initPanoramicInteraction = function () {
        var v = this.viewer;
        var panoramicView = document.getElementById('panoramicView');
        var panoramicImg = document.getElementById('panoramicImage');
        if (!panoramicView || !panoramicImg) {
            console.warn('VolumeInteraction: panoramic elements not found');
            return;
        }

        v.panoramicZoom = 1.0;
        v.panoramicPan = { x: 0, y: 0 };
        this.updatePanoramicTransform();

        var self = this;

        panoramicView.addEventListener('wheel', function (event) {
            event.preventDefault();
            event.stopPropagation();
            self.handlePanoramicZoom(event.deltaY > 0 ? -0.1 : 0.1);
        }, { passive: false });

        var isDragging = false;
        var lastMouseX = 0;
        var lastMouseY = 0;

        panoramicView.addEventListener('mousedown', function (event) {
            if (event.button === 0) {
                event.preventDefault();
                event.stopPropagation();
                isDragging = true;
                lastMouseX = event.clientX;
                lastMouseY = event.clientY;
                panoramicView.style.cursor = 'move';
            }
        });

        panoramicView.addEventListener('mousemove', function (event) {
            if (isDragging && event.buttons === 1) {
                event.preventDefault();
                event.stopPropagation();
                self.handlePanoramicPan(event.clientX - lastMouseX, event.clientY - lastMouseY);
                lastMouseX = event.clientX;
                lastMouseY = event.clientY;
            }
        });

        panoramicView.addEventListener('mouseup', function (event) {
            if (event.button === 0) {
                isDragging = false;
                panoramicView.style.cursor = 'crosshair';
            }
        });

        panoramicView.addEventListener('contextmenu', function (event) {
            event.preventDefault();
        });

        panoramicView.addEventListener('dblclick', function (event) {
            event.preventDefault();
            self.resetPanoramicView();
        });
    };

    VolumeInteraction.prototype.handlePanoramicZoom = function (zoomDelta) {
        var v = this.viewer;
        v.panoramicZoom = Math.max(0.5, Math.min(5.0, v.panoramicZoom + zoomDelta));
        if (v.panoramicZoom <= 1.0) {
            v.panoramicPan.x = 0;
            v.panoramicPan.y = 0;
        }
        this.updatePanoramicTransform();
    };

    VolumeInteraction.prototype.handlePanoramicPan = function (deltaX, deltaY) {
        var v = this.viewer;
        if (v.panoramicZoom <= 1.0) return;
        var panSensitivity = 1.0 / v.panoramicZoom;
        v.panoramicPan.x += deltaX * panSensitivity;
        v.panoramicPan.y += deltaY * panSensitivity;
        this.updatePanoramicTransform();
    };

    VolumeInteraction.prototype.updatePanoramicTransform = function () {
        var v = this.viewer;
        var panoramicImg = document.getElementById('panoramicImage');
        var canvas = v.panoramicCanvas;
        var target = (canvas && canvas.style.display !== 'none') ? canvas : panoramicImg;
        if (!target) return;
        var transform = 'scale(' + v.panoramicZoom + ') translate(' + v.panoramicPan.x + 'px, ' + v.panoramicPan.y + 'px)';
        target.style.transform = transform;
        target.style.transformOrigin = 'center center';
    };

    VolumeInteraction.prototype.resetPanoramicView = function () {
        var v = this.viewer;
        v.panoramicZoom = 1.0;
        v.panoramicPan = { x: 0, y: 0 };
        this.updatePanoramicTransform();
    };

    /**
     * Create offscreen source canvas and visible windowed canvas for the panoramic image.
     */
    VolumeInteraction.prototype.initPanoramicCanvases = function (loadedImg) {
        var v = this.viewer;
        var panoramicView = document.getElementById('panoramicView');
        var imgEl = document.getElementById('panoramicImage');
        if (!panoramicView || !imgEl || !loadedImg) return;

        if (!v.panoramicSourceCanvas) {
            v.panoramicSourceCanvas = document.createElement('canvas');
        }
        var srcCanvas = v.panoramicSourceCanvas;
        srcCanvas.width = loadedImg.naturalWidth || loadedImg.width;
        srcCanvas.height = loadedImg.naturalHeight || loadedImg.height;
        var srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
        srcCtx.drawImage(loadedImg, 0, 0, srcCanvas.width, srcCanvas.height);

        if (!v.panoramicCanvas) {
            v.panoramicCanvas = document.createElement('canvas');
            v.panoramicCanvas.id = 'panoramicCanvas';
            v.panoramicCanvas.className = 'panoramic-image';
            v.panoramicCanvas.style.maxWidth = '100%';
            v.panoramicCanvas.style.maxHeight = '100%';
            v.panoramicCanvas.style.objectFit = 'contain';
            panoramicView.appendChild(v.panoramicCanvas);
        }
        var canvas = v.panoramicCanvas;
        canvas.width = srcCanvas.width;
        canvas.height = srcCanvas.height;
        imgEl.style.display = 'none';
        canvas.style.display = 'block';
        this.updatePanoramicTransform();
    };

    /**
     * Re-apply windowing to the panoramic canvas from source data.
     */
    VolumeInteraction.prototype.updatePanoramicWindowing = function () {
        var v = this.viewer;
        if (!v.panoramicCanvas || !v.panoramicSourceCanvas) return;
        var src = v.panoramicSourceCanvas;
        var dst = v.panoramicCanvas;
        var srcCtx = src.getContext('2d', { willReadFrequently: true });
        var dstCtx = dst.getContext('2d', { willReadFrequently: true });
        var imgData = srcCtx.getImageData(0, 0, src.width, src.height);

        v.windowing.applyToPanoramicData(imgData.data);
        dstCtx.putImageData(imgData, 0, 0);
    };

    /**
     * Force refresh the panoramic image (re-fetch from server).
     */
    VolumeInteraction.prototype.forceRefreshPanoramic = function () {
        var v = this.viewer;
        console.log('VolumeInteraction: force refreshing panoramic image...');
        v.panoramicLoaded = false;

        var panoramicImg = document.getElementById('panoramicImage');
        var panoramicLoading = document.getElementById('panoramicLoading');
        var panoramicError = document.getElementById('panoramicError');

        if (panoramicImg) panoramicImg.style.display = 'none';
        if (panoramicError) panoramicError.style.display = 'none';
        if (panoramicLoading) panoramicLoading.style.display = 'block';

        if (v.panoramicCanvas && v.panoramicCanvas.parentElement) {
            v.panoramicCanvas.parentElement.removeChild(v.panoramicCanvas);
        }
        v.panoramicCanvas = null;
        v.panoramicSourceCanvas = null;

        this.loadPanoramicImage();
    };

    // Expose globally (no ES6 modules)
    window.VolumeInteraction = VolumeInteraction;
})();
