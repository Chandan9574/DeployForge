#!/usr/bin/env node
const { Command } = require("commander");
const init = require("../src/commands/init");
const deploy = require("../src/commands/deploy");
const watch = require("../src/commands/watch");
const list = require("../src/commands/list");
const stop = require("../src/commands/stop");
const restart = require("../src/commands/restart");
const status = require("../src/commands/status");
const logs = require("../src/commands/logs");
const open = require("../src/commands/open");
const destroy = require("../src/commands/destroy");
const branches = require("../src/commands/branches");
const { ui } = require("../src/ui");

const program = new Command();

program
  .name("deployforge")
  .description("Instant self-hosted preview environments for Git branches")
  .version("1.1.0")
  .showSuggestionAfterError();

const repoOption = ["-r, --repo <path>", "repository path"];

program
  .command("init")
  .description("Initialize DeployForge in a Git repository")
  .argument("[directory]", "repository directory", ".")
  .option(...repoOption)
  .option("-p, --project <name>", "project name")
  .option("-a, --api <url>", "DeployForge API URL")
  .option("-u, --repo-url <url>", "HTTPS repository URL")
  .option("--dockerfile <path>", "Dockerfile path")
  .option("--context <path>", "Docker build context")
  .option("--health-path <path>", "HTTP path used to verify previews")
  .option("--image <image>", "use an allowlisted image instead of building a Dockerfile")
  .option("--pattern <glob>", "default branch pattern for deploy --all and watch")
  .option("--deploy", "deploy the current branch after initialization")
  .option("--watch", "start watching branches after initialization")
  .option("--no-check", "skip the API reachability check")
  .action(init);

program
  .command("deploy")
  .description("Deploy one or more branches, each in its own container")
  .argument("[branches...]", "branches to deploy (defaults to the current branch)")
  .option(...repoOption)
  .option("-p, --project <name>", "project name")
  .option("-a, --api <url>", "DeployForge API URL")
  .option("-u, --repo-url <url>", "repository URL override")
  .option("--all", "deploy every branch found on origin")
  .option("--pattern <glob>", "branch pattern used with --all")
  .option("--commit <sha>", "deploy a specific commit")
  .option("--dockerfile <path>", "Dockerfile path")
  .option("--context <path>", "Docker build context")
  .option("--health-path <path>", "HTTP path used to verify the preview")
  .option("--image <image>", "deploy an allowlisted image instead of a Dockerfile")
  .option("--timeout <seconds>", "deployment timeout")
  .option("--no-wait", "return as soon as the deployment is queued")
  .option("--no-remote", "use local branches instead of origin")
  .option("--json", "print deployment JSON")
  .action(deploy);

program
  .command("list")
  .alias("ls")
  .description("List deployments")
  .option("-p, --project <name>", "project name")
  .option("-a, --api <url>", "DeployForge API URL")
  .option("--all", "list deployments for every project")
  .option("--stats", "include live CPU and memory")
  .option("--json", "print deployment JSON")
  .action(list);

program
  .command("stop")
  .description("Stop a branch preview")
  .argument("[deployments...]", "branch names or deployment ids (defaults to the current branch)")
  .option(...repoOption)
  .option("-p, --project <name>", "project name")
  .option("-a, --api <url>", "DeployForge API URL")
  .option("--all", "stop every active deployment in the project")
  .option("--json", "print deployment JSON")
  .action(stop);

program
  .command("restart")
  .description("Restart a branch preview")
  .argument("[deployments...]", "branch names or deployment ids (defaults to the current branch)")
  .option(...repoOption)
  .option("-p, --project <name>", "project name")
  .option("-a, --api <url>", "DeployForge API URL")
  .option("--all", "restart every active deployment in the project")
  .option("--commit <sha>", "restart from a specific commit")
  .option("--timeout <seconds>", "deployment timeout")
  .option("--no-wait", "return as soon as the restart is queued")
  .option("--json", "print deployment JSON")
  .action(restart);

program
  .command("status")
  .description("Show details for a branch or deployment")
  .argument("[deployment]", "branch name or deployment id")
  .option(...repoOption)
  .option("-p, --project <name>", "project name")
  .option("-a, --api <url>", "DeployForge API URL")
  .option("--json", "print deployment JSON")
  .action(status);

program
  .command("watch")
  .description("Watch Git branches and deploy each one automatically")
  .option(...repoOption)
  .option("-p, --project <name>", "project name")
  .option("-a, --api <url>", "DeployForge API URL")
  .option("-u, --repo-url <url>", "repository URL override")
  .option("-i, --interval <seconds>", "poll interval")
  .option("--pattern <glob>", "branch pattern such as feature/*")
  .option("--once", "scan once and exit")
  .option("--no-remote", "only inspect local branches")
  .option("--destroy-on-exit", "delete watched previews when the watcher stops")
  .action(watch);

program
  .command("branches")
  .description("List branches that can be deployed")
  .option(...repoOption)
  .option("-a, --api <url>", "DeployForge API URL")
  .option("--pattern <glob>", "branch pattern such as feature/*")
  .option("--local", "only inspect local branches")
  .option("--json", "print branch JSON")
  .action(branches);

program
  .command("logs")
  .description("Show deployment logs")
  .argument("<deployment>", "deployment id or branch name")
  .option("-p, --project <name>", "project name")
  .option("-a, --api <url>", "DeployForge API URL")
  .option("-f, --follow", "follow logs")
  .action(logs);

program
  .command("open")
  .description("Print or open a preview URL")
  .argument("<deployment>", "deployment id or branch name")
  .option("-p, --project <name>", "project name")
  .option("-a, --api <url>", "DeployForge API URL")
  .option("--browser", "open the URL in the default browser")
  .action(open);

program
  .command("destroy")
  .description("Stop a preview and remove its container and route")
  .argument("<deployment>", "deployment id or branch name")
  .option("-p, --project <name>", "project name")
  .option("-a, --api <url>", "DeployForge API URL")
  .action(destroy);

program.parseAsync(process.argv).catch((error) => {
  ui.error(error.message || String(error));
  process.exitCode = 1;
});
