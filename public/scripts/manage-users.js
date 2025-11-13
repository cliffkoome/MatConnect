document.addEventListener('DOMContentLoaded', () => {
  const accessToken = localStorage.getItem('accessToken');
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.querySelector('.user-name');
  const logoutLinkDesktop = document.getElementById('logout-link-desktop');
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const mainNav = document.querySelector('.main-nav');
  const usersTableBody = document.getElementById('users-table-body');
  const searchInput = document.getElementById('user-search-input');
  const roleFilterButtons = document.getElementById('role-filter-buttons');

  // Modal elements
  const addUserModal = document.getElementById('add-user-modal');
  const addUserBtn = document.getElementById('add-user-btn');
  const closeModalBtn = document.getElementById('close-user-modal-btn');
  const cancelBtn = document.getElementById('cancel-user-btn');
  const addUserForm = document.getElementById('add-user-form');
  const passwordToggleBtn = document.querySelector('.password-toggle-btn');

  let searchTimeout;

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
    // Handle responses with no content
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
      return response.json();
    }
    return;
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

  function createUserRow(user) {
    const statusClass = user.disabled ? 'badge-danger' : 'badge-success';
    const statusText = user.disabled ? 'Blocked' : 'Active';
    const blockButtonText = user.disabled ? 'Unblock' : 'Block';

    return `
      <tr data-user-id="${user.id}">
        <td>${user.name}</td>
        <td>${user.email}</td>
        <td><span class="badge-role role-${user.role.toLowerCase()}">${user.role}</span></td>
        <td><span class="badge ${statusClass}">${statusText}</span></td>
        <td class="actions-cell">
          <button class="btn-action btn-block" data-disabled="${!user.disabled}">${blockButtonText}</button>
          <button class="btn-action btn-delete">Delete</button>
        </td>
      </tr>
    `;
  }

  async function fetchAndDisplayUsers(query = '', role = '') {
    try {
      const params = new URLSearchParams({ q: query, role: role });
      const users = await apiFetch(`/api/admin/users?${params.toString()}`);

      if (users.length > 0) {
        usersTableBody.innerHTML = users.map(createUserRow).join('');
      } else {
        usersTableBody.innerHTML = '<tr><td colspan="5">No users found.</td></tr>';
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      usersTableBody.innerHTML = '<tr><td colspan="5" class="error-message">Could not load users.</td></tr>';
    }
  }

  async function handleTableClick(event) {
    const target = event.target;
    const row = target.closest('tr');
    if (!row) return;

    const userId = row.dataset.userId;

    if (target.classList.contains('btn-block')) {
      const shouldBeDisabled = target.dataset.disabled === 'true';
      if (confirm(`Are you sure you want to ${shouldBeDisabled ? 'block' : 'unblock'} this user?`)) {
        try {
          await apiFetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ disabled: shouldBeDisabled }),
          });
          fetchAndDisplayUsers(searchInput.value); // Refresh list
        } catch (error) {
          alert(`Error updating user: ${error.message}`);
        }
      }
    }

    if (target.classList.contains('btn-delete')) {
      if (confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) {
        try {
          await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
          row.remove(); // Optimistically remove from UI
        } catch (error) {
          alert(`Error deleting user: ${error.message}`);
        }
      }
    }
  }

  async function handleAddUser(event) {
    event.preventDefault();
    const name = document.getElementById('user-name-input').value;
    const email = document.getElementById('user-email-input').value;
    const password = document.getElementById('user-password-input').value;
    const role = document.getElementById('user-role-select').value;

    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role }),
      });
      closeModal();
      fetchAndDisplayUsers(); // Refresh the list
    } catch (error) {
      alert(`Error creating user: ${error.message}`);
    }
  }

  function togglePasswordVisibility() {
    const passwordInput = document.getElementById('user-password-input');
    const icon = passwordToggleBtn.querySelector('.material-symbols-outlined');
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      icon.textContent = 'visibility_off';
      passwordToggleBtn.title = 'Hide password';
    } else {
      passwordInput.type = 'password';
      icon.textContent = 'visibility';
      passwordToggleBtn.title = 'Show password';
    }
  }

  // Modal handling
  const openModal = () => addUserModal.classList.remove('hidden');
  const closeModal = () => {
    addUserModal.classList.add('hidden');
    addUserForm.reset();
  };

  const initializeApp = async () => {
    const role = localStorage.getItem('role');
    if (!accessToken || role !== 'Admin') {
      window.location.href = '/login.html';
      return;
    }

    try {
      const user = await apiFetch('/api/auth/me/admin');
      userAvatar.src = user.profilePictureUrl || '/images/pfp.jpg';
      userName.textContent = user.name.split(' ')[0];
    } catch (e) {
      console.error("Failed to fetch user profile", e);
    }

    // Event Listeners
    logoutLinkDesktop.addEventListener('click', logoutUser);
    mobileMenuBtn.addEventListener('click', () => mainNav.classList.toggle('is-active'));
    usersTableBody.addEventListener('click', handleTableClick);
    addUserBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    addUserForm.addEventListener('submit', handleAddUser);
    passwordToggleBtn.addEventListener('click', togglePasswordVisibility);

    // Debounced search
    searchInput.addEventListener('keyup', () => {
      clearTimeout(searchTimeout);
      const activeRole = roleFilterButtons.querySelector('button.active').dataset.role;
      searchTimeout = setTimeout(() => {
        fetchAndDisplayUsers(searchInput.value, activeRole);
      }, 300); // 300ms delay
    });

    // Role filter buttons
    roleFilterButtons.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        roleFilterButtons.querySelector('button.active').classList.remove('active');
        e.target.classList.add('active');
        fetchAndDisplayUsers(searchInput.value, e.target.dataset.role);
      }
    });

    // Add mobile logout link
    const navList = mainNav.querySelector('ul');
    const logoutLi = document.createElement('li');
    logoutLi.innerHTML = `<a href="#" id="logout-link-mobile">Logout</a>`;
    navList.appendChild(logoutLi);
    logoutLi.querySelector('#logout-link-mobile').addEventListener('click', logoutUser);

    // Initial data fetch
    fetchAndDisplayUsers();
  };

  initializeApp();
});