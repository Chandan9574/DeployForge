function notFound(request, response) {
  response.status(404).json({ message: "Route not found", code: "NOT_FOUND" });
}

module.exports = notFound;
