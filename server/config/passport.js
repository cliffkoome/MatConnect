const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { User } = require("../models");
require("dotenv").config();

// Construct the absolute callback URL. This is crucial for Google OAuth.
const callbackURL = `${process.env.SERVER_BASE_URL || `http://localhost:${process.env.PORT || 5000}`}/api/auth/google/callback`;

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: callbackURL,
      // Pass the request object to the callback to access session info, etc.
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        let user = await User.findOne({ where: { email: email } });

        if (user) {
          // User exists. If they don't have a googleId, link the account.
          if (!user.googleId) {
            user.googleId = profile.id;
            user.profilePictureUrl =
              user.profilePictureUrl ||
              (profile.photos && profile.photos.length > 0
                ? profile.photos[0].value
                : null);
            await user.save();
          }
        } else {
          // User does not exist, create a new one.
          user = await User.create({
            googleId: profile.id,
            name: profile.displayName,
            email: email,
            profilePictureUrl:
              profile.photos && profile.photos.length > 0
                ? profile.photos[0].value
                : null,
            role: "Passenger", // Default role for new Google sign-ups
          });
        }

        // The 'done' callback attaches the user to req.user
        return done(null, user);
      } catch (err) {
        console.error("   ❌ Error in Google OAuth strategy:", err);
        return done(err, null);
      }
    },
  ),
);
