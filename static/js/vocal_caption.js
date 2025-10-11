class VocalCaptionRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.currentAudio = null;
        
        this.isRecording = false;
        this.isPaused = false;
        
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
        this.progressBar = document.querySelector('.progress .progress-bar');
        this.audioPlayback = document.querySelector('.audio-playback');
        this.modalityIndicator = document.getElementById('modalityIndicator');
        
        // Text input elements
        this.voiceInputRadio = document.getElementById('voiceInput');
        this.textInputRadio = document.getElementById('textInput');
        this.audioRecorderCard = document.getElementById('audioRecorderCard');
        this.textInputCard = document.getElementById('textInputCard');
        this.captionTextArea = document.getElementById('captionTextArea');
        this.textCharCount = document.getElementById('textCharCount');
        this.saveTextBtn = document.getElementById('saveTextCaption');
        this.clearTextBtn = document.getElementById('clearTextCaption');
        
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
                this.startBtn.title = 'Voice recording not supported, try to change browser.';
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
                alert('Voice recording is not supported. Please use a modern browser.');
            });
        }
        
        document.addEventListener('click', (e) => {
            if (e.target.closest('.btn-play-audio')) {
                const audioUrl = e.target.closest('.btn-play-audio').dataset.audioUrl;
                this.playAudio(audioUrl);
            }
            
            if (e.target.closest('.btn-delete-caption')) {
                const captionId = e.target.closest('.btn-delete-caption').dataset.captionId;
                this.deleteCaption(captionId);
            }
            
            if (e.target.closest('.btn-edit-caption')) {
                const captionId = e.target.closest('.btn-edit-caption').dataset.captionId;
                this.editCaption(captionId);
            }
            
            if (e.target.closest('.caption-toggle-btn')) {
                const captionId = e.target.closest('.caption-toggle-btn').dataset.captionId;
                this.toggleCaption(captionId);
            }
        });
        
        // Initialize edit modal functionality
        this.initializeEditModal();
        
        // Initialize text input functionality
        this.initializeTextInput();
    }
    
    getCurrentModality() {
        // Prefer the modality toggle group rendered in patient detail
        const toggleGroup = document.getElementById('modalityToggleGroup');
        if (toggleGroup) {
            const checked = toggleGroup.querySelector('input[name="viewerType"]:checked');
            if (checked) {
                const label = toggleGroup.querySelector(`label[for="${checked.id}"]`);
                const value = (label && label.dataset && label.dataset.modality) || checked.id.replace(/^modality_/, '');
                const display = label ? (label.textContent.trim() || value.toUpperCase()) : value.toUpperCase();
                return { value, display };
            }
        }

        // Secondary fallback: any checked viewerType radio anywhere
        const anyChecked = document.querySelector('input[name="viewerType"]:checked');
        if (anyChecked) {
            const fallbackLabel = document.querySelector(`label[for="${anyChecked.id}"]`);
            const value = (fallbackLabel && fallbackLabel.dataset && fallbackLabel.dataset.modality) || anyChecked.id.replace(/^modality_/, '');
            const display = fallbackLabel ? (fallbackLabel.textContent.trim() || value.toUpperCase()) : value.toUpperCase();
            return { value, display };
        }

        // Fallback: infer from visible viewer container (e.g., ios-viewer, cbct-viewer, <slug>-viewer)
        const visibleContainer = document.querySelector('.viewer-container:not([style*="display: none"])');
        if (visibleContainer && visibleContainer.id) {
            const value = visibleContainer.id.replace(/-viewer$/, '');
            // Try finding its toggle label for display text
            let display = value.toUpperCase();
            const tg = document.getElementById('modalityToggleGroup');
            if (tg) {
                const input = tg.querySelector(`#modality_${value}`);
                if (input) {
                    const label = tg.querySelector(`label[for="modality_${value}"]`);
                    if (label) display = label.textContent.trim() || display;
                }
            }
            return { value, display };
        }

        // Global default from Django JSON
        if (window.defaultModality) {
            const slug = window.defaultModality;
            const list = (window.modalities || []);
            const found = Array.isArray(list) ? list.find(m => m.slug === slug) : null;
            const display = found ? (found.label || found.name || slug.toUpperCase()) : slug.toUpperCase();
            return { value: slug, display };
        }

        // Last resort fallback
        return { value: "Undefined", display: "None" };
    }
    
    async startRecording() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            const options = this.getRecorderOptions();
            this.mediaRecorder = new MediaRecorder(this.stream, options);
            
            this.audioChunks = [];
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.start(1000);
            
            this.isRecording = true;
            this.isPaused = false;
            this.recordingStartTime = Date.now();
            this.totalPausedDuration = 0;
            this.currentPauseStart = null;
            
            this.updateUI();
            this.startTimer();
            
            // Update modality indicator
            this.modality = this.getCurrentModality();
            if (this.modalityIndicator) {
                this.modalityIndicator.textContent = this.modality.display;
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
            this.isPaused = true;
            this.stopTimer();
        }
        
        this.cleanup();
    }
    
    async saveRecording() {
        // Stop recording if active
        if (this.isRecording) {
            this.stopRecording();
        }
        
        if (this.audioChunks.length === 0) {
            alert('No audio recorded. Please record something before saving.');
            return;
        }
        
        try {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            const duration = this.getTotalDuration();
            const modality = this.modality;
            
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
        let totalPaused = this.totalPausedDuration;
        
        if (this.isPaused && this.currentPauseStart) {
            totalPaused += now - this.currentPauseStart;
        }
        
        return (totalElapsed - totalPaused) / 1000;
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
            let progress = Math.min((seconds / 120) * 100, 100); // Max 2 minutes
            progress = Math.min(progress, 100);
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
        } else {
            console.log('No progress bar found');
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
                        <span class="badge bg-${caption.is_text_caption ? 'success' : caption.quality_color} me-2">${caption.is_text_caption ? 'Text' : caption.display_duration}</span>
                        <small class="text-muted">${caption.created_at}</small>
                    </div>
                    <div class="caption-actions">
                        ${caption.audio_url ? `
                            <button class="btn btn-outline-primary btn-sm btn-play-audio" data-audio-url="${caption.audio_url}" title="Play">
                                <i class="fas fa-play" style="font-size: 0.75rem;"></i>
                            </button>
                        ` : ''}
                        ${caption.is_processed && caption.text_caption ? `
                            <button class="btn btn-outline-secondary btn-sm btn-edit-caption" data-caption-id="${caption.id}" title="Edit">
                                <i class="fas fa-edit" style="font-size: 0.75rem;"></i>
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
                method: 'DELETE',
                headers: {
                    'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value,
                    'Content-Type': 'application/json'
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
                                <i class="fas fa-comment me-1"></i>
                                No captions yet. Record audio or write text to describe your findings!
                            </p>
                        </div>
                    `;
                    captionListContainer.innerHTML = noCaptionsHtml;
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                
                if (response.status === 403) {
                    if (errorData.code === 'not_owner') {
                        alert('You cannot delete voice captions created by other users.');
                    } else if (errorData.code === 'admin_confirmation_required') {
                        // Admin confirmation required
                        if (confirm(errorData.message + '\n\nClick OK to confirm deletion.')) {
                            // Retry with admin confirmation
                            const confirmResponse = await fetch(`${window.location.pathname}voice-caption/${captionId}/delete/`, {
                                method: 'DELETE',
                                headers: {
                                    'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ admin_confirmed: true })
                            });
                            
                            if (confirmResponse.ok) {
                                // Remove the caption element
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
                                                <i class="fas fa-comment me-1"></i>
                                                No captions yet. Record audio or write text to describe your findings!
                                            </p>
                                        </div>
                                    `;
                                    captionListContainer.innerHTML = noCaptionsHtml;
                                }
                            } else {
                                alert('Failed to delete caption after confirmation.');
                            }
                        }
                    } else {
                        alert('Permission denied: ' + (errorData.error || 'You do not have permission to delete this caption.'));
                    }
                } else {
                    throw new Error('Delete failed');
                }
            }
        } catch (error) {
            console.error('Error deleting caption:', error);
            alert('Failed to delete caption. Please try again.');
        }
    }
    
    playAudio(audioUrl) {
        const playButton = event.target.closest('.btn-play-audio');
        
        if (this.currentAudio && !this.currentAudio.paused) {
            // Stop current audio
            this.currentAudio.pause();
            this.currentAudio = null;
            this.updatePlayButton(playButton, false);
            return;
        }
        
        if (this.currentAudio) {
            this.currentAudio.pause();
        }
        
        this.currentAudio = new Audio(audioUrl);
        
        // Update button to show it's playing
        this.updatePlayButton(playButton, true);
        
        // Add event listeners to reset button when audio ends
        this.currentAudio.addEventListener('ended', () => {
            this.updatePlayButton(playButton, false);
        });
        
        this.currentAudio.addEventListener('error', () => {
            this.updatePlayButton(playButton, false);
        });
        
        this.currentAudio.play().catch(error => {
            console.error('Error playing audio:', error);
            alert('Unable to play audio file.');
            this.updatePlayButton(playButton, false);
        });
    }
    
    updatePlayButton(button, isPlaying) {
        if (!button) return;
        
        const icon = button.querySelector('i');
        if (isPlaying) {
            button.classList.remove('btn-outline-primary');
            button.classList.add('btn-danger');
            button.title = 'Stop';
            icon.className = 'fas fa-stop';
            icon.style.fontSize = '0.75rem';
        } else {
            button.classList.remove('btn-danger');
            button.classList.add('btn-outline-primary');
            button.title = 'Play';
            icon.className = 'fas fa-play';
            icon.style.fontSize = '0.75rem';
        }
    }
    
    initializeEditModal() {
        this.editModal = new bootstrap.Modal(document.getElementById('editTranscriptionModal'));
        this.transcriptionTextarea = document.getElementById('transcriptionText');
        this.saveButton = document.getElementById('saveTranscription');
        this.revertButton = document.getElementById('revertToOriginal');
        
        // Attach event listeners
        this.saveButton.addEventListener('click', () => this.saveTranscription());
        this.revertButton.addEventListener('click', () => this.revertTranscription());
        
        // Store current caption data
        this.currentCaptionId = null;
        this.currentCaptionData = null;
    }
    
    editCaption(captionId) {
        // Find the caption element and extract data
        const captionElement = document.querySelector(`[data-caption-id="${captionId}"]`);
        if (!captionElement) {
            console.error('Caption element not found');
            return;
        }
        
        // Get the FULL transcription text from the full view, not the preview
        const fullTextElement = captionElement.querySelector('.caption-text-full small');
        const previewTextElement = captionElement.querySelector('.caption-text-preview small');
        
        let currentText = '';
        if (fullTextElement) {
            // Use the full text if available
            currentText = fullTextElement.textContent.trim();
        } else if (previewTextElement) {
            // Fallback to preview text if full text not available
            currentText = previewTextElement.textContent.trim();
        } else {
            console.error('Transcription text not found');
            return;
        }
        
        // Extract text without the [edited] badge
        const editedBadge = fullTextElement ? fullTextElement.querySelector('.badge') : previewTextElement.querySelector('.badge');
        if (editedBadge) {
            currentText = currentText.replace(editedBadge.textContent, '').trim();
        }
        
        // Store current caption data
        this.currentCaptionId = captionId;
        this.currentCaptionData = {
            text: currentText,
            isEdited: captionElement.querySelector('.badge.bg-warning') !== null
        };
        
        // Populate modal with full text
        this.transcriptionTextarea.value = currentText;
        
        // Show/hide revert button based on edit status
        if (this.currentCaptionData.isEdited) {
            this.revertButton.style.display = 'block';
        } else {
            this.revertButton.style.display = 'none';
        }
        
        // Show modal
        this.editModal.show();
    }
    
    async saveTranscription() {
        if (!this.currentCaptionId) return;
        
        const newText = this.transcriptionTextarea.value.trim();
        if (!newText) {
            alert('Transcription text cannot be empty');
            return;
        }
        
        try {
            const response = await fetch(`/${window.projectNamespace}/patient/${window.scanId}/voice-caption/${this.currentCaptionId}/edit/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
                },
                body: JSON.stringify({
                    action: 'edit',
                    text: newText
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                
                // Update the caption display
                this.updateCaptionDisplay(this.currentCaptionId, newText, true);
                
                // Show success message
                this.showSavedIndicator();
                
                // Close modal
                this.editModal.hide();
                
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save transcription');
            }
        } catch (error) {
            console.error('Error saving transcription:', error);
            alert('Failed to save transcription: ' + error.message);
        }
    }
    
    async revertTranscription() {
        if (!this.currentCaptionId) return;
        
        if (!confirm('Are you sure you want to revert to the original transcription? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`/${window.projectNamespace}/patient/${this.scanId}/voice-caption/${this.currentCaptionId}/edit/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
                },
                body: JSON.stringify({
                    action: 'revert'
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                
                // Update the caption display
                this.updateCaptionDisplay(this.currentCaptionId, result.caption.text_caption, false);
                
                // Show success message
                this.showSavedIndicator();
                
                // Close modal
                this.editModal.hide();
                
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to revert transcription');
            }
        } catch (error) {
            console.error('Error reverting transcription:', error);
            alert('Failed to revert transcription: ' + error.message);
        }
    }
    

    
    updateCaptionDisplay(captionId, newText, isEdited) {
        const captionElement = document.querySelector(`[data-caption-id="${captionId}"]`);
        if (!captionElement) return;
        
        // Update both preview and full text
        const previewText = captionElement.querySelector('.caption-text-preview small');
        const fullText = captionElement.querySelector('.caption-text-full small');
        
        if (previewText) {
            let displayText = newText;
            if (newText.length > 100) {
                displayText = newText.substring(0, 100) + '...';
            }
            
            // Remove existing edited badge if present
            const existingBadge = previewText.querySelector('.badge');
            if (existingBadge) {
                existingBadge.remove();
            }
            
            previewText.textContent = displayText;
            
            // Add edited badge if needed
            if (isEdited) {
                const badge = document.createElement('span');
                badge.className = 'badge bg-warning ms-1';
                badge.title = 'Edited transcription';
                badge.textContent = 'edited';
                previewText.appendChild(badge);
            }
            
            // Update more/less button visibility
            const moreButton = captionElement.querySelector('.caption-toggle-btn');
            if (moreButton) {
                if (newText.length > 100) {
                    moreButton.style.display = 'inline';
                } else {
                    moreButton.style.display = 'none';
                }
            }
        }
        
        if (fullText) {
            // Remove existing edited badge if present
            const existingBadge = fullText.querySelector('.badge');
            if (existingBadge) {
                existingBadge.remove();
            }
            
            fullText.textContent = newText;
            
            // Add edited badge if needed
            if (isEdited) {
                const badge = document.createElement('span');
                badge.className = 'badge bg-warning ms-1';
                badge.title = 'Edited transcription';
                badge.textContent = 'edited';
                fullText.appendChild(badge);
            }
        }
    }
    
    showSavedIndicator() {
        const indicator = document.getElementById('savingIndicator');
        if (indicator) {
            indicator.style.display = 'block';
            setTimeout(() => {
                indicator.style.display = 'none';
            }, 2000);
        }
    }
    
    initializeTextInput() {
        // Handle input method toggle
        if (this.voiceInputRadio && this.textInputRadio) {
            this.voiceInputRadio.addEventListener('change', () => {
                this.showAudioRecorder();
            });
            
            this.textInputRadio.addEventListener('change', () => {
                this.showTextInput();
            });
        }
        
        // Handle text input events
        if (this.captionTextArea) {
            this.captionTextArea.addEventListener('input', () => {
                this.updateCharacterCount();
            });
            
            // Handle Enter key (Ctrl+Enter to save)
            this.captionTextArea.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'Enter') {
                    e.preventDefault();
                    this.saveTextCaption();
                }
            });
        }
        
        // Handle text input buttons
        if (this.saveTextBtn) {
            this.saveTextBtn.addEventListener('click', () => {
                this.saveTextCaption();
            });
        }
        
        if (this.clearTextBtn) {
            this.clearTextBtn.addEventListener('click', () => {
                this.clearTextCaption();
            });
        }
    }
    
    showAudioRecorder() {
        if (this.audioRecorderCard) {
            this.audioRecorderCard.style.display = 'block';
        }
        if (this.textInputCard) {
            this.textInputCard.style.display = 'none';
        }
    }
    
    showTextInput() {
        if (this.audioRecorderCard) {
            this.audioRecorderCard.style.display = 'none';
        }
        if (this.textInputCard) {
            this.textInputCard.style.display = 'block';
        }
    }
    
    updateCharacterCount() {
        if (this.captionTextArea && this.textCharCount) {
            const count = this.captionTextArea.value.length;
            this.textCharCount.textContent = count;
            
            // Change color based on character count
            if (count > 1800) {
                this.textCharCount.style.color = '#dc3545'; // Red
            } else if (count > 1500) {
                this.textCharCount.style.color = '#fd7e14'; // Orange
            } else {
                this.textCharCount.style.color = '#6c757d'; // Default gray
            }
        }
    }
    
    clearTextCaption() {
        if (this.captionTextArea) {
            this.captionTextArea.value = '';
            this.updateCharacterCount();
        }
    }
    
    async saveTextCaption() {
        if (!this.captionTextArea) return;
        
        const textContent = this.captionTextArea.value.trim();
        if (!textContent) {
            alert('Please enter some text before saving.');
            return;
        }
        
        if (textContent.length < 10) {
            alert('Please enter at least 10 characters for a meaningful caption.');
            return;
        }
        
        try {
            const modality = this.getCurrentModality();
            
            const response = await fetch(window.location.pathname + 'text-caption/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
                },
                body: JSON.stringify({
                    text: textContent,
                    modality: modality.value
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                this.addCaptionToList(result.caption);
                this.clearTextCaption();
                this.showSavedIndicator();
            } else {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `Save failed (${response.status})`);
            }
        } catch (error) {
            console.error('Error saving text caption:', error);
            alert(`Failed to save text caption: ${error.message}`);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.recorder = new VocalCaptionRecorder();
}); 