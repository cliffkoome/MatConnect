document.addEventListener('DOMContentLoaded', () => {
  const accessToken = localStorage.getItem('accessToken');
  const ratingStarsContainer = document.querySelector('.rating-stars');

  // Protect the page: redirect to login if not authenticated
  if (!accessToken) {
    window.location.href = '/login.html';
    return;
  }

  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const mainNav = document.querySelector('.main-nav');
  const navList = mainNav.querySelector('ul');
  const headerActions = document.querySelector('.header-actions');

  // --- Mobile Menu Toggle ---
  mobileMenuBtn.addEventListener('click', () => {
    mainNav.classList.toggle('is-active');
  });

  // --- Logout Functionality ---
  function logoutUser() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('role');
    window.location.href = '/login.html';
  }

  // Add logout link to mobile menu
  const logoutLi = document.createElement('li');
  const logoutMobileLink = document.createElement('a');
  logoutMobileLink.href = '#';
  logoutMobileLink.textContent = 'Logout';
  logoutMobileLink.addEventListener('click', (e) => {
    e.preventDefault();
    logoutUser();
  });
  logoutLi.appendChild(logoutMobileLink);
  navList.appendChild(logoutLi);

  // Add logout button for desktop view
  const logoutDesktopBtn = document.createElement('button');
  logoutDesktopBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i>';
  logoutDesktopBtn.title = 'Logout';
  logoutDesktopBtn.classList.add('logout-btn-desktop');
  logoutDesktopBtn.addEventListener('click', logoutUser);
  // Add it before the profile icon
  headerActions.insertBefore(logoutDesktopBtn, headerActions.querySelector('.user-profile'));

  // --- Star Rating Functionality ---
  if (ratingStarsContainer) {
    const stars = ratingStarsContainer.querySelectorAll('label');
    const starInputs = ratingStarsContainer.querySelectorAll('input[type="radio"]');

    starInputs.forEach(input => {
      input.addEventListener('change', () => {
        const selectedValue = parseInt(input.value, 10);
        stars.forEach((star, index) => {
          // The labels are in reverse order in the DOM (5, 4, 3, 2, 1).
          // The visual order is (1, 2, 3, 4, 5) due to `flex-direction: row-reverse`.
          const starValue = parseInt(star.htmlFor.replace('star', ''), 10);
          star.classList.toggle('is-selected', starValue <= selectedValue);
        });
      });
    });
  }
});