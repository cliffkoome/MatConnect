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
  disableTwoFactor,
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
router.post('/2fa/disable', authMiddleware(), disableTwoFactor);
router.post('/2fa/login', verifyLoginTwoFactor);

// --- Google OAuth Routes ---

// 1. Route to start the Google sign-in flow
router.get('/google', (req, res, next) => {
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// 2. Callback route that Google redirects to after authentication
router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', { failureRedirect: '/login.html?error=auth_failed', session: false }, (err, user, info) => {
    if (err) { console.error('   Passport authenticate error:', err); return next(err); }
    if (!user) { console.log('   User not found or authentication failed. Info:', info); return res.redirect('/login.html?error=auth_failed'); }
    req.user = user; // Manually attach user to request
    next();
  })(req, res, next);
}, require('../controllers/authController').googleCallback);


module.exports = router;