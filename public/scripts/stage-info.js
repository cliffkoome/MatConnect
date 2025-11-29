document.addEventListener('DOMContentLoaded', () => {
  const arrivalList = document.querySelector('.arrival-list');
  const stageHeader = document.getElementById('stage-name-header');
  const accessToken = localStorage.getItem('accessToken');
  const notificationBell = document.getElementById('notification-bell');
  const notificationIcon = notificationBell.querySelector('.material-symbols-outlined');
  const profileIcon = document.querySelector('.profile-icon');
  const destinationSelect = document.getElementById('destination-select');

  let allArrivals = []; // To store the full list of arrivals before filtering
  if (notificationBell) {
    notificationBell.addEventListener('click', toggleSubscription);
  }

  // Get the stageId from the URL query parameters
  const params = new URLSearchParams(window.location.search);
  const stageId = params.get('stageId');

  if (!stageId) {
    alert('No stage selected. Redirecting...');
    window.location.href = '/select-stage.html';
    return;
  }

  if (!accessToken || localStorage.getItem('role') !== 'Passenger') {
    window.location.href = '/login.html';
    return;
  }

  // --- Mobile Menu & Logout ---
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const mainNav = document.querySelector('.main-nav');
  const headerActions = document.querySelector('.header-actions');

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => mainNav.classList.toggle('is-active'));
  }

  function logoutUser() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('role');
    window.location.href = '/login.html';
  }

  // Add logout to mobile nav
  const navList = mainNav.querySelector('ul');
  const logoutLi = document.createElement('li');
  logoutLi.innerHTML = `<a href="#" class="logout-link">Logout</a>`;
  logoutLi.addEventListener('click', (e) => { e.preventDefault(); logoutUser(); });
  navList.appendChild(logoutLi);

  // Add logout to desktop header
  const logoutDesktopBtn = document.createElement('button');
  logoutDesktopBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i>';
  logoutDesktopBtn.title = 'Logout';
  logoutDesktopBtn.classList.add('logout-btn-desktop');
  logoutDesktopBtn.addEventListener('click', logoutUser);
  if (headerActions) {
    headerActions.insertBefore(logoutDesktopBtn, headerActions.querySelector('.user-profile'));
  }

  function createArrivalItem(vehicle) {
    const statusClass = vehicle.status.toLowerCase().replace(' ', '-');
    return `
      <li class="arrival-item">
        <div class="vehicle-info">
          <span class="material-symbols-outlined vehicle-icon">directions_bus</span>
          <div>
            <p class="plate-number">${vehicle.plateNumber}</p>
            <p class="next-destination">
              <span class="material-symbols-outlined">trending_flat</span>
              Next: <strong>${vehicle.nextDestination || 'N/A'}</strong>
            </p>
          </div>
        </div>
        <div class="status-wrapper">
          <span class="status-badge status-${statusClass}">
            <span class="status-dot"></span>
            ${vehicle.status}
          </span>
          <p class="eta">${vehicle.eta}</p>
        </div>
      </li>
    `;
  }

  async function fetchAndDisplayEtas() {
    try {
      const response = await fetch(`/api/eta/${stageId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch ETA data.');
      }

      const data = await response.json();
      allArrivals = data.arrivals; // Store the full list
      stageHeader.textContent = data.stageName;

      // Display initial (unfiltered) list
      displayFilteredArrivals();

    } catch (error) {
      console.error('Error:', error);
      arrivalList.innerHTML = '<li class="error-message">Could not load arrival times. Please try again later.</li>';
    }
  }

  async function populateDestinationFilter() {
    try {
      const destinations = await fetch(`/api/eta/${stageId}/destinations`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(res => res.json());

      destinationSelect.innerHTML = '<option value="all">-- All Destinations --</option>'; // Reset
      destinations.forEach(dest => {
        const option = document.createElement('option');
        option.value = dest.name;
        option.textContent = dest.name;
        destinationSelect.appendChild(option);
      });
    } catch (error) {
      console.error('Error fetching possible destinations:', error);
    }
  }

  function displayFilteredArrivals() {
    const selectedDestination = destinationSelect.value;
    let filteredArrivals = allArrivals;

    if (selectedDestination && selectedDestination !== 'all') {
      filteredArrivals = allArrivals.filter(vehicle => vehicle.nextDestination === selectedDestination);
    }

    if (filteredArrivals.length > 0) {
      arrivalList.innerHTML = filteredArrivals.map(createArrivalItem).join('');
    } else {
      arrivalList.innerHTML = '<li class="info-message">No vehicles currently heading to that destination.</li>';
    }
  }

  async function fetchSubscriptionStatus() {
    try {
      const response = await fetch(`/api/stages/${stageId}/subscription`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!response.ok) throw new Error('Failed to get subscription status.');
      const data = await response.json();
      updateBellIcon(data.isSubscribed);
    } catch (error) {
      console.error('Error fetching subscription status:', error);
    }
  }

  function updateBellIcon(isSubscribed) {
    if (isSubscribed) {
      notificationIcon.textContent = 'notifications_active';
      notificationBell.classList.add('active');
      notificationBell.title = 'SMS alerts are ON for the next arrival. Click to turn off.';
    } else {
      notificationIcon.textContent = 'notifications_off';
      notificationBell.classList.remove('active');
      notificationBell.title = 'SMS alerts are OFF. Click to get an alert for the next arrival.';
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

  async function toggleSubscription() {
    const isSubscribed = notificationBell.classList.contains('active');
    const endpoint = isSubscribed ? 'unsubscribe' : 'subscribe';
    const method = 'POST';

    try {
      notificationBell.disabled = true; // Prevent double-clicking
      const response = await fetch(`/api/stages/${stageId}/${endpoint}`, {
        method,
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to update subscription.');
      }

      alert(result.message);
      updateBellIcon(!isSubscribed);

    } catch (error) {
      console.error('Error toggling subscription:', error);
      alert(`Error: ${error.message}`);
    } finally {
      notificationBell.disabled = false;
    }
  }

  // Fetch profile image
  fetchProfileImage();

  // Fetch data immediately and then every 30 seconds
  fetchAndDisplayEtas();
  populateDestinationFilter();
  fetchSubscriptionStatus();
  setInterval(fetchAndDisplayEtas, 30000);

  destinationSelect.addEventListener('change', displayFilteredArrivals);
});