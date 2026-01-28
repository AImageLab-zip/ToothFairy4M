/**
 * NiiVueViewer - A wrapper class for NiiVue single-view volume display
 *
 * Purpose: Provides a clean API for viewer_grid.js to use NiiVue for
 * medical volume visualization. Wraps the NiiVue library with methods
 * for initialization, orientation control, and slice navigation.
 *
 * Usage:
 *   const viewer = new NiiVueViewer('canvas-element-id');
 *   await viewer.init('t1', volumeBlob);
 *   viewer.setOrientation('sagittal');
 *   viewer.dispose();
 *
 * Dependencies: NiiVue library must be loaded (window.niivue)
 */

class NiiVueViewer {
    /**
     * Create a NiiVueViewer instance
     * @param {string} containerId - The ID of the canvas element to render into
     */
    constructor(containerId) {
        this.containerId = containerId;
        this.nv = null;
        this.initialized = false;
        this.currentOrientation = 'axial';
        this.modalitySlug = null;
    }

    /**
     * Initialize the viewer with a volume
     * @param {string} modalitySlug - The modality identifier (e.g., 't1', 't2', 'flair')
     * @param {Blob} fileBlob - The NIfTI volume file as a Blob
     * @returns {Promise<void>}
     */
    async init(modalitySlug, fileBlob) {
        if (this.initialized) {
            await this.dispose();
        }

        // Verify NiiVue is available
        if (typeof window.niivue === 'undefined' || typeof window.niivue.Niivue !== 'function') {
            throw new Error('NiiVue library not loaded. Ensure niivue.min.js is included before this script.');
        }

        this.modalitySlug = modalitySlug;

        // Create NiiVue instance with single-view mode (multiplanar: false)
        this.nv = new window.niivue.Niivue({
            backColor: [0, 0, 0, 1],       // Black background (medical imaging convention)
            show3Dcrosshair: false,         // No 3D crosshair in single view
            multiplanarForceRender: false,  // Single view mode
            isColorbar: false,              // No colorbar for simple viewing
            logging: false                  // Disable console logging
        });

        // Attach to canvas element
        const canvas = document.getElementById(this.containerId);
        if (!canvas) {
            throw new Error(`Canvas element with id '${this.containerId}' not found`);
        }

        await this.nv.attachToCanvas(canvas);

        // Convert blob to ArrayBuffer and pass via urlImageData.
        // NiiVue extracts the file extension from the url field for format
        // detection — blob URLs have no extension, so we use a synthetic
        // filename URL and supply the actual data through urlImageData.
        const arrayBuffer = await fileBlob.arrayBuffer();

        await this.nv.loadVolumes([{
            url: modalitySlug + '.nii.gz',
            urlImageData: arrayBuffer
        }]);

        // Set default orientation to axial
        this.setOrientation('axial');

        this.initialized = true;
    }

    /**
     * Set the viewing orientation
     * @param {string} orientation - 'axial', 'sagittal', or 'coronal'
     */
    setOrientation(orientation) {
        if (!this.nv) {
            console.warn('NiiVueViewer: Cannot set orientation - viewer not initialized');
            return;
        }

        const normalizedOrientation = orientation.toLowerCase();

        // Map orientation names to NiiVue slice type constants
        // NiiVue uses: sliceTypeAxial=2, sliceTypeSagittal=1, sliceTypeCoronal=0
        let sliceType;
        let actualOrientation = normalizedOrientation;
        switch (normalizedOrientation) {
            case 'axial':
                sliceType = this.nv.sliceTypeAxial;
                break;
            case 'sagittal':
                sliceType = this.nv.sliceTypeSagittal;
                break;
            case 'coronal':
                sliceType = this.nv.sliceTypeCoronal;
                break;
            default:
                console.warn(`NiiVueViewer: Unknown orientation '${orientation}', defaulting to axial`);
                sliceType = this.nv.sliceTypeAxial;
                actualOrientation = 'axial';
        }

        this.nv.setSliceType(sliceType);
        this.currentOrientation = actualOrientation;
    }

    /**
     * Get the current slice index (for Phase 5 synchronization)
     * @returns {number} The current slice index, or -1 if not initialized
     */
    getSliceIndex() {
        if (!this.nv || !this.initialized) {
            return -1;
        }

        // NiiVue stores crosshair position as fraction [0-1] for each axis
        // Convert to slice index based on current orientation
        const crosshair = this.nv.scene.crosshairPos;
        const volumes = this.nv.volumes;

        if (!volumes || volumes.length === 0) {
            return -1;
        }

        const dims = volumes[0].dimsRAS;

        switch (this.currentOrientation) {
            case 'axial':
                // Z axis (dim 3)
                return Math.round(crosshair[2] * (dims[3] - 1));
            case 'sagittal':
                // X axis (dim 1)
                return Math.round(crosshair[0] * (dims[1] - 1));
            case 'coronal':
                // Y axis (dim 2)
                return Math.round(crosshair[1] * (dims[2] - 1));
            default:
                return -1;
        }
    }

    /**
     * Set the current slice index (for Phase 5 synchronization)
     * @param {number} index - The slice index to navigate to
     */
    setSliceIndex(index) {
        if (!this.nv || !this.initialized) {
            console.warn('NiiVueViewer: Cannot set slice index - viewer not initialized');
            return;
        }

        const volumes = this.nv.volumes;
        if (!volumes || volumes.length === 0) {
            return;
        }

        const dims = volumes[0].dimsRAS;
        const crosshair = [...this.nv.scene.crosshairPos];

        switch (this.currentOrientation) {
            case 'axial':
                // Z axis (dim 3)
                crosshair[2] = Math.min(Math.max(index / (dims[3] - 1), 0), 1);
                break;
            case 'sagittal':
                // X axis (dim 1)
                crosshair[0] = Math.min(Math.max(index / (dims[1] - 1), 0), 1);
                break;
            case 'coronal':
                // Y axis (dim 2)
                crosshair[1] = Math.min(Math.max(index / (dims[2] - 1), 0), 1);
                break;
        }

        this.nv.scene.crosshairPos = crosshair;
        this.nv.updateGLVolume();
    }

    /**
     * Get the total number of slices in the current orientation
     * @returns {number} The total slice count, or 0 if not initialized
     */
    getSliceCount() {
        if (!this.nv || !this.initialized) {
            return 0;
        }

        const volumes = this.nv.volumes;
        if (!volumes || volumes.length === 0) {
            return 0;
        }

        const dims = volumes[0].dimsRAS;

        switch (this.currentOrientation) {
            case 'axial':
                return dims[3];
            case 'sagittal':
                return dims[1];
            case 'coronal':
                return dims[2];
            default:
                return 0;
        }
    }

    /**
     * Check if the viewer is initialized and ready
     * @returns {boolean}
     */
    isReady() {
        return this.initialized && this.nv !== null;
    }

    /**
     * Get the current orientation
     * @returns {string} 'axial', 'sagittal', or 'coronal'
     */
    getOrientation() {
        return this.currentOrientation;
    }

    /**
     * Force a redraw of the viewer
     */
    redraw() {
        if (this.nv) {
            this.nv.drawScene();
        }
    }

    /**
     * Dispose of the viewer and clean up resources
     */
    dispose() {
        if (this.nv) {
            // Clear all volumes
            if (this.nv.volumes && this.nv.volumes.length > 0) {
                this.nv.closeVolume(0);
            }
            this.nv = null;
        }

        this.initialized = false;
        this.currentOrientation = 'axial';
        this.modalitySlug = null;
    }
}

// Expose as global for viewer_grid.js to use
window.NiiVueViewer = NiiVueViewer;
