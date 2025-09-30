document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('reset-form');
  const emailInput = document.getElementById('email-address');
  const resetFields = document.getElementById('reset-fields');
  const tokenInput = document.getElementById('reset-token');
  const userIdInput = document.getElementById('user-id');
  const passwordInput = document.getElementById('new-password');
  const submitButton = document.getElementById('submit-button');
  const messageArea = document.getElementById('message-area');
  const subtitle = document.getElementById('subtitle-text');

  // This flag tracks which step of the process we are in.
  let isLinkSent = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMessage('', 'none'); // Clear previous messages

    if (!isLinkSent) {
      // --- Step 1: Request the reset link ---
      const email = emailInput.value;
      if (!email) {
        showMessage('Please enter your email address.', 'error');
        return;
      }

      try {
        setLoading(true, 'Sending...');
        const response = await fetch('/api/auth/requestPasswordReset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        // Transition to the next step
        showMessage('A reset link has been sent to your email. Please copy the ID and Token from the link into the fields below.', 'success');
        isLinkSent = true;
        emailInput.readOnly = true; // Lock the email field
        resetFields.style.display = 'block';
        subtitle.textContent = 'Enter the details from your reset link.';
        setLoading(false, 'Reset Password');

      } catch (error) {
        showMessage(error.message, 'error');
        setLoading(false, 'Send Reset Link');
      }
    } else {
      // --- Step 2: Submit the ID, token, and new password ---
      const id = userIdInput.value;
      const token = tokenInput.value;
      const password = passwordInput.value;

      if (!id || !token || !password) {
        showMessage('Please fill in your User ID, Token, and a new password.', 'error');
        return;
      }

      try {
        setLoading(true, 'Resetting...');
        // The URL is constructed based on your authRoutes.js
        const response = await fetch(`/api/auth/resetpassword/${id}/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        showMessage('Password reset successfully! Redirecting to login...', 'success');
        
        // Redirect to login page after a short delay
        setTimeout(() => {
          window.location.href = '/login.html';
        }, 2000);

      } catch (error) {
        showMessage(error.message, 'error');
        setLoading(false, 'Reset Password');
      }
    }
  });

  function setLoading(isLoading, buttonText) {
    submitButton.disabled = isLoading;
    submitButton.textContent = buttonText;
  }

  function showMessage(text, type) {
    messageArea.textContent = text;
    // Add CSS classes for styling success/error messages
    messageArea.className = 'message'; 
    if (type === 'error') {
      messageArea.classList.add('error');
    } else if (type === 'success') {
      messageArea.classList.add('success');
    }
  }
});