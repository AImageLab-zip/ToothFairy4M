class VocalCaptionRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recording = false;
        this.startTime = null;
        this.timerInterval = null;
        this.currentAudio = null;
        
        this.initializeElements();
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
    
    attachEventListeners() {
        this.startBtn.addEventListener('click', () => this.startRecording());
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
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            
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
            alert('Unable to access microphone. Please check permissions.');
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