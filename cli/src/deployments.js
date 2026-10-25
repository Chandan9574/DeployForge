const ACTIVE = ["pending", "cloning", "building", "starting", "checking", "running"];

async function listActive(client, project) {
  const deployments = await client.list(project);
  return deployments.filter((deployment) => ACTIVE.includes(deployment.status));
}

async function resolveDeployment(client, project, value) {
  if (/^[a-f0-9]{24}$/i.test(value)) {
    return client.get(value);
  }
  const deployments = await client.list(project);
  const match = deployments.find((deployment) => deployment.branchName === value) ||
    deployments.find((deployment) => deployment.branchName.includes(value));
  if (!match) throw new Error(`No deployment found for "${value}"`);
  return match;
}

module.exports = { ACTIVE, listActive, resolveDeployment };
