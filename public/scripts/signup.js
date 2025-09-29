const fullNameEl = document.getElementById("full-name");
const emailAddressEl = document.getElementById("email-address");
const passwordEl = document.getElementById("password");
const confirmPasswordEl = document.getElementById("confirm-password");
const signupForm = document.querySelector(".form");

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fullName = fullNameEl.value.trim();
  const email = emailAddressEl.value.trim();
  const password = passwordEl.value;
  const confirmPassword = confirmPasswordEl.value;

  if (!fullName || !email || !password || !confirmPassword) {
    alert("Please fill in all fields.");
    return;
  }

  if (password !== confirmPassword) {
    alert("Passwords do not match.");
    return;
  }

  try {
    const response = await fetch("http://localhost:5000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fullName, email, password, role: "Passenger" }),
    });

    const result = await response.json();

    if (response.ok) {
      alert("Signup successful! Please log in.");
      window.location.href = "../login.html";
    } else {
      alert(result.message || "Signup failed.");
    }
  } catch (error) {
    alert("An error occurred. Please try again.");
  }
});