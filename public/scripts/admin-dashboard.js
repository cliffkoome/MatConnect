document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.avatar').src = '/images/pfp.jpg';

  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const mainNav = document.querySelector('.main-nav');
  const navList = mainNav.querySelector('ul');
  const userMenu = document.querySelector('.user-menu');
  const logoutLinkDesktop = document.getElementById('logout-link-desktop');

  const vehicleTableBody = document.querySelector('.data-table tbody');
  const feedbackList = document.getElementById('feedback-list');
  const accessToken = localStorage.getItem('accessToken');

  // Stat card elements
  const totalVehiclesStat = document.getElementById('total-vehicles-stat');
  const onlineVehiclesStat = document.getElementById('online-vehicles-stat');
  const totalStagesStat = document.getElementById('total-stages-stat');



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
    let locationCell = vehicle.location || 'N/A';

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

      // Update vehicle table and stats
      if (data.vehicles && data.vehicles.length > 0) {
        vehicleTableBody.innerHTML = data.vehicles.map(createVehicleRow).join('');
        totalVehiclesStat.textContent = data.vehicles.length;
        const onlineCount = data.vehicles.filter(v => v.status.toLowerCase() === 'online').length;
        onlineVehiclesStat.textContent = onlineCount;
      } else {
        vehicleTableBody.innerHTML = '<tr><td colspan="4">No vehicles found.</td></tr>';
        totalVehiclesStat.textContent = 0;
        onlineVehiclesStat.textContent = 0;
      }

      // Update stages stat
      const stages = await apiFetch('/api/stages');
      totalStagesStat.textContent = stages.length || 0;

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      if (vehicleTableBody) {
        vehicleTableBody.innerHTML = `<tr><td colspan="4" class="error-message">Could not load vehicle data.</td></tr>`;
      }
    }
  }

  // Mock function to display feedback
  function displayMockFeedback() {
    const mockFeedback = [
      {
        name: "Sarah W.",
        time: "2d ago",
        rating: 5,
        comment: "Great service, the ETA was spot on!",
        avatar: "https://i.pravatar.cc/150?img=1"
      },
      {
        name: "David M.",
        time: "3d ago",
        rating: 4,
        comment: "The app is helpful, but the ETA could be more accurate sometimes.",
        avatar: "https://i.pravatar.cc/150?img=3"
      },
      {
        name: "Jane D.",
        time: "5d ago",
        rating: 5,
        comment: "Very clean vehicle and polite driver.",
        avatar: "https://i.pravatar.cc/150?img=5"
      }
    ];

    feedbackList.innerHTML = mockFeedback.map(item => {
      const stars = Array(5).fill(0).map((_, i) =>
        `<span class="material-symbols-outlined ${i < item.rating ? '' : 'star-empty'}">star</span>`
      ).join('');

      return `
        <div class="feedback-item">
          <img alt="User Avatar" class="avatar" src="${item.avatar}" />
          <div class="feedback-body">
            <div class="feedback-meta"><p>${item.name}</p><time>${item.time}</time></div>
            <div class="star-rating">${stars}</div>
            <p class="feedback-comment">${item.comment}</p>
          </div>
        </div>
      `;
    }).join('');
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

  const initializeApp = async () => {
    // Auth check
    const role = localStorage.getItem('role');
    if (!accessToken || role !== 'Admin') {
      window.location.href = '/login.html';
      return;
    }

    // --- Mobile Menu Toggle ---
    mobileMenuBtn.addEventListener('click', () => {
      mainNav.classList.toggle('is-active');
    });

    // --- Desktop User Menu Toggle ---
    if (userMenu) {
      userMenu.addEventListener('click', (e) => {
        // Prevents the document click listener from firing immediately
        e.stopPropagation();
        userMenu.classList.toggle('is-active');
      });
    }

    // --- Add Logout Link to Nav ---
    const logoutLi = document.createElement('li');
    logoutLi.innerHTML = `<a href="#" class="logout-link">Logout</a>`;
    navList.appendChild(logoutLi);
    logoutLi.querySelector('.logout-link').addEventListener('click', logoutUser);
    logoutLinkDesktop.addEventListener('click', logoutUser);
  };

  initializeApp();

  // Fetch data immediately and then set an interval to refresh
  fetchAndDisplayDashboardData();
  setInterval(fetchAndDisplayDashboardData, 60000); // Refresh every 60 seconds

  // Display mock feedback for demonstration
  displayMockFeedback();

  // Close user menu when clicking outside
  document.addEventListener('click', () => {
    if (userMenu && userMenu.classList.contains('is-active')) {
      userMenu.classList.remove('is-active');
    }
  });
});