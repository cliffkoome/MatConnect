const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { User } = require('../models');

const callbackURL = `${process.env.SERVER_URL || 'http://localhost:5000'}/api/auth/google/callback`;

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: callbackURL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Find a user based on their Google ID
      let user = await User.findOne({ where: { googleId: profile.id } });

      if (user) {
        // If user exists, proceed
        return done(null, user);
      }

      // If no user with that Google ID, check for an existing user with the same email
      user = await User.findOne({ where: { email: profile.emails[0].value } });

      if (user) {
        // If a user with that email exists, link the Google ID to their account
        user.googleId = profile.id;
        await user.save();
        return done(null, user);
      }

      // If no user exists at all, create a new one
      const newUser = await User.create({
        googleId: profile.id,
        name: profile.displayName,
        email: profile.emails[0].value,
        role: 'Passenger', // Default role for new sign-ups
        // Password is not set for OAuth users
      });

      return done(null, newUser);

    } catch (err) {
      return done(err, false);
    }
  }
));

// These are not strictly necessary for JWT-based sessions but are good practice with Passport
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await User.findByPk(id);
  done(null, user);
});