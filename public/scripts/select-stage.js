const profileIcon = document.querySelector('.profile-icon');
if (profileIcon) {
  profileIcon.addEventListener('click', () => {
    console.log('Clicked');
    window.location.href = '/user-profile.html';
  });
}