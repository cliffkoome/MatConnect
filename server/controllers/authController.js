const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const nodemailer = require("nodemailer");

// Login user
const loginUser = async (req, res) => {
  console.log("Called");
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user) return res.status(404).json({ message: "User not found" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(401).json({ message: "Invalid password" });

    // Generate tokens
    const accessToken = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "15m" }
    );

    // Set refresh token in a secure, HTTP-only cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res
      .status(200)
      .json({ message: "Login successful", accessToken, role: user.role });
  } catch (error) {
    res.status(500).json({ message: "Error logging in", error: error.message });
  }
};

const refreshAccessToken = (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken)
      return res.status(401).json({ message: "Refresh token missing" });

    jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET,
      async (err, decoded) => {
        if (err)
          return res.status(403).json({ message: "Invalid refresh token" });

        const user = await User.findByPk(decoded.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        const newAccessToken = jwt.sign(
          { id: user.id, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "15m" }
        );

        res.status(200).json({ accessToken: newAccessToken });
      }
    );
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error refreshing token", error: error.message });
  }
};

// Create a new user
const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
    });

    res.status(201).json({ message: "User created successfully", user });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating user", error: error.message });
  }
};

const logoutUser = (req, res) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  res.status(200).json({ message: "Logged out successfully" });
};

const me = async (req, res) => {
  console.log("User request:", req.user);

  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not Authenticated" });
    }

    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ["password"] },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user data:", error);
    res
      .status(500)
      .json({ message: "Error fetching user data", error: error.message });
  }
};

const requestPasswordReset = async (req, res, next) => {
  const { email } = req.body;

  try {
    // Sequelize-style lookup
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ message: "User doesn't exist" });

    const jwtSecret = process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET;
    const secret = jwtSecret + user.password;
    const token = jwt.sign({ id: user.id, email: user.email }, secret, { expiresIn: '1h' });

    // Use env vars for mail credentials. For Gmail use an App Password or OAuth2.
    let transporter;
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 465,
        secure: process.env.EMAIL_SECURE !== 'false',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      // verify SMTP credentials early, fall back to Ethereal on failure
      try {
        await transporter.verify();
      } catch (err) {
        console.error('SMTP verify failed, falling back to Ethereal test account:', err.message || err);
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: { user: testAccount.user, pass: testAccount.pass },
        });
        console.warn('Using Ethereal test account. Set correct SMTP env vars for production.');
      }
    } else {
      // Dev fallback
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      console.warn('EMAIL_USER / EMAIL_PASS not set — using Ethereal test account for email delivery.');
    }

    const mailOptions = {
      to: user.email,
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@example.com',
      subject: 'Password Reset Request',
      text: `If you didn't request this, ignore this email.\n\n Reset Token: ${token}\n\n User ID: ${user.id}`,
    };

    const info = await transporter.sendMail(mailOptions);
    // if using Ethereal, log preview URL
    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) console.log('Preview email URL:', preview);

    res.status(200).json({ message: 'Password reset link sent' });
  } catch (error) {
    console.error("requestPasswordReset error:", error);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

const resetPassword = async (req, res, next) => {
  const { id, token } = req.params;
  const { password } = req.body;

  try {
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(400).json({ message: "User not exists!" });
    }

    const jwtSecret = process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET;
    const secret = jwtSecret + user.password;

    // verify token
    jwt.verify(token, secret);

    const encryptedPassword = await bcrypt.hash(password, 10);

    // Sequelize update
    await user.update({ password: encryptedPassword });

    res.status(200).json({ message: 'Password has been reset' });
  } catch (error) {
    console.error("resetPassword error:", error);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = { loginUser, createUser, me, refreshAccessToken, logoutUser, requestPasswordReset, resetPassword };
