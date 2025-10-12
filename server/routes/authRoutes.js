const express = require("express");
const router = express.Router();
const {
  loginUser,
  createUser,
  me,
  refreshAccessToken,
  logoutUser,
  requestPasswordReset,
  resetPassword,
  generateTwoFactorSecret,
  verifyTwoFactorSecret,
  verifyLoginTwoFactor,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const passport = require("passport");

// Login Route
router.post('/login', loginUser);

// Create User Route (For Initial Setup)
router.post('/register', createUser);

// Check login status
router.get('/me/admin', authMiddleware('Admin'), me);
router.get('/me/passenger', authMiddleware('Passenger'), me);

// Refresh Token
router.post('/refresh-token', refreshAccessToken);

// Log Out
router.post('/logout', logoutUser);

//Route to request password reset\
router.post('/requestPasswordReset', requestPasswordReset);

// Route to reset password
router.post('/resetpassword/:id/:token', resetPassword);

// --- Two-Factor Authentication Routes ---
router.post('/2fa/setup', authMiddleware(), generateTwoFactorSecret);
router.post('/2fa/verify', authMiddleware(), verifyTwoFactorSecret);
router.post('/2fa/login', verifyLoginTwoFactor);

// --- Google OAuth Routes ---

// 1. Route to start the Google sign-in flow
router.get('/google', (req, res, next) => {
  console.log('➡️  [authRoutes] - Step 1: Received request to /api/auth/google. Initiating Google authentication.');
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// 2. Callback route that Google redirects to after authentication
router.get('/google/callback', (req, res, next) => {
  console.log('➡️  [authRoutes] - Step 2: Received callback from Google at /api/auth/google/callback.');
  console.log('   Query Parameters from Google:', req.query);
  passport.authenticate('google', { failureRedirect: '/login.html?error=auth_failed', session: false }, (err, user, info) => {
    console.log('➡️  [authRoutes] - Step 4: Passport authentication in callback complete.');
    if (err) { console.error('   Passport authenticate error:', err); return next(err); }
    if (!user) { console.log('   User not found or authentication failed. Info:', info); return res.redirect('/login.html?error=auth_failed'); }
    req.user = user; // Manually attach user to request
    next();
  })(req, res, next);
}, require('../controllers/authController').googleCallback);


module.exports = router;