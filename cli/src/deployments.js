const ACTIVE = ["pending", "cloning", "building", "starting", "checking", "running"];
const IN_PROGRESS = ["pending", "cloning", "building", "starting", "checking"];

function isActive(deployment) {
  return ACTIVE.includes(deployment.status);
}

function isInProgress(deployment) {
  return IN_PROGRESS.includes(deployment.status);
}

async function listActive(client, project) {
  const deployments = await client.list(project);
  return deployments.filter(isActive);
}

function isActiveAtCommit(deployment, commitSha) {
  if (!commitSha || !deployment.commitSha) return false;
  return deployment.commitSha.toLowerCase().startsWith(commitSha.toLowerCase());
}

async function resolveDeployment(client, project, value) {
  if (/^[a-f0-9]{24}$/i.test(value)) {
    return client.get(value);
  }
  const deployments = await client.list(project);
  const matches = deployments.filter((deployment) => deployment.branchName === value);
  const candidate = matches.find(isActive) || matches[0];
  if (candidate) return candidate;

  const partial = deployments.filter((deployment) => deployment.branchName.includes(value));
  const partialCandidate = partial.find(isActive) || partial[0];
  if (partialCandidate) return partialCandidate;
  throw new Error(`No deployment found for "${value}"`);
}

async function resolveDeployments(client, project, values) {
  const resolved = [];
  const seen = new Set();
  for (const value of values) {
    const deployment = await resolveDeployment(client, project, value);
    if (seen.has(deployment._id)) continue;
    seen.add(deployment._id);
    resolved.push(deployment);
  }
  return resolved;
}

module.exports = {
  ACTIVE,
  IN_PROGRESS,
  isActive,
  isActiveAtCommit,
  isInProgress,
  listActive,
  resolveDeployment,
  resolveDeployments
};
