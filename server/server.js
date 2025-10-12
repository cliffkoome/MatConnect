require("dotenv").config();
const path = require("path");
const express = require("express");
const { syncDB } = require("./models");
const app = express();
const passport = require('passport');
require('./config/passport'); // Import the passport configuration

const isPkg = typeof process.pkg !== 'undefined';
const basePath = isPkg ? path.dirname(process.execPath) : __dirname;
app.use(express.static(path.join(basePath, '../public')));

// Middleware
app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use(passport.initialize());

// Sync DB & Start Server
syncDB().then(() => {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log("Open front end at http://localhost:5000/");
  });
});
