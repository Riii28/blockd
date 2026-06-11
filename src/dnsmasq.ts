import { spawn, spawnSync, type ChildProcess } from "child_process";
import chalk from "chalk";

import type { BlockdConfig } from "./types.js";
import { writeConfig, CONFIG_PATH } from "./config.js";

let proc: ChildProcess | null = null;

const tag = {
   dnsmasq: chalk.dim("[") + chalk.hex("#9f5afd")("dnsmasq") + chalk.dim("]"),

   blockd: chalk.dim("[") + chalk.hex("#7941BE")("blockd") + chalk.dim("]"),
};

const writeLine = (text: string): void => {
   process.stdout.write(`${text}\n`);
};

const normalize = (line: string): string => {
   const idx = line.indexOf(":");
   return idx === -1 ? line.trim() : line.slice(idx + 1).trim();
};

const hasRule = (): boolean => {
   const result = spawnSync(
      "iptables",
      ["-C", "OUTPUT", "-p", "udp", "--dport", "443", "-j", "REJECT"],
      { stdio: "ignore" },
   );

   return result.status === 0;
};

const addRule = (): void => {
   if (hasRule()) return;

   spawnSync(
      "iptables",
      ["-A", "OUTPUT", "-p", "udp", "--dport", "443", "-j", "REJECT"],
      { stdio: "ignore" },
   );
};

const removeRule = (): void => {
   while (hasRule()) {
      spawnSync(
         "iptables",
         ["-D", "OUTPUT", "-p", "udp", "--dport", "443", "-j", "REJECT"],
         { stdio: "ignore" },
      );
   }
};

const attachLogs = (child: ChildProcess): void => {
   child.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);

      for (const line of lines) {
         writeLine(`  ${tag.dnsmasq} ${chalk.dim(normalize(line))}`);
      }
   });

   child.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);

      for (const line of lines) {
         writeLine(`  ${tag.dnsmasq} ${chalk.red(normalize(line))}`);
      }
   });

   child.on("error", (error) => {
      writeLine(`  ${tag.dnsmasq} ${chalk.red(error.message)}`);
   });

   child.on("exit", (code, signal) => {
      if (code !== 0 && signal !== "SIGTERM") {
         writeLine(`  ${tag.dnsmasq} ${chalk.red(`exited with code ${code}`)}`);
      }

      if (proc === child) {
         proc = null;
      }
   });
};

const start = (): void => {
   if (proc) {
      writeLine(`  ${tag.blockd} ${chalk.yellow("dnsmasq already running")}`);

      return;
   }

   proc = spawn(
      "dnsmasq",
      ["--conf-file=" + CONFIG_PATH, "--no-daemon", "--log-queries"],
      {
         stdio: ["ignore", "pipe", "pipe"],
      },
   );

   attachLogs(proc);
};

const stop = async (): Promise<void> => {
   if (!proc) return;

   const current = proc;
   proc = null;

   await new Promise<void>((resolve) => {
      current.once("exit", () => resolve());

      if (!current.kill("SIGTERM")) {
         resolve();
      }
   });
};

export const startDnsmasq = (config: BlockdConfig): void => {
   writeConfig(config);

   addRule();
   start();

   writeLine(
      `  ${tag.blockd} ${chalk.dim(
         "dnsmasq started on port",
      )} ${chalk.white(config.port)}`,
   );
};

export const reloadDnsmasq = async (config: BlockdConfig): Promise<void> => {
   await stop();

   writeConfig(config);

   start();
};

export const stopDnsmasq = async (): Promise<void> => {
   removeRule();

   await stop();
};
