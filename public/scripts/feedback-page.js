document.addEventListener('DOMContentLoaded', () => {
  const accessToken = localStorage.getItem('accessToken');
  const mainNavList = document.querySelector('.main-nav ul');
  const ratingStarsContainer = document.querySelector('.rating-stars');
  const profileIcon = document.querySelector('.profile-icon');

  const feedbackForm = document.getElementById('feedback-form');
  const vehicleSelect = document.getElementById('vehicle-select');
  // Protect the page: redirect to login if not authenticated
  if (!accessToken) {
    window.location.href = '/login.html';
    return;
  }

  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const mainNav = document.querySelector('.main-nav');
  const headerActions = document.querySelector('.header-actions');

  const apiFetch = async (url, options = {}) => {
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    };
    const response = await fetch(url, { ...defaultOptions, ...options });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        window.location.href = '/login.html';
      }
      const errorData = await response.json();
      throw new Error(errorData.message || 'API request failed');
    }
    return response.json();
  };

  // --- Mobile Menu Toggle ---
  mobileMenuBtn.addEventListener('click', () => {
    mainNav.classList.toggle('is-active');
  });

  // --- Logout Functionality ---
  function logoutUser() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('role');
    window.location.href = '/login.html';
  }

  // Add logout link to mobile menu
  const logoutLi = document.createElement('li');
  const logoutMobileLink = document.createElement('a');
  logoutMobileLink.href = '#';
  logoutMobileLink.textContent = 'Logout';
  logoutMobileLink.addEventListener('click', (e) => {
    e.preventDefault();
    logoutUser();
  });
  logoutLi.appendChild(logoutMobileLink);
  mainNavList.appendChild(logoutLi);

  // Add logout button for desktop view
  const logoutDesktopBtn = document.createElement('button');
  logoutDesktopBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i>';
  logoutDesktopBtn.title = 'Logout';
  logoutDesktopBtn.classList.add('logout-btn-desktop');
  logoutDesktopBtn.addEventListener('click', logoutUser);
  // Add it before the profile icon
  headerActions.insertBefore(logoutDesktopBtn, headerActions.querySelector('.user-profile'));

  // --- Star Rating Functionality ---
  if (ratingStarsContainer) {
    const stars = ratingStarsContainer.querySelectorAll('label');
    const starInputs = ratingStarsContainer.querySelectorAll('input[type="radio"]');

    starInputs.forEach(input => {
      input.addEventListener('change', () => {
        const selectedValue = parseInt(input.value, 10);
        stars.forEach((star, index) => {
          // The labels are in reverse order in the DOM (5, 4, 3, 2, 1).
          // The visual order is (1, 2, 3, 4, 5) due to `flex-direction: row-reverse`.
          const starValue = parseInt(star.htmlFor.replace('star', ''), 10);
          star.classList.toggle('is-selected', starValue <= selectedValue);
        });
      });
    });
  }

  async function populateVehicleDropdown() {
    try {
      const vehicles = await apiFetch('/api/feedback/vehicles');
      if (vehicles.length > 0) {
        vehicleSelect.innerHTML = '<option value="" disabled selected>Select a vehicle...</option>';
        vehicles.forEach(vehicle => {
          const option = document.createElement('option');
          option.value = vehicle.id;
          option.textContent = vehicle.plateNumber;
          vehicleSelect.appendChild(option);
        });
      } else {
        vehicleSelect.innerHTML = '<option value="" disabled selected>No vehicles available for feedback.</option>';
      }
    } catch (error) {
      console.error('Error fetching vehicles:', error);
      vehicleSelect.innerHTML = '<option value="" disabled selected>Could not load vehicles.</option>';
    }
  }

  async function handleFeedbackSubmit(event) {
    event.preventDefault();
    const formData = new FormData(feedbackForm);
    const vehicleId = formData.get('vehicle');
    const rating = formData.get('rating');
    const comment = formData.get('comments');

    if (!vehicleId) {
      alert('Please select a vehicle.');
      return;
    }
    if (!rating) {
      alert('Please provide a star rating.');
      return;
    }

    try {
      const response = await apiFetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ vehicleId, rating: parseInt(rating), comment }),
      });
      alert(response.message);
      feedbackForm.reset();
    } catch (error) {
      alert(`Error submitting feedback: ${error.message}`);
    }
  }

  async function fetchProfileImage() {
    if (!profileIcon) return;
    try {
      const res = await fetch('/api/auth/me/passenger', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!res.ok) throw new Error('Failed to fetch profile image.');

      const { profilePictureUrl } = await res.json();
      profileIcon.src = profilePictureUrl || './images/pfp.jpg';
      profileIcon.refferrerPolicy = 'no-referrer';
    } catch (err) {
      console.error('Error fetching profile image:', err);
      profileIcon.src = './images/pfp.jpg';
    }
  }

  fetchProfileImage();

  feedbackForm.addEventListener('submit', handleFeedbackSubmit);
  populateVehicleDropdown();
});