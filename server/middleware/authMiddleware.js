const jwt = require("jsonwebtoken");

const authMiddleware = (role) => {
  return (req, res, next) => {
    const authHeader = req.header("Authorization");
    
    if (!authHeader) {
      return res
        .status(401)
        .json({ message: "Access denied. No token provided." });
    }

    const tokenParts = authHeader.split(" ");
    if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
      return res.status(400).json({ message: "Invalid token format" });
    }

    const token = tokenParts[1];

    try {
      const verified = jwt.verify(token, process.env.JWT_SECRET);
      req.user = verified;
      if (role && req.user.role !== role) {
        return res
          .status(403)
          .json({ message: "Forbidden: Insufficient permissions" });
      }

      next();
    } catch (error) {
      console.log("Error in token verification:", error);
      res.status(401).json({ message: "Invalid token" });
    }
  };
};

module.exports = authMiddleware;
