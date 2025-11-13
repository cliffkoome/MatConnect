document.addEventListener('DOMContentLoaded', () => {
  const accessToken = localStorage.getItem('accessToken');
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.querySelector('.user-name');
  const logoutLinkDesktop = document.getElementById('logout-link-desktop');
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const mainNav = document.querySelector('.main-nav');

  // Stat card elements
  const totalVehiclesStat = document.getElementById('total-vehicles-stat');
  const totalDistanceStat = document.getElementById('total-distance-stat');
  const totalTripsStat = document.getElementById('total-trips-stat');
  const vehicleTableBody = document.getElementById('vehicle-table-body');

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

  const logoutUser = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout failed, but clearing session anyway.');
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('role');
    window.location.href = '/login.html';
  };

  async function fetchDashboardSummary() {
    try {
      const summary = await apiFetch('/api/mat-admin/dashboard-summary');
      totalVehiclesStat.textContent = summary.totalVehicles;
      totalDistanceStat.textContent = `${(summary.totalDistanceToday / 1000).toFixed(2)} km`;
      totalTripsStat.textContent = summary.totalTripsToday;
    } catch (error) {
      console.error('Error fetching summary:', error);
      totalVehiclesStat.textContent = 'Error';
    }
  }

  function createVehicleRow(vehicle) {
    console.log(vehicle);
    const statusClass = vehicle.status.toLowerCase() === 'online' ? 'badge-success' : 'badge-danger';
    let locationCell = vehicle.location || 'N/A';

    if (vehicle.latitude && vehicle.longitude) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${vehicle.latitude},${vehicle.longitude}`;
      locationCell = `<a href="${mapsUrl}" target="_blank" title="View on Google Maps">${vehicle.location}</a>`;
    }

    return `
      <tr>
        <td>${vehicle.plateNumber}</td>
        <td><span class="badge ${statusClass}">${vehicle.status}</span></td>
        <td>${locationCell}</td>
      </tr>
    `;
  }

  async function fetchLiveVehicleStatus() {
    try {
      const data = await apiFetch('/api/mat-admin/dashboard-data');
      if (data.vehicles && data.vehicles.length > 0) {
        console.log(data);
        
        vehicleTableBody.innerHTML = data.vehicles.map(createVehicleRow).join('');
      } else {
        vehicleTableBody.innerHTML = '<tr><td colspan="3">No vehicles found.</td></tr>';
      }
    } catch (error) {
      console.error('Error fetching live vehicle data:', error);
      vehicleTableBody.innerHTML = '<tr><td colspan="3" class="error-message">Could not load vehicle data.</td></tr>';
    }
  }

  const initializeApp = async () => {
    const role = localStorage.getItem('role');
    if (!accessToken || role !== 'MatAdmin') {
      window.location.href = '/login.html';
      return;
    }

    const user = await apiFetch('/api/auth/me/mat-admin');
    userAvatar.src = user.profilePictureUrl || '/images/pfp.jpg';
    userName.textContent = user.name.split(' ')[0];

    logoutLinkDesktop.addEventListener('click', logoutUser);
    mobileMenuBtn.addEventListener('click', () => mainNav.classList.toggle('is-active'));

    // Add mobile logout link
    const navList = mainNav.querySelector('ul');
    const logoutLi = document.createElement('li');
    logoutLi.innerHTML = `<a href="#" id="logout-link-mobile">Logout</a>`;
    navList.appendChild(logoutLi);
    logoutLi.querySelector('#logout-link-mobile').addEventListener('click', logoutUser);

    // Fetch data
    fetchDashboardSummary();
    fetchLiveVehicleStatus();
    setInterval(fetchLiveVehicleStatus, 30000); // Refresh live status every 30s
  };

  initializeApp();
});