function trimText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : value;
}

module.exports = { trimText };
