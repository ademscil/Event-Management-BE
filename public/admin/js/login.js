/**
 * Login Page Script
 * Handles login form submission and validation
 */

// Initialize login page
document.addEventListener('DOMContentLoaded', async function() {
    // Check auth state using token validation, not token presence only.
    const authState = await window.Auth.validateToken();
    if (authState.valid) {
        window.location.href = 'dashboard';
        return;
    }

    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('loginButton');
    const usernameError = document.getElementById('usernameError') || document.getElementById('username-error');
    const passwordError = document.getElementById('passwordError') || document.getElementById('password-error');
    const defaultButtonText = loginButton.textContent;
    let isSubmitting = false;

    usernameInput.focus();

    // Clear errors on input
    usernameInput.addEventListener('input', function() {
        usernameInput.classList.remove('error');
        usernameError.classList.remove('show');
        usernameError.textContent = '';
    });

    passwordInput.addEventListener('input', function() {
        passwordInput.classList.remove('error');
        passwordError.classList.remove('show');
        passwordError.textContent = '';
    });

    // Handle form submission
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (isSubmitting) {
            return;
        }

        // Clear previous errors
        usernameInput.classList.remove('error');
        passwordInput.classList.remove('error');
        usernameError.classList.remove('show');
        passwordError.classList.remove('show');
        usernameError.textContent = '';
        passwordError.textContent = '';

        // Get form values
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        // Client-side validation
        let hasError = false;

        if (!username) {
            usernameInput.classList.add('error');
            usernameError.textContent = 'Username harus diisi';
            usernameError.classList.add('show');
            hasError = true;
        }

        if (username && (username.length < 3 || username.length > 50)) {
            usernameInput.classList.add('error');
            usernameError.textContent = 'Username harus 3-50 karakter';
            usernameError.classList.add('show');
            hasError = true;
        }

        if (!password) {
            passwordInput.classList.add('error');
            passwordError.textContent = 'Password harus diisi';
            passwordError.classList.add('show');
            hasError = true;
        }

        if (hasError) {
            return;
        }

        isSubmitting = true;
        // Show loading state
        loginButton.disabled = true;
        loginButton.textContent = 'Memproses...';

        try {
            // Attempt login
            const result = await window.Auth.login(username, password);

            if (result.success) {
                // Redirect to dashboard
                window.location.href = 'dashboard';
            } else {
                // Show error message
                usernameInput.classList.add('error');
                usernameError.textContent = result.message || 'Username atau password salah';
                usernameError.classList.add('show');
            }
        } catch (error) {
            // Show error message
            usernameInput.classList.add('error');
            usernameError.textContent = error.message || 'Terjadi kesalahan saat login';
            usernameError.classList.add('show');
        } finally {
            isSubmitting = false;
            // Hide loading state
            loginButton.disabled = false;
            loginButton.textContent = defaultButtonText;
        }
    });
});

