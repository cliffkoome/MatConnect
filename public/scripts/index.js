const loginBtns = document.querySelectorAll('.login');
const signupBtns = document.querySelectorAll('.signup');

const accessToken = localStorage.getItem('accessToken');
const role = localStorage.getItem('role');

const headerButtonsDiv = document.querySelector('.header-buttons');
const heroBtnsDiv = document.querySelector('.hero-btns');

loginBtns.forEach(btn => {
  btn.addEventListener('click', ()=> {
    window.location.href = 'login.html'
  })
})


signupBtns.forEach(btn => {
  btn.addEventListener('click', ()=> {
    window.location.href = 'signup.html'
  })
})

{
  const endpoint = role === 'Admin'
    ? 'http://localhost:5000/api/auth/me/admin'
    : 'http://localhost:5000/api/auth/me/passenger';

  fetch(endpoint, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })
  .then(res => res.json())
  .then(data => {
    if (data && data.id) {
      console.log('Logged in as:', role);
      headerButtonsDiv.innerHTML = `
        <span>Welcome, ${data.name}!</span>
        <button class="logout primary-btn btn-2">Logout</button>
      `;
      const logoutBtn = document.querySelector('.logout');
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('role');
        alert('Logged out successfully');
        window.location.href = 'index.html';
      });
      heroBtnsDiv.innerHTML = `
        <button class="dashboard primary-btn btn-1">Select a Stage</button>
      `;
      const dashboardBtn = document.querySelector('.dashboard');
      dashboardBtn.addEventListener('click', () => {
        window.location.href = role === 'Admin' ? 'admin-dashboard.html' : 'select-stage.html';
      });
    } else {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('role');
    }
  })
  .catch(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('role');
  });
}