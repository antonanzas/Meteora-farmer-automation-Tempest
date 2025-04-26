import DLMM from "@meteora-ag/dlmm";
import { user } from "../../../common";
import { getPrice } from "../../jupiter/getPrice";
import { jitoBundleClosure} from "./removePositionLiquidity";
import { rl, startMonitoringSpecificDLMM } from "../..";
import { config, connection } from "../../../common";
import { calculateCountDown, limitOrderTriggered, limitOrderTriggeredSOL, parseDuration } from "../../discord/webhook";
import clc from "cli-color";
import { generatePNLCard } from "../../pnl/createPNL";
import "../../others/loggers"
import { getPairInfo } from "../api/getPairs";
import { PublicKey } from "@solana/web3.js";
import { tradeToFile } from "../../others/activityCSV";

const SOL = "So11111111111111111111111111111111111111112"
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
const solDecimals = 9
let solPrice = 200

const dlmmListeners = new Map<string, (input: string) => void>();

async function getSolPrice(): Promise<void> {
    while (true) {
        try {
            await getPrice(SOL)
        } catch (error) {
            console.error("Error updating Sol price");
        }
        await new Promise(resolve => setTimeout(resolve, 60000));
    }
}

function setSolPrice(newPrice: number) {
    solPrice = newPrice;
}

async function getCurrencyPrice(currency:string): Promise<void> {
    while (true) {
        try {
            solPrice = parseFloat((await getPrice(currency)).price)
        } catch (error) {
            console.error("Error updating Sol price:", error);
        }
        await new Promise(resolve => setTimeout(resolve, 60000));
    }
}

function calculateStimatedCumulativeDailyFees(totalFees: number, elapsedMinutes: number,openValue:number) {
    let feesPerMinute = totalFees / elapsedMinutes;
    return ((feesPerMinute * 1440)/openValue)*100;
}

async function monitorPosition(automated: boolean, hotkey:boolean , name: string, dlmm: DLMM, openValue: number, startTime: number,closeByTime: number, deadlineUp:number | null, deadlineDown: number | null,resetDeadlineCallback: (direction: string) => void,takeProfit?: number, takeProfitPrice?: number,stopLoss?: number) {

    const elapsedMinutes = (Date.now() - startTime) / 60000;

    const { userPositions } = await dlmm.getPositionsByUserAndLbPair(
        user.publicKey
    );

    const activeBin = await dlmm.getActiveBin()

    let liquidityXtoken = 0, liquidityYtoken = 0, feesXtoken = 0, feesYtoken = 0 , finalXAmount = 0, finalYAmount = 0
    let active = false
    let activePrint = clc.red('●')

    for (const position of userPositions) {
        active = position.positionData.positionBinData[0].binId <= activeBin.binId && activeBin.binId <= position.positionData.positionBinData[position.positionData.positionBinData.length - 1].binId  ? true : false
        if (active) {resetDeadlineCallback("up"),resetDeadlineCallback("down"), activePrint = clc.green('●')} 
        if (active) {resetDeadlineCallback("up"),resetDeadlineCallback("down"), activePrint = clc.green('●')}
        if (!active) {
            !(position.positionData.positionBinData[0].binId <= activeBin.binId) ? resetDeadlineCallback("up") : resetDeadlineCallback("down")
        }

        liquidityXtoken += position.positionData.positionBinData.reduce((sum,item) => sum + parseInt(item.positionXAmount),0) / Math.pow(10, dlmm.tokenX.decimal)
        liquidityYtoken += position.positionData.positionBinData.reduce((sum,item) => sum + parseInt(item.positionYAmount),0) / Math.pow(10, dlmm.tokenY.decimal)
        feesXtoken += position.positionData.feeX.toNumber() / Math.pow(10, dlmm.tokenX.decimal)
        feesYtoken += position.positionData.feeY.toNumber() / Math.pow(10, dlmm.tokenY.decimal)
        finalXAmount += liquidityXtoken + feesXtoken
        finalYAmount += liquidityYtoken + feesYtoken
    }

    const priceX = await getPrice(dlmm.tokenX.publicKey.toString())
    const priceY = await getPrice(dlmm.tokenY.publicKey.toString())
    const pairPrice = await getPrice(dlmm.tokenX.publicKey.toString(),dlmm.tokenY.publicKey.toString())

    if (!priceX || !priceY || !pairPrice) {
        console.error("\x1b[94m+\x1b[0m  Error fetching prices for monitoring")
        return true;
    }
        
    const liquidityValue = liquidityXtoken * parseFloat(priceX.price) + liquidityYtoken * parseFloat(priceY.price)
    const feesValue = feesXtoken * parseFloat(priceX.price) + feesYtoken * parseFloat(priceY.price)
    const totalValue = liquidityValue + feesValue
    const percentChange = (totalValue - openValue) / openValue * 100
    const estimated24hPercent = calculateStimatedCumulativeDailyFees(feesValue, elapsedMinutes,openValue)

    const colorCode = percentChange > 0 ? "\x1b[32m" : "\x1b[31m";
    console.log(activePrint+ " "+ dlmm.pubkey.toString() + " " + name +  " Positions: "+ totalValue.toFixed(2)+ "SOL "+ colorCode+ "("+ percentChange.toFixed(2)+ "% )  "+ "\x1b[0m"+ clc.cyan('● ')+ liquidityValue.toFixed(2)+ "SOL   "+clc.yellow('● ')+feesValue.toFixed(2)+ "SOL   ~"+ estimated24hPercent.toFixed(2)+ "% (24h)") 
    const additionalInfo = [
        takeProfit !== undefined ? `TP: ${takeProfit}% ` : null,
        takeProfitPrice !== undefined ? `TP Price: ${takeProfitPrice} ` : null,
        stopLoss !== undefined ? `SL: ${stopLoss}% ` : null,
        closeByTime !== 0 ? `Close Time: ${calculateCountDown(closeByTime)} ` : null
    ].filter(Boolean).join(" | ");
    console.log(activePrint+ "  Pair price: "+ pairPrice.price+ " | "+ additionalInfo )

    if (hotkey) {
        console.log("\x1b[33m+  ~ ", dlmm.pubkey.toString(), " Hotkey executed: ", percentChange.toFixed(2), "%", "\x1b[0m")
        limitOrderTriggered( "🔥 Hotkey executed 🔥",dlmm.pubkey.toString(),startTime,openValue,liquidityValue,percentChange,feesValue)
        generatePNLCard(dlmm.pubkey.toString(),startTime,openValue,liquidityValue,feesValue,percentChange, dlmm.lbPair.binStep, dlmm.getFeeInfo().baseFeeRatePercentage.toNumber())
        tradeToFile(dlmm.tokenX.publicKey.toString(), openValue, openValue/solPrice, liquidityValue, liquidityValue/solPrice, feesValue, feesValue/solPrice, false, false,false, true, automated)
        await jitoBundleClosure(dlmm)
        return false
    }

    if ((takeProfit && takeProfitPrice) && percentChange > takeProfit && pairPrice.price > takeProfitPrice) {
        console.log("\x1b[32m+  ~ "+ dlmm.pubkey.toString()+ " Combined Take Profit triggered: "+ percentChange.toFixed(2)+ "%"+ "\x1b[0m")
        limitOrderTriggered( "🟢 Combined Take Profit Triggered 🟢",dlmm.pubkey.toString(),startTime,openValue,liquidityValue,percentChange,feesValue)
        generatePNLCard(dlmm.pubkey.toString(),startTime,openValue,liquidityValue,feesValue,percentChange, dlmm.lbPair.binStep, dlmm.getFeeInfo().baseFeeRatePercentage.toNumber())
        tradeToFile(dlmm.tokenX.publicKey.toString(), openValue, openValue/solPrice, liquidityValue, liquidityValue/solPrice, feesValue, feesValue/solPrice, true, false,false, false, automated)
        await jitoBundleClosure(dlmm)
        return false
    } else if (takeProfit  && percentChange > takeProfit) {
        console.log("\x1b[32m+  ~ "+ dlmm.pubkey.toString()+ " Take Profit triggered: "+ percentChange.toFixed(2)+ "%"+ "\x1b[0m")
        limitOrderTriggered( "🟢 Take Profit Triggered 🟢",dlmm.pubkey.toString(),startTime,openValue,liquidityValue,percentChange,feesValue)
        generatePNLCard(dlmm.pubkey.toString(),startTime,openValue,liquidityValue,feesValue,percentChange, dlmm.lbPair.binStep, dlmm.getFeeInfo().baseFeeRatePercentage.toNumber())
        tradeToFile(dlmm.tokenX.publicKey.toString(), openValue, openValue/solPrice, liquidityValue, liquidityValue/solPrice, feesValue, feesValue/solPrice, true, false,false, false, automated)
        await jitoBundleClosure(dlmm)
        return false
    } else if (stopLoss && percentChange < stopLoss) {
        console.log("\x1b[31m+  ~ "+ dlmm.pubkey.toString()+ "Stop Loss triggered:"+ percentChange.toFixed(2)+ "%"+ "\x1b[0m")
        limitOrderTriggered("🔴 Stop Loss Triggered 🔴",dlmm.pubkey.toString(),startTime,openValue,liquidityValue,percentChange,feesValue)
        generatePNLCard(dlmm.pubkey.toString(),startTime,openValue,liquidityValue,feesValue,percentChange, dlmm.lbPair.binStep, dlmm.getFeeInfo().baseFeeRatePercentage.toNumber())
        tradeToFile(dlmm.tokenX.publicKey.toString(), openValue, openValue/solPrice, liquidityValue, liquidityValue/solPrice, feesValue, feesValue/solPrice, false,true,false, false, automated)
        await jitoBundleClosure(dlmm)
        return false
    }

    if (closeByTime > 0 && (Date.now() > closeByTime)) {
        console.log("\x1b[94m+\x1b[0m  ~ "+ dlmm.pubkey.toString()+ " closure by time triggered")
        limitOrderTriggered("🕑 Limit Time Triggered 🕑",dlmm.pubkey.toString(),startTime,openValue,liquidityValue,percentChange,feesValue)
        generatePNLCard(dlmm.pubkey.toString(),startTime,openValue,liquidityValue,feesValue,percentChange, dlmm.lbPair.binStep, dlmm.getFeeInfo().baseFeeRatePercentage.toNumber())
        tradeToFile(dlmm.tokenX.publicKey.toString(), openValue, openValue/solPrice, liquidityValue, liquidityValue/solPrice, feesValue, feesValue/solPrice, false, false,true, false, automated)
        await jitoBundleClosure(dlmm)
        return false
    }

    if (deadlineUp && deadlineUp < Date.now()) {
        console.log("\x1b[94m+\x1b[0m  ~ "+ dlmm.pubkey.toString()+ " closure by out of range triggered")
        limitOrderTriggered("🕑 Out of Range Triggered (Up) 🕑",dlmm.pubkey.toString(),startTime,openValue,liquidityValue,percentChange,feesValue)
        generatePNLCard(dlmm.pubkey.toString(),startTime,openValue,liquidityValue,feesValue,percentChange, dlmm.lbPair.binStep, dlmm.getFeeInfo().baseFeeRatePercentage.toNumber())
        tradeToFile(dlmm.tokenX.publicKey.toString(), openValue, openValue/solPrice, liquidityValue, liquidityValue/solPrice, feesValue, feesValue/solPrice, false, false,false, false, automated)
        await jitoBundleClosure(dlmm)
        return false
    }

    if (deadlineDown && deadlineDown < Date.now()) {
        console.log("\x1b[94m+\x1b[0m  ~ "+ dlmm.pubkey.toString()+ " closure by out of range triggered")
        limitOrderTriggered("🕑 Out of Range Triggered (Down) 🕑",dlmm.pubkey.toString(),startTime,openValue,liquidityValue,percentChange,feesValue)
        generatePNLCard(dlmm.pubkey.toString(),startTime,openValue,liquidityValue,feesValue,percentChange, dlmm.lbPair.binStep, dlmm.getFeeInfo().baseFeeRatePercentage.toNumber())
        tradeToFile(dlmm.tokenX.publicKey.toString(), openValue, openValue/solPrice, liquidityValue, liquidityValue/solPrice, feesValue, feesValue/solPrice, false, false,false, false, automated)
        await jitoBundleClosure(dlmm)
        return false
    }
    
    return true
}

async function monitorPositionSOL(automated: boolean, hotkey: boolean,name: string, dlmm: DLMM, openValueSOL: number, startTime: number,closeByTime: number, deadlineUp:number | null, deadlineDown: number | null,resetDeadlineCallback: (direction: string) => void,takeProfit?: number, takeProfitPrice?: number ,stopLoss?: number) {

    const elapsedMinutes = (Date.now() - startTime) / 60000;

    const { userPositions } = await dlmm.getPositionsByUserAndLbPair(
        user.publicKey
    );

    const activeBin = await dlmm.getActiveBin()

    let liquidityXtoken = 0, liquidityYtoken = 0, feesXtoken = 0, feesYtoken = 0 , finalXAmount = 0, finalYAmount = 0
    let active = false
    let activePrint = clc.red('●')

    for (const position of userPositions) {
        active = position.positionData.positionBinData[0].binId <= activeBin.binId && activeBin.binId <= position.positionData.positionBinData[position.positionData.positionBinData.length - 1].binId  ? true : false
        if (active) {resetDeadlineCallback("up"),resetDeadlineCallback("down"), activePrint = clc.green('●')}
        if (!active) {
            !(position.positionData.positionBinData[0].binId <= activeBin.binId) ? resetDeadlineCallback("up") : resetDeadlineCallback("down")
        }

        liquidityXtoken += position.positionData.positionBinData.reduce((sum,item) => sum + parseInt(item.positionXAmount),0) / Math.pow(10, dlmm.tokenX.decimal)
        liquidityYtoken += position.positionData.positionBinData.reduce((sum,item) => sum + parseInt(item.positionYAmount),0) / Math.pow(10, dlmm.tokenY.decimal)
        feesXtoken += position.positionData.feeX.toNumber() / Math.pow(10, dlmm.tokenX.decimal)
        feesYtoken += position.positionData.feeY.toNumber() / Math.pow(10, dlmm.tokenY.decimal)
        finalXAmount += liquidityXtoken + feesXtoken
        finalYAmount += liquidityYtoken + feesYtoken
    }

    const priceX = await getPrice(dlmm.tokenX.publicKey.toString())
    const priceY = await getPrice(dlmm.tokenY.publicKey.toString())
    const pairPrice = await getPrice(dlmm.tokenX.publicKey.toString(),dlmm.tokenY.publicKey.toString())

    if (!priceX || !priceY || !pairPrice) {
        console.error("\x1b[94m+\x1b[0m  Error fetching prices for monitoring")
        return true;
    }
        
    const liquidityValueSOL = (liquidityXtoken * parseFloat(priceX.price) + liquidityYtoken * parseFloat(priceY.price)) / solPrice
    const feesValueSOL = (feesXtoken * parseFloat(priceX.price) + feesYtoken * parseFloat(priceY.price)) / solPrice
    const totalValueSOL = liquidityValueSOL + feesValueSOL
    const percentChange = (totalValueSOL - openValueSOL) / openValueSOL * 100
    const estimated24hPercent = calculateStimatedCumulativeDailyFees(feesValueSOL, elapsedMinutes,openValueSOL)

    const colorCode = percentChange > 0 ? "\x1b[32m" : "\x1b[31m";
    console.log(activePrint+ "  "+ dlmm.pubkey.toString() + " " + clc.cyan(name)  + " Positions: "+ totalValueSOL.toFixed(3)+ "SOL "+ colorCode+ "("+ percentChange.toFixed(2)+ "% )  "+ "\x1b[0m"+ clc.cyan('● ')+ liquidityValueSOL.toFixed(3)+ "SOL   "+clc.yellow('● ')+ feesValueSOL.toFixed(3)+ "SOL   ~"+ estimated24hPercent.toFixed(2)+ "% (24h)") 
    const additionalInfo = [
        takeProfit !== undefined ? `TP: ${takeProfit}% ` : null,
        takeProfitPrice !== undefined ? `TP Price: ${takeProfitPrice} ` : null,
        stopLoss !== undefined ? `SL: ${stopLoss}% ` : null,
        closeByTime !== 0 ? `Close Time: ${calculateCountDown(closeByTime)} ` : null
    ].filter(Boolean).join(" | ");
    console.log(activePrint + "  Pair price: "+ pairPrice.price+ " | "+ additionalInfo )

    if (hotkey) {
        console.log("\x1b[33m+  ~ "+ dlmm.pubkey.toString()+ " Hotkey executed: "+ percentChange.toFixed(2)+ "%"+ "\x1b[0m")
        limitOrderTriggered( "🔥 Hotkey executed 🔥",dlmm.pubkey.toString(),startTime,openValueSOL,liquidityValueSOL,percentChange,feesValueSOL)
        generatePNLCard(dlmm.pubkey.toString(),startTime,openValueSOL*solPrice,liquidityValueSOL*solPrice,feesValueSOL*solPrice,percentChange, dlmm.lbPair.binStep, dlmm.getFeeInfo().baseFeeRatePercentage.toNumber())
        tradeToFile(dlmm.tokenX.publicKey.toString(), openValueSOL* solPrice, openValueSOL, liquidityValueSOL * solPrice,liquidityValueSOL,feesValueSOL * solPrice,feesValueSOL, false, false,false, true,automated)
        await jitoBundleClosure(dlmm)
        return false
    }

    if ((takeProfit && takeProfitPrice) && percentChange > takeProfit && pairPrice.price > takeProfitPrice) {
        console.log("\x1b[32m+  ~ "+ dlmm.pubkey.toString()+ " Combined Take Profit triggered: "+ percentChange.toFixed(2)+ "%"+ "\x1b[0m")
        limitOrderTriggered( "🟢 Combined Take Profit Triggered 🟢",dlmm.pubkey.toString(),startTime,openValueSOL,liquidityValueSOL,percentChange,feesValueSOL)
        generatePNLCard(dlmm.pubkey.toString(),startTime,openValueSOL*solPrice,liquidityValueSOL*solPrice,feesValueSOL*solPrice,percentChange, dlmm.lbPair.binStep, dlmm.getFeeInfo().baseFeeRatePercentage.toNumber())
        tradeToFile(dlmm.tokenX.publicKey.toString(), openValueSOL* solPrice, openValueSOL, liquidityValueSOL * solPrice,liquidityValueSOL,feesValueSOL * solPrice,feesValueSOL, true, false,false,false,automated)
        await jitoBundleClosure(dlmm)
        return false
    } else if (takeProfit && percentChange > takeProfit) {
        console.log("\x1b[32m+  ~ "+ dlmm.pubkey.toString()+ " Take Profit triggered: "+ percentChange.toFixed(2)+ "%"+ "\x1b[0m")
        limitOrderTriggeredSOL( "🟢 Take Profit Triggered 🟢",dlmm.pubkey.toString(),startTime,openValueSOL,liquidityValueSOL,percentChange,feesValueSOL)
        generatePNLCard(dlmm.pubkey.toString(),startTime,openValueSOL*solPrice,liquidityValueSOL*solPrice,feesValueSOL*solPrice,percentChange, dlmm.lbPair.binStep, dlmm.getFeeInfo().baseFeeRatePercentage.toNumber())
        tradeToFile(dlmm.tokenX.publicKey.toString(), openValueSOL* solPrice, openValueSOL, liquidityValueSOL * solPrice,liquidityValueSOL,feesValueSOL * solPrice,feesValueSOL, true, false,false, false,automated)
        await jitoBundleClosure(dlmm)
        return false
    } else if (stopLoss && percentChange < stopLoss) {
        console.log("\x1b[31m+  ~ "+ dlmm.pubkey.toString()+ "Stop Loss triggered:"+ percentChange.toFixed(2)+ "%"+ "\x1b[0m")
        limitOrderTriggeredSOL("🔴 Stop Loss Triggered 🔴",dlmm.pubkey.toString(),startTime,openValueSOL,liquidityValueSOL,percentChange,feesValueSOL)
        generatePNLCard(dlmm.pubkey.toString(),startTime,openValueSOL*solPrice,liquidityValueSOL*solPrice,feesValueSOL*solPrice,percentChange, dlmm.lbPair.binStep, dlmm.getFeeInfo().baseFeeRatePercentage.toNumber())
        tradeToFile(dlmm.tokenX.publicKey.toString(), openValueSOL* solPrice, openValueSOL, liquidityValueSOL * solPrice,liquidityValueSOL,feesValueSOL * solPrice,feesValueSOL, false, true,false, false,automated)
        await jitoBundleClosure(dlmm)
        return false
    }

    if (closeByTime > 0 && (Date.now() > closeByTime)) {
        console.log("\x1b[94m+\x1b[0m  ~ "+ dlmm.pubkey.toString()+ " closure by time triggered")
        limitOrderTriggeredSOL("🕑 Limit Time Triggered 🕑",dlmm.pubkey.toString(),startTime,openValueSOL,liquidityValueSOL,percentChange,feesValueSOL)
        generatePNLCard(dlmm.pubkey.toString(),startTime,openValueSOL*solPrice,liquidityValueSOL*solPrice,feesValueSOL*solPrice,percentChange, dlmm.lbPair.binStep, dlmm.getFeeInfo().baseFeeRatePercentage.toNumber())
        tradeToFile(dlmm.tokenX.publicKey.toString(), openValueSOL* solPrice, openValueSOL, liquidityValueSOL * solPrice,liquidityValueSOL,feesValueSOL * solPrice,feesValueSOL, false, false,true, false,automated)
        await jitoBundleClosure(dlmm)
        return false
    }

    if (deadlineUp && deadlineUp < Date.now()) {
        console.log("\x1b[94m+\x1b[0m  ~ "+ dlmm.pubkey.toString()+ " closure by out of range triggered")
        limitOrderTriggeredSOL("🕑 Out of Range Triggered (Up) 🕑",dlmm.pubkey.toString(),startTime,openValueSOL,liquidityValueSOL,percentChange,feesValueSOL)
        generatePNLCard(dlmm.pubkey.toString(),startTime,openValueSOL*solPrice,liquidityValueSOL*solPrice,feesValueSOL*solPrice,percentChange, dlmm.lbPair.binStep, dlmm.getFeeInfo().baseFeeRatePercentage.toNumber())
        tradeToFile(dlmm.tokenX.publicKey.toString(), openValueSOL* solPrice, openValueSOL, liquidityValueSOL * solPrice,liquidityValueSOL,feesValueSOL * solPrice,feesValueSOL, false, false,false, false,automated)
        await jitoBundleClosure(dlmm)
        return false
    }

    if (deadlineDown && deadlineDown < Date.now()) {
        console.log("\x1b[94m+\x1b[0m  ~ "+ dlmm.pubkey.toString()+ " closure by out of range triggered")
        limitOrderTriggeredSOL("🕑 Out of Range Triggered (Down) 🕑",dlmm.pubkey.toString(),startTime,openValueSOL,liquidityValueSOL,percentChange,feesValueSOL)
        generatePNLCard(dlmm.pubkey.toString(),startTime,openValueSOL*solPrice,liquidityValueSOL*solPrice,feesValueSOL*solPrice,percentChange, dlmm.lbPair.binStep, dlmm.getFeeInfo().baseFeeRatePercentage.toNumber())
        tradeToFile(dlmm.tokenX.publicKey.toString(), openValueSOL* solPrice, openValueSOL, liquidityValueSOL * solPrice,liquidityValueSOL,feesValueSOL * solPrice,feesValueSOL, false, false,false, false,automated)
        await jitoBundleClosure(dlmm)
        return false
    }
    
    return true
}

async function startMonitor(automated: boolean,dlmm: DLMM, openValue: number, takeProfit?: number, closeByTime?: number, takeProfitPrice?: number,stopLoss?: number) {

    const name = (await getPairInfo(dlmm.pubkey.toString())).name
    console.log("\x1b[94m+\x1b[0m  ~ Monitoring "+ dlmm.pubkey.toString()+ " position in 5 seconds")
    await new Promise(resolve => setTimeout(resolve, 5000));

    const openValueSOL = openValue/solPrice

    const startTime = Date.now()
    let keepMonitoring = true

    let timeClose = 0
    if (closeByTime) {timeClose = Date.now() + closeByTime}

    let deadlineUp : number | null = null
    !isNaN(Number(config.timeoutAbove)) ? deadlineUp = Date.now() + Number(config.timeoutAbove) * 60000 : null

    let deadlineDown : number | null = null
    !isNaN(Number(config.timeoutBelow)) ? deadlineDown = Date.now() + Number(config.timeoutBelow) * 60000 : null

    const resetDeadline = (direction: string) => {
        if (deadlineUp && direction == "up") {deadlineUp = Date.now() + Number(config.timeoutAbove) * 60000}
        if (deadlineDown && direction == "down") {deadlineDown = Date.now() + Number(config.timeoutBelow) * 60000}
    };

    hotKey(automated,name,dlmm,
        () => {keepMonitoring = false},
        (timeToAdd) => { timeClose = Date.now() + timeToAdd}, 
        (tp) => { takeProfit = tp},
        (sl) => { stopLoss = sl},
        (tpPrice) => { takeProfitPrice = tpPrice},
        openValue,openValueSOL,startTime,timeClose,deadlineUp,deadlineDown,resetDeadline,takeProfit,takeProfitPrice,stopLoss
    );

    while (keepMonitoring) {

        try {
        config.currency == "SOL" ? 
                keepMonitoring = await monitorPositionSOL(automated,false,name,dlmm,openValueSOL,startTime,timeClose,deadlineUp,deadlineDown,resetDeadline,takeProfit,takeProfitPrice,stopLoss) :
                keepMonitoring = await monitorPosition(automated,false,name,dlmm,openValue,startTime,timeClose,deadlineUp,deadlineDown,resetDeadline,takeProfit,takeProfitPrice,stopLoss)
        
        } catch (error) {
            console.error("\x1b[94m+\x1b[0m  Error monitoring position: "+ error)
        }

        await new Promise(resolve => setTimeout(resolve, config.monitorTimeinSecs * 1000));
    }

    return false
}

function hotKey(automated: boolean,name: string, dlmm: DLMM, stopMonitoring: () => void, addTime: (time: number) => void, setTP: (tp: number) => void, setSL: (sl: number) => void, setTpPrice: (tpPrice: number) => void,
 openValue: number, openValueSOL: number, startTime: number,closeByTime: number, deadlineUp:number | null, deadlineDown: number | null,resetDeadline: (direction: string) => void,takeProfit?: number, takeProfitPrice?: number ,stopLoss?: number) {
    if (dlmmListeners.has(dlmm.pubkey.toString())) {
        console.log("\x1b[94m+\x1b[0m  Updating previous listener for " + dlmm.pubkey.toString());
        rl.off("line", dlmmListeners.get(dlmm.pubkey.toString())!);
    }

    const listener =  (input: string) => {
        if (input.trim() === dlmm.pubkey.toString() || input.trim() === name) {
            console.log("\x1b[33m+   >>> EXECUTING HOTKEY "+ name.toUpperCase() +" <<< \x1b[0m");
            stopMonitoring(); 

            config.currency == "SOL" ? 
                monitorPositionSOL(automated,true,name,dlmm,openValueSOL,startTime,closeByTime,deadlineUp,deadlineDown,resetDeadline,takeProfit,takeProfitPrice,stopLoss) :
                monitorPosition(automated,true,name,dlmm,openValue,startTime,closeByTime,deadlineUp,deadlineDown,resetDeadline,takeProfit,takeProfitPrice,stopLoss) 
        }

        if (input.includes(dlmm.pubkey.toString() + " set time") ||  input.toLowerCase().includes(name.toLowerCase() + " set time")) {
            
            let parsedTime = input.replace(dlmm.pubkey.toString(), "")
            parsedTime = parsedTime.replace(new RegExp(name,"gi"), "")   
            parsedTime = parsedTime.replace("set time", "")
            parsedTime = parsedTime.trim()

            if (parsedTime.includes("m")) {
                parsedTime = parsedTime.replace("m", "")
                console.log("\x1b[94m+\x1b[0m   >>> Setting " + parsedTime + "m <<<");
                addTime(parseInt(parsedTime) * 60000)
            } else if (parsedTime.includes("h")) {
                parsedTime = parsedTime.replace("h", "")
                console.log("\x1b[94m+\x1b[0m   >>> Setting " + parsedTime + "h <<<");
                addTime(parseInt(parsedTime) * 3600000)
            } else if (parsedTime.includes("d")) {
                parsedTime = parsedTime.replace("d", "")
                console.log("\x1b[94m+\x1b[0m   >>> Setting " + parsedTime + "d <<<");
                addTime(parseInt(parsedTime) * 86400000)
            } else {
                console.log("\x1b[94m+\x1b[0m   >>> Error parsing time <<<");
            }
        }

        if (input.includes(dlmm.pubkey.toString() + " set tp") || input.toLowerCase().includes(name.toLowerCase() + " set tp" )) {
            let parsedTp = input.replace(dlmm.pubkey.toString(), "")
            parsedTp = parsedTp.replace(new RegExp(name,"gi"), "")
            parsedTp = parsedTp.replace(" set tp", "")
            parsedTp = parsedTp.trim()
            if (parseInt(parsedTp) <= 0 || isNaN(parseInt(parsedTp))) {
                console.log("\x1b[94m+\x1b[0m   Error setting TP, must be positive");
            } else {
                console.log("\x1b[94m+\x1b[0m   >>> Setting TP " + parsedTp + " <<<");
                setTP(parseInt(parsedTp))
            }
        }

        if (input.includes(dlmm.pubkey.toString() + " set sl") || input.toLowerCase().includes(name.toLowerCase() + " set sl")) {
            let parsedSl = input.replace(dlmm.pubkey.toString(), "")
            parsedSl = parsedSl.replace(new RegExp(name,"gi"), "")
            parsedSl = parsedSl.replace(" set sl", "")
            parsedSl = parsedSl.trim()
            if (parseInt(parsedSl) >= 0 || isNaN(parseInt(parsedSl))) {
                console.log("\x1b[94m+\x1b[0m   Error setting SL, must be negative");
            } else {
                console.log("\x1b[94m+\x1b[0m   >>> Setting SL " + parseInt(parsedSl) + " <<<");
                setSL(parseInt(parsedSl))
            }
            
        }

        if (input.includes(dlmm.pubkey.toString() + " set price") || input.toLowerCase().includes(name.toLowerCase() + " set price")) {
            let parsedTpPrice = input.replace(dlmm.pubkey.toString(), "")
            parsedTpPrice = parsedTpPrice.replace(new RegExp(name,"gi"), "")
            parsedTpPrice = parsedTpPrice.replace(" set price", "")
            parsedTpPrice = parsedTpPrice.trim()
            if (parseFloat(parsedTpPrice) <= 0 || isNaN(parseFloat(parsedTpPrice))) {
                console.log("\x1b[94m+\x1b[0m   Error setting TP price, must be positive");
            } else {
                console.log("\x1b[94m+\x1b[0m   >>> Setting TP price " + parsedTpPrice + " <<<");
                setTpPrice(parseFloat(parsedTpPrice))
            }
        }
    };

    rl.on("line", listener);
    dlmmListeners.set(dlmm.pubkey.toString(), listener);
}

async function hotkeyMonitoringSpecificDLMM(){
    rl.on("line", (input) => {
        if (input.includes("add monitor")) {

            let parsedDLMM = input.replace("add monitor", "").trim()
            console.log("\x1b[33m+   >>> ADDING MONITOR "+ parsedDLMM +" <<< \x1b[0m");

            startMonitoringSpecificDLMM(parsedDLMM)     
        }
    });
}


export { solPrice, solDecimals, getSolPrice,startMonitor, SOL, USDC, USDT, calculateStimatedCumulativeDailyFees, setSolPrice,hotkeyMonitoringSpecificDLMM }