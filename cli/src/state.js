const fs = require("fs/promises");
const path = require("path");

function statePath(repo) {
  return path.join(path.resolve(repo), ".deployforge", "state.json");
}

async function loadState(repo) {
  try {
    return JSON.parse(await fs.readFile(statePath(repo), "utf8"));
  } catch {
    return { branches: {} };
  }
}

async function saveState(repo, state) {
  const file = statePath(repo);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`);
  await fs.rename(temporary, file);
}

module.exports = { loadState, saveState, statePath };
