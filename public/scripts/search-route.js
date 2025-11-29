document.addEventListener('DOMContentLoaded', () => {
  const accessToken = localStorage.getItem('accessToken');
  if (!accessToken) {
    window.location.href = '/login.html';
    return;
  }

  // --- DOM Elements ---
  const destinationSelect = document.getElementById('destination-select');
  const resultsContainer = document.getElementById('results-container');
  const originStagesList = document.getElementById('origin-stages-list');
  const noResultsMessage = document.getElementById('no-results-message');
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const mainNav = document.querySelector('.main-nav');
  const navList = mainNav.querySelector('ul');
  const headerActions = document.querySelector('.header-actions');

  // --- API Helper ---
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

  // --- Functions ---
  const populateDestinationDropdown = async () => {
    try {
      const stages = await apiFetch('/api/stages');
      destinationSelect.innerHTML = '<option value="" disabled selected>Select a destination</option>';
      stages.forEach(stage => {
        const option = document.createElement('option');
        option.value = stage.id;
        option.textContent = stage.name;
        destinationSelect.appendChild(option);
      });
    } catch (error) {
      console.error('Error fetching stages:', error);
      destinationSelect.innerHTML = '<option value="" disabled>Could not load destinations</option>';
    }
  };

  const handleDestinationChange = async () => {
    const destinationId = destinationSelect.value;
    if (!destinationId) return;

    originStagesList.innerHTML = '<p>Loading available routes...</p>';
    resultsContainer.classList.remove('hidden');
    noResultsMessage.classList.add('hidden');

    try {
      const originStages = await apiFetch(`/api/stages/by-destination?destinationId=${destinationId}`);
      if (originStages.length > 0) {
        originStagesList.innerHTML = originStages.map(stage => `
          <div class="origin-stage-card">
            <span class="material-symbols-outlined">directions_bus</span>
            <div class="stage-info">
              <h4>Board at: ${stage.name}</h4>
              <p>Matatus from this stage go to your selected destination.</p>
            </div>
          </div>
        `).join('');
      } else {
        resultsContainer.classList.add('hidden');
        noResultsMessage.classList.remove('hidden');
      }
    } catch (error) {
      console.error('Error fetching origin stages:', error);
      originStagesList.innerHTML = `<p class="error">Could not load routes. ${error.message}</p>`;
    }
  };

  // --- Logout Functionality ---
  function logoutUser() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('role');
    window.location.href = '/login.html';
  }

  // --- Initialization ---
  const initialize = () => {
    // Mobile Menu
    mobileMenuBtn.addEventListener('click', () => mainNav.classList.toggle('is-active'));

    // Add logout link to mobile menu
    const logoutLi = document.createElement('li');
    logoutLi.innerHTML = `<a href="#" class="logout-link">Logout</a>`;
    logoutLi.addEventListener('click', (e) => { e.preventDefault(); logoutUser(); });
    navList.appendChild(logoutLi);

    // Add logout button for desktop view
    const logoutDesktopBtn = document.createElement('button');
    logoutDesktopBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i>';
    logoutDesktopBtn.title = 'Logout';
    logoutDesktopBtn.classList.add('logout-btn-desktop');
    logoutDesktopBtn.addEventListener('click', logoutUser);
    headerActions.insertBefore(logoutDesktopBtn, headerActions.querySelector('.user-profile'));

    destinationSelect.addEventListener('change', handleDestinationChange);
    populateDestinationDropdown();
  };

  initialize();
});