document.addEventListener('DOMContentLoaded', async () => {
    const profileIcon = document.querySelector('.profile-icon');
if (profileIcon) {
  profileIcon.addEventListener('click', () => {
    console.log('Clicked');
    window.location.href = '/user-profile.html';
  });
}

    const token = localStorage.getItem('accessToken');

    if (!token) {
        // If no token is found, the user is not authenticated. Redirect to login.
        window.location.href = '/login.html';
        return;
    }

    try {
        // Fetch the user's profile data from the protected endpoint.
        // This is the critical step where the token MUST be included in the headers.
        const response = await fetch('/api/auth/me/passenger', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 401 || response.status === 403) {
            // Token is invalid or expired. Clear it and redirect to login.
            localStorage.removeItem('accessToken');
            localStorage.removeItem('role');
            window.location.href = '/login.html';
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to fetch user data.');
        }

        const user = await response.json();
        
        // Now you can use the user data to populate the page.
        console.log('Successfully fetched user:', user.name);

    } catch (error) {
        console.error('Error fetching protected data:', error);
        // For any other error, it's safest to redirect to login.
        window.location.href = '/login.html';
    }
});