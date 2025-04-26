import axios from "axios";
import { SOL } from "../sdk/monitorPosition";
import { min } from "bn.js";
import { getPoolStatsDex } from "../../dexscreener/getTokenStats";
import "../../others/loggers"


interface MeteoraApiResponse {
  address: string;
  name: string;
  mint_x: string;
  mint_y: string;
  reserve_x: string;
  reserve_y: string;
  reserve_x_amount: number;
  reserve_y_amount: number;
  bin_step: number;
  base_fee_percentage: string;
  max_fee_percentage: string;
  protocol_fee_percentage: string;
  liquidity: string;
  reward_mint_x: string;
  reward_mint_y: string;
  fees_24h: number;
  today_fees: number;
  trade_volume_24h: number;
  cumulative_trade_volume: string;
  cumulative_fee_volume: string;
  current_price: number;
  apr: number;
  apy: number;
  farm_apr: number;
  farm_apy: number;
  hide: boolean;
}

async function getAllPairs() {
  const baseURL = "https://dlmm-api.meteora.ag";

  try {
    const response = await axios.get(`${baseURL}/pair/all`);
    //console.log(response.data);
    return response.data;
  } catch (error) {
    console.error("\x1b[94m+\x1b[0m  Error al hacer la request:", error);
  }
}

async function getPairInfo(pairAddress: string) {

  const baseURL = "https://dlmm-api.meteora.ag";

  try {
    const response = await axios.get(`${baseURL}/pair/${pairAddress}`);
    //console.log(response.data);
    return response.data;
  } catch (error) {
    console.error("Error al hacer la request:", error);
  }
}


async function filterFromAllPairs(minBinStep: number | string, maxBinStep: number | string, minTVL: number | string,
  maxTVL: number | string, min24hFees: number | string) {
    
  const allPairs: MeteoraApiResponse[] = await getAllPairs();

  const filteredPairs = allPairs.filter(pair => {
    if (minBinStep != "disable" && pair.bin_step < Number(minBinStep)) return false;
    if (maxBinStep != "disable" && pair.bin_step > Number(maxBinStep)) return false;

    const liquidity = parseFloat(pair.liquidity);
    if (minTVL != "disable" && liquidity < Number(minTVL)) return false;
    if (maxTVL != "disable" && liquidity > Number(maxTVL)) return false;

    if (min24hFees != "disable" && pair.fees_24h <= Number(min24hFees)) return false;

    if (pair.mint_y != SOL) return false;

    return true;
  });

  return filteredPairs;
}


async function filterFromTokens(tokens: Set<string>, minBinStep: number | string, maxBinStep: number | string, minTVL: number | string, maxTVL: number | string, min24hFees: number | string) {
  const allPairs: MeteoraApiResponse[] = await getAllPairs();

  const selectedDLMMS = allPairs.filter((pair) => {
    if (minBinStep != "disable" && pair.bin_step <= Number(minBinStep)) return false;
    if (maxBinStep != "disable" && pair.bin_step >= Number(maxBinStep)) return false;

    const liquidity = parseFloat(pair.liquidity);
    if (minTVL != "disable" && liquidity <= Number(minTVL)) return false;
    if (maxTVL != "disable" && liquidity >= Number(maxTVL)) return false;

    if (min24hFees != "disable" && pair.fees_24h <= Number(min24hFees)) return false;

    if (pair.mint_y !== SOL) return false;

    if (!tokens.has(pair.mint_x) && !tokens.has(pair.mint_y)) return false;

    return true;
  });

  return selectedDLMMS;
}

async function getTopPoolsByScore(pools: MeteoraApiResponse[]) {
  const minMaxValues = {
    yield: { min: Infinity, max: -Infinity },
    tvl: { min: Infinity, max: -Infinity },
    fees: { min: Infinity, max: -Infinity },
    activity: { min: Infinity, max: -Infinity },
  };

  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    const yieldValue = pool.apr;
    const tvlValue = parseFloat(pool.liquidity);
    const feesValue = pool.fees_24h;
    const recentActivity = await getPoolStatsDex(pool.address);
    const recentActivityValue =
      0.4 * (recentActivity.txns.m5.buys + recentActivity.txns.m5.sells) +
      0.3 * (recentActivity.txns.h1.buys + recentActivity.txns.h1.sells) +
      0.2 * (recentActivity.txns.h6.buys + recentActivity.txns.h6.sells) +
      0.1 * (recentActivity.txns.h24.buys + recentActivity.txns.h24.sells);

    minMaxValues.yield.min = Math.min(minMaxValues.yield.min, yieldValue);
    minMaxValues.yield.max = Math.max(minMaxValues.yield.max, yieldValue);

    minMaxValues.tvl.min = Math.min(minMaxValues.tvl.min, tvlValue);
    minMaxValues.tvl.max = Math.max(minMaxValues.tvl.max, tvlValue);

    minMaxValues.fees.min = Math.min(minMaxValues.fees.min, feesValue);
    minMaxValues.fees.max = Math.max(minMaxValues.fees.max, feesValue);

    minMaxValues.activity.min = Math.min(minMaxValues.activity.min, recentActivityValue);
    minMaxValues.activity.max = Math.max(minMaxValues.activity.max, recentActivityValue);
  }

  const weights = {
    yield: 0.4,
    tvl: 0.2,
    fees: 0.25,
    activity: 0.15,
  };

  const scoredPools: { pool: MeteoraApiResponse; score: number }[] = [];
  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    const yieldValue = pool.apr;
    const tvlValue = parseFloat(pool.liquidity);
    const feesValue = pool.fees_24h;
    const recentActivity = await getPoolStatsDex(pool.address);
    const recentActivityValue =
      0.4 * (recentActivity.txns.m5.buys + recentActivity.txns.m5.sells) +
      0.3 * (recentActivity.txns.h1.buys + recentActivity.txns.h1.sells) +
      0.2 * (recentActivity.txns.h6.buys + recentActivity.txns.h6.sells) +
      0.1 * (recentActivity.txns.h24.buys + recentActivity.txns.h24.sells);

    const normalizedYield = (yieldValue - minMaxValues.yield.min) / (minMaxValues.yield.max - minMaxValues.yield.min);
    const normalizedTVL = (tvlValue - minMaxValues.tvl.min) / (minMaxValues.tvl.max - minMaxValues.tvl.min);
    const normalizedFees = (feesValue - minMaxValues.fees.min) / (minMaxValues.fees.max - minMaxValues.fees.min);
    const normalizedActivity = (recentActivityValue - minMaxValues.activity.min) / (minMaxValues.activity.max - minMaxValues.activity.min);

    const score =
      weights.yield * normalizedYield +
      weights.tvl * normalizedTVL +
      weights.fees * normalizedFees +
      weights.activity * normalizedActivity;

    scoredPools.push({ pool, score }); 
  }

  return scoredPools
    .sort((a, b) => b.score - a.score) 
}

export { getAllPairs,filterFromAllPairs,filterFromTokens , getPairInfo, getTopPoolsByScore, MeteoraApiResponse};