document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.avatar').src = '/images/pfp.jpg';
  const logoutBtn = document.getElementById('logout-btn');


  const vehicleTableBody = document.querySelector('.data-table tbody');
  const accessToken = localStorage.getItem('accessToken');


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

  function createVehicleRow(vehicle) {
    const statusClass = vehicle.status.toLowerCase() === 'online' ? 'badge-success' : 'badge-danger';
    let locationCell = vehicle.location;

    // If we have coordinates, make the location a link to Google Maps
    if (vehicle.latitude && vehicle.longitude) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${vehicle.latitude},${vehicle.longitude}`;
      locationCell = `<a href="${mapsUrl}" target="_blank" title="View on Google Maps">${vehicle.location}</a>`;
    }

    return `
      <tr>
        <td>${vehicle.plateNumber}</td>
        <td>${vehicle.route}</td>
        <td><span class="badge ${statusClass}">${vehicle.status}</span></td>
        <td>${locationCell}</td>
      </tr>
    `;
  }

  async function fetchAndDisplayDashboardData() {
    try {
      const data = await apiFetch('/api/admin/dashboard-data');

      if (data.vehicles && data.vehicles.length > 0) {
        vehicleTableBody.innerHTML = data.vehicles.map(createVehicleRow).join('');
      } else {
        vehicleTableBody.innerHTML = '<tr><td colspan="4">No vehicles found.</td></tr>';
      }

      // Here you would update other dashboard stats like ETA accuracy, etc.

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      if (vehicleTableBody) {
        vehicleTableBody.innerHTML = `<tr><td colspan="4" class="error-message">Could not load vehicle data.</td></tr>`;
      }
    }
  }

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

  logoutBtn.addEventListener('click', logoutUser);


  const initializeApp = async () => {
    // Auth check
    const role = localStorage.getItem('role');
    if (!accessToken || role !== 'Admin') {
      window.location.href = '/login.html';
      return;
    }

    // Add event listeners
    logoutBtn.addEventListener('click', logoutUser);
  };

  initializeApp();

  // Fetch data immediately and then set an interval to refresh
  fetchAndDisplayDashboardData();
  setInterval(fetchAndDisplayDashboardData, 60000); // Refresh every 60 seconds
});