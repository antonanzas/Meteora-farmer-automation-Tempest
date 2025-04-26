import axios from "axios";
import { filterFromAllPairs, getTopPoolsByScore, MeteoraApiResponse } from "../meteora/api/getPairs";
import {config} from "../../common";
import { SOL } from "../meteora/sdk/monitorPosition";
import "../others/loggers"

interface Module {
    position: {
      tokenAgeHours: number | string;
      keepOpenHours: number | string;
      takeProfit: number | string;
      stopLoss: number | string;
    };
    marketCap: {
      min: number | string;
      max: number | string;
    };
    volume: {
      min1h: number | string;
      min24h: number | string;
    };
    binStep: {
      min: number | string;
      max: number | string;
    };
    TVL: {
      min: number | string;
      max: number | string;
    };
    fees: {
      min24h: number | string;
    };
    priceChange: {
      min1h: number | string;
      max1h: number | string;
      min6h: number | string;
      max6h: number | string;
    };
}
  
  
async function getTokenStats(token: string) {
    const baseURL = "https://api.dexscreener.com/latest/dex/search?q=";
  
    try {
      const response = await axios.get(`${baseURL}${token}`);
      return response.data.pairs[0];
    } catch (error) {
      console.error("Error al hacer la request:", error);
    }
}

async function getPoolStatsDex(token: string) {
  const baseURL = "https://api.dexscreener.com/latest/dex/search?q=";

  try {
    const response = await axios.get(`${baseURL}${token}`);
    return response.data.pairs[0];
  } catch (error) {
    console.error("Error al hacer la request:", error);
  }
}

async function filterTokenStats( tokens: Set<string>, minMC: number | string, maxMC: number | string,
    minAgeHours: number | string, min1hVolume: number | string, min24hVolume: number | string, min1hChange: number | string,
    max1hChange: number | string, min6hChange: number | string, max6hChange: number | string) {
    
    const filteredTokens: Set<string> = new Set();
    const maxTimestamp = minAgeHours != "disable" ? Date.now() - Number(minAgeHours) * 60 *60 *1000 : null;
  
    console.log("\x1b[94m+\x1b[0m  ~ Filtering tokens...");
  
    for (const token of tokens) {

      if (config.excludedTokensAutofarming.includes(token)) console.log("\x1b[94m+\x1b[0m  ~ token excluded by user: " + token)
      if (config.excludedTokensAutofarming.includes(token)) continue;
      
      const stats = await getTokenStats(token);

      if (minMC != "disable" && stats.marketCap <= Number(minMC)) continue;
      if (maxMC != "disable" && stats.marketCap >= Number(maxMC)) continue;
  
      if (maxTimestamp != null && stats.pairCreatedAt >= maxTimestamp) continue;
  
      if (min1hVolume != "disable" && stats.volume.h1 <= Number(min1hVolume)) continue;
  
      if (min24hVolume != "disable" && stats.volume.h24 <= Number(min24hVolume)) continue;
  
      if (min1hChange != "disable" && stats.priceChange.h1 <= Number(min1hChange)) continue;
      if (max1hChange != "disable" && stats.priceChange.h1 >= Number(max1hChange)) continue;

      if (min6hChange != "disable" && stats.priceChange.h6 <= Number(min6hChange)) continue;
      if (max6hChange != "disable" && stats.priceChange.h6 >= Number(max6hChange)) continue;
  
      filteredTokens.add(token);
    }

    filteredTokens.delete(SOL)
  
    console.log("\x1b[94m+\x1b[0m  ~ Filtered tokens: " + filteredTokens.size);
  
    return filteredTokens;
}

async function filterByStrategy(strategy: string){

    const configModule: Module = config.modules[strategy];
    let tokenSet: Set<string> = new Set();

    let dlmms = await filterFromAllPairs(configModule.binStep.min, configModule.binStep.max, configModule.TVL.min, configModule.TVL.max, configModule.fees.min24h);
    
    for (const pair of dlmms) {
      tokenSet.add(pair.mint_x);
      tokenSet.add(pair.mint_y);
    }

    console.log("\x1b[94m+\x1b[0m  ~ Tokens meeting DLMMs requirements: "+ dlmms.length.toString());
    
    tokenSet = await filterTokenStats(tokenSet, configModule.marketCap.min, configModule.marketCap.max, configModule.position.tokenAgeHours, configModule.volume.min1h, configModule.volume.min24h, configModule.priceChange.min1h, configModule.priceChange.max1h, configModule.priceChange.min6h, configModule.priceChange.max6h);
    
    let selecteddlmms: MeteoraApiResponse[] = [];

    for (const pair of dlmms) {
      if (tokenSet.has(pair.mint_x)) {
        console.log("\x1b[94m+\x1b[0m  ~ Candidate pool: "+ pair.address + " : " + pair.mint_x + "-" + pair.mint_y);
        selecteddlmms.push(pair);
      }
    }

    console.log("\x1b[94m+\x1b[0m  ~ DLMMs meeting token & DLMMs requirements: "+ selecteddlmms.length.toString());

    let dlmmsAndScore = await getTopPoolsByScore(selecteddlmms)

    const seen = new Set<string>();
    const filtrada = dlmmsAndScore.filter((obj) => {
        if (seen.has(obj.pool.name)) {
            return false;
        }
        seen.add(obj.pool.name);
        return true;
    });

    const top3 = filtrada.slice(0, 3);

    let result = "\x1b[94m+\x1b[0m  ~ Top 3: ";

    for (let i = 0; i < top3.length; i++) {
      const name = top3[i] && top3[i].pool.name ? top3[i].pool.name : "N/A";
      const score = top3[i] && top3[i].score ? top3[i].score.toFixed(2) : "N/A";  
      result += `${name} (${score}) `; 
    }

    console.log(result);

    return top3
}

export { getTokenStats,filterByStrategy,Module, getPoolStatsDex}