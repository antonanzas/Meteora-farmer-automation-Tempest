import { Connection, Keypair } from '@solana/web3.js';
import { Wallet } from '@project-serum/anchor';
import bs58 from "bs58";
import readline from "readline";
import { readFileSync } from 'fs';
import clc from 'cli-color';
import './src/others/loggers';

interface ModuleConfig {
  position: {
    tokenAgeHours: number | "disable";
    keepOpenHours: number | "disable";
    takeProfit: number | "disable";
    stopLoss: number | "disable";
  };
  marketCap: { min: number | "disable"; max: number | "disable" };
  volume: { min1h: number | "disable"; min24h: number | "disable" };
  binStep: { min: number | "disable"; max: number | "disable" };
  TVL: { min: number | "disable"; max: number | "disable" };
  fees: { min24h: number | "disable" };
  priceChange: {
    min1h: number | "disable";
    max1h: number | "disable";
    min6h: number | "disable";
    max6h: number | "disable";
  };
}

interface Config {
  walletKey: string;
  rpc: string;
  discordWebhook: string;
  fullLogs: boolean;
  priorityFeeInMicroLamports: number;
  currency: string;
  monitorTimeinSecs: number;
  timeoutAbove: number | "disable";
  timeoutBelow: number | "disable";
  pulseDefaultValues: {
    takeProfit: number | "disable";
    stopLoss: number | "disable";
    closeAfterMinutes: number | "disable";
  };
  excludedTokensAutofarming: string[],
  modules: Record<string, ModuleConfig>;
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function validateConfig(data: any): asserts data is Config {
  

  if (!data.walletKey || typeof data.walletKey !== "string" || bs58.decode(data.walletKey).length !== 64) {
    throw new Error("❌ Invalid walletKey");
  }

  if (!data.rpc || !isValidUrl(data.rpc)) {
    throw new Error(`❌ Invalid RPC URL: ${data.rpc}`);
  }

  if (data.discordWebhook == "" || data.discordWebhook == " " || data.discordWebhook == "your_webhook_link") {
    data.discordWebhook = null;
  }

  if (data.discordWebhook && !data.discordWebhook.startsWith('https://discord.com/api/webhooks/')) {
    throw new Error("❌ Invalid Discord webhook URL.");
  }

  if (data.fullLogs == 'true') {data.fullLogs = true}
  if (data.fullLogs == 'false') {data.fullLogs = false}

  if (typeof data.fullLogs !== 'boolean') {
    throw new Error("❌ 'fullLogs' must be a boolean value.");
  }

  if (typeof data.priorityFeeInMicroLamports !== "number") {
    throw new Error("❌ priorityFeeInMicroLamports must be a number.");
  }

  if (typeof data.currency !== "string") {
    throw new Error("❌ Currency must be a string.");
  }

  if (typeof data.monitorTimeinSecs !== "number") {
    throw new Error("❌ monitorTimeinSecs must be a number.");
  }

  if (typeof data.timeoutAbove !== "number" && data.timeoutAbove !== "disable") {
    throw new Error("❌ timeoutAbove must be a number.");
  }

  if (typeof data.timeoutBelow !== "number" && data.timeoutBelow !== "disable") {
    throw new Error("❌ timeoutBelow must be a number.");
  }

  if (!data.pulseDefaultValues || typeof data.pulseDefaultValues !== "object") {
    throw new Error("❌ Invalid pulseDefaultValues configuration.");
  }

  if ( typeof data.pulseDefaultValues.takeProfit !== "number" && data.pulseDefaultValues.takeProfit !== "disable") {
    throw new Error("❌ Invalid pulseDefaultValues : takeProfit configuration.");
  }

  if ( typeof data.pulseDefaultValues.stopLoss !== "number" && data.pulseDefaultValues.stopLoss !== "disable") {
    throw new Error("❌ Invalid pulseDefaultValues : stopLoss configuration.");
  }

  if ( typeof data.pulseDefaultValues.closeAfterMinutes !== "number" && data.pulseDefaultValues.closeAfterMinutes !== "disable") {
    throw new Error("❌ Invalid pulseDefaultValues : closeAfterMinutes configuration.");
  }

  if (!data.excludedTokensAutofarming || !Array.isArray(data.excludedTokensAutofarming)) {
    throw new Error(`❌  Invalid excludedTokensAutofarming. It must be an array.`);
  }

  if (data.excludedTokensAutofarming) {
    data.excludedTokensAutofarming.forEach((token: any) => {
      if (typeof token !== "string") {
        throw new Error(`❌ ${token} is invalid for excludedTokensAutofarming. Token must be a string.`);
      }
    });
  }

  if (!data.modules || typeof data.modules !== "object") {
    throw new Error("❌ Invalid modules configuration.");
  }

  Object.entries(data.modules).forEach(([name, module]: [string, any]) => {
    if (!module.position || typeof module.position !== "object") {
      throw new Error(`❌ Module '${name}' is missing position config.`);
    }

    if (typeof module.position.tokenAgeHours !== "number" && module.position.tokenAgeHours !== "disable") {
      throw new Error(`❌ Module '${name}' has invalid tokenAgeHours.`);
    }

    if (typeof module.position.keepOpenHours !== "number" && module.position.keepOpenHours !== "disable") {
      throw new Error(`❌ Module '${name}' has invalid keepOpenHours.`);
    }

    if ((typeof module.position.takeProfit !== "number" && module.position.takeProfit !== "disable") || (typeof module.position.stopLoss !== "number"&& module.position.stopLoss !== "disable")) {
      throw new Error(`❌ Module '${name}' has invalid takeProfit or stopLoss.`);
    }

    if (!module.marketCap || typeof module.marketCap !== "object") {
      throw new Error(`❌ Module '${name}' is missing marketCap config.`);
    }
    if ((typeof module.marketCap.min !== "number" &&  module.marketCap.min != "disable") || (typeof module.marketCap.max !== "number" && module.marketCap.max !== "disable")) {
      throw new Error(`❌ Module '${name}' has invalid marketCap.`);
    }

    if (!module.volume || typeof module.volume !== "object") {
      throw new Error(`❌ Module '${name}' is missing volume config.`);
    }
    if ((typeof module.volume.min1h !== "number" && module.volume.min1h != "disable" )|| (typeof module.volume.min24h !== "number" && module.volume.min24h != "disable")) {
      throw new Error(`❌ Module '${name}' has invalid volume.`);
    }

    if (!module.binStep || typeof module.binStep !== "object") {
      throw new Error(`❌ Module '${name}' is missing binStep config.`);
    }
    if ((typeof module.binStep.min !== "number" && module.binStep.min != "disable" ) || (typeof module.binStep.max !== "number" && module.binStep.max !== "disable")) {
      throw new Error(`❌ Module '${name}' has invalid binStep.`);
    }

    if (!module.TVL || typeof module.TVL !== "object") {
      throw new Error(`❌ Module '${name}' is missing TVL config.`);
    }
    if ((typeof module.TVL.min !== "number" && module.TVL.min != "disable")|| (typeof module.TVL.max !== "number" && module.TVL.max !== "disable")) {
      throw new Error(`❌ Module '${name}' has invalid TVL.`);
    }

    if (!module.fees || typeof module.fees !== "object") {
      throw new Error(`❌ Module '${name}' is missing fees config.`);
    }
    if (typeof module.fees.min24h !== "number" && module.fees.min24h !== "disable") {
      throw new Error(`❌ Module '${name}' has invalid fees.min24h.`);
    }

    if (!module.priceChange || typeof module.priceChange !== "object") {
      throw new Error(`❌ Module '${name}' is missing priceChange config.`);
    }
    if (
      (typeof module.priceChange.min1h !== "number" && module.priceChange.min1h !== "disable") ||
      (typeof module.priceChange.max1h !== "number" && module.priceChange.max1h !== "disable") ||
      (typeof module.priceChange.min6h !== "number" && module.priceChange.min6h !== "disable") ||
      (typeof module.priceChange.max6h !== "number" && module.priceChange.max6h !== "disable")
    ) {
      throw new Error(`❌ Module '${name}' has invalid priceChange.`);
    }
  });

  console.log("✅ Config validated successfully!");
}

function loadConfig(): Config {
  try {
    const rawData = readFileSync('data/config.txt', 'utf-8');
    const parsedConfig = JSON.parse(rawData);

    validateConfig(parsedConfig);
    return parsedConfig;
  } catch (error) {
    console.error(error || "❌ Error loading config");
    process.exit(1);
}

const config = loadConfig();

const connection = new Connection(config.rpc, 'confirmed');

const WebHookLink = config.discordWebhook ?? null;

let user: Keypair;
let wallet: Wallet;

try {
  user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(config.walletKey)));
  wallet = new Wallet(user);
} catch (error) {
  console.error("❌ Error initializing wallet:", error);
  process.exit(1);
}

console.log("✅ Configurations loaded successfully!");
//console.log(config)

export { connection, user, wallet, config, WebHookLink };
