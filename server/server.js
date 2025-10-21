require("dotenv").config();
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { syncDB } = require("./models");
const app = express();
const passport = require('passport');

const isPkg = typeof process.pkg !== 'undefined';
const basePath = isPkg ? path.dirname(process.execPath) : __dirname;
app.use(express.static(path.join(basePath, '../public')));

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(passport.initialize());

// This should be after dotenv config and passport.initialize
require('./config/passport'); // Import the passport configuration

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/eta", require("./routes/etaRoutes"));
app.use("/api/stages", require("./routes/stageRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

// Sync DB & Start Server
syncDB().then(() => {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log("Open front end at http://localhost:5000/");
  });
});
