require("dotenv").config();

const express = require("express");
const { syncDB } = require("./models");
const app = express();

// Middleware
app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/authRoutes"));

// Sync DB & Start Server
syncDB().then(() => {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log("Open front end at http://localhost:5000/");
  });
});
