function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error);

  const statusCode = error.statusCode || error.status || (error.name === "ValidationError" ? 400 : 500);
  const message = statusCode >= 500 ? "Unexpected server error" : error.message;

  if (statusCode >= 500) console.error(error);
  response.status(statusCode).json({
    message,
    code: error.code || "REQUEST_ERROR"
  });
}

module.exports = errorHandler;
