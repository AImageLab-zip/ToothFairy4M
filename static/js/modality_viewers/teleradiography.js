/**
 * Teleradiography Viewer
 * Handles display and interaction with teleradiography images
 */

window.TeleradiographyViewer = {
    initialized: false,
    patientId: null,
    
    init: function(patientId) {
        this.patientId = patientId;
        this.initialized = true;
        console.debug('Teleradiography Viewer initialized for patient', patientId);
    },
    
    load: function() {
        if (!this.patientId) {
            console.error('No patient ID set for teleradiography viewer');
            return;
        }
        
        const loading = document.getElementById('teleradiographyLoading');
        const content = document.getElementById('teleradiographyContent');
        const error = document.getElementById('teleradiographyError');
        const img = document.getElementById('teleradiographyImage');
        
        // Show loading state
        if (loading) loading.style.display = 'block';
        if (content) content.style.display = 'none';
        if (error) error.style.display = 'none';
        
        // Make API call to get teleradiography image
        fetch(`/maxillo/api/patient/${this.patientId}/teleradiography/`)
            .then(response => {
                if (loading) loading.style.display = 'none';
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                // Set the image source to the API endpoint
                if (img) {
                    img.src = `/maxillo/api/patient/${this.patientId}/teleradiography/`;
                    img.onload = () => {
                        if (content) content.style.display = 'block';
                    };
                    img.onerror = () => {
                        if (error) error.style.display = 'block';
                    };
                    
                    // Add click handler for fullscreen view
                    img.onclick = () => {
                        this.showFullscreenImage(img.src, 'Teleradiography');
                    };
                }
            })
            .catch(error => {
                console.error('Error loading teleradiography:', error);
                if (loading) loading.style.display = 'none';
                if (error) error.style.display = 'block';
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



