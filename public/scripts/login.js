document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.querySelector('.form');
  const accessToken = localStorage.getItem('accessToken');
  const role = localStorage.getItem('role');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.querySelector('#email-address').value.trim();
      const password = document.querySelector('#password').value;

      try {
        const response = await fetch('http://localhost:5000/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email, password })
        });

        const result = await response.json();

        if (response.ok) {
          localStorage.setItem('accessToken', result.accessToken);
          localStorage.setItem('role', result.role);
          if (result.role === 'Admin') {
            window.location.href = '../admin-dashboard.html';
          } else if (result.role === 'Passenger') {
            window.location.href = '../select-stage.html';
          }
        } else {
          alert(result.message || 'Login failed');
        }
      } catch (error) {
        alert('An error occurred. Please try again.');
      }
    });
  }
});