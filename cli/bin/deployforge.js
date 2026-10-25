#!/usr/bin/env node
const { Command } = require("commander");
const deploy = require("../src/commands/deploy");
const watch = require("../src/commands/watch");
const list = require("../src/commands/list");
const logs = require("../src/commands/logs");
const open = require("../src/commands/open");
const destroy = require("../src/commands/destroy");

const program = new Command();

program
  .name("deployforge")
  .description("Instant self-hosted preview environments for Git branches")
  .version("1.0.0");

program
  .command("deploy")
  .description("Deploy a branch and print its preview URL")
  .argument("<branch>", "branch name to deploy")
  .option("-r, --repo <path>", "repository path", process.cwd())
  .option("-p, --project <name>", "project name")
  .option("-u, --repo-url <url>", "repository URL override")
  .option("-a, --api <url>", "DeployForge API URL")
  .option("--health-path <path>", "HTTP path used to verify the preview", "/")
  .option("--timeout <seconds>", "deployment timeout", "20")
  .action(deploy);

program
  .command("watch")
  .description("Watch Git branches and deploy them automatically")
  .option("-r, --repo <path>", "repository path", process.cwd())
  .option("-p, --project <name>", "project name")
  .option("-a, --api <url>", "DeployForge API URL")
  .option("-u, --repo-url <url>", "repository URL override")
  .option("-i, --interval <seconds>", "poll interval", "3")
  .option("--pattern <glob>", "branch pattern such as feature/*", "*")
  .option("--no-remote", "only inspect local branches")
  .option("--destroy-on-exit", "delete previews when the watcher stops")
  .action(watch);

program
  .command("list")
  .description("List deployments")
  .option("-p, --project <name>", "project name")
  .option("-a, --api <url>", "DeployForge API URL")
  .option("--stats", "include live CPU and memory")
  .action(list);

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
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
