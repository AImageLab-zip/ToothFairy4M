// Collapse Section Management
document.addEventListener('DOMContentLoaded', function() {
    // Handle collapse indicator rotation
    const collapseElements = document.querySelectorAll('[data-bs-toggle="collapse"]');
    
    collapseElements.forEach(element => {
        element.addEventListener('click', function() {
            const target = this.getAttribute('data-bs-target');
            const indicator = this.querySelector('.collapse-indicator');
            const isExpanded = this.getAttribute('aria-expanded') === 'true';
            
            // Toggle the aria-expanded attribute
            this.setAttribute('aria-expanded', !isExpanded);
            
            // Update icon direction
            if (indicator) {
                if (!isExpanded) {
                    indicator.classList.remove('fa-chevron-right');
                    indicator.classList.add('fa-chevron-down');
                } else {
                    indicator.classList.remove('fa-chevron-down');
                    indicator.classList.add('fa-chevron-right');
                }
            }
        });
    });
    
    // Bootstrap collapse events for better icon management
    document.addEventListener('shown.bs.collapse', function(e) {
        const trigger = document.querySelector(`[data-bs-target="#${e.target.id}"]`);
        if (trigger) {
            const indicator = trigger.querySelector('.collapse-indicator');
            if (indicator) {
                indicator.classList.remove('fa-chevron-right');
                indicator.classList.add('fa-chevron-down');
            }
        }
    });
    
    document.addEventListener('hidden.bs.collapse', function(e) {
        const trigger = document.querySelector(`[data-bs-target="#${e.target.id}"]`);
        if (trigger) {
            const indicator = trigger.querySelector('.collapse-indicator');
            if (indicator) {
                indicator.classList.remove('fa-chevron-down');
                indicator.classList.add('fa-chevron-right');
            }
        }
    });
}); 