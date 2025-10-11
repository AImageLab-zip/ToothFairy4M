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
    
    load: function() {
        if (!this.patientId) {
            console.error('No patient ID set for panoramic viewer');
            return;
        }
        
        const loading = document.getElementById('panoramicLoading');
        const content = document.getElementById('panoramicContent');
        const error = document.getElementById('panoramicError');
        const img = document.getElementById('panoramicStandaloneImage');
        
        if (!img) {
            console.error('Panoramic image element not found');
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
            this.showFullscreenImage(img.src, 'Panoramic');
        };
        
        // Set the image source (this triggers loading)
        img.src = `/maxillo/api/patient/${this.patientId}/panoramic/`;
        
        // Handle case where image is already cached
        if (img.complete && img.naturalHeight !== 0) {
            console.debug('Panoramic image already loaded from cache');
            if (loading) loading.style.display = 'none';
            if (content) content.style.display = 'block';
        }
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



