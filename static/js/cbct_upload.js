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
            // Set upload type to file
            const hiddenField = document.querySelector('input[name="cbct_upload_type"]');
            if (hiddenField) {
                hiddenField.value = 'file';
            }
        } else if (folderRadio.checked) {
            fileSection.style.display = 'none';
            folderSection.style.display = 'block';
            // Clear file input when switching to folder mode
            const fileInput = fileSection.querySelector('input[type="file"]');
            if (fileInput) {
                fileInput.value = '';
            }
            // Set upload type to folder
            const hiddenField = document.querySelector('input[name="cbct_upload_type"]');
            if (hiddenField) {
                hiddenField.value = 'folder';
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
            // Set upload type to file
            const hiddenField = document.querySelector('input[name="cbct_upload_type"]');
            if (hiddenField) {
                hiddenField.value = 'file';
            }
        } else if (folderRadio.checked) {
            fileSection.style.display = 'none';
            folderSection.style.display = 'block';
            // Clear file input when switching to folder mode
            const fileInput = fileSection.querySelector('input[type="file"]');
            if (fileInput) {
                fileInput.value = '';
            }
            // Set upload type to folder
            const hiddenField = document.querySelector('input[name="cbct_upload_type"]');
            if (hiddenField) {
                hiddenField.value = 'folder';
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
            // Skip validation for scan management form (which only updates settings)
            const action = form.querySelector('input[name="action"]')?.value;
            if (action === 'update_management') {
                return true; // Allow scan management form to submit without file validation
            }
            
            // Check if user has uploaded any files at all
            const hasUpperScan = form.querySelector('input[name="upper_scan_raw"]')?.files.length ||
                                form.querySelector('input[name="upper_scan"]')?.files.length;
            const hasLowerScan = form.querySelector('input[name="lower_scan_raw"]')?.files.length ||
                                form.querySelector('input[name="lower_scan"]')?.files.length;
            const hasAnyIOS = hasUpperScan || hasLowerScan;
            
            // Check if CBCT files are actually being uploaded
            const hasCBCTFile = form.querySelector('input[name="cbct"]')?.files.length;
            const hasCBCTFolder = form.querySelector('input[name="cbct_folder_files"]')?.files.length;
            const hasAnyCBCT = hasCBCTFile || hasCBCTFolder;
            
            // If no files are being uploaded at all, show a general message
            if (!hasAnyIOS && !hasAnyCBCT) {
                e.preventDefault();
                alert('Please upload at least one file (IOS scan or CBCT).');
                return false;
            }
            
            // Only validate CBCT if user has actually selected files in the chosen mode
            // Check CBCT upload modes
            const folderRadioUpload = document.getElementById('cbct_folder_upload');
            const folderRadioDetail = document.getElementById('cbct_folder_upload_detail');
            const fileRadioUpload = document.getElementById('cbct_file_upload');
            const fileRadioDetail = document.getElementById('cbct_file_upload_detail');
            
            const isFolderMode = (folderRadioUpload && folderRadioUpload.checked) || 
                                (folderRadioDetail && folderRadioDetail.checked);
            const isFileMode = (fileRadioUpload && fileRadioUpload.checked) || 
                              (fileRadioDetail && fileRadioDetail.checked);
            
            // Only validate if user has actually selected CBCT files
            if (isFolderMode && hasCBCTFolder === 0 && hasAnyIOS === 0) {
                // Folder mode selected, no folder files, and no IOS files either
                e.preventDefault();
                alert('Please select a folder containing DICOM files.');
                return false;
            } else if (isFileMode && hasCBCTFile === 0 && hasAnyIOS === 0) {
                // File mode selected, no file, and no IOS files either
                e.preventDefault();
                alert('Please select a CBCT file to upload.');
                return false;
            }
            
            // Allow normal form submission
            return true;
        });
    });
}

// Initialize form submission handling
document.addEventListener('DOMContentLoaded', handleFormSubmission);