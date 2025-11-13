document.addEventListener('DOMContentLoaded', () => {
  const accessToken = localStorage.getItem('accessToken');
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.querySelector('.user-name');
  const logoutLinkDesktop = document.getElementById('logout-link-desktop');
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const mainNav = document.querySelector('.main-nav');
  const statsContainer = document.getElementById('vehicle-stats-container');
  const exportFleetBtn = document.getElementById('export-fleet-report-btn');

  // To keep track of Chart.js instances
  const chartInstances = {};

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

  function createVehicleStatCard(vehicle) {
    const distance = vehicle.DailyDistances[0] ? (vehicle.DailyDistances[0].distanceCovered / 1000).toFixed(2) : '0.00';
    const trips = vehicle.DailyTrips[0] ? vehicle.DailyTrips[0].tripCount : 0;

    const feedbackHtml = vehicle.Feedbacks.length > 0
      ? vehicle.Feedbacks.map(fb => `
          <div class="feedback-item">
            <p><strong>${fb.User.name} (${fb.rating}★):</strong> ${fb.comment || 'No comment'}</p>
          </div>
        `).join('')
      : '<p>No feedback for this vehicle yet.</p>';

    return `
      <div class="vehicle-card panel">
        <div class="card-header">
          <h3>${vehicle.plateNumber}</h3>
          <span class="vehicle-id">ID: ${vehicle.carId}</span>
        </div>
        <div class="vehicle-stats-grid">
          <div class="mini-stat">
            <h4>Distance Today</h4>
            <p>${distance} km</p>
          </div>
          <div class="mini-stat">
            <h4>Trips Today</h4>
            <p>${trips}</p>
          </div>
        </div>
        <div class="feedback-section">
          <h4>Recent Feedback</h4>
          ${feedbackHtml}
        </div>
        <div class="charts-section">
          <h4>Performance Charts</h4>
          <div class="chart-controls" data-vehicle-id="${vehicle.id}">
            <div class="chart-period-filters">
              <button class="active" data-period="daily">Daily</button>
              <button data-period="weekly">Weekly</button>
              <button data-period="monthly">Monthly</button>
            </div>
            <button class="btn btn-outline export-chart-btn">
              <span class="material-symbols-outlined">download</span> Export
            </button>
          </div>
          <div class="chart-container">
            <canvas id="chart-${vehicle.id}"></canvas>
          </div>
        </div>
      </div>
    `;
  }

  async function fetchAndDisplayVehicleStats() {
    try {
      statsContainer.innerHTML = '<div class="loading-placeholder"><p>Loading vehicle stats...</p></div>';
      const vehicles = await apiFetch('/api/mat-admin/vehicle-stats');

      if (vehicles && vehicles.length > 0) {
        statsContainer.innerHTML = vehicles.map(createVehicleStatCard).join('');
        // After rendering, initialize charts and add event listeners
        vehicles.forEach(vehicle => {
          initializeChartForVehicle(vehicle.id);
        });
      } else {
        statsContainer.innerHTML = '<div class="loading-placeholder"><p>You have not added any vehicles yet.</p></div>';
      }
    } catch (error) {
      console.error('Error fetching vehicle stats:', error);
      statsContainer.innerHTML = '<div class="loading-placeholder error-message"><p>Could not load vehicle statistics.</p></div>';
    }
  }

  function initializeChartForVehicle(vehicleId) {
    const chartControls = document.querySelector(`.chart-controls[data-vehicle-id="${vehicleId}"]`);
    const periodFilters = chartControls.querySelector('.chart-period-filters');
    const exportBtn = chartControls.querySelector('.export-chart-btn');

    periodFilters.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        const period = e.target.dataset.period;
        // Update active button
        periodFilters.querySelector('button.active').classList.remove('active');
        e.target.classList.add('active');
        // Fetch new data and update chart
        updateChart(vehicleId, period);
      }
    });

    exportBtn.addEventListener('click', () => {
      const chart = chartInstances[vehicleId];
      if (chart) {
        const a = document.createElement('a');
        a.href = chart.toBase64Image();
        a.download = `chart_vehicle_${vehicleId}_${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
      }
    });

    // Initial chart load (daily)
    updateChart(vehicleId, 'daily');
  }

  async function updateChart(vehicleId, period) {
    try {
      const data = await apiFetch(`/api/mat-admin/vehicles/${vehicleId}/chart-data?period=${period}`);
      renderChart(vehicleId, data, period);
    } catch (error) {
      console.error(`Error fetching chart data for vehicle ${vehicleId}:`, error);
      const canvas = document.getElementById(`chart-${vehicleId}`);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillText('Could not load chart data.', 10, 50);
    }
  }

  function renderChart(vehicleId, data, period) {
    const ctx = document.getElementById(`chart-${vehicleId}`).getContext('2d');

    // Destroy previous chart instance if it exists
    if (chartInstances[vehicleId]) {
      chartInstances[vehicleId].destroy();
    }

    const labels = data.distance.map(d => d.period);

    chartInstances[vehicleId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Distance (km)',
            data: data.distance.map(d => d.total),
            backgroundColor: 'rgba(74, 108, 247, 0.6)', // Primary color with opacity
            borderColor: 'rgba(74, 108, 247, 1)',
            borderWidth: 1,
            yAxisID: 'yDistance',
          },
          {
            label: 'Trips',
            data: data.trips.map(d => d.total),
            backgroundColor: 'rgba(56, 161, 105, 0.6)', // Green color with opacity
            borderColor: 'rgba(56, 161, 105, 1)',
            borderWidth: 1,
            yAxisID: 'yTrips',
          }
        ]
      },
      options: {
        scales: {
          yDistance: {
            type: 'linear',
            display: true,
            position: 'left',
            title: { display: true, text: 'Distance (km)' }
          },
          yTrips: {
            type: 'linear',
            display: true,
            position: 'right',
            title: { display: true, text: 'Trips' },
            grid: { drawOnChartArea: false } // only show the grid for the left axis
          }
        }
      }
    });
  }

  function generateCSV(data) {
    const headers = ['Period', 'Total Distance (km)', 'Total Trips'];
    const rows = Object.entries(data).map(([period, values]) => {
      const distance = values.distance || 0;
      const trips = values.trips || 0;
      return [period, distance, trips];
    });

    // Sort rows by period
    rows.sort((a, b) => a[0].localeCompare(b[0]));

    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";
    csvContent += rows.map(row => row.join(",")).join("\n");

    return encodeURI(csvContent);
  }

  async function handleExportFleetReport() {
    const filters = document.getElementById('fleet-report-filters');
    const period = filters.querySelector('button.active').dataset.period;

    try {
      const data = await apiFetch(`/api/mat-admin/fleet-aggregate-data?period=${period}`);
      if (Object.keys(data).length === 0) {
        alert('No data available to export for the selected period.');
        return;
      }

      const csvUri = generateCSV(data);
      const link = document.createElement("a");
      link.setAttribute("href", csvUri);
      link.setAttribute("download", `fleet_report_${period}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error('Error exporting fleet report:', error);
      alert('Failed to generate the report. Please try again.');
    }
  }

  document.getElementById('fleet-report-filters').addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    document.querySelector('#fleet-report-filters button.active').classList.remove('active');
    e.target.classList.add('active');
  });

  const initializeApp = async () => {
    const role = localStorage.getItem('role');
    if (!accessToken || role !== 'MatAdmin') {
      window.location.href = '/login.html';
      return;
    }

    try {
      const user = await apiFetch('/api/auth/me/mat-admin');
      userAvatar.src = user.profilePictureUrl || '/images/pfp.jpg';
      userName.textContent = user.name.split(' ')[0];
    } catch (e) {
      console.error("Failed to fetch user profile", e);
      // Allow continuing, but with default avatar/name
    }

    logoutLinkDesktop.addEventListener('click', logoutUser);
    mobileMenuBtn.addEventListener('click', () => mainNav.classList.toggle('is-active'));

    // Add mobile logout link
    const navList = mainNav.querySelector('ul');
    const logoutLi = document.createElement('li');
    logoutLi.innerHTML = `<a href="#" id="logout-link-mobile">Logout</a>`;
    navList.appendChild(logoutLi);
    logoutLi.querySelector('#logout-link-mobile').addEventListener('click', logoutUser);

    // Set date input to today
    document.getElementById('stats-date').valueAsDate = new Date();

    exportFleetBtn.addEventListener('click', handleExportFleetReport);

    fetchAndDisplayVehicleStats();
  };

  initializeApp();
});