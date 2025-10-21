document.addEventListener('DOMContentLoaded', () => {
  const stageGrid = document.getElementById('stage-grid');
  const accessToken = localStorage.getItem('accessToken');

  if (!accessToken) {
    window.location.href = '/login.html';
    return;
  }

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

  fetchAndDisplayStages();
});