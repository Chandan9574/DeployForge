const useColor = Boolean(process.stdout.isTTY) && process.env.NO_COLOR !== "1";
const paint = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);

const ui = {
  dim: (text) => paint("2", text),
  bold: (text) => paint("1", text),
  green: (text) => paint("32", text),
  yellow: (text) => paint("33", text),
  red: (text) => paint("31", text),
  cyan: (text) => paint("36", text),
  step: (text) => console.log(`${ui.dim("->")} ${text}`),
  ok: (text) => console.log(`${ui.green("ok")} ${text}`),
  warn: (text) => console.log(`${ui.yellow("!")} ${text}`),
  error: (text) => console.error(`${ui.red("x")} ${text}`),
  info: (text) => console.log(`${ui.dim("-")} ${text}`),
  title: (text) => console.log(`\n${ui.bold(text)}`),
  url: (text) => console.log(`\n${ui.green("Preview available:")}\n${ui.cyan(text)}\n`)
};

function formatDuration(ms) {
  if (!ms) return "0s";
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

module.exports = { ui, formatDuration, formatBytes };
