/**
 * CBCT Upload Toggle Functionality
 * Handles switching between file and folder upload modes
 */

document.addEventListener('DOMContentLoaded', function() {
    // Upload scan page functionality
    initUploadToggle();
    
    // Scan detail page functionality
    initDetailToggle();
});

function initUploadToggle() {
    const fileRadio = document.getElementById('cbct_file_upload');
    const folderRadio = document.getElementById('cbct_folder_upload');
    const fileSection = document.getElementById('cbct_file_section');
    const folderSection = document.getElementById('cbct_folder_section');
    
    if (!fileRadio || !folderRadio || !fileSection || !folderSection) {
        return; // Not on upload page
    }
    
    function toggleSections() {
        if (fileRadio.checked) {
            fileSection.style.display = 'block';
            folderSection.style.display = 'none';
            // Clear folder input when switching to file mode
            const folderInput = document.getElementById('cbct_folder');
            if (folderInput) {
                folderInput.value = '';
            }
        } else if (folderRadio.checked) {
            fileSection.style.display = 'none';
            folderSection.style.display = 'block';
            // Clear file input when switching to folder mode
            const fileInput = fileSection.querySelector('input[type="file"]');
            if (fileInput) {
                fileInput.value = '';
            }
        }
    }
    
    fileRadio.addEventListener('change', toggleSections);
    folderRadio.addEventListener('change', toggleSections);
    
    // Set initial state
    toggleSections();
}

function initDetailToggle() {
    const fileRadio = document.getElementById('cbct_file_upload_detail');
    const folderRadio = document.getElementById('cbct_folder_upload_detail');
    const fileSection = document.getElementById('cbct_file_section_detail');
    const folderSection = document.getElementById('cbct_folder_section_detail');
    
    if (!fileRadio || !folderRadio || !fileSection || !folderSection) {
        return; // Not on detail page
    }
    
    function toggleSections() {
        if (fileRadio.checked) {
            fileSection.style.display = 'block';
            folderSection.style.display = 'none';
            // Clear folder input when switching to file mode
            const folderInput = document.getElementById('cbct_folder_detail');
            if (folderInput) {
                folderInput.value = '';
            }
        } else if (folderRadio.checked) {
            fileSection.style.display = 'none';
            folderSection.style.display = 'block';
            // Clear file input when switching to folder mode
            const fileInput = fileSection.querySelector('input[type="file"]');
            if (fileInput) {
                fileInput.value = '';
            }
        }
    }
    
    fileRadio.addEventListener('change', toggleSections);
    folderRadio.addEventListener('change', toggleSections);
    
    // Set initial state
    toggleSections();
}

/**
 * Handle form submission validation
 */
function handleFormSubmission() {
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            // Check if folder upload is selected
            const folderRadioUpload = document.getElementById('cbct_folder_upload');
            const folderRadioDetail = document.getElementById('cbct_folder_upload_detail');
            
            if ((folderRadioUpload && folderRadioUpload.checked) || 
                (folderRadioDetail && folderRadioDetail.checked)) {
                
                // Get the folder input
                const folderInput = document.getElementById('cbct_folder') || 
                                  document.getElementById('cbct_folder_detail');
                
                if (!folderInput || folderInput.files.length === 0) {
                    // Folder mode selected but no files chosen
                    e.preventDefault();
                    alert('Please select a folder containing DICOM files.');
                    return false;
                }
            }
            
            // For file upload mode, check if file is selected when required
            const fileRadioUpload = document.getElementById('cbct_file_upload');
            const fileRadioDetail = document.getElementById('cbct_file_upload_detail');
            
            if ((fileRadioUpload && fileRadioUpload.checked) || 
                (fileRadioDetail && fileRadioDetail.checked)) {
                
                const fileSection = document.getElementById('cbct_file_section') || 
                                  document.getElementById('cbct_file_section_detail');
                const fileInput = fileSection ? fileSection.querySelector('input[type="file"]') : null;
                
                if (fileInput && !fileInput.files.length) {
                    // Check if this form requires CBCT upload
                    const hasOtherFiles = form.querySelector('input[name="upper_scan_raw"]')?.files.length ||
                                        form.querySelector('input[name="lower_scan_raw"]')?.files.length ||
                                        form.querySelector('input[name="upper_scan"]')?.files.length ||
                                        form.querySelector('input[name="lower_scan"]')?.files.length;
                    
                    if (!hasOtherFiles) {
                        e.preventDefault();
                        alert('Please select a CBCT file to upload.');
                        return false;
                    }
                }
            }
            
            // Allow normal form submission
            return true;
        });
    });
}

// Initialize form submission handling
document.addEventListener('DOMContentLoaded', handleFormSubmission);