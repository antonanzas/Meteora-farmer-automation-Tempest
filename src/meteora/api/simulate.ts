//import { simulationsRunning } from "../..";
import { PublicKey } from "@solana/web3.js";
import { connection,config } from "../../../common";
import DLMM from '@meteora-ag/dlmm';
import { getPairInfo } from "./getPairs";
import { getPrice } from "../../jupiter/getPrice";
import { solPrice,calculateStimatedCumulativeDailyFees } from "../sdk/monitorPosition";
import { filterByStrategy, Module} from "../../dexscreener/getTokenStats";
import { limitOrderTriggered } from "../../discord/webhook";
import "../../others/loggers"

interface BinData {
    binId: number; 
    liquidity: number; 
}

function calculateBidAskBins(n: number, amountSOL: number): number {
    const first = 0.000414 * amountSOL;
    const diference = 0.00041407 * amountSOL;

    return parseFloat((first + (n - 1) * diference).toFixed(8));
}

async function simulate(type: string,dlmm: string,distribution:string,amountSOL:number, startTime: number,closeByTime?: number,takeProfit?: number, stopLoss?: number) {

    const openValue = amountSOL * solPrice

    let  dlmmPool = await DLMM.create(connection, new PublicKey(dlmm));
    let activeBin = await dlmmPool.getActiveBin();
    let initialPrice = parseFloat(activeBin.pricePerToken)
    const maxRange = activeBin.binId
    const minRange = activeBin.binId - 68
    const eachBinSolSpot = amountSOL / 69
    let liquidityperbin: BinData[] = []

    if (distribution == "spot") {
        for (let i = minRange; i <= maxRange; i++) {
            liquidityperbin.push({binId: i, liquidity: eachBinSolSpot})
        }
    } else if (distribution == "bidask") {
        let binCount = 0
        for (let i = maxRange; i >= minRange; i--) {
            binCount ++
            liquidityperbin.push({binId: i, liquidity: calculateBidAskBins(binCount, amountSOL)})
        }
    }

    let fees = {tokenX: 0, tokenY: 0}

    let firstIteration = true
    let outOfRangeDate = Date.now() + 1800000

    while ( outOfRangeDate > Date.now()) {
        try {
            const elapsedMinutes = (Date.now() - startTime) / 60000; 
            
            const infoActual = await getPairInfo(dlmm)
            const tokenXPrice = (await getPrice(infoActual.mint_x)).price
            activeBin = await dlmmPool.getActiveBin();

            let active = "🔴"
            active = minRange <= activeBin.binId && activeBin.binId <= maxRange  ? "🟢" : "🔴"
            if (active == "🟢") {outOfRangeDate = Date.now() + 1800000} 

            let solForTokenX = 0
            let buyPrice = (initialPrice + parseFloat(activeBin.pricePerToken)) / 2
            if (distribution == "bidask") {buyPrice = initialPrice + (initialPrice - parseFloat(activeBin.pricePerToken))/3}

            for (const bin of liquidityperbin) {
                if (activeBin.binId < bin.binId) {
                    solForTokenX += bin.liquidity
                }
            }

            let amountTokenX = solForTokenX / buyPrice
            let amountTokenY = amountSOL - solForTokenX

            // console.log("amountTokenX ", amountTokenX)
            // console.log("tokenXPrice ", tokenXPrice) 
            // console.log("amountTokenY ", amountTokenY)
            // console.log("solForTokenX ", solForTokenX)
            // console.log("buyPrice ", buyPrice)

            const liquidityValue = amountTokenX * tokenXPrice + amountTokenY * solPrice

            let activeLiquidity = liquidityperbin.find(bin => bin.binId == activeBin.binId)

            if (activeLiquidity && !firstIteration){
                let coeficientForFees = 1
                if (distribution == "bidask") {coeficientForFees = activeLiquidity.liquidity / eachBinSolSpot}

                // console.log("liquidityValue ", liquidityValue)
                // console.log("coeficientForFees ", coeficientForFees)
                // console.log("infoActual.apr ", infoActual.apr)
                // console.log("apr Per minute ", infoActual.apr/(100*24*60))
                //console.log((liquidityValue * ((infoActual.apr/(100*24*60)) * coeficientForFees) * 0.8) / tokenXPrice)
                //console.log((liquidityValue * ((infoActual.apr/(100*24*60)) * coeficientForFees) * 0.2) / solPrice)

                fees.tokenX += (liquidityValue * ((infoActual.apr*config.monitorTimeinSecs/(100*24*3600)) * coeficientForFees) * 0.8) / tokenXPrice
                fees.tokenY += (liquidityValue * ((infoActual.apr*config.monitorTimeinSecs/(100*24*3600)) * coeficientForFees) * 0.2) / solPrice
            } else if (firstIteration){
                firstIteration = false
            }

            let feesValue = fees.tokenX * tokenXPrice + fees.tokenY * solPrice
            let totalValue = liquidityValue + feesValue
            const estimated24hPercent = calculateStimatedCumulativeDailyFees(feesValue, elapsedMinutes,openValue)
            const percentChange = (totalValue - openValue) / openValue * 100

            percentChange > 0 
                ? console.log(active," " ,type," ~ ", dlmm , " Positions: ", totalValue.toFixed(2), "$ ", "\x1b[32m", "(", percentChange.toFixed(2), "% )", "\x1b[0m", " 💧 ", liquidityValue.toFixed(2), "$   💵", feesValue.toFixed(2), "$   ~", estimated24hPercent.toFixed(2), "% (24h)") 
                : console.log(active," ",type, " ~ ", dlmm , " Positions: ", totalValue.toFixed(2), "$ ", "\x1b[31m", "(", percentChange.toFixed(2), "% )", "\x1b[0m", " 💧 ", liquidityValue.toFixed(2), "$   💵", feesValue.toFixed(2), "$   ~", estimated24hPercent.toFixed(2), "% (24h)");


            if (takeProfit && percentChange > takeProfit) {
                console.log("\x1b[32m","+  ~ ", dlmm, " Take Profit triggered: ", percentChange.toFixed(2), "%", "\x1b[0m")
                limitOrderTriggered("🟢 Take Profit Triggered 🟢",dlmm,startTime,openValue,liquidityValue,percentChange,feesValue,true)
                return false
            } else if (stopLoss && percentChange < stopLoss) {
                console.log("\x1b[31m","+  ~ ", dlmm, "Stop Loss triggered:", percentChange.toFixed(2), "%", "\x1b[0m")
                limitOrderTriggered("🔴 Stop Loss Triggered 🔴",dlmm,startTime,openValue,liquidityValue,percentChange,feesValue,true)
                return false
            }

            if (closeByTime && closeByTime > Date.now()) {
                console.log("\x1b[94m+\x1b[0m  ~ ", dlmm, " closure by time triggered")
                limitOrderTriggered("🕑 Limit Time Triggered 🕑",dlmm,startTime,openValue,liquidityValue,percentChange,feesValue,true)
                return false
            }
            
            await new Promise(resolve => setTimeout(resolve, (config.monitorTimeinSecs * 1000)*5));

            if ( !(outOfRangeDate > Date.now())) {
                console.log("\x1b[94m+\x1b[0m  ~ 30 mins out of range, closing position")
                limitOrderTriggered("🕑 Out of Range Triggered 🕑",dlmm,startTime,openValue,liquidityValue,percentChange,feesValue,true)
            }
        } catch (error) {
            console.error(`Error in simulation loop: ${error}`);
            await new Promise((resolve) => setTimeout(resolve, 5000)); 
        }
    }

    return false
}

async function startSimulationLoop(strategy: string, distribution : string, amountSOL: number) {

    let configModule: Module
    if (strategy == "safe"){
        configModule = config.modules.safeModule;
    }else {
        configModule = config.modules.degenModule;    
    }

    const tp = configModule.position.takeProfit != "disable" ? Number(configModule.position.takeProfit) : undefined
    const sl = configModule.position.stopLoss != "disable" ? Number(configModule.position.stopLoss) : undefined

    let closeByTime: undefined | number = undefined 

    while (true) {
        try {
            console.log(`\x1b[94m+\x1b[0m  ~ Starting simulation for strategy: ${strategy}`);

            let filteredDLMMs = await filterByStrategy(strategy);

            if (configModule.position.keepOpenHours != "disable") {closeByTime = Date.now() + Number(configModule.position.keepOpenHours)}

            const waitClosing = await simulate(
                strategy,
                filteredDLMMs[0].pool.address,
                distribution,
                amountSOL,
                Date.now(),
                closeByTime,
                tp,
                sl
            );

            console.log(`\x1b[94m+\x1b[0m  ~ Restarting ${strategy} simulation...`);
        } catch (error) {
            console.error(`Error in simulation loop: ${error}`);
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
}


function parseDurationToMilliseconds(duration: string): number {
    const timeUnits: { [key: string]: number } = {
        d: 24 * 60 * 60 * 1000, 
        h: 60 * 60 * 1000,      
        m: 60 * 1000
    };

    const match = duration.match(/^(\d+)([dhm])$/);

    if (!match) {
        throw new Error(`Formato de duración no válido: ${duration}`);
    }

    const value = parseInt(match[1], 10); 
    const unit = match[2];             

    if (!timeUnits[unit]) {
        throw new Error(`Unidad de tiempo no válida: ${unit}`);
    }

    return value * timeUnits[unit];
}

export { simulate,startSimulationLoop, parseDurationToMilliseconds};