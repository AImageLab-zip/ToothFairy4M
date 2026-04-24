/**
 * Panoramic Viewer
 * Handles display and interaction with panoramic images
 */

window.PanoramicViewer = {
    initialized: false,
    patientId: null,
    
    init: function(patientId) {
        this.patientId = patientId;
        this.initialized = true;
        console.debug('Panoramic Viewer initialized for patient', patientId);
    },
    
    getApiUrl: function() {
        const namespace = window.projectNamespace || 'maxillo';
        return `/${namespace}/api/patient/${this.patientId}/panoramic/`;
    },

    loadInto: function(config) {
        if (!this.patientId) {
            console.error('No patient ID set for panoramic viewer');
            return;
        }

        const loading = document.getElementById(config.loadingId);
        const content = document.getElementById(config.contentId);
        const error = document.getElementById(config.errorId);
        const img = document.getElementById(config.imageId);
        
        if (!img) {
            console.debug('Panoramic image element not found for target:', config.imageId);
            return;
        }
        
        // Show loading state
        if (loading) loading.style.display = 'block';
        if (content) content.style.display = 'none';
        if (error) error.style.display = 'none';
        
        // Setup handlers before setting src
        img.onload = () => {
            console.debug('Panoramic image loaded successfully');
            if (loading) loading.style.display = 'none';
            if (content) content.style.display = 'block';
        };
        
        img.onerror = () => {
            console.error('Failed to load panoramic image');
            if (loading) loading.style.display = 'none';
            if (error) error.style.display = 'block';
        };
        
        // Add click handler for fullscreen view
        img.onclick = () => {
            this.showFullscreenImage(img.src, config.title || 'Panoramic');
        };
        
        // Set the image source (this triggers loading)
        img.src = this.getApiUrl();
        
        // Handle case where image is already cached
        if (img.complete && img.naturalHeight !== 0) {
            console.debug('Panoramic image already loaded from cache');
            if (loading) loading.style.display = 'none';
            if (content) content.style.display = 'block';
        }
    },

    load: function() {
        this.loadInto({
            loadingId: 'panoramicLoading',
            contentId: 'panoramicContent',
            errorId: 'panoramicError',
            imageId: 'panoramicStandaloneImage',
            title: 'Panoramic'
        });
    },

    loadInlineForCBCT: function() {
        this.loadInto({
            loadingId: 'cbctPanoramicLoading',
            contentId: 'cbctPanoramicContent',
            errorId: 'cbctPanoramicError',
            imageId: 'cbctPanoramicImage',
            title: 'CBCT Panoramic'
        });
    },
    
    showFullscreenImage: function(src, title) {
        const modal = document.getElementById('fullscreenImageModal');
        const modalTitle = document.getElementById('fullscreenImageModalLabel');
        const fullscreenImg = document.getElementById('fullscreenImage');
        
        if (modalTitle) modalTitle.textContent = title || 'Image Viewer';
        if (fullscreenImg) fullscreenImg.src = src;
        
        if (modal) {
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
        }
    }
};


