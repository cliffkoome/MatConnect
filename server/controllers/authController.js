const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const nodemailer = require("nodemailer");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");

// Login user
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user) return res.status(404).json({ message: "User not found" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(401).json({ message: "Invalid password" });

    // Check if 2FA is enabled for the user
    if (user.twoFactorEnabled) {
      // If 2FA is enabled, generate a temporary token
      const tempToken = jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "5m" } // Short-lived token
      );
      return res.status(200).json({
        twoFactorRequired: true,
        tempToken: tempToken,
      });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
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

    // Convert to a plain object to add custom properties
    const userObject = user.get({ plain: true });

    // Add a flag to indicate if the user is a Google user
    userObject.isGoogleUser = !!user.googleId;
    // Don't send the googleId itself to the client
    delete userObject.googleId;

    res.status(200).json(userObject);
  } catch (error) {
    console.error("Error fetching user data:", error);
    res
      .status(500)
      .json({ message: "Error fetching user data", error: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, phoneNumber } = req.body;
    const userId = req.user.id;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const fieldsToUpdate = {};
    if (name) {
      fieldsToUpdate.name = name;
    }

    // Normalize and validate phone number if provided
    if (phoneNumber !== undefined) {
      // Basic validation and normalization (can be improved)
      let normalizedPhone = phoneNumber.replace(/\s+/g, ''); // remove spaces
      if (normalizedPhone.startsWith('07')) {
        normalizedPhone = `+254${normalizedPhone.substring(1)}`;
      }
      fieldsToUpdate.phoneNumber = normalizedPhone;
    }

    await user.update(fieldsToUpdate);

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error updating profile", error: error.message });
  }
}

const requestPasswordReset = async (req, res, next) => {
  const { email } = req.body;

  try {
    // Sequelize-style lookup
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ message: "User doesn't exist" });

    const secret = process.env.JWT_SECRET + user.password;
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

    const secret = process.env.JWT_SECRET + user.password;

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

// --- Two-Factor Authentication Controllers ---

const generateTwoFactorSecret = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const secret = speakeasy.generateSecret({
      name: `Realtime Matatu (${user.email})`,
    });

    // Temporarily store the un-verified secret.
    // In a production app, you might want a separate field for a pending secret to not overwrite an existing enabled one.
    await user.update({ twoFactorSecret: secret.base32 });

    qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
      if (err) {
        console.error("Error generating QR code:", err);
        return res.status(500).json({ message: "Error generating QR code" });
      }
      res.json({ secret: secret.base32, qrCodeUrl: data_url });
    });
  } catch (error) {
    console.error("Error setting up 2FA:", error);
    res.status(500).json({ message: "Error setting up 2FA" });
  }
};

const verifyTwoFactorSecret = async (req, res) => {
  const { token } = req.body;
  try {
    const user = await User.findByPk(req.user.id);
    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ message: "2FA not set up or user not found." });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: token,
    });

    if (verified) {
      await user.update({ twoFactorEnabled: true });
      res.json({ message: "2FA enabled successfully" });
    } else {
      res.status(400).json({ message: "Invalid 2FA token" });
    }
  } catch (error) {
    console.error("Error verifying 2FA token:", error);
    res.status(500).json({ message: "Error verifying 2FA token" });
  }
};

const verifyLoginTwoFactor = async (req, res) => {
  const { tempToken, token } = req.body;
  try {
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ message: "2FA is not enabled for this user." });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: token,
      window: 1, // Allow for a 30-second window of tolerance
    });

    if (verified) {
      // 2FA code is correct, issue the final access token
      const accessToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "15m" });
      const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });

      res.cookie("refreshToken", refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" });
      res.json({ message: "Login successful", accessToken, role: user.role });
    } else {
      res.status(400).json({ message: "Invalid 2FA token" });
    }
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired temporary token." });
  }
};

// This function is called after passport successfully authenticates the user.
const googleCallback = (req, res) => {
  const user = req.user;
  const accessToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "15m" });
  res.redirect(`/auth-success.html?accessToken=${accessToken}&role=${user.role}`);
};

const disableTwoFactor = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // For enhanced security, you might require a password or 2FA token to disable.
    // For simplicity here, we'll just disable it.
    await user.update({
      twoFactorEnabled: false,
      twoFactorSecret: null, // Clear the secret for security
    });

    res.json({ message: "2FA disabled successfully" });
  } catch (error) {
    console.error("Error disabling 2FA:", error);
    res.status(500).json({ message: "Error disabling 2FA" });
  }
};

module.exports = { loginUser, createUser, me, updateProfile, refreshAccessToken, logoutUser, requestPasswordReset, resetPassword, generateTwoFactorSecret, verifyTwoFactorSecret, verifyLoginTwoFactor, googleCallback, disableTwoFactor };
