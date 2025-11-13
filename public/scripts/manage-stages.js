document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const stageList = document.getElementById('stage-list');
  const detailsTitle = document.getElementById('details-title');
  const detailsCoords = document.getElementById('details-coords');
  const assignedVehiclesList = document.getElementById('assigned-vehicles-list');
  const assignVehicleSelect = document.getElementById('assign-vehicle-select');
  const assignVehicleBtn = document.getElementById('assign-vehicle-btn');
  const detailsFooter = document.getElementById('details-footer');

  // Header elements
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const mainNav = document.querySelector('.main-nav');
  const userMenu = document.querySelector('.user-menu');
  const logoutLinkDesktop = document.getElementById('logout-link-desktop');

  // Stage Modal Elements
  const addStageBtn = document.getElementById('add-stage-btn');
  const stageModal = document.getElementById('add-stage-modal');
  const closeStageModalBtn = document.getElementById('close-modal-btn');
  const cancelStageBtn = document.getElementById('cancel-btn');
  const addStageForm = document.getElementById('add-stage-form');

  // Vehicle Modal Elements
  const addVehicleBtn = document.getElementById('add-vehicle-btn');
  const vehicleModal = document.getElementById('add-vehicle-modal');
  const closeVehicleModalBtn = document.getElementById('close-vehicle-modal-btn');
  const cancelVehicleBtn = document.getElementById('cancel-vehicle-btn');
  const addVehicleForm = document.getElementById('add-vehicle-form');
  const vehicleOwnerSelect = document.getElementById('vehicle-owner-select');

  document.querySelector('.avatar').src = '/images/pfp.jpg';

  // --- State ---
  let stages = [];
  let vehicles = [];
  let selectedStage = null;
  let matAdmins = [];
  const accessToken = localStorage.getItem('accessToken');

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

  // --- Render Functions ---
  const renderStageList = () => {
    stageList.innerHTML = '';
    if (stages.length === 0) {
      stageList.innerHTML = '<p>No stages found. Add one to get started.</p>';
      return;
    }
    stages.forEach(stage => {
      const li = document.createElement('li');
      li.className = 'stage-list-item';
      li.dataset.stageId = stage.id;
      li.innerHTML = `
        <div class="item-icon"><span class="material-symbols-outlined">flag</span></div>
        <p>${stage.name}</p>
        <span class="material-symbols-outlined chevron">chevron_right</span>
      `;
      li.addEventListener('click', () => handleStageSelect(stage.id));
      stageList.appendChild(li);
    });
  };

  const renderStageDetails = () => {
    if (!selectedStage) {
      detailsTitle.textContent = 'Select a Stage';
      detailsCoords.textContent = 'Details will appear here.';
      assignedVehiclesList.innerHTML = '<p>Select a stage to see assigned vehicles.</p>';
      detailsFooter.classList.add('hidden');
      return;
    }

    detailsFooter.classList.remove('hidden');
    detailsTitle.textContent = selectedStage.name;
    detailsCoords.innerHTML = `<span class="material-symbols-outlined">location_on</span> Lat: ${selectedStage.latitude}, Long: ${selectedStage.longitude}`;

    // Highlight selected stage in the list
    document.querySelectorAll('.stage-list-item').forEach(item => {
      item.classList.toggle('active', item.dataset.stageId == selectedStage.id);
      if (item.dataset.stageId == selectedStage.id) item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // Render assigned vehicles
    assignedVehiclesList.innerHTML = '';
    if (selectedStage.Vehicles.length === 0) {
      assignedVehiclesList.innerHTML = '<p>No vehicles assigned to this stage.</p>';
    } else {
      selectedStage.Vehicles.forEach(vehicle => {
        const li = document.createElement('li');
        li.className = 'vehicle-list-item';
        li.innerHTML = `
          <div class="vehicle-info">
            <span class="material-symbols-outlined">local_shipping</span>
            <p>${vehicle.plateNumber}</p>
          </div>
          <div class="vehicle-actions">
            <button class="icon-button unassign-btn" title="Unassign from stage" data-vehicle-id="${vehicle.id}">
              <span class="material-symbols-outlined">link_off</span>
            </button>
            <button class="icon-button delete-btn" title="Delete vehicle permanently" data-vehicle-id="${vehicle.id}">
              <span class="material-symbols-outlined">delete_forever</span>
            </button>
          </div>
        `;
        li.querySelector('.unassign-btn').addEventListener('click', () => handleRemoveVehicle(vehicle.id));
        li.querySelector('.delete-btn').addEventListener('click', () => handleDeleteVehicle(vehicle.id));
        assignedVehiclesList.appendChild(li);
      });
    }

    // Render vehicle assignment dropdown
    const assignedVehicleIds = new Set(selectedStage.Vehicles.map(v => v.id));
    const availableVehicles = vehicles.filter(v => !assignedVehicleIds.has(v.id));
    assignVehicleSelect.innerHTML = '<option value="">Select a vehicle to assign...</option>';
    availableVehicles.forEach(v => {
      assignVehicleSelect.innerHTML += `<option value="${v.id}">${v.plateNumber}</option>`;
    });
  };

  // --- Event Handlers ---
  const handleStageSelect = (stageId) => {
    selectedStage = stages.find(s => s.id === stageId);
    renderStageDetails();
  };

  const handleAddStage = async (event) => {
    event.preventDefault();
    const name = document.getElementById('stage-name-input').value;
    const latitude = document.getElementById('latitude-input').value;
    const longitude = document.getElementById('longitude-input').value;

    try {
      const newStage = await apiFetch('/api/admin/stages', {
        method: 'POST',
        body: JSON.stringify({ name, latitude, longitude }),
      });
      stages.push({ ...newStage, Vehicles: [] }); // Add to local state
      stages.sort((a, b) => a.name.localeCompare(b.name)); // Keep it sorted
      renderStageList();
      closeStageModal();
    } catch (error) {
      alert(`Error creating stage: ${error.message}`);
    }
  };

  const handleAssignVehicle = async () => {
    const vehicleId = assignVehicleSelect.value;
    if (!vehicleId || !selectedStage) return;

    try {
      await apiFetch('/api/admin/stages/assign-vehicle', {
        method: 'POST',
        body: JSON.stringify({ stageId: selectedStage.id, vehicleId: parseInt(vehicleId) }),
      });

      // Refresh data to reflect the change
      const vehicleToAdd = vehicles.find(v => v.id == vehicleId);
      selectedStage.Vehicles.push(vehicleToAdd);
      renderStageDetails();
    } catch (error) {
      alert(`Error assigning vehicle: ${error.message}`);
    }
  };

  const handleRemoveVehicle = async (vehicleId) => {
    if (!selectedStage) return;

    try {
      await apiFetch(`/api/admin/stages/${selectedStage.id}/vehicles/${vehicleId}`, {
        method: 'DELETE',
      });

      // Refresh data to reflect the change
      selectedStage.Vehicles = selectedStage.Vehicles.filter(v => v.id !== vehicleId);
      renderStageDetails();
    } catch (error) {
      alert(`Error removing vehicle: ${error.message}`);
    }
  };

  const handleDeleteVehicle = async (vehicleId) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;

    if (!confirm(`Are you sure you want to permanently delete vehicle ${vehicle.plateNumber}? This action cannot be undone.`)) {
      return;
    }

    try {
      await apiFetch(`/api/admin/vehicles/${vehicleId}`, {
        method: 'DELETE',
      });
      // Refetch all data to ensure UI consistency
      await initializeApp(true);
    } catch (error) {
      alert(`Error deleting vehicle: ${error.message}`);
    }
  };

  const handleAddVehicle = async (event) => {
    event.preventDefault();
    const plateNumber = document.getElementById('vehicle-plate-input').value;
    const carId = document.getElementById('vehicle-carid-input').value;
    const ownerId = vehicleOwnerSelect.value;

    try {
      const newVehicle = await apiFetch('/api/admin/vehicles', {
        method: 'POST',
        body: JSON.stringify({ plateNumber, carId, ownerId: ownerId || null }),
      });
      vehicles.push(newVehicle);
      vehicles.sort((a, b) => a.plateNumber.localeCompare(b.plateNumber));
      renderStageDetails(); // Re-render dropdown with new vehicle
      closeVehicleModal();
    } catch (error) {
      alert(`Error creating vehicle: ${error.message}`);
    }
  };

  // --- Modal Logic ---
  const openStageModal = () => stageModal.classList.remove('hidden');
  const closeStageModal = () => {
    stageModal.classList.add('hidden');
    addStageForm.reset();
  };

  const openVehicleModal = () => vehicleModal.classList.remove('hidden');
  const closeVehicleModal = () => {
    vehicleModal.classList.add('hidden');
    addVehicleForm.reset();
  };

  const populateOwnerDropdown = () => {
    vehicleOwnerSelect.innerHTML = '<option value="">-- No Owner --</option>';
    matAdmins.forEach(admin => {
      vehicleOwnerSelect.innerHTML += `<option value="${admin.id}">${admin.name}</option>`;
    });
  };

  addStageBtn.addEventListener('click', openStageModal);
  closeStageModalBtn.addEventListener('click', closeStageModal);
  cancelStageBtn.addEventListener('click', closeStageModal);
  stageModal.addEventListener('click', (e) => {
    if (e.target === stageModal) closeStageModal();
  });

  addVehicleBtn.addEventListener('click', openVehicleModal);
  closeVehicleModalBtn.addEventListener('click', closeVehicleModal);
  cancelVehicleBtn.addEventListener('click', closeVehicleModal);
  vehicleModal.addEventListener('click', (e) => {
    if (e.target === vehicleModal) closeVehicleModal();
  });

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
  // --- Initialization ---
  const initializeApp = async (isRefresh = false) => {
    // Auth check
    const role = localStorage.getItem('role');
    if (!accessToken || role !== 'Admin') {
      window.location.href = '/login.html';
      return;
    }
    if (isRefresh) selectedStage = null; // Reset selection on refresh

    // --- Mobile Menu Toggle ---
    mobileMenuBtn.addEventListener('click', () => {
      mainNav.classList.toggle('is-active');
    });

    // --- Desktop User Menu Toggle ---
    if (userMenu) {
      userMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        userMenu.classList.toggle('is-active');
      });
    }

    // --- Add Logout Links ---
    if (!isRefresh) {
      const navList = mainNav.querySelector('ul');
      const logoutLi = document.createElement('li');
      logoutLi.innerHTML = `<a href="#" class="logout-link">Logout</a>`;
      navList.appendChild(logoutLi);
      logoutLi.querySelector('.logout-link').addEventListener('click', logoutUser);
      logoutLinkDesktop.addEventListener('click', logoutUser);

      // Add event listeners
      addStageForm.addEventListener('submit', handleAddStage);
      addVehicleForm.addEventListener('submit', handleAddVehicle);
      assignVehicleBtn.addEventListener('click', handleAssignVehicle);
    }

    // Initial data fetch
    try {
      const [stagesData, vehiclesData, matAdminsData] = await Promise.all([
        apiFetch('/api/admin/stages'),
        apiFetch('/api/admin/vehicles'),
        apiFetch('/api/admin/mat-admins'),
      ]);
      stages = stagesData;
      vehicles = vehiclesData;
      matAdmins = matAdminsData;
      renderStageList();
      populateOwnerDropdown();
      renderStageDetails(); // Render the initial empty state for details
    } catch (error) {
      stageList.innerHTML = `<p class="error-message">Failed to load data: ${error.message}</p>`;
    }
  };

  // Close user menu when clicking outside
  document.addEventListener('click', () => {
    if (userMenu && userMenu.classList.contains('is-active')) {
      userMenu.classList.remove('is-active');
    }
  });

  initializeApp();
});