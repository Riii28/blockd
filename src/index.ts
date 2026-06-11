import * as readline from "readline";
import { spawnSync } from "child_process";
import chalk from "chalk";
import type { BlockdConfig } from "./types.js";
import { startDnsmasq, reloadDnsmasq, stopDnsmasq } from "./dnsmasq.js";
import { loadState, saveState } from "./state.js";

const ESC = "\x1b[";
const move = {
   up: (n = 1) => process.stdout.write(`${ESC}${n}A`),
   col: (n = 1) => process.stdout.write(`${ESC}${n}G`),
   clearLine: () => process.stdout.write(`${ESC}2K`),
};

const writeLine = (text: string): void =>
   void process.stdout.write(text + "\n");
const write = (text: string): void => void process.stdout.write(text);

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function createSpinner(label: string) {
   let i = 0;
   let interval: NodeJS.Timeout;

   const start = () => {
      write("\n");
      interval = setInterval(() => {
         move.up(1);
         move.col(1);
         move.clearLine();
         write(
            `  ${chalk.magenta(spinnerFrames[i++ % spinnerFrames.length])} ${chalk.dim(label)}\n`,
         );
      }, 80);
   };

   const stop = (success: boolean, msg: string) => {
      clearInterval(interval);
      move.up(1);
      move.col(1);
      move.clearLine();
      if (success) {
         writeLine(`  ${chalk.green("✔")} ${msg}`);
      } else {
         writeLine(`  ${chalk.red("✖")} ${msg}`);
      }
   };

   return { start, stop };
}

const banner = (): void => {
   const result = spawnSync("figlet", ["blockd"], { encoding: "utf-8" });

   writeLine("");
   if (result.stdout) {
      for (const line of result.stdout.trimEnd().split("\n")) {
         writeLine(chalk.hex("#9f5afd")(line));
      }
   } else {
      writeLine(chalk.hex("#9f5afd").bold("  blockd"));
   }

   write(chalk.dim("  ────────────────────────────────\n"));
   writeLine(chalk.dim("  DNS-level blocker via dnsmasq"));
   writeLine("");
};

const statusBar = (state: BlockdConfig): void => {
   const active = chalk.hex("#9f5afd")("●");
   writeLine(
      `  ${active}  ${chalk.dim("port")} ${chalk.white(state.port)}   ` +
         `${chalk.dim("upstream")} ${chalk.white(state.upstreamDns)}   ` +
         `${chalk.dim("blocked")} ${chalk.white(state.blockedDomains.length)}`,
   );
   writeLine(chalk.dim("  ────────────────────────────────"));
   writeLine("");
};

const log = {
   info: (msg: string) =>
      writeLine(`  ${chalk.hex("#64b5f6")("ℹ")} ${chalk.dim(msg)}`),
   success: (msg: string) => writeLine(`  ${chalk.green("✔")} ${msg}`),
   error: (msg: string) => writeLine(`  ${chalk.red("✖")} ${chalk.dim(msg)}`),
   warn: (msg: string) => writeLine(`  ${chalk.yellow("⚠")} ${chalk.dim(msg)}`),
   domain: (d: string) => chalk.hex("#c792ea")(d),
   muted: (s: string) => chalk.dim(s),
   blank: () => writeLine(""),
};

const state: BlockdConfig = loadState();

let isShuttingDown = false;

const shutdown = async (signal?: string): Promise<never> => {
   if (isShuttingDown) process.exit(0);
   isShuttingDown = true;

   rl.close();
   log.blank();
   if (signal) log.info(`received ${signal}, shutting down...`);

   try {
      await stopDnsmasq();
   } catch (err) {
      log.error(
         `failed to stop dnsmasq: ${err instanceof Error ? err.message : String(err)}`,
      );
   } finally {
      process.exit(0);
   }
};

const commands: Record<string, (args: string[]) => Promise<void> | void> = {
   block: async (args) => {
      const domain = args[0];
      if (!domain) return log.warn(`usage: ${chalk.white("block <domain>")}`);
      if (state.blockedDomains.includes(domain))
         return log.warn(`${log.domain(domain)} is already blocked`);

      const spinner = createSpinner(`blocking ${domain}...`);
      spinner.start();
      try {
         state.blockedDomains.push(domain);
         await reloadDnsmasq(state);
         saveState(state);
         spinner.stop(true, `blocked ${log.domain(domain)}`);
      } catch (err) {
         state.blockedDomains.pop();
         spinner.stop(false, `failed to block ${log.domain(domain)}`);
         log.error(err instanceof Error ? err.message : String(err));
      }
   },

   unblock: async (args) => {
      const domain = args[0];
      if (!domain) return log.warn(`usage: ${chalk.white("unblock <domain>")}`);
      const index = state.blockedDomains.indexOf(domain);
      if (index === -1)
         return log.error(`${log.domain(domain)} is not in the blocklist`);

      const spinner = createSpinner(`unblocking ${domain}...`);
      spinner.start();
      try {
         state.blockedDomains.splice(index, 1);
         await reloadDnsmasq(state);
         saveState(state);
         spinner.stop(true, `unblocked ${log.domain(domain)}`);
      } catch (err) {
         state.blockedDomains.splice(index, 0, domain);
         spinner.stop(false, `failed to unblock ${log.domain(domain)}`);
         log.error(err instanceof Error ? err.message : String(err));
      }
   },

   list: () => {
      log.blank();
      if (state.blockedDomains.length === 0) {
         writeLine(log.muted("  no domains are blocked"));
         log.blank();
         return;
      }
      const count = state.blockedDomains.length;
      writeLine(
         chalk.dim(`  ${count} blocked domain${count !== 1 ? "s" : ""}`),
      );
      writeLine(chalk.dim("  ────────────────────────────────"));
      state.blockedDomains.forEach((d, i) => {
         writeLine(
            `  ${chalk.dim(String(i + 1).padStart(2) + ".")} ${log.domain(d)}`,
         );
      });
      log.blank();
   },

   upstream: async (args) => {
      const dns = args[0];
      if (!dns) return log.warn(`usage: ${chalk.white("upstream <ip>")}`);

      const prev = state.upstreamDns;
      const spinner = createSpinner(`switching upstream to ${dns}...`);
      spinner.start();
      try {
         state.upstreamDns = dns;
         await reloadDnsmasq(state);
         saveState(state);
         spinner.stop(
            true,
            `upstream DNS ${chalk.dim("→")} ${chalk.white(dns)}`,
         );
      } catch (err) {
         state.upstreamDns = prev;
         spinner.stop(false, `failed to switch upstream`);
         log.error(err instanceof Error ? err.message : String(err));
      }
   },

   status: () => {
      log.blank();
      statusBar(state);
   },

   stop: async () => {
      await shutdown();
   },

   help: () => {
      const row = (cmd: string, desc: string) =>
         writeLine(`  ${chalk.white(cmd.padEnd(22))}${chalk.dim(desc)}`);

      log.blank();
      writeLine(chalk.dim("  commands"));
      writeLine(chalk.dim("  ────────────────────────────────"));
      row("block <domain>", "block a domain and all subdomains");
      row("unblock <domain>", "remove a domain from the blocklist");
      row("list", "show all blocked domains");
      row("upstream <ip>", "change upstream DNS server");
      row("status", "show current runtime status");
      row("stop", "stop blockd and exit");
      log.blank();
   },
};


const rl = readline.createInterface({
   input: process.stdin,
   output: process.stdout,
   prompt:
      chalk.hex("#7941BE")("▸") +
      chalk.dim(" blockd") +
      chalk.hex("#9f5afd")(" › ") +
      chalk.reset(),
});

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGHUP", () => void shutdown("SIGHUP"));

process.on("uncaughtException", async (err) => {
   log.blank();
   log.error(`uncaught exception: ${err.message}`);
   await shutdown();
});

process.on("unhandledRejection", async (reason) => {
   log.blank();
   log.error(
      `unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
   );
   await shutdown();
});

banner();

try {
   startDnsmasq(state);
} catch (err) {
   log.error(
      `failed to start dnsmasq: ${err instanceof Error ? err.message : String(err)}`,
   );
   process.exit(1);
}

statusBar(state);
writeLine(chalk.dim(`  type ${chalk.white("help")} to see available commands`));
writeLine("");

rl.prompt();

rl.on("line", async (line) => {
   if (isShuttingDown) return;

   const [cmd, ...args] = line.trim().split(/\s+/);
   if (!cmd) {
      rl.prompt();
      return;
   }

   const handler = commands[cmd];
   if (!handler) {
      log.error(
         `unknown command "${chalk.white(cmd)}" — type ${chalk.white("help")} for available commands`,
      );
   } else {
      await handler(args);
   }

   if (!isShuttingDown) rl.prompt();
});

rl.on("close", () => {
   if (!isShuttingDown) void shutdown();
});
