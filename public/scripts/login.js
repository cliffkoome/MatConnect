document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('.form');
  const emailInput = document.getElementById('email-address');
  const passwordInput = document.getElementById('password');
  const tokenInput = document.getElementById('2fa-token');
  const twoFaContainer = document.getElementById('2fa-container');
  const messageArea = document.getElementById('message-area');
  const submitButton = document.getElementById('submit-button');
  const subtitle = document.getElementById('subtitle-text');
  const googleButton = document.getElementById('google-signin-button');

  let tempToken = null; // To store the temporary token for 2FA

  // Check for authentication errors from URL parameters (e.g., from Google OAuth)
  const params = new URLSearchParams(window.location.search);
  if (params.get('error') === 'auth_failed') {
    showMessage('Authentication failed. Please try again.', 'error');
    // Clean up the URL
    window.history.replaceState({}, document.title, "/login.html");
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();

    try {
      // If tempToken is present, we are in the second step (2FA verification)
      if (tempToken) {
        await verifyTwoFactor();
      } else {
        // Otherwise, this is the first step (email/password login)
        await loginWithPassword();
      }
    } catch (error) {
      console.error('An unexpected error occurred:', error);
      showMessage('An unexpected error occurred. Please try again.', 'error');
    }
  });

  googleButton.addEventListener('click', () => {
    // Redirect the user to the backend route that starts the Google OAuth flow
    window.location.href = '/api/auth/google';
  });

  async function loginWithPassword() {
    const email = emailInput.value;
    const password = passwordInput.value;

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      if (data.twoFactorRequired) {
        // 2FA is required, move to the second step
        tempToken = data.tempToken;
        prepareTwoFactorUI();
      } else {
        // Login successful, no 2FA
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('role', data.role);
        window.location.href = data.role === 'Admin' ? '/admin-dashboard.html' : '/select-stage.html';
      }
    } else {
      // Login failed (e.g., wrong password)
      showMessage(data.message || 'Login failed.', 'error');
    }
  }

  async function verifyTwoFactor() {
    const token = tokenInput.value;

    if (!token || token.length !== 6) {
      showMessage('Please enter a valid 6-digit code.', 'error');
      return;
    }

    const response = await fetch('/api/auth/2fa/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken, token }),
    });

    const data = await response.json();

    if (response.ok) {
      // 2FA verification successful
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('role', data.role);
      window.location.href = data.role === 'Admin' ? '/admin-dashboard.html' : '/select-stage.html';
    } else {
      // 2FA verification failed
      showMessage(data.message || 'Invalid 2FA code.', 'error');
      tokenInput.value = ''; // Clear the input for retry
      tokenInput.focus();
    }
  }

  function prepareTwoFactorUI() {
    // Hide email and password fields
    emailInput.parentElement.style.display = 'none';
    passwordInput.parentElement.style.display = 'none';

    // Show the 2FA token input
    twoFaContainer.style.display = 'block';
    tokenInput.focus();

    // Update UI text
    subtitle.textContent = 'Enter the 6-digit code from your authenticator app.';
    submitButton.textContent = 'Verify Code';
  }

  function showMessage(message, type = 'info') {
    messageArea.textContent = message;
    messageArea.className = `message ${type}`; // Assumes you have .error, .success classes in your CSS
    messageArea.style.display = 'block';
  }

  function clearMessage() {
    messageArea.textContent = '';
    messageArea.style.display = 'none';
  }
});