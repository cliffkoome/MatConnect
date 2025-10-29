document.addEventListener('DOMContentLoaded', () => {
  const stageGrid = document.getElementById('stage-grid');
  const accessToken = localStorage.getItem('accessToken');

  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const mainNav = document.querySelector('.main-nav');
  const headerActions = document.querySelector('.header-actions');

  if (!accessToken) {
    window.location.href = '/login.html';
    return;
  }

  // --- Mobile Menu Toggle ---
  mobileMenuBtn.addEventListener('click', () => {
    mainNav.classList.toggle('is-active');
  });

  // --- Add Logout Buttons ---
  addLogoutButtons();

  // A simple function to create a stage card element
  function createStageCard(stage) {
    const card = document.createElement('a');
    card.className = 'stage-card';
    // Pass the stage ID in the URL to the next page
    card.href = `/stage-info.html?stageId=${stage.id}`;

    // Use a placeholder image for now. You can add image URLs to your Stage model later.
    const imageNumber = Math.floor(Math.random() * 6) + 1; // Cycle through 6 placeholder images
    console.log(imageNumber);
    

    card.innerHTML = `
      <div class="card-image">
        <img alt="${stage.name}" src="./images/stage-${imageNumber}.jpg">
        <div class="overlay"></div>
      </div>
      <div class="card-content">
        <h3>${stage.name}</h3>
        <p>Lat: ${stage.latitude}, Long: ${stage.longitude}</p>
      </div>
    `;
    return card;
  }

  // Fetches stages from the API and displays them
  async function fetchAndDisplayStages() {
    try {
      const response = await fetch('/api/stages', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch stages.');
      }

      const stages = await response.json();
      stageGrid.innerHTML = ''; // Clear the "Loading..." message

      if (stages.length > 0) {
        stages.forEach(stage => {
          const card = createStageCard(stage);
          stageGrid.appendChild(card);
        });
      } else {
        stageGrid.innerHTML = '<p>No stages are available at the moment.</p>';
      }
    } catch (error) {
      console.error('Error:', error);
      stageGrid.innerHTML = '<p class="error-message">Could not load stages. Please try again later.</p>';
    }
  }

  // --- Logout Functionality ---
  function logoutUser() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('role');
    window.location.href = '/login.html';
  }

  function addLogoutButtons() {
    // 1. Add logout button to mobile navigation
    const navList = mainNav.querySelector('ul');
    const logoutLi = document.createElement('li');
    const logoutMobileLink = document.createElement('a');
    logoutMobileLink.href = '#';
    logoutMobileLink.textContent = 'Logout';
    logoutMobileLink.classList.add('logout-link');
    logoutMobileLink.addEventListener('click', (e) => {
      e.preventDefault();
      logoutUser();
    });
    logoutLi.appendChild(logoutMobileLink);
    navList.appendChild(logoutLi);

    // 2. Add logout button for desktop view
    const logoutDesktopBtn = document.createElement('button');
    logoutDesktopBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i>';
    logoutDesktopBtn.title = 'Logout';
    logoutDesktopBtn.classList.add('logout-btn-desktop');
    logoutDesktopBtn.addEventListener('click', logoutUser);
    headerActions.insertBefore(logoutDesktopBtn, headerActions.firstChild);
  }

  fetchAndDisplayStages();
});