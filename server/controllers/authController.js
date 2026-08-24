const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const nodemailer = require("nodemailer");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const { validationResult } = require("express-validator");
const { v4: uuidv4 } = require("uuid");
const { addToBlocklist } = require("../services/tokenBlocklistService");

// Login user
const loginUser = async (req, res, next) => {
  // ValidationResult check is done in authRoutes.js
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.disabled)
      return res.status(403).json({
        message:
          "Your account has been disabled. Please contact an administrator.",
      });

    // If user has no password, they likely registered via OAuth.
    // Prevent them from logging in with a password.
    if (!user.password) {
      return res.status(400).json({
        message: "Please sign in using Google.",
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(401).json({ message: "Invalid password" });

    // Check if 2FA is enabled for the user
    if (user.twoFactorEnabled) {
      // If 2FA is enabled, generate a temporary token
      const tempToken = jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }, // Short-lived token
      );
      return res.status(200).json({
        twoFactorRequired: true,
        tempToken: tempToken,
      });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      {
        id: user.id,
        role: user.role,
        jti: uuidv4(),
        disabled: user.disabled, // Include disabled status in token
        // Include tokensValidFrom timestamp in token for quick validation without DB query
        // Convert to milliseconds for consistent comparison with iat
        tokensValidFrom: user.tokensValidFrom.getTime(),
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" },
    );

    const refreshToken = jwt.sign(
      { id: user.id, jti: uuidv4() }, // JTI for refresh token blocklisting
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" },
    );

    // Set refresh token in a secure, HTTP-only cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true, // Must be true if sameSite is 'none'
      sameSite: "none",
    });

    res
      .status(200)
      .json({ message: "Login successful", accessToken, role: user.role });
  } catch (error) {
    next(error);
  }
};

const refreshAccessToken = (req, res, next) => {
  try {
    // ValidationResult check is done in authRoutes.js
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken)
      return res.status(401).json({ message: "Refresh token missing" });

    // CSRF Protection: Require the (potentially expired) access token in the Authorization header.
    // This proves the client possesses both tokens, which a CSRF attacker cannot do.
    const authHeader = req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Access token missing for refresh" });
    }
    const accessToken = authHeader.split(" ")[1];

    // Verify the refresh token first
    jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET,
      async (err, oldDecodedRefresh) => {
        if (err)
          return res.status(403).json({ message: "Invalid refresh token" });

        // Check if the refresh token has already been used/invalidated.
        if (
          oldDecodedRefresh.jti &&
          (await isBlocklisted(oldDecodedRefresh.jti))
        ) {
          return res
            .status(401)
            .json({ message: "Token has been invalidated" });
        }

        try {
          // Verify the access token's signature (ignoring expiration) to prove it was issued by us.
          const decodedAccess = jwt.verify(
            accessToken,
            process.env.JWT_SECRET,
            { ignoreExpiration: true },
          );
          if (!decodedAccess || decodedAccess.id !== oldDecodedRefresh.id) {
            return res.status(403).json({ message: "Token mismatch" });
          }
        } catch (verifyError) {
          // Catches malformed tokens that would otherwise crash the server.
          return res
            .status(401)
            .json({ message: "Invalid access token for refresh" });
        }

        const user = await User.findByPk(oldDecodedRefresh.id);
        // Also check if the user is disabled before issuing a new token.
        if (!user || user.disabled) {
          return res
            .status(403)
            .json({ message: "User account is disabled or not found" });
        }
        // Check if tokens have been invalidated since this refresh token was issued.
        if (oldDecodedRefresh.iat * 1000 < user.tokensValidFrom.getTime()) {
          return res
            .status(401)
            .json({ message: "Token has been invalidated" });
        }

        const newAccessToken = jwt.sign(
          {
            id: user.id,
            role: user.role,
            jti: uuidv4(),
            disabled: user.disabled,
            tokensValidFrom: user.tokensValidFrom.getTime(),
          },
          process.env.JWT_SECRET,
          { expiresIn: "15m" },
        );

        // Implement Refresh Token Rotation: issue a new refresh token.
        const newRefreshToken = jwt.sign(
          { id: user.id, jti: uuidv4() }, // JTI for refresh token blocklisting
          process.env.JWT_REFRESH_SECRET,
          { expiresIn: "7d" },
        );

        // Invalidate the old refresh token by adding it to the blocklist.
        if (oldDecodedRefresh.jti && oldDecodedRefresh.exp) {
          await addToBlocklist(oldDecodedRefresh.jti, oldDecodedRefresh.exp);
        }

        res.cookie("refreshToken", newRefreshToken, {
          httpOnly: true,
          secure: true, // Must be true if sameSite is 'none'
          sameSite: "none",
        });

        res.status(200).json({
          accessToken: newAccessToken,
          role: user.role,
        });
      },
    );
  } catch (error) {
    next(error);
  }
};

// Create a new user
const createUser = async (req, res, next) => {
  // ValidationResult check is done in authRoutes.js
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;
    let role = "Passenger"; // Default role

    // --- Bootstrap Logic: Make the first user an Admin ---
    const userCount = await User.count();
    if (userCount === 0) {
      role = "Admin";
      console.log(
        "✨ No users found. Promoting first registered user to Admin.",
      );
    }
    // --- End Bootstrap Logic ---

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role,
    });
    delete user.dataValues.password;

    res.status(201).json({ message: "User created successfully", user });
  } catch (error) {
    next(error);
  }
};

const logoutUser = async (req, res, next) => {
  try {
    // Invalidate the access token by adding it to a blocklist.
    const authHeader = req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.decode(token);
      if (decoded && decoded.jti && decoded.exp) {
        await addToBlocklist(decoded.jti, decoded.exp);
      }
    }

    // Also invalidate the refresh token.
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      try {
        // Verify the signature to prevent DoS attacks with forged tokens.
        const decoded = jwt.verify(
          refreshToken,
          process.env.JWT_REFRESH_SECRET,
        );
        if (decoded && decoded.jti && decoded.exp) {
          await addToBlocklist(decoded.jti, decoded.exp);
        }
      } catch (e) {
        // Ignore invalid/malformed refresh tokens during logout.
      }
    }

    // Clear the refresh token cookie.
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: true, // Must be true if sameSite is 'none'
      sameSite: "none",
    });

    res.status(200).json({ message: "Logged out successfully." });
  } catch (error) {
    next(error);
  }
};

const me = async (req, res, next) => {
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
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  // ValidationResult check is done in authRoutes.js
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

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
      let normalizedPhone = phoneNumber.replace(/\s+/g, ""); // Remove spaces
      // Example: If it starts with 0, and is not already international, assume Kenyan and prepend +254
      if (normalizedPhone.startsWith("0") && !normalizedPhone.startsWith("+")) {
        normalizedPhone = `+254${normalizedPhone.substring(1)}`; // Basic assumption for Kenyan numbers
      } // For full internationalization, use a library like libphonenumber-js
      fieldsToUpdate.phoneNumber = normalizedPhone;
    }

    await user.update(fieldsToUpdate);

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    next(error);
  }
};

const requestPasswordReset = async (req, res, next) => {
  const { email } = req.body;

  try {
    // Sequelize-style lookup
    const user = await User.findOne({ where: { email } });

    // To prevent user enumeration and timing attacks, and to handle OAuth-only users,
    // we proceed only if a user with a password exists. Otherwise, we perform a dummy
    // operation and return a generic message.
    if (!user || !user.password) {
      // To prevent timing attacks, perform a dummy hash operation
      // that takes a similar amount of time as the JWT signing.
      await bcrypt.hash(uuidv4(), 1);
      return res.status(200).json({
        message:
          "If an account with that email exists, a password reset link has been sent.",
      });
    }

    const secret = process.env.JWT_SECRET + user.password;
    const token = jwt.sign({ id: user.id, email: user.email }, secret, {
      expiresIn: "1h",
    });

    // Use env vars for mail credentials. For Gmail use an App Password or OAuth2.
    let transporter;
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || "smtp.gmail.com",
        port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 465,
        secure: process.env.EMAIL_SECURE !== "false",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      // verify SMTP credentials early, fall back to Ethereal on failure
      try {
        await transporter.verify();
      } catch (err) {
        console.error(
          "SMTP verify failed, falling back to Ethereal test account:",
          err.message || err,
        );
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: { user: testAccount.user, pass: testAccount.pass },
        });
        console.warn(
          "Using Ethereal test account. Set correct SMTP env vars for production.",
        );
      }
    } else {
      // Dev fallback
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      console.warn(
        "EMAIL_USER / EMAIL_PASS not set — using Ethereal test account for email delivery.",
      );
    }

    const mailOptions = {
      to: user.email,
      from:
        process.env.EMAIL_FROM ||
        process.env.EMAIL_USER ||
        "no-reply@example.com",
      subject: "Password Reset Request",
      text: `If you didn't request this, ignore this email.\n\n Reset Token: ${token}\n\n User ID: ${user.id}`,
    };

    // Send email in a separate try/catch to prevent leaking user existence on SMTP failure.
    try {
      const info = await transporter.sendMail(mailOptions);
      // if using Ethereal, log preview URL
      const preview = nodemailer.getTestMessageUrl(info);
      if (preview) console.log("Preview email URL:", preview);
    } catch (emailError) {
      console.error("❌ Failed to send password reset email:", emailError);
      // Do not throw an error to the client, just log it.
    }

    res.status(200).json({
      message:
        "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  const { id, token } = req.params;
  const { password } = req.body;

  // ValidationResult check is done in authRoutes.js
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

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
    await user.update({
      password: encryptedPassword,
      tokensValidFrom: new Date(),
    }); // Invalidate existing sessions

    res.status(200).json({ message: "Password has been reset" });
  } catch (error) {
    next(error);
  }
};

// --- Two-Factor Authentication Controllers ---

const generateTwoFactorSecret = async (req, res, next) => {
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
    next(error);
  }
};

const verifyTwoFactorSecret = async (req, res, next) => {
  const { token } = req.body;
  try {
    const user = await User.findByPk(req.user.id);
    if (!user || !user.twoFactorSecret) {
      return res
        .status(400)
        .json({ message: "2FA not set up or user not found." });
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
    next(error);
  }
};

const verifyLoginTwoFactor = async (req, res, next) => {
  const { tempToken, token } = req.body;
  try {
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res
        .status(400)
        .json({ message: "2FA is not enabled for this user." });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: token,
      window: 1, // Allow for a 30-second window of tolerance
    });

    if (verified) {
      // 2FA code is correct, issue the final access token
      const accessToken = jwt.sign(
        {
          id: user.id,
          role: user.role,
          jti: uuidv4(),
          disabled: user.disabled,
          tokensValidFrom: user.tokensValidFrom.getTime(),
        },
        process.env.JWT_SECRET,
        { expiresIn: "15m" },
      );
      const refreshToken = jwt.sign(
        { id: user.id, jti: uuidv4() },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: "7d" },
      ); // JTI for refresh token blocklisting

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: true, // Must be true if sameSite is 'none'
        sameSite: "none",
      });
      res.json({ message: "Login successful", accessToken, role: user.role });
    } else {
      res.status(400).json({ message: "Invalid 2FA token" });
    }
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res
        .status(401)
        .json({ message: "2FA session expired, please log in again." });
    } else if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: "Invalid 2FA session token." });
    } else {
      // Pass to error handler for other unexpected errors.
      next(error);
    }
  }
};

// This function is called after passport successfully authenticates the user.
const googleCallback = (req, res) => {
  const user = req.user;
  const accessToken = jwt.sign(
    {
      id: user.id,
      role: user.role,
      jti: uuidv4(),
      disabled: user.disabled,
      tokensValidFrom: user.tokensValidFrom.getTime(),
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" },
  );
  // Use a URL fragment (#) instead of a query string (?) to pass the token.
  // This is more secure as fragments are not sent to the server and are less likely to be logged.
  // The frontend (auth-success.html) will need to be updated to parse the token from the URL fragment.
  res.redirect(
    `/auth-success.html#accessToken=${accessToken}&role=${user.role}`,
  );
};

const disableTwoFactor = async (req, res, next) => {
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
    next(error);
  }
};

module.exports = {
  loginUser,
  createUser,
  me,
  updateProfile,
  refreshAccessToken,
  logoutUser,
  requestPasswordReset,
  resetPassword,
  generateTwoFactorSecret,
  verifyTwoFactorSecret,
  verifyLoginTwoFactor,
  googleCallback,
  disableTwoFactor,
};
