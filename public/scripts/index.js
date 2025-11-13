const loginBtns = document.querySelectorAll('.login');
const signupBtns = document.querySelectorAll('.signup');

const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
const mainNav = document.querySelector('.main-nav');
const navLinks = document.querySelector('.nav-links');


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
mobileMenuBtn.addEventListener('click', () => {
  mainNav.classList.toggle('is-active');
  })

// Only try to fetch user data if a token exists
if (accessToken && role) {
  // Use relative paths for API calls to work in any environment
  const endpoint = role === 'Admin' ? '/api/auth/me/admin' : '/api/auth/me/passenger';
  
  fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })
    .then(res => {
      if (!res.ok) {
        // If token is invalid/expired, clear storage
        throw new Error('Invalid token');
      }
      return res.json();
    })
    .then(data => {
      if (data && data.id) {
        console.log('Logged in as:', role);
        headerButtonsDiv.innerHTML = `
          <button class="logout primary-btn btn-2">
            <i class="fa-solid fa-right-from-bracket">
          </i></button>
        `;

        // Add logout button to mobile nav
        const logoutLi = document.createElement('li');
        const logoutMobileBtn = document.createElement('a');
        logoutMobileBtn.href = '#';
        logoutMobileBtn.textContent = 'Logout';
        logoutMobileBtn.classList.add('logout');
        logoutLi.appendChild(logoutMobileBtn);
        navLinks.appendChild(logoutLi);


        const logoutBtn = document.querySelector('.logout');
        logoutBtn.addEventListener('click', () => {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('role');
          alert('Logged out successfully');
          window.location.href = 'index.html';
        });

        // Add event listener for the new mobile logout button
        logoutMobileBtn.addEventListener('click', (e) => {
          e.preventDefault();
          localStorage.removeItem('accessToken');
          localStorage.removeItem('role');
          window.location.href = 'index.html';
        });
        heroBtnsDiv.innerHTML = `
          <button class="dashboard primary-btn btn-1">Select a Stage</button>
        `;
        const dashboardBtn = document.querySelector('.dashboard');
        dashboardBtn.addEventListener('click', () => {
          window.location.href = role === 'Admin' ? 'admin-dashboard.html' : 'select-stage.html';
        });
      }
    })
    .catch(() => {
      // If fetch fails for any reason (e.g., invalid token), clear localStorage
      localStorage.removeItem('accessToken');
      localStorage.removeItem('role');
    });
}