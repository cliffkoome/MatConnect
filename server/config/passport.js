const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { User } = require('../models');
require('dotenv').config();

console.log("Configuring Passport...");
console.log("GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID ? "Loaded" : "MISSING");
console.log("GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET ? "Loaded" : "MISSING");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "Loaded" : "MISSING");

// Construct the absolute callback URL. This is crucial for Google OAuth.
const callbackURL = `${process.env.SERVER_BASE_URL || `http://localhost:${process.env.PORT || 5000}`}/api/auth/google/callback`;
console.log("Using Google OAuth Callback URL:", callbackURL);

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: callbackURL,
    // Pass the request object to the callback to access session info, etc.
    passReqToCallback: true
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      console.log('➡️  [passport.js] - Step 3: Google strategy verify callback executed.');
      console.log('   Received profile from Google:', { id: profile.id, displayName: profile.displayName, emails: profile.emails });
      
      console.log('   Finding or creating user in the database...');
      const [user, created] = await User.findOrCreate({
        where: { googleId: profile.id },
        defaults: {
          name: profile.displayName,
          email: profile.emails[0].value,
          googleId: profile.id,
          role: 'Passenger' // Default role for new Google sign-ups
        }
      });

      if (created) {
        console.log('   ✅ New user created via Google:', user.toJSON());
      } else {
        console.log('   ✅ Existing user found via Google:', user.toJSON());
      }

      // The 'done' callback attaches the user to req.user
      return done(null, user);
    } catch (err) {
      console.error("   ❌ Error in Google OAuth strategy:", err);
      return done(err, null);
    }
  }
));

// Note: We are not using serializeUser/deserializeUser because we set `session: false` in the route.
// Passport's session support is not needed for a JWT-based API.