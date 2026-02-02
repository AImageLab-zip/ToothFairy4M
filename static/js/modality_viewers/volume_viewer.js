/**
 * VolumeViewer - Multi-instance 3D volume visualization orchestrator
 *
 * Thin orchestrator that coordinates four focused modules:
 *   - VolumeWindowing  (windowing.js)     - Window/level calculations
 *   - VolumeLoader     (volume_loader.js) - NIfTI fetch/parse
 *   - SliceRenderer    (slice_renderer.js)- Three.js rendering
 *   - VolumeInteraction(volume_interaction.js) - User interaction
 *
 * Each instance manages its own state, renderers, and volume data.
 * Refactored from monolithic class to modular architecture (Phase 6).
 *
 * Script loading order (all via <script> tags, no ES6 modules):
 *   1. windowing.js
 *   2. volume_loader.js
 *   3. slice_renderer.js
 *   4. volume_interaction.js
 *   5. volume_viewer.js   (this file)
 */

class VolumeViewer {
    constructor(containerPrefix) {
        containerPrefix = containerPrefix || '';
        this.containerPrefix = containerPrefix;
        this.initialized = false;
        this.loading = false;
        this.targetModality = null;

        // Volume data (cached per instance)
        this.volumeData = null;
        this.dimensions = null;
        this.spacing = null;
        this.histogram = null;

        // Three.js objects (per instance)
        this.scenes = {};
        this.cameras = {};
        this.renderers = {};
        this.controls = {};
        this.renderFunctions = {};

        // View state
        this.slicePositions = {
            axial: 0,
            sagittal: 0,
            coronal: 0
        };

        this.zoomLevels = {
            axial: 1.0,
            sagittal: 1.0,
            coronal: 1.0
        };

        this.panOffsets = {
            axial: { x: 0, y: 0 },
            sagittal: { x: 0, y: 0 },
            coronal: { x: 0, y: 0 }
        };

        this.dataAspectRatios = {};
        this.baseCameraBounds = {};

        // Panoramic (CBCT only)
        this.panoramicZoom = 1.0;
        this.panoramicPan = { x: 0, y: 0 };
        this.panoramicCanvas = null;
        this.panoramicSourceCanvas = null;
        this.panoramicLoaded = false;

        // Event handler references for cleanup
        this._boundWindowResizeHandlerGeneral = null;
        this._boundWindowResizeHandlerDebounced = null;
        this._lastWindowSlider = null;

        // Sub-modules
        this.windowing = new window.VolumeWindowing();
        this.loader = new window.VolumeLoader();
        this.sliceRenderer = new window.SliceRenderer(this);
        this.interaction = new window.VolumeInteraction(this);
    }

    /**
     * Initialize the viewer for a specific modality
     * @param {string} modalitySlug - The modality to load (e.g., 'braintumor-mri-t1', 'cbct')
     */
    init(modalitySlug) {
        this.targetModality = modalitySlug || 'cbct';

        // Don't initialize for image modalities
        const imageModalities = ['intraoral', 'intraoral-photo', 'teleradiography', 'panoramic'];
        if (imageModalities.includes(this.targetModality)) {
            console.debug('Skipping volume viewer initialization for image modality:', this.targetModality);
            return;
        }

        // If we already have volume data cached, reinitialize viewers
        if (this.volumeData && this.dimensions) {
            console.debug('Using cached volume data for', this.targetModality);
            this.initialized = false;
            this._initViewers();
            this.initialized = true;
            this.loading = false;

            const idSlug = this.targetModality || 'cbct';
            const loadEl = document.getElementById(this.containerPrefix + idSlug + 'Loading');
            const viewsEl = document.getElementById(this.containerPrefix + idSlug + 'Views');
            if (loadEl) loadEl.style.display = 'none';
            if (viewsEl) viewsEl.style.display = 'block';
            return;
        }

        if (this.loading || this.initialized) {
            console.debug('Volume Viewer already loading or initialized');
            return;
        }

        console.debug('Initializing Volume Viewer for', this.targetModality, 'with prefix', this.containerPrefix);

        if (this.targetModality === 'cbct') {
            this.interaction.loadPanoramicImage();
        }
        this._loadVolume();
    }

    /**
     * Dispose the viewer and clean up resources
     */
    dispose() {
        try {
            // Remove resize listeners
            if (this._boundWindowResizeHandlerGeneral) {
                window.removeEventListener('resize', this._boundWindowResizeHandlerGeneral);
                this._boundWindowResizeHandlerGeneral = null;
            }
            if (this._boundWindowResizeHandlerDebounced) {
                window.removeEventListener('resize', this._boundWindowResizeHandlerDebounced);
                this._boundWindowResizeHandlerDebounced = null;
            }

            // Dispose 2D slice renderers and remove canvases
            ['axial', 'sagittal', 'coronal'].forEach(orientation => {
                const renderer = this.renderers && this.renderers[orientation];
                if (renderer) {
                    try {
                        const gl = renderer.getContext();
                        if (gl) {
                            gl.getExtension('WEBGL_lose_context')?.loseContext();
                        }
                        renderer.dispose();
                    } catch (e) {
                        console.warn('Error disposing renderer:', e);
                    }
                    if (renderer.domElement && renderer.domElement.parentElement) {
                        renderer.domElement.parentElement.removeChild(renderer.domElement);
                    }
                }
                if (this.scenes) this.scenes[orientation] = null;
                if (this.cameras) this.cameras[orientation] = null;
                if (this.renderers) this.renderers[orientation] = null;
                if (this.renderFunctions) this.renderFunctions[orientation] = null;
            });
        } catch (e) {
            console.warn('Error during VolumeViewer dispose:', e);
        }

        // Reset state
        this.initialized = false;
        this.loading = false;
        this.dataAspectRatios = {};
        this.baseCameraBounds = {};
        this.zoomLevels = { axial: 1.0, sagittal: 1.0, coronal: 1.0 };
        this.panOffsets = { axial: { x: 0, y: 0 }, sagittal: { x: 0, y: 0 }, coronal: { x: 0, y: 0 } };

        console.debug('VolumeViewer disposed');
    }

    /**
     * Clear all cached data
     */
    clearCache() {
        console.debug('Clearing volume cache...');
        this.dispose();
        this.volumeData = null;
        this.dimensions = null;
        this.spacing = null;
        this.histogram = null;
    }

    /**
     * Refresh all views (delegate to SliceRenderer)
     */
    refreshAllViews() {
        if (!this.initialized) {
            console.debug('Volume viewer not initialized yet, cannot refresh');
            return;
        }

        console.debug('Refreshing all volume views...');
        const self = this;
        setTimeout(() => {
            self.sliceRenderer.refreshAllViews();

            if (self.targetModality === 'cbct' && !self.panoramicLoaded) {
                console.debug('Refreshing panoramic image...');
                self.interaction.loadPanoramicImage();
            }
        }, 50);
    }

    /**
     * Reset all slice views to center positions
     */
    resetAllViews() {
        this.slicePositions.axial = Math.floor(this.dimensions.z / 2);
        this.slicePositions.sagittal = Math.floor(this.dimensions.x / 2);
        this.slicePositions.coronal = Math.floor(this.dimensions.y / 2);

        this.sliceRenderer.updateSlice('axial');
        this.sliceRenderer.updateSlice('sagittal');
        this.sliceRenderer.updateSlice('coronal');

        if (this.controls.volume) {
            this.controls.volume.reset();
        }
    }

    /**
     * Handle window resize (delegate to SliceRenderer)
     */
    handleResize() {
        this.sliceRenderer.handleResize();
    }

    /**
     * Force refresh the panoramic image
     */
    forceRefreshPanoramic() {
        this.interaction.forceRefreshPanoramic();
    }

    /**
     * Show an error message in the loading container
     */
    showError(message, type) {
        type = type || 'warning';
        const idSlug = (this.targetModality && this.targetModality !== 'cbct') ? this.targetModality : 'cbct';
        const loadingDiv = document.getElementById(this.containerPrefix + idSlug + 'Loading') || document.getElementById(this.containerPrefix + 'cbctLoading');
        let iconClass = 'fa-exclamation-triangle text-warning';
        let textClass = 'text-muted';

        if (type === 'info') {
            iconClass = 'fa-info-circle text-info';
            textClass = 'text-info';
        } else if (type === 'danger') {
            iconClass = 'fa-times-circle text-danger';
            textClass = 'text-danger';
        }

        if (!loadingDiv) return;
        loadingDiv.innerHTML =
            '<div class="text-center py-4">' +
            '<i class="fas ' + iconClass + ' mb-2" style="font-size: 2rem;"></i>' +
            '<p class="' + textClass + '">' + message + '</p>' +
            '</div>';
    }

    // =========================================================================
    // Private methods
    // =========================================================================

    /**
     * Fetch and parse volume data using VolumeLoader, then initialize viewers.
     */
    _loadVolume() {
        this.loading = true;

        // Show loading indicator
        const idSlug = this.targetModality;
        const loadEl = document.getElementById(this.containerPrefix + idSlug + 'Loading');
        const viewsEl = document.getElementById(this.containerPrefix + idSlug + 'Views');
        if (loadEl) loadEl.style.display = 'flex';
        if (viewsEl) viewsEl.style.display = 'none';

        const self = this;

        this.loader.load(
            this.targetModality,
            // onSuccess
            function (result) {
                self.volumeData = result.volumeData;
                self.dimensions = result.dimensions;
                self.spacing = result.spacing;
                self.histogram = result.histogram;

                // Propagate histogram range to windowing module
                self.windowing.setHistogramRange(result.histogram.min, result.histogram.max);

                self._initViewers();
                self.initialized = true;
                self.loading = false;

                // Hide loading indicator
                const idSlug2 = self.targetModality || 'cbct';
                const loadEl2 = document.getElementById(self.containerPrefix + idSlug2 + 'Loading');
                const viewsEl2 = document.getElementById(self.containerPrefix + idSlug2 + 'Views');
                if (loadEl2) loadEl2.style.display = 'none';
                if (viewsEl2) viewsEl2.style.display = 'block';
            },
            // onError
            function (err) {
                self.loading = false;
                if (err.type === 'processing') {
                    self.showError(err.message, 'info');
                } else if (err.type === 'failed') {
                    self.showError(err.message, 'danger');
                } else {
                    self.showError('Failed to load volume data');
                }
            }
        );
    }

    /**
     * Initialize viewers and bind event listeners.
     */
    _initViewers() {
        this.sliceRenderer.initializeViewers();
        this._setupEventListeners();
    }

    /**
     * Set up global event listeners (windowing sliders, resize).
     */
    _setupEventListeners() {
        // Note: Per-viewer interaction events are set up by VolumeInteraction
        // via SliceRenderer.initSliceViewer -> interaction.bindSliceEvents

        // Window resize for slice views
        if (this._boundWindowResizeHandlerGeneral) {
            window.removeEventListener('resize', this._boundWindowResizeHandlerGeneral);
        }
        const self = this;
        this._boundWindowResizeHandlerGeneral = function () { self.handleResize(); };
        window.addEventListener('resize', this._boundWindowResizeHandlerGeneral);

        // Debounced resize handler for full refresh
        if (this._boundWindowResizeHandlerDebounced) {
            window.removeEventListener('resize', this._boundWindowResizeHandlerDebounced);
        }
        let resizeTimeout;
        this._boundWindowResizeHandlerDebounced = function () {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function () {
                if (self.initialized) {
                    self.refreshAllViews();
                }
            }, 150);
        };
        window.addEventListener('resize', this._boundWindowResizeHandlerDebounced);
    }

    // =========================================================================
    // Backward-compatible accessors (used by external code / windowing sliders)
    // =========================================================================

    get windowPercentMin() {
        return this.windowing.percentMin;
    }
    set windowPercentMin(val) {
        this.windowing.percentMin = val;
        this.windowing.invalidateCache();
    }

    get windowPercentMax() {
        return this.windowing.percentMax;
    }
    set windowPercentMax(val) {
        this.windowing.percentMax = val;
        this.windowing.invalidateCache();
    }

    /** @deprecated Use windowing.calculateParams() directly */
    _calculateWindowParams() {
        return this.windowing.calculateParams();
    }

    /** @deprecated Use windowing.applyToValue() directly */
    applyWindowing(huValue) {
        return this.windowing.applyToValue(huValue);
    }

    // Delegate panoramic windowing update
    updatePanoramicWindowing() {
        this.interaction.updatePanoramicWindowing();
    }
}

// Legacy compatibility: Create a wrapper that mimics the old singleton API
// This allows existing code (Maxillo pages) to continue working
window.CBCTViewer = {
    _instance: null,
    containerPrefix: '',

    init: function(modalitySlug) {
        if (this._instance) {
            this._instance.dispose();
        }
        this._instance = new VolumeViewer(this.containerPrefix);
        this._instance.init(modalitySlug);
    },

    dispose: function() {
        if (this._instance) {
            this._instance.dispose();
            this._instance = null;
        }
    },

    clearCache: function() {
        if (this._instance) {
            this._instance.clearCache();
        }
    },

    refreshAllViews: function() {
        if (this._instance) {
            this._instance.refreshAllViews();
        }
    },

    loadPanoramicImage: function() {
        if (this._instance) {
            this._instance.interaction.loadPanoramicImage();
        }
    },

    forceRefreshPanoramic: function() {
        if (this._instance) {
            this._instance.forceRefreshPanoramic();
        }
    },

    // Proxy common properties
    get initialized() {
        return this._instance ? this._instance.initialized : false;
    },

    get loading() {
        return this._instance ? this._instance.loading : false;
    },

    get volumeData() {
        return this._instance ? this._instance.volumeData : null;
    },

    get dimensions() {
        return this._instance ? this._instance.dimensions : null;
    },

    get panoramicLoaded() {
        return this._instance ? this._instance.panoramicLoaded : false;
    },
    set panoramicLoaded(val) {
        if (this._instance) {
            this._instance.panoramicLoaded = val;
        }
    }
};

// Export class for direct use
window.VolumeViewer = VolumeViewer;
