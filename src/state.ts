import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

import type { BlockdConfig } from "./types.js";

const STATE_DIR = "/etc/blockd";
const STATE_PATH = `${STATE_DIR}/state.json`;

const defaults: BlockdConfig = {
   blockedDomains: [],
   port: 5353,
   listenAddress: "127.0.0.1",
   upstreamDns: "8.8.8.8",
};

function ensureStateDir(): void {
   if (!existsSync(STATE_DIR)) {
      mkdirSync(STATE_DIR, { recursive: true });
   }
}

export const loadState = (): BlockdConfig => {
   ensureStateDir();

   if (!existsSync(STATE_PATH)) {
      return { ...defaults };
   }

   try {
      const raw = readFileSync(STATE_PATH, "utf-8");
      return {
         ...defaults,
         ...JSON.parse(raw),
      };
   } catch {
      return { ...defaults };
   }
};

export const saveState = (state: BlockdConfig): void => {
   ensureStateDir();

   writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
};
