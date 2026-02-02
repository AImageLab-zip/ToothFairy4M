/**
 * SliceRenderer - Three.js-based 2D slice rendering for volume data
 *
 * Responsible for:
 *   - Setting up Three.js scenes, cameras, renderers per orientation
 *   - Creating slice textures from volume data with windowing applied
 *   - Rendering crosshair overlays showing positions of other planes
 *   - Updating slice labels (slice counter)
 *   - Handling resize and refresh of renderers
 *   - Managing the 3D Volume placeholder
 *
 * Requires: Three.js (global `THREE`) loaded via script tag.
 * Requires: VolumeWindowing (global `window.VolumeWindowing`) loaded before this file.
 *
 * Usage (script-tag, no ES6 modules):
 *   var renderer = new window.SliceRenderer(viewer);
 *   renderer.initSliceViewer(containerId, 'axial');
 *   renderer.updateSlice('axial');
 */

(function () {
    'use strict';

    var ORIENTATIONS = ['axial', 'sagittal', 'coronal'];

    /**
     * @constructor
     * @param {object} viewer - The parent VolumeViewer instance (provides volumeData,
     *                          dimensions, slicePositions, windowing, containerPrefix,
     *                          targetModality, scenes, cameras, renderers, renderFunctions,
     *                          dataAspectRatios, baseCameraBounds, zoomLevels, panOffsets)
     */
    function SliceRenderer(viewer) {
        this.viewer = viewer;
    }

    // -------------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------------

    /**
     * Initialize all three slice viewers and the 3D placeholder.
     */
    SliceRenderer.prototype.initializeViewers = function () {
        var v = this.viewer;
        var idPrefix = (v.targetModality && v.targetModality !== 'cbct')
            ? (v.targetModality + '_') : '';

        this.initSliceViewer(idPrefix + 'axialView', 'axial');
        this.initSliceViewer(idPrefix + 'sagittalView', 'sagittal');
        this.initSliceViewer(idPrefix + 'coronalView', 'coronal');
        this.initVolumeViewerPlaceholder(idPrefix + 'volumeView');
    };

    /**
     * Initialize a single slice viewer inside a DOM container.
     * Retries up to 50 times (5 s) if the container has zero dimensions.
     */
    SliceRenderer.prototype.initSliceViewer = function (containerId, orientation, retryCount) {
        retryCount = retryCount || 0;
        var v = this.viewer;
        var actualContainerId = v.containerPrefix + containerId;
        var container = document.getElementById(actualContainerId);

        if (!container || container.clientWidth === 0 || container.clientHeight === 0) {
            if (retryCount < 50) {
                var self = this;
                setTimeout(function () {
                    self.initSliceViewer(containerId, orientation, retryCount + 1);
                }, 100);
            } else {
                console.error('SliceRenderer: container not ready after 5 s for', actualContainerId);
            }
            return;
        }

        if (!v.dimensions) {
            console.error('SliceRenderer: dimensions not loaded');
            return;
        }

        var containerWidth = container.clientWidth;
        var containerHeight = container.clientHeight;

        var scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);

        var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
        camera.position.set(0, 0, 1);
        camera.lookAt(0, 0, 0);

        var renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(containerWidth, containerHeight);
        container.appendChild(renderer.domElement);

        v.scenes[orientation] = scene;
        v.cameras[orientation] = camera;
        v.renderers[orientation] = renderer;

        // Compute data aspect ratio
        var sliceDims = this._sliceDimensions(orientation);
        v.dataAspectRatios = v.dataAspectRatios || {};
        v.dataAspectRatios[orientation] = sliceDims.width / sliceDims.height;

        v.baseCameraBounds = v.baseCameraBounds || {};
        v.baseCameraBounds[orientation] = { left: -1, right: 1, top: 1, bottom: -1 };

        // Set initial slice position to center
        if (orientation === 'axial') {
            v.slicePositions[orientation] = Math.floor(v.dimensions.z / 2);
        } else if (orientation === 'sagittal') {
            v.slicePositions[orientation] = Math.floor(v.dimensions.x / 2);
        } else {
            v.slicePositions[orientation] = Math.floor(v.dimensions.y / 2);
        }

        this.updateSlice(orientation);
        this.updateSliceLabel(orientation);

        // Bind interaction events -- delegated to VolumeInteraction via the viewer
        if (v.interaction) {
            v.interaction.bindSliceEvents(renderer.domElement, orientation);
        }

        renderer.render(scene, camera);

        v.renderFunctions = v.renderFunctions || {};
        v.renderFunctions[orientation] = function () {
            renderer.render(scene, camera);
        };
    };

    /**
     * Set up the "3D Volume - Not yet supported" placeholder.
     */
    SliceRenderer.prototype.initVolumeViewerPlaceholder = function (containerId) {
        var v = this.viewer;
        var actualContainerId = v.containerPrefix + containerId;
        var container = document.getElementById(actualContainerId);
        if (!container) return;

        container.innerHTML = '';
        var placeholder = document.createElement('div');
        placeholder.style.cssText =
            'display:flex;align-items:center;justify-content:center;width:100%;height:100%;' +
            'background-color:#1a1a1a;color:#888;font-size:1.2rem;' +
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
        placeholder.innerHTML =
            '<div style="text-align:center;">' +
            '<i class="fas fa-cube" style="font-size:3rem;opacity:0.5;margin-bottom:1rem;display:block;"></i>' +
            '<div>3D Volume Rendering</div>' +
            '<div style="font-size:0.9rem;opacity:0.7;margin-top:0.5rem;">Not yet supported</div>' +
            '</div>';
        container.appendChild(placeholder);
    };

    // -------------------------------------------------------------------------
    // Slice Update
    // -------------------------------------------------------------------------

    /**
     * Re-render a slice for the given orientation at its current position.
     */
    SliceRenderer.prototype.updateSlice = function (orientation) {
        var v = this.viewer;
        var scene = v.scenes[orientation];
        var position = v.slicePositions[orientation];
        var dataAspectRatio = v.dataAspectRatios[orientation];

        // Clear previous objects
        while (scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }

        var texture = this.createSliceTexture(orientation, position);
        var containerAspect = v.renderers[orientation].domElement.width / v.renderers[orientation].domElement.height;
        var planeWidth, planeHeight;

        if (dataAspectRatio > containerAspect) {
            planeWidth = 2.0;
            planeHeight = 2.0 * containerAspect / dataAspectRatio;
        } else {
            planeHeight = 2.0;
            planeWidth = 2.0 * dataAspectRatio / containerAspect;
        }

        var geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        var material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: false,
            side: THREE.DoubleSide
        });
        var plane = new THREE.Mesh(geometry, material);
        scene.add(plane);

        this.addCrosshairs(orientation, planeWidth, planeHeight);

        if (v.renderFunctions && v.renderFunctions[orientation]) {
            v.renderFunctions[orientation]();
        } else {
            v.renderers[orientation].render(scene, v.cameras[orientation]);
        }
    };

    /**
     * Update crosshairs on all orientations OTHER than the changed one.
     */
    SliceRenderer.prototype.updateCrosshairs = function (changedOrientation) {
        var self = this;
        var v = this.viewer;
        ORIENTATIONS.forEach(function (orientation) {
            if (orientation !== changedOrientation && v.scenes[orientation]) {
                self.updateSlice(orientation);
            }
        });
    };

    // -------------------------------------------------------------------------
    // Texture Creation
    // -------------------------------------------------------------------------

    /**
     * Create a DataTexture for a 2D slice from volumeData using windowing.
     */
    SliceRenderer.prototype.createSliceTexture = function (orientation, sliceIndex) {
        var v = this.viewer;
        var dims = v.dimensions;
        var sliceDims = this._sliceDimensions(orientation);
        var sliceWidth = sliceDims.width;
        var sliceHeight = sliceDims.height;

        var sliceData = new Uint8Array(sliceWidth * sliceHeight);
        var params = v.windowing.calculateParams();
        var windowMin = params.windowMin;
        var windowMax = params.windowMax;
        var windowRange = params.windowRange;
        var volumeData = v.volumeData;

        if (orientation === 'axial') {
            for (var y = 0; y < sliceHeight; y++) {
                for (var x = 0; x < sliceWidth; x++) {
                    var idx3d = sliceIndex * sliceWidth * sliceHeight + y * sliceWidth + x;
                    if (idx3d < volumeData.length) {
                        var hu = volumeData[idx3d];
                        var clamped = hu < windowMin ? windowMin : (hu > windowMax ? windowMax : hu);
                        sliceData[y * sliceWidth + x] = Math.floor(((clamped - windowMin) / windowRange) * 255);
                    }
                }
            }
        } else if (orientation === 'sagittal') {
            for (var z = 0; z < sliceHeight; z++) {
                for (var yy = 0; yy < sliceWidth; yy++) {
                    var idx3dS = z * dims.x * dims.y + yy * dims.x + sliceIndex;
                    if (idx3dS < volumeData.length) {
                        var huS = volumeData[idx3dS];
                        var clampedS = huS < windowMin ? windowMin : (huS > windowMax ? windowMax : huS);
                        sliceData[z * sliceWidth + yy] = Math.floor(((clampedS - windowMin) / windowRange) * 255);
                    }
                }
            }
        } else { // coronal
            for (var zc = 0; zc < sliceHeight; zc++) {
                for (var xc = 0; xc < sliceWidth; xc++) {
                    var idx3dC = zc * dims.x * dims.y + sliceIndex * dims.x + xc;
                    if (idx3dC < volumeData.length) {
                        var huC = volumeData[idx3dC];
                        var clampedC = huC < windowMin ? windowMin : (huC > windowMax ? windowMax : huC);
                        sliceData[zc * sliceWidth + xc] = Math.floor(((clampedC - windowMin) / windowRange) * 255);
                    }
                }
            }
        }

        var texture = new THREE.DataTexture(sliceData, sliceWidth, sliceHeight, THREE.LuminanceFormat, THREE.UnsignedByteType);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.needsUpdate = true;
        return texture;
    };

    // -------------------------------------------------------------------------
    // Crosshairs
    // -------------------------------------------------------------------------

    /**
     * Add crosshair lines showing where the other two planes intersect this view.
     */
    SliceRenderer.prototype.addCrosshairs = function (orientation, planeWidth, planeHeight) {
        var v = this.viewer;
        var scene = v.scenes[orientation];
        var dims = v.dimensions;

        if (orientation === 'axial') {
            // Sagittal line (vertical, blue)
            var sagNorm = (v.slicePositions.sagittal / (dims.x - 1)) * 2 - 1;
            this._addLine(scene, sagNorm * (planeWidth / 2), planeHeight, true, 0x0000ff);

            // Coronal line (horizontal, green)
            var corNorm = (v.slicePositions.coronal / (dims.y - 1)) * 2 - 1;
            this._addLine(scene, corNorm * (planeHeight / 2), planeWidth, false, 0x00ff00);

        } else if (orientation === 'sagittal') {
            // Axial line (horizontal, red)
            var axNorm = (v.slicePositions.axial / (dims.z - 1)) * 2 - 1;
            this._addLine(scene, axNorm * (planeHeight / 2), planeWidth, false, 0xff0000);

            // Coronal line (vertical, green)
            var corNormS = (v.slicePositions.coronal / (dims.y - 1)) * 2 - 1;
            this._addLine(scene, corNormS * (planeWidth / 2), planeHeight, true, 0x00ff00);

        } else { // coronal
            // Axial line (horizontal, red)
            var axNormC = (v.slicePositions.axial / (dims.z - 1)) * 2 - 1;
            this._addLine(scene, axNormC * (planeHeight / 2), planeWidth, false, 0xff0000);

            // Sagittal line (vertical, blue)
            var sagNormC = (v.slicePositions.sagittal / (dims.x - 1)) * 2 - 1;
            this._addLine(scene, sagNormC * (planeWidth / 2), planeHeight, true, 0x0000ff);
        }
    };

    /**
     * Helper: add a single crosshair line to a scene.
     * @param {THREE.Scene} scene
     * @param {number} pos     - normalized position along the axis
     * @param {number} extent  - full length of the line
     * @param {boolean} vertical - true for vertical line, false for horizontal
     * @param {number} color   - hex color
     */
    SliceRenderer.prototype._addLine = function (scene, pos, extent, vertical, color) {
        var material = new THREE.LineBasicMaterial({
            color: color,
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });

        var halfExtent = extent / 2;
        var points;
        if (vertical) {
            points = [
                new THREE.Vector3(pos, -halfExtent, 0.001),
                new THREE.Vector3(pos, halfExtent, 0.001)
            ];
        } else {
            points = [
                new THREE.Vector3(-halfExtent, pos, 0.001),
                new THREE.Vector3(halfExtent, pos, 0.001)
            ];
        }

        var geometry = new THREE.BufferGeometry().setFromPoints(points);
        var line = new THREE.Line(geometry, material);
        scene.add(line);
    };

    // -------------------------------------------------------------------------
    // Slice Label
    // -------------------------------------------------------------------------

    /**
     * Update or create the slice counter label (e.g. "128/256").
     */
    SliceRenderer.prototype.updateSliceLabel = function (orientation) {
        var v = this.viewer;
        var maxSlice, currentSlice;

        if (orientation === 'axial') {
            maxSlice = v.dimensions.z;
            currentSlice = v.slicePositions[orientation] + 1;
        } else if (orientation === 'sagittal') {
            maxSlice = v.dimensions.x;
            currentSlice = v.slicePositions[orientation] + 1;
        } else {
            maxSlice = v.dimensions.y;
            currentSlice = v.slicePositions[orientation] + 1;
        }

        var prefix = (v.targetModality && v.targetModality !== 'cbct') ? (v.targetModality + '_') : '';
        var containerId = (orientation === 'axial') ? (prefix + 'axialView')
            : (orientation === 'sagittal') ? (prefix + 'sagittalView')
            : (prefix + 'coronalView');
        var container = document.getElementById(v.containerPrefix + containerId);
        if (!container) return;

        var label = container.querySelector('.slice-counter');
        if (!label) {
            label = document.createElement('div');
            label.className = 'slice-counter';
            label.style.cssText =
                'position:absolute;bottom:5px;right:10px;color:white;font-size:0.8rem;' +
                'background:rgba(0,0,0,0.7);padding:2px 6px;border-radius:3px;' +
                'z-index:100;pointer-events:none;';
            container.appendChild(label);
        }

        label.textContent = currentSlice + '/' + maxSlice;
    };

    // -------------------------------------------------------------------------
    // Resize / Refresh
    // -------------------------------------------------------------------------

    /**
     * Handle window resize for all slice renderers.
     */
    SliceRenderer.prototype.handleResize = function () {
        var v = this.viewer;
        var prefix = (v.targetModality && v.targetModality !== 'cbct') ? (v.targetModality + '_') : '';
        var self = this;

        ORIENTATIONS.forEach(function (orientation) {
            if (v.renderers[orientation] && v.cameras[orientation]) {
                var containerId = (orientation === 'axial') ? (prefix + 'axialView')
                    : (orientation === 'sagittal') ? (prefix + 'sagittalView')
                    : (prefix + 'coronalView');
                var container = document.getElementById(v.containerPrefix + containerId);
                if (container && container.clientWidth > 0 && container.clientHeight > 0) {
                    v.renderers[orientation].setSize(container.clientWidth, container.clientHeight);

                    var zoomLevel = v.zoomLevels[orientation] || 1.0;
                    var panX = (v.panOffsets[orientation] && v.panOffsets[orientation].x) || 0;
                    var panY = (v.panOffsets[orientation] && v.panOffsets[orientation].y) || 0;

                    var w = 2 / zoomLevel;
                    var h = 2 / zoomLevel;

                    var camera = v.cameras[orientation];
                    camera.left = -w / 2 + panX;
                    camera.right = w / 2 + panX;
                    camera.top = h / 2 + panY;
                    camera.bottom = -h / 2 + panY;
                    camera.updateProjectionMatrix();
                    self.updateSlice(orientation);
                }
            }
        });
    };

    /**
     * Refresh all views (reset zoom/pan, resize renderers).
     */
    SliceRenderer.prototype.refreshAllViews = function () {
        var v = this.viewer;
        var self = this;

        ORIENTATIONS.forEach(function (orientation) {
            if (v.renderers[orientation] && v.scenes[orientation] && v.cameras[orientation]) {
                var prefix = (v.targetModality && v.targetModality !== 'cbct') ? (v.targetModality + '_') : '';
                var containerId = (orientation === 'axial') ? (prefix + 'axialView')
                    : (orientation === 'sagittal') ? (prefix + 'sagittalView')
                    : (prefix + 'coronalView');
                var container = document.getElementById(v.containerPrefix + containerId);
                if (container && container.clientWidth > 0 && container.clientHeight > 0) {
                    v.renderers[orientation].setSize(container.clientWidth, container.clientHeight);
                    v.zoomLevels[orientation] = 1.0;
                    v.panOffsets[orientation] = { x: 0, y: 0 };

                    var camera = v.cameras[orientation];
                    camera.left = -1;
                    camera.right = 1;
                    camera.top = 1;
                    camera.bottom = -1;
                    camera.updateProjectionMatrix();
                    self.updateSlice(orientation);
                }
            }
        });
    };

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * Return the pixel dimensions of a 2D slice for the given orientation.
     */
    SliceRenderer.prototype._sliceDimensions = function (orientation) {
        var d = this.viewer.dimensions;
        if (orientation === 'axial') return { width: d.x, height: d.y };
        if (orientation === 'sagittal') return { width: d.y, height: d.z };
        return { width: d.x, height: d.z }; // coronal
    };

    // Expose globally (no ES6 modules)
    window.SliceRenderer = SliceRenderer;
})();
