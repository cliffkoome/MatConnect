const { ValidationError, UniqueConstraintError } = require("sequelize");

const errorHandler = (err, req, res, next) => {
  // Log the full error for debugging purposes on the server
  console.error(err);

  // Handle malformed JSON request bodies
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ message: "Malformed JSON in request body" });
  }

  // Handle Sequelize validation errors specifically
  if (err instanceof ValidationError || err instanceof UniqueConstraintError) {
    const errors = err.errors.map((e) => ({
      message: e.message,
      field: e.path,
    }));
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  // Send a generic, user-friendly message to the client
  // to avoid leaking implementation details.
  res
    .status(500)
    .json({ message: "An unexpected internal server error occurred." });
};

module.exports = errorHandler;
