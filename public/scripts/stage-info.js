document.addEventListener('DOMContentLoaded', () => {
  const arrivalList = document.querySelector('.arrival-list');
  const stageHeader = document.querySelector('.page-header h2');
  const accessToken = localStorage.getItem('accessToken');

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

  // Fetch data immediately and then every 30 seconds
  fetchAndDisplayEtas();
  setInterval(fetchAndDisplayEtas, 30000);
});