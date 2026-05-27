const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const {
  loginUser,
  createUser,
  updateProfile,
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
router.post(
  "/login",
  body("email", "Please provide a valid email").isEmail().normalizeEmail(),
  body("password", "Password cannot be empty").notEmpty(),
  loginUser,
);

// Create User Route (For Initial Setup)
router.post(
  "/register",
  body("name", "Name is required").notEmpty().trim().escape(),
  body("email", "Please provide a valid email").isEmail().normalizeEmail(),
  body("password", "Password must be at least 6 characters long").isLength({
    min: 6,
  }),
  createUser,
);

// Check login status
router.get("/me/admin", authMiddleware("Admin"), me);
router.get("/me/passenger", authMiddleware("Passenger"), me);
router.get("/me/mat-admin", authMiddleware("MatAdmin"), me);

// Update user profile
router.put(
  "/me",
  authMiddleware(),
  body("name").optional().trim().escape(),
  body("phoneNumber")
    .optional({ checkFalsy: true })
    .isString()
    .withMessage("Invalid phone number"),
  updateProfile,
);

// Refresh Token
router.post("/refresh-token", refreshAccessToken);

// Log Out
router.post("/logout", authMiddleware(), logoutUser);

//Route to request password reset\
router.post("/requestPasswordReset", requestPasswordReset);

// Route to reset password
router.post(
  "/resetpassword/:id/:token",
  param("id", "Invalid user ID").isInt({ min: 1 }),
  param("token", "Invalid token format").isJWT(),
  body("password", "Password must be at least 6 characters long").isLength({
    min: 6,
  }),
  resetPassword,
);

// --- Two-Factor Authentication Routes ---
router.post("/2fa/setup", authMiddleware(), generateTwoFactorSecret);
router.post("/2fa/verify", authMiddleware(), verifyTwoFactorSecret);
router.post("/2fa/disable", authMiddleware(), disableTwoFactor);
router.post("/2fa/login", verifyLoginTwoFactor);

// --- Google OAuth Routes ---

// 1. Route to start the Google sign-in flow
router.get("/google", (req, res, next) => {
  passport.authenticate("google", { scope: ["profile", "email"] })(
    req,
    res,
    next,
  );
});

// 2. Callback route that Google redirects to after authentication
router.get(
  "/google/callback",
  (req, res, next) => {
    passport.authenticate(
      "google",
      { failureRedirect: "/login.html?error=auth_failed", session: false },
      (err, user, info) => {
        if (err) {
          console.error("   Passport authenticate error:", err);
          return next(err);
        }
        if (!user) {
          console.log(
            "   User not found or authentication failed. Info:",
            info,
          );
          return res.redirect("/login.html?error=auth_failed");
        }
        req.user = user; // Manually attach user to request
        next();
      },
    )(req, res, next);
  },
  require("../controllers/authController").googleCallback,
);

module.exports = router;
