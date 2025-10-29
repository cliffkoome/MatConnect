document.addEventListener('DOMContentLoaded', () => {
  const arrivalList = document.querySelector('.arrival-list');
  const avatar = document.querySelector('.avatar');
  const stageHeader = document.querySelector('.page-header h2');
  const accessToken = localStorage.getItem('accessToken');
  const logoutBtn = document.getElementById('logout-btn');
  const notificationBell = document.getElementById('notification-bell');
  const notificationIcon = notificationBell.querySelector('.material-symbols-outlined');

  avatar.addEventListener('click', () => {
    window.location.href = '/user-profile.html';
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutUser);
  }
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

  function createArrivalItem(vehicle) {
    const statusClass = vehicle.status.toLowerCase().replace(' ', '-');
    return `
      <li class="arrival-item">
        <div class="vehicle-info">
          <div class="vehicle-icon-wrapper">
            <span class="material-symbols-outlined">directions_bus</span>
          </div>
          <div>
            <p class="plate-number">${vehicle.plateNumber}</p>
            <p class="eta">ETA: ${vehicle.eta}</p>
          </div>
        </div>
        <div class="status-wrapper">
          <span class="status-badge status-${statusClass}">
            <span class="status-dot"></span>
            ${vehicle.status}
          </span>
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
      stageHeader.textContent = data.stageName;
      arrivalList.innerHTML = data.arrivals.map(createArrivalItem).join('');

    } catch (error) {
      console.error('Error:', error);
      arrivalList.innerHTML = '<li class="error-message">Could not load arrival times. Please try again later.</li>';
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

  // Fetch data immediately and then every 30 seconds
  fetchAndDisplayEtas();
  fetchSubscriptionStatus();
  setInterval(fetchAndDisplayEtas, 30000);

  async function logoutUser() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('role');
    window.location.href = '/login.html';
  }
});