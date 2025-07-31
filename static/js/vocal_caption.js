class VocalCaptionRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recording = false;
        this.startTime = null;
        this.timerInterval = null;
        this.currentAudio = null;
        
        this.initializeElements();
        this.checkBrowserSupport();
        this.attachEventListeners();
    }
    
    initializeElements() {
        this.startBtn = document.getElementById('startRecording');
        this.saveBtn = document.getElementById('saveRecording');
        this.discardBtn = document.getElementById('discardRecording');
        this.recordingInfo = document.getElementById('recordingInfo');
        this.recordingTimer = document.getElementById('recordingTimer');
        this.modalityIndicator = document.getElementById('modalityIndicator');
        this.progressBar = document.getElementById('recordingProgress');
        this.audioPlayback = document.getElementById('audioPlayback');
    }
    
    checkBrowserSupport() {
        // Check if all required APIs are supported
        const isSupported = navigator.mediaDevices && 
                           navigator.mediaDevices.getUserMedia && 
                           window.MediaRecorder;
        
        // Check if we're in development mode (HTTP on remote)
        const isDevelopment = window.location.protocol === 'http:' && 
                             !window.location.hostname.includes('localhost') &&
                             !window.location.hostname.includes('127.0.0.1');
        
        if (!isSupported) {
            // Disable the record button and show a helpful message
            if (this.startBtn) {
                this.startBtn.disabled = true;
                
                if (isDevelopment) {
                    this.startBtn.innerHTML = '<i class="fas fa-microphone me-1"></i>Dev Mode';
                    this.startBtn.classList.add('btn-warning');
                    this.startBtn.classList.remove('btn-primary');
                    this.startBtn.title = 'Voice recording disabled in HTTP development mode';
                } else {
                    this.startBtn.innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i>Not Supported';
                    this.startBtn.classList.add('btn-secondary');
                    this.startBtn.classList.remove('btn-primary');
                    this.startBtn.title = 'Voice recording requires HTTPS and a modern browser';
                }
            }
            
            // Add a small notice below the button
            let noticeHtml = '';
            if (isDevelopment) {
                noticeHtml = `
                    <div class="mt-2 text-center">
                        <small class="text-warning">
                            <i class="fas fa-tools me-1"></i>
                            Voice recording disabled in HTTP development mode
                        </small>
                    </div>
                `;
            } else {
                noticeHtml = `
                    <div class="mt-2 text-center">
                        <small class="text-muted">
                            <i class="fas fa-info-circle me-1"></i>
                            Voice recording requires HTTPS connection
                        </small>
                    </div>
                `;
            }
            
            if (this.startBtn && this.startBtn.parentNode) {
                this.startBtn.parentNode.insertAdjacentHTML('afterend', noticeHtml);
            }
        }
    }
    
    attachEventListeners() {
        // Check if we're in development mode (HTTP on remote)
        const isDevelopment = window.location.protocol === 'http:' && 
                             !window.location.hostname.includes('localhost') &&
                             !window.location.hostname.includes('127.0.0.1');
        
        // Only attach recording listener if APIs are supported
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder) {
            this.startBtn.addEventListener('click', () => this.startRecording());
        } else {
            this.startBtn.addEventListener('click', () => {
                if (isDevelopment) {
                    alert('Voice recording is disabled in HTTP development mode. Use browser flags or HTTPS for testing.');
                } else {
                    alert('Voice recording is not available. This feature requires HTTPS and a modern browser.');
                }
            });
        }
        
        this.saveBtn.addEventListener('click', () => this.saveRecording());
        this.discardBtn.addEventListener('click', () => this.discardRecording());
        
        // Compact list audio controls
        document.addEventListener('click', (e) => {
            if (e.target.closest('.btn-play-audio')) {
                const audioUrl = e.target.closest('.btn-play-audio').dataset.audioUrl;
                this.playAudio(audioUrl);
            }
            
            if (e.target.closest('.btn-delete-caption')) {
                const captionId = e.target.closest('.btn-delete-caption').dataset.captionId;
                this.deleteCaption(captionId);
            }
        });
    }
    
    getCurrentModality() {
        // Check which viewer is selected
        const iosViewer = document.getElementById('iosViewer');
        const cbctViewer = document.getElementById('cbctViewer');
        
        if (iosViewer && iosViewer.checked) {
            return { value: 'ios', display: 'IOS' };
        } else if (cbctViewer && cbctViewer.checked) {
            return { value: 'cbct', display: 'CBCT' };
        }
        
        // Default to CBCT if no selection or viewers not found
        return { value: 'cbct', display: 'CBCT' };
    }
    
    async startRecording() {
        // Early return if APIs not supported - prevent any execution
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
            alert('Voice recording is not supported. Please use HTTPS and a modern browser.');
            return;
        }
        
        try {
            // Additional check for MediaDevices API support
            if (!navigator.mediaDevices) {
                throw new Error('MediaRecorder API not available. This feature requires HTTPS connection.');
            }
            
            if (!navigator.mediaDevices.getUserMedia) {
                throw new Error('getUserMedia not supported. Please use a modern browser with HTTPS.');
            }
            
            // Check for MediaRecorder support
            if (!window.MediaRecorder) {
                throw new Error('MediaRecorder API not supported in this browser.');
            }
            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Check if webm is supported, fallback to default
            let options = {};
            if (MediaRecorder.isTypeSupported('audio/webm')) {
                options.mimeType = 'audio/webm';
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                options.mimeType = 'audio/mp4';
            } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                options.mimeType = 'audio/ogg';
            }
            
            this.mediaRecorder = new MediaRecorder(stream, options);
            
            this.audioChunks = [];
            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };
            
            this.mediaRecorder.start();
            this.recording = true;
            this.startTime = Date.now();
            
            // Update modality indicator
            const modality = this.getCurrentModality();
            this.modalityIndicator.textContent = modality.display;
            
            this.updateUI();
            this.startTimer();
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            
            let errorMessage = 'Unable to access microphone. ';
            
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Please allow microphone access in your browser settings.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'No microphone found. Please connect a microphone.';
            } else if (error.name === 'NotSupportedError' || error.message.includes('not supported')) {
                errorMessage += 'This feature requires HTTPS or a modern browser.';
            } else if (error.name === 'NotReadableError') {
                errorMessage += 'Microphone is already in use by another application.';
            } else {
                errorMessage += 'Please check your browser settings and permissions.';
            }
            
            alert(errorMessage);
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.recording) {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            this.recording = false;
            this.stopTimer();
        }
    }
    
    async saveRecording() {
        this.stopRecording();
        
        if (this.audioChunks.length === 0) return;
        
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const duration = (Date.now() - this.startTime) / 1000;
        const modality = this.getCurrentModality();
        
        const formData = new FormData();
        formData.append('audio_file', audioBlob, 'recording.webm');
        formData.append('duration', duration);
        formData.append('modality', modality.value);
        
        try {
            const response = await fetch(window.location.pathname + 'voice-caption/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
                },
                body: formData
            });
            
            if (response.ok) {
                const result = await response.json();
                this.addCaptionToList(result.caption);
                this.resetUI();
            } else {
                throw new Error('Upload failed');
            }
        } catch (error) {
            console.error('Error saving recording:', error);
            alert('Failed to save recording. Please try again.');
            this.resetUI();
        }
    }
    
    discardRecording() {
        this.stopRecording();
        this.resetUI();
    }
    
    playAudio(audioUrl) {
        // Stop any currently playing audio
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
        }
        
        this.currentAudio = new Audio(audioUrl);
        this.currentAudio.play();
    }
    
    async deleteCaption(captionId) {
        if (!confirm('Are you sure you want to delete this voice caption?')) return;
        
        try {
            const response = await fetch(`${window.location.pathname}voice-caption/${captionId}/delete/`, {
                method: 'DELETE',
                headers: {
                    'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
                }
            });
            
            if (response.ok) {
                const captionElement = document.querySelector(`[data-caption-id="${captionId}"]`);
                if (captionElement) {
                    captionElement.remove();
                }
                
                // Show no captions message if list is empty
                const captionList = document.querySelector('.caption-list-compact');
                if (captionList && captionList.children.length === 0) {
                    const noCaptionsHtml = `
                        <div class="no-captions">
                            <p class="text-muted mb-0 text-center">
                                <i class="fas fa-microphone me-1"></i>
                                No voice captions yet. Click the record button to start!
                            </p>
                        </div>
                    `;
                    captionList.parentElement.innerHTML = noCaptionsHtml;
                }
            } else {
                throw new Error('Delete failed');
            }
        } catch (error) {
            console.error('Error deleting caption:', error);
            alert('Failed to delete caption. Please try again.');
        }
    }
    
    startTimer() {
        this.timerInterval = setInterval(() => {
            const elapsed = (Date.now() - this.startTime) / 1000;
            this.updateTimer(elapsed);
        }, 100);
    }
    
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    
    updateTimer(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        this.recordingTimer.textContent = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        // Update progress bar (max 60 seconds for visual purposes)
        const progress = Math.min((seconds / 60) * 100, 100);
        this.progressBar.style.width = `${progress}%`;
        
        // Update progress bar color based on duration
        this.progressBar.classList.remove('duration-short', 'duration-medium', 'duration-good');
        
        if (seconds < 30) {
            this.progressBar.classList.add('duration-short');
        } else if (seconds <= 45) {
            this.progressBar.classList.add('duration-medium');
        } else {
            this.progressBar.classList.add('duration-good');
        }
    }
    
    updateUI() {
        if (this.recording) {
            this.startBtn.classList.add('d-none');
            this.recordingInfo.classList.remove('d-none');
        } else {
            this.resetUI();
        }
    }
    
    resetUI() {
        this.startBtn.classList.remove('d-none');
        this.recordingInfo.classList.add('d-none');
        this.audioPlayback.classList.add('d-none');
        
        this.recordingTimer.textContent = '00:00';
        this.progressBar.style.width = '0%';
        this.progressBar.classList.remove('duration-short', 'duration-medium', 'duration-good');
    }
    
    addCaptionToList(caption) {
        const captionListContainer = document.querySelector('.voice-captions-list');
        const noCaptions = captionListContainer.querySelector('.no-captions');
        
        if (noCaptions) {
            noCaptions.remove();
        }
        
        let captionList = captionListContainer.querySelector('.caption-list-compact');
        if (!captionList) {
            captionList = document.createElement('div');
            captionList.className = 'caption-list-compact';
            captionListContainer.appendChild(captionList);
        }
        
        // Determine if caption is processed and has text
        const isProcessed = caption.processing_status === 'completed' && caption.text_caption;
        const expandSection = isProcessed ? `
            <div class="caption-expand-section mt-2">
                <button class="btn btn-link btn-sm p-0 caption-expand-btn" 
                        data-caption-id="${caption.id}" 
                        data-bs-toggle="collapse" 
                        data-bs-target="#caption-${caption.id}" 
                        aria-expanded="false">
                    <small class="text-primary">
                        <i class="fas fa-chevron-down me-1"></i>
                        Read caption
                    </small>
                </button>
                <div class="collapse caption-content" id="caption-${caption.id}">
                    <div class="caption-text-expanded mt-2 p-2">
                        <small class="text-dark">${caption.text_caption}</small>
                    </div>
                </div>
            </div>
        ` : '';
        
        const captionHtml = `
            <div class="caption-item-compact" data-caption-id="${caption.id}">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="caption-info">
                        <small class="text-primary me-2">${caption.user_username}</small>
                        <span class="badge bg-secondary me-1">${caption.modality_display}</span>
                        <span class="badge bg-${caption.quality_color} me-2">${caption.display_duration}</span>
                        <small class="text-muted">${caption.created_at}</small>
                    </div>
                    <div class="caption-actions">
                        <button class="btn btn-outline-primary btn-sm btn-play-audio" data-audio-url="${caption.audio_url}" title="Play">
                            <i class="fas fa-play" style="font-size: 0.75rem;"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-sm btn-delete-caption" data-caption-id="${caption.id}" title="Delete">
                            <i class="fas fa-trash" style="font-size: 0.75rem;"></i>
                        </button>
                    </div>
                </div>
                <div class="caption-text-compact mt-1">
                    <small class="text-muted">
                        <i class="fas fa-spinner fa-spin me-1"></i>
                        Preprocessing audio...
                    </small>
                    ${expandSection}
                </div>
            </div>
        `;
        
        captionList.insertAdjacentHTML('afterbegin', captionHtml);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    new VocalCaptionRecorder();
}); 