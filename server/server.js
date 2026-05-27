require("dotenv").config();
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { syncDB } = require("./models");
const app = express();
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const passport = require("passport");

const isPkg = typeof process.pkg !== "undefined";
const basePath = isPkg ? path.dirname(process.execPath) : __dirname;
app.use(express.static(path.join(basePath, "../public")));

// Middleware
// Trust the first proxy in front of the app (e.g., Nginx, Heroku, etc.)
// This is crucial for rate limiting to work correctly behind a proxy.
app.set("trust proxy", 1);
app.use(helmet()); // Adds various security headers
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5000", // Restrict to frontend origin
    credentials: true, // Allow cookies to be sent
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(passport.initialize());

// Apply rate limiting to authentication routes to prevent brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again after 15 minutes",
});

// This should be after dotenv config and passport.initialize
require("./config/passport"); // Import the passport configuration

// Routes
app.use("/api/auth", authLimiter, require("./routes/authRoutes"));
app.use("/api/eta", require("./routes/etaRoutes")); // ETA routes are already authenticated
app.use("/api/stages", require("./routes/stageRoutes")); // Rate limiting is applied within the route file
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/feedback", require("./routes/feedbackRoutes"));
app.use("/api/mat-admin", require("./routes/matAdminRoutes"));

// --- Background ETA Update Service ---
const { startEtaUpdateCycle } = require("./services/cronService");
const UPDATE_INTERVAL_SECONDS = 30;

// --- Centralized Error Handler ---
const errorHandler = require("./middleware/errorHandler");
app.use(errorHandler);

// --- Start Server Function ---
const startServer = async () => {
  try {
    // 1. Connect to and sync the database.
    await syncDB();

    // 2. If DB sync is successful, start the server.
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log("Open front end at http://localhost:5000/");

      // 3. Start the background ETA update cycle using node-cron.
      startEtaUpdateCycle(UPDATE_INTERVAL_SECONDS);
    });
  } catch (error) {
    console.error(
      "❌ Failed to start server due to database connection issues. Please check your .env file and ensure your database is running.",
    );
    process.exit(1); // Exit with a failure code.
  }
};

// --- Run the application ---
startServer();
