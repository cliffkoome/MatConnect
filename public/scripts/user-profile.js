document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const profileForm = document.querySelector('.profile-details-section .form-grid');
  const passwordForm = document.querySelector('.password-reset-section .form-grid');
  const logoutBtn = document.getElementById('logout-btn');

  // 2FA Elements
  const twoFaStatus = document.getElementById('2fa-status');
  const twoFaToggleBtn = document.getElementById('2fa-toggle-btn');
  const twoFaModal = document.getElementById('2fa-modal');
  const twoFaCloseModalBtn = document.getElementById('2fa-close-modal-btn');
  const twoFaCancelBtn = document.getElementById('2fa-cancel-btn');
  const twoFaVerifyBtn = document.getElementById('2fa-verify-btn');
  const qrCodeContainer = document.getElementById('qr-code-container');
  const twoFaTokenInput = document.getElementById('2fa-verify-token');

  // --- State ---
  const token = localStorage.getItem('accessToken');

  // 1. Authentication Check: Redirect if no token is found.
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  // 2. Fetch and display user data.
  fetchUserProfile(token);

  // 3. Add event listeners for the forms.
  if (profileForm) {
    profileForm.addEventListener('submit', (e) => handleProfileUpdate(e, token));
  }

  // Logout listener
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutUser);
  }

  // 2FA Listeners
  if (twoFaToggleBtn) {
    twoFaToggleBtn.addEventListener('click', () => handle2FaToggle(token));
  }
  if (twoFaCloseModalBtn) {
    twoFaCloseModalBtn.addEventListener('click', close2FaModal);
  }
  if (twoFaCancelBtn) {
    twoFaCancelBtn.addEventListener('click', close2FaModal);
  }
  if (twoFaModal) {
    twoFaModal.addEventListener('click', (e) => {
      if (e.target === twoFaModal) close2FaModal();
    });
  }
  if (twoFaVerifyBtn) {
    twoFaVerifyBtn.addEventListener('click', () => handle2FaVerify(token));
  }
});

/**
 * Generic API fetch helper
 */
async function apiFetch(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'An API error occurred');
  }
  return response.json();
};

/**
 * Fetches user data from the server and populates the form.
 * @param {string} token The JWT access token.
 */
async function fetchUserProfile(token) {
  try {
    const user = await apiFetch('/api/auth/me/passenger', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    populateProfileForm(user);

  } catch (error) {
    console.error('Error fetching profile:', error);
    alert('Could not load your profile. Please try logging in again.');
  }
}

/**
 * Fills the input fields with the user's data.
 * @param {object} user The user object from the API.
 */
function populateProfileForm(user) {
  document.getElementById('name').value = user.name || '';
  document.getElementById('email').value = user.email || '';
  document.getElementById('phone').value = user.phoneNumber || '';
  document.getElementById('profile-img').src = user.profilePictureUrl || './images/pfp.jpg';
  document.querySelector('.avatar').style.backgroundImage = `url(${user.profilePictureUrl || './images/pfp.jpg'})`;
    
  update2FaUI(user.twoFactorEnabled);
}

/**
 * Handles the submission of the profile update form.
 * @param {Event} event The form submission event.
 * @param {string} token The JWT access token.
 */
async function handleProfileUpdate(event, token) {
  event.preventDefault();
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const phone = document.getElementById('phone').value;

  // Note: You need to create this endpoint on your backend.
  // Example: router.put('/api/users/me', authMiddleware, updateUser);
  try {
    await apiFetch('/api/users/me', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phoneNumber: phone }),
    });

    alert('Profile updated successfully!');
  } catch (error) {
    console.error('Profile update error:', error);
    alert(`Error: ${error.message}`);
  }
}

/**
 * Handles the logic for enabling or disabling 2FA.
 * @param {string} token The JWT access token.
 */
async function handle2FaToggle(token) {
  const isEnabled = document.getElementById('2fa-status').classList.contains('enabled');

  if (isEnabled) {
    // --- Disable 2FA ---
    if (confirm('Are you sure you want to disable Two-Factor Authentication?')) {
      try {
        await apiFetch('/api/auth/2fa/disable', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        alert('2FA has been disabled.');
        update2FaUI(false);
      } catch (error) {
        alert(`Error disabling 2FA: ${error.message}`);
      }
    }
  } else {
    // --- Enable 2FA ---
    try {
      const data = await apiFetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      document.getElementById('qr-code-container').innerHTML = `<img src="${data.qrCodeUrl}" alt="QR Code for 2FA" />`;
      document.getElementById('2fa-modal').classList.remove('hidden');
    } catch (error) {
      alert(`Error setting up 2FA: ${error.message}`);
    }
  }
}

/**
 * Handles the verification of the 2FA token from the modal.
 * @param {string} token The JWT access token.
 */
async function handle2FaVerify(token) {
  const twoFaCode = document.getElementById('2fa-verify-token').value;
  if (!twoFaCode || twoFaCode.length !== 6) {
    alert('Please enter a valid 6-digit code.');
    return;
  }

  try {
    await apiFetch('/api/auth/2fa/verify', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: twoFaCode }),
    });
    alert('2FA enabled successfully!');
    close2FaModal();
    update2FaUI(true);
  } catch (error) {
    alert(`Verification failed: ${error.message}`);
  }
}

function close2FaModal() {
  document.getElementById('2fa-modal').classList.add('hidden');
  document.getElementById('qr-code-container').innerHTML = '';
  document.getElementById('2fa-verify-token').value = '';
}

function update2FaUI(isEnabled) {
  const statusEl = document.getElementById('2fa-status');
  const toggleBtn = document.getElementById('2fa-toggle-btn');
  statusEl.textContent = isEnabled ? 'Enabled' : 'Disabled';
  statusEl.className = `status-badge ${isEnabled ? 'enabled' : 'disabled'}`;
  toggleBtn.textContent = isEnabled ? 'Disable 2FA' : 'Enable 2FA';
}

/**
 * Logs the user out by clearing the token and redirecting.
 */
async function logoutUser() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('role');
  window.location.href = '/login.html';
}