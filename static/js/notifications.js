(function () {
    'use strict';

    function normalizeType(type) {
        const value = String(type || 'info').toLowerCase();
        if (value === 'error') {
            return 'danger';
        }
        if (value === 'warn') {
            return 'warning';
        }
        if (value === 'ok') {
            return 'success';
        }
        return value;
    }

    function toastTitle(type) {
        if (type === 'success') return 'Success';
        if (type === 'danger') return 'Error';
        if (type === 'warning') return 'Warning';
        return 'Info';
    }

    function toastIcon(type) {
        if (type === 'success') return 'fa-check-circle text-success';
        if (type === 'danger') return 'fa-circle-exclamation text-danger';
        if (type === 'warning') return 'fa-triangle-exclamation text-warning';
        return 'fa-circle-info text-primary';
    }

    function ensureToastContainer() {
        let container = document.getElementById('globalToastContainer');
        if (container) {
            return container;
        }

        container = document.createElement('div');
        container.id = 'globalToastContainer';
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '2000';
        document.body.appendChild(container);
        return container;
    }

    function fallbackAlert(type, message) {
        const alertBox = document.createElement('div');
        alertBox.className = `alert alert-${type} alert-dismissible fade show`;
        alertBox.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 2000; min-width: 280px;';
        alertBox.setAttribute('role', 'alert');

        const text = document.createElement('span');
        text.textContent = String(message || '');
        alertBox.appendChild(text);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-close';
        closeBtn.setAttribute('data-bs-dismiss', 'alert');
        closeBtn.setAttribute('aria-label', 'Close');
        alertBox.appendChild(closeBtn);

        document.body.appendChild(alertBox);

        setTimeout(function () {
            alertBox.classList.remove('show');
            setTimeout(function () {
                if (alertBox.parentNode) {
                    alertBox.remove();
                }
            }, 150);
        }, 4500);
    }

    function appNotify(type, message, options) {
        const normalizedType = normalizeType(type);
        const text = String(message || '').trim();
        const settings = options || {};

        if (!text) {
            return;
        }

        if (!window.bootstrap || typeof window.bootstrap.Toast === 'undefined') {
            fallbackAlert(normalizedType, text);
            return;
        }

        const container = ensureToastContainer();
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');

        const header = document.createElement('div');
        header.className = 'toast-header';

        const icon = document.createElement('i');
        icon.className = `fas ${toastIcon(normalizedType)} me-2`;
        header.appendChild(icon);

        const title = document.createElement('strong');
        title.className = 'me-auto';
        title.textContent = toastTitle(normalizedType);
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-close';
        closeBtn.setAttribute('data-bs-dismiss', 'toast');
        closeBtn.setAttribute('aria-label', 'Close');
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'toast-body';
        body.textContent = text;

        toast.appendChild(header);
        toast.appendChild(body);
        container.appendChild(toast);

        const instance = new window.bootstrap.Toast(toast, {
            autohide: settings.autohide !== false,
            delay: settings.delay || 4500
        });

        toast.addEventListener('hidden.bs.toast', function () {
            if (toast.parentNode) {
                toast.remove();
            }
        });

        instance.show();
    }

    window.appNotify = appNotify;
    window.showNotification = appNotify;
})();
