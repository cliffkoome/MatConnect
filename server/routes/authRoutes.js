const express = require("express");
const router = express.Router();
const { loginUser, createUser, me, refreshAccessToken, logoutUser } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

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

module.exports = router;