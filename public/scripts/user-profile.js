document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('accessToken');

  // 1. Authentication Check: Redirect if no token is found.
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  // 2. Fetch and display user data.
  fetchUserProfile(token);

  // 3. Add event listeners for the forms.
  const profileForm = document.querySelector('.profile-details-section .form-grid');
  const passwordForm = document.querySelector('.password-reset-section .form-grid');

  if (profileForm) {
    profileForm.addEventListener('submit', (e) => handleProfileUpdate(e, token));
  }

  if (passwordForm) {
    passwordForm.addEventListener('submit', (e) => handlePasswordReset(e, token));
  }

  // Note: You can add a logout button and hook it to this function.
  // For example, clicking the avatar could trigger logout.
  const avatar = document.querySelector('.avatar');
  if (avatar) {
    avatar.addEventListener('click', () => {
      if (confirm('Are you sure you want to log out?')) {
        logoutUser();
      }
    });
  }
});

/**
 * Fetches user data from the server and populates the form.
 * @param {string} token The JWT access token.
 */
async function fetchUserProfile(token) {
  try {
    const response = await fetch('/api/auth/me/passenger', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 401 || response.status === 403) {
      logoutUser(); // Token is invalid or expired.
      return;
    }

    if (!response.ok) {
      throw new Error('Failed to fetch user profile.');
    }

    const user = await response.json();
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
  // The API doesn't provide a phone number, so we'll leave the default or set it to empty.
  document.getElementById('phone').value = user.phoneNumber || '';
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
    const response = await fetch('/api/users/me', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, email, phoneNumber: phone }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Update failed.');

    alert('Profile updated successfully!');
  } catch (error) {
    console.error('Profile update error:', error);
    alert(`Error: ${error.message}`);
  }
}

/**
 * Handles the submission of the password reset form.
 * @param {Event} event The form submission event.
 * @param {string} token The JWT access token.
 */
async function handlePasswordReset(event, token) {
  event.preventDefault();
  const newPassword = document.getElementById('new_password').value;
  const confirmPassword = document.getElementById('confirm_password').value;

  if (newPassword !== confirmPassword) {
    alert('Passwords do not match.');
    return;
  }

  if (!newPassword) {
    alert('Please enter a new password.');
    return;
  }

  // Note: You need to create this endpoint on your backend.
  // Example: router.post('/api/users/change-password', authMiddleware, changePassword);
  try {
    const response = await fetch('/api/users/change-password', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Password reset failed.');

    alert('Password changed successfully!');
    event.target.reset(); // Clear the password fields.
  } catch (error) {
    console.error('Password reset error:', error);
    alert(`Error: ${error.message}`);
  }
}

/**
 * Logs the user out by clearing the token and redirecting.
 */
function logoutUser() {
  localStorage.removeItem('accessToken');
  window.location.href = '/login.html';
}