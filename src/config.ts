import { writeFileSync } from "fs";
import type { BlockdConfig } from "./types.js";

export const CONFIG_PATH = "/etc/dnsmasq.conf";

export const generateConfig = (config: BlockdConfig): string => {
   const blockRules = config.blockedDomains
      .flatMap((domain) => [
         `address=/${domain}/0.0.0.0`,
         `address=/.${domain}/0.0.0.0`,
         `address=/${domain}/::`,
         `address=/.${domain}/::`,
      ])
      .join("\n");

   return [
      `port=${config.port}`,
      `listen-address=${config.listenAddress}`,
      `bind-interfaces`,
      `no-resolv`,
      `server=${config.upstreamDns}`,
      ``,
      `# blocked domains`,
      blockRules,
   ].join("\n");
};

export const writeConfig = (config: BlockdConfig): void => {
   const content = generateConfig(config);
   writeFileSync(CONFIG_PATH, content, "utf-8");
};
