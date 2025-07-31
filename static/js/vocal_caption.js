class VocalCaptionRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.currentAudio = null;
        
        // Simple state tracking
        this.isRecording = false;
        this.isPaused = false;
        
        // Simple timing - just track total duration
        this.recordingStartTime = null;
        this.totalPausedDuration = 0;
        this.currentPauseStart = null;
        this.timerInterval = null;
        
        this.initializeElements();
        this.checkBrowserSupport();
        this.attachEventListeners();
    }
    
    initializeElements() {
        this.startBtn = document.getElementById('startRecording');
        this.pauseBtn = document.getElementById('pauseRecording');
        this.saveBtn = document.getElementById('saveRecording');
        this.discardBtn = document.getElementById('discardRecording');
        this.recordingInfo = document.querySelector('.recording-info');
        this.recordingTimer = document.getElementById('recordingTimer');
        this.progressBar = document.querySelector('.recording-progress .progress-bar');
        this.audioPlayback = document.querySelector('.audio-playback');
        this.modalityIndicator = document.getElementById('modalityIndicator');
        
        if (!this.startBtn || !this.recordingTimer || !this.progressBar) {
            console.warn('Some recording UI elements not found');
        }
    }
    
    checkBrowserSupport() {
        const isSupported = navigator.mediaDevices && 
                           navigator.mediaDevices.getUserMedia && 
                           window.MediaRecorder;
        
        if (!isSupported) {
            console.warn('Voice recording not supported in this browser');
            if (this.startBtn) {
                this.startBtn.disabled = true;
                this.startBtn.title = 'Voice recording not supported';
            }
        }
    }
    
    attachEventListeners() {
        if (!this.startBtn) return;
        
        const isSupported = navigator.mediaDevices && 
                           navigator.mediaDevices.getUserMedia && 
                           window.MediaRecorder;
        
        if (isSupported) {
            this.startBtn.addEventListener('click', () => this.startRecording());
            this.pauseBtn?.addEventListener('click', () => this.togglePause());
            this.saveBtn?.addEventListener('click', () => this.saveRecording());
            this.discardBtn?.addEventListener('click', () => this.discardRecording());
        } else {
            this.startBtn.addEventListener('click', () => {
                alert('Voice recording is not supported. Please use HTTPS and a modern browser.');
            });
        }
        
        // Audio playback and delete controls
        document.addEventListener('click', (e) => {
            if (e.target.closest('.btn-play-audio')) {
                const audioUrl = e.target.closest('.btn-play-audio').dataset.audioUrl;
                this.playAudio(audioUrl);
            }
            
            if (e.target.closest('.btn-delete-caption')) {
                const captionId = e.target.closest('.btn-delete-caption').dataset.captionId;
                this.deleteCaption(captionId);
            }
            
            // Caption toggle functionality
            if (e.target.closest('.caption-toggle-btn')) {
                const captionId = e.target.closest('.caption-toggle-btn').dataset.captionId;
                this.toggleCaption(captionId);
            }
        });
    }
    
    getCurrentModality() {
        const cbctTab = document.querySelector('#cbct-tab');
        const iosTab = document.querySelector('#ios-tab');
        
        if (cbctTab && cbctTab.classList.contains('active')) {
            return { value: 'cbct', display: 'CBCT' };
        } else if (iosTab && iosTab.classList.contains('active')) {
            return { value: 'ios', display: 'Intra-Oral Scans' };
        }
        
        return { value: 'cbct', display: 'CBCT' };
    }
    
    async startRecording() {
        try {
            // Get microphone access
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Configure MediaRecorder
            const options = this.getRecorderOptions();
            this.mediaRecorder = new MediaRecorder(this.stream, options);
            
            // Setup data collection
            this.audioChunks = [];
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            // Start recording
            this.mediaRecorder.start(1000); // Collect data every second
            
            // Set state
            this.isRecording = true;
            this.isPaused = false;
            this.recordingStartTime = Date.now();
            this.totalPausedDuration = 0;
            this.currentPauseStart = null;
            
            // Update UI and start timer
            this.updateUI();
            this.startTimer();
            
            // Update modality indicator
            const modality = this.getCurrentModality();
            if (this.modalityIndicator) {
                this.modalityIndicator.textContent = modality.display;
            }
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.handleRecordingError(error);
            this.cleanup();
        }
    }
    
    togglePause() {
        if (!this.mediaRecorder || !this.isRecording) return;
        
        if (this.isPaused) {
            // Resume
            this.mediaRecorder.resume();
            this.isPaused = false;
            
            // Add the pause duration to total
            if (this.currentPauseStart) {
                this.totalPausedDuration += Date.now() - this.currentPauseStart;
                this.currentPauseStart = null;
            }
            
            this.pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            this.pauseBtn.title = 'Pause';
        } else {
            // Pause
            this.mediaRecorder.pause();
            this.isPaused = true;
            this.currentPauseStart = Date.now();
            
            this.pauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            this.pauseBtn.title = 'Resume';
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            if (this.isPaused) {
                this.mediaRecorder.resume();
            }
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.isPaused = false;
            this.stopTimer();
        }
        
        this.cleanup();
    }
    
    async saveRecording() {
        // Always stop recording first if it's running
        if (this.isRecording) {
            // Get final data chunk before stopping
            this.mediaRecorder.requestData();
            
            // Wait for final data and stop
            await new Promise(resolve => {
                const handleFinalData = (event) => {
                    if (event.data.size > 0) {
                        this.audioChunks.push(event.data);
                    }
                    this.mediaRecorder.removeEventListener('dataavailable', handleFinalData);
                    resolve();
                };
                this.mediaRecorder.addEventListener('dataavailable', handleFinalData);
                this.stopRecording();
            });
        }
        
        if (this.audioChunks.length === 0) {
            alert('No audio recorded. Please record something before saving.');
            return;
        }
        
        try {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            const duration = this.getTotalDuration();
            const modality = this.getCurrentModality();
            
            const formData = new FormData();
            formData.append('audio_file', audioBlob, 'recording.webm');
            formData.append('duration', duration.toFixed(2));
            formData.append('modality', modality.value);
            
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
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `Upload failed (${response.status})`);
            }
        } catch (error) {
            console.error('Error saving recording:', error);
            alert(`Failed to save recording: ${error.message}`);
            this.resetUI();
        }
    }
    
    discardRecording() {
        this.stopRecording();
        this.resetUI();
    }
    
    getTotalDuration() {
        if (!this.recordingStartTime) return 0;
        
        const now = Date.now();
        const totalElapsed = now - this.recordingStartTime;
        
        // Calculate current pause duration if paused
        let currentPauseDuration = 0;
        if (this.isPaused && this.currentPauseStart) {
            currentPauseDuration = now - this.currentPauseStart;
        }
        
        const totalPaused = this.totalPausedDuration + currentPauseDuration;
        return (totalElapsed - totalPaused) / 1000; // Convert to seconds
    }
    
    startTimer() {
        this.timerInterval = setInterval(() => {
            const duration = this.getTotalDuration();
            this.updateTimerDisplay(duration);
        }, 100);
    }
    
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    
    updateTimerDisplay(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        
        if (this.recordingTimer) {
            this.recordingTimer.textContent = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        
        if (this.progressBar) {
            const progress = Math.min((seconds / 300) * 100, 100); // Max 5 minutes
            this.progressBar.style.width = `${progress}%`;
            
            // Update color based on duration
            this.progressBar.classList.remove('duration-short', 'duration-medium', 'duration-good');
            if (seconds < 30) {
                this.progressBar.classList.add('duration-short');
            } else if (seconds <= 45) {
                this.progressBar.classList.add('duration-medium');
            } else {
                this.progressBar.classList.add('duration-good');
            }
        }
        
        // Auto-save at 5 minutes
        if (seconds >= 300) {
            this.saveRecording();
        }
    }
    
    updateUI() {
        if (this.isRecording) {
            this.startBtn?.classList.add('d-none');
            this.recordingInfo?.classList.remove('d-none');
            this.pauseBtn?.classList.remove('d-none');
        } else {
            this.resetUI();
        }
    }
    
    resetUI() {
        this.startBtn?.classList.remove('d-none');
        this.recordingInfo?.classList.add('d-none');
        this.audioPlayback?.classList.add('d-none');
        this.pauseBtn?.classList.add('d-none');
        
        if (this.recordingTimer) {
            this.recordingTimer.textContent = '00:00';
        }
        
        if (this.progressBar) {
            this.progressBar.style.width = '0%';
            this.progressBar.classList.remove('duration-short', 'duration-medium', 'duration-good');
        }
        
        if (this.pauseBtn) {
            this.pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            this.pauseBtn.title = 'Pause';
        }
        
        // Reset state
        this.audioChunks = [];
        this.recordingStartTime = null;
        this.totalPausedDuration = 0;
        this.currentPauseStart = null;
        this.isRecording = false;
        this.isPaused = false;
    }
    
    cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.mediaRecorder = null;
    }
    
    getRecorderOptions() {
        const options = {
            audioBitsPerSecond: 128000
        };
        
        // Try preferred formats in order
        const formats = ['audio/webm', 'audio/mp4', 'audio/ogg'];
        for (const format of formats) {
            if (MediaRecorder.isTypeSupported(format)) {
                options.mimeType = format;
                break;
            }
        }
        
        return options;
    }
    
    handleRecordingError(error) {
        let message = 'Unable to access microphone. ';
        
        switch (error.name) {
            case 'NotAllowedError':
                message += 'Please allow microphone access in your browser settings.';
                break;
            case 'NotFoundError':
                message += 'No microphone found. Please connect a microphone.';
                break;
            case 'NotSupportedError':
                message += 'This feature requires HTTPS or a modern browser.';
                break;
            case 'NotReadableError':
                message += 'Microphone is already in use by another application.';
                break;
            default:
                message += 'Please check your browser settings and permissions.';
        }
        
        alert(message);
    }
    
    addCaptionToList(caption) {
        const captionListContainer = document.querySelector('.voice-captions-list');
        if (!captionListContainer) return;
        
        // Remove "no captions" message if it exists
        const noCaptions = captionListContainer.querySelector('.no-captions');
        if (noCaptions) {
            noCaptions.remove();
        }
        
        // Create or get the caption list container
        let captionList = captionListContainer.querySelector('.caption-list-compact');
        if (!captionList) {
            captionList = document.createElement('div');
            captionList.className = 'caption-list-compact';
            captionListContainer.appendChild(captionList);
        }
        
        // Determine processing status display
        let captionTextSection;
        if (caption.processing_status === 'processing') {
            captionTextSection = `
                <small class="text-muted">
                    <i class="fas fa-spinner fa-spin me-1"></i>
                    Converting speech to text...
                </small>
            `;
        } else if (caption.processing_status === 'failed') {
            captionTextSection = `
                <small class="text-muted">
                    <i class="fas fa-exclamation-triangle me-1 text-danger"></i>
                    Processing failed
                </small>
            `;
        } else if (caption.is_processed && caption.text_caption) {
            const isLong = caption.text_caption.length > 100;
            const truncatedText = isLong ? caption.text_caption.substring(0, 100) + '...' : caption.text_caption;
            
            captionTextSection = `
                <div class="caption-text-display">
                    <div class="caption-text-preview">
                        <small class="text-dark">${truncatedText}</small>
                        ${isLong ? `
                            <button class="btn btn-link btn-sm p-0 caption-toggle-btn" data-caption-id="${caption.id}">
                                <small class="text-primary">more</small>
                            </button>
                        ` : ''}
                    </div>
                    ${isLong ? `
                        <div class="caption-text-full" id="caption-full-${caption.id}" style="display: none;">
                            <small class="text-dark">${caption.text_caption}</small>
                            <button class="btn btn-link btn-sm p-0 caption-toggle-btn" data-caption-id="${caption.id}">
                                <small class="text-primary">less</small>
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            captionTextSection = `
                <small class="text-muted">
                    <i class="fas fa-clock me-1"></i>
                    Preprocessing audio...
                </small>
            `;
        }
        
        // Create the caption HTML matching the existing structure
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
                        ${caption.audio_url ? `
                            <button class="btn btn-outline-primary btn-sm btn-play-audio" data-audio-url="${caption.audio_url}" title="Play">
                                <i class="fas fa-play" style="font-size: 0.75rem;"></i>
                            </button>
                        ` : ''}
                        <button class="btn btn-outline-danger btn-sm btn-delete-caption" data-caption-id="${caption.id}" title="Delete">
                            <i class="fas fa-trash" style="font-size: 0.75rem;"></i>
                        </button>
                    </div>
                </div>
                
                <div class="caption-text-compact mt-1">
                    ${captionTextSection}
                </div>
            </div>
        `;
        
        captionList.insertAdjacentHTML('afterbegin', captionHtml);
    }

    toggleCaption(captionId) {
        const previewElement = document.querySelector(`[data-caption-id="${captionId}"] .caption-text-preview`);
        const fullElement = document.getElementById(`caption-full-${captionId}`);
        
        if (previewElement && fullElement) {
            if (fullElement.style.display === 'none') {
                // Show full caption
                previewElement.style.display = 'none';
                fullElement.style.display = 'block';
            } else {
                // Show preview
                previewElement.style.display = 'block';
                fullElement.style.display = 'none';
            }
        }
    }

    async deleteCaption(captionId) {
        if (!confirm('Are you sure you want to delete this voice caption?')) return;
        
        try {
            const response = await fetch(`${window.location.pathname}voice-caption/${captionId}/delete/`, {
                method: 'POST',
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
                    const captionListContainer = document.querySelector('.voice-captions-list');
                    captionList.remove();
                    const noCaptionsHtml = `
                        <div class="no-captions">
                            <p class="text-muted mb-0 text-center">
                                <i class="fas fa-microphone me-1"></i>
                                No voice captions yet. Click the record button to start!
                            </p>
                        </div>
                    `;
                    captionListContainer.innerHTML = noCaptionsHtml;
                }
            } else {
                throw new Error('Delete failed');
            }
        } catch (error) {
            console.error('Error deleting caption:', error);
            alert('Failed to delete caption. Please try again.');
        }
    }
    
    playAudio(audioUrl) {
        if (this.currentAudio) {
            this.currentAudio.pause();
        }
        
        this.currentAudio = new Audio(audioUrl);
        this.currentAudio.play().catch(error => {
            console.error('Error playing audio:', error);
            alert('Unable to play audio file.');
        });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.recorder = new VocalCaptionRecorder();
}); 