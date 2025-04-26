import { parseDurationToMilliseconds } from "../api/simulate"
import { Module, filterByStrategy } from "../../dexscreener/getTokenStats";
import { config ,connection} from "../../../common";
import { Keypair, PublicKey } from "@solana/web3.js";
import { solPrice, startMonitor } from "./monitorPosition";
import { createBidAskPosition, createImbalancePosition, createSpotBidPosition } from "./createPosition";
import {addLiquidityToExistingPositionBidAsk} from "./addLiquidity";
import { getPrice } from "./../../jupiter/getPrice";
import { openPositionMessage } from "../../discord/webhook";
import DLMM from "@meteora-ag/dlmm";
import "../../others/loggers"

async function startFarmingLoop(strategy: string, distribution: string, dollarAmount: number){

    let solAmount = dollarAmount / solPrice

    let configModule: Module = config.modules[strategy];
    let closeByTime: undefined | number = undefined 

    const tp = configModule.position.takeProfit != "disable" ? Number(configModule.position.takeProfit) : undefined;
    const sl = configModule.position.stopLoss != "disable" ? Number(configModule.position.stopLoss) : undefined;    
    configModule.position.keepOpenHours != "disable" ? closeByTime = Number(configModule.position.keepOpenHours) * 60*60*1000 : undefined;

    config.currency == "SOL" ?
        console.log(`\x1b[94m+\x1b[0m  ~ Starting auto farm for: ${strategy} - ${distribution} - ${solAmount} SOL`):
        console.log(`\x1b[94m+\x1b[0m  ~ Starting auto farm for: ${strategy} - ${distribution} - ${dollarAmount} $`);

    while (true) {
        if (config.currency != "SOL") {solAmount = dollarAmount / solPrice}
        try {
            
            let filteredDLMMs = await filterByStrategy(strategy);

            if (filteredDLMMs.length == 0) {
                console.log(`\x1b[94m+\x1b[0m  ~ No pools found for strategy ${strategy}. Retrying in 2 min...`);
                await new Promise((resolve) => setTimeout(resolve, 120000));
                continue;
            }

            const newPosition = new Keypair();
            const newPosition2 = new Keypair();

            const poolAddr = filteredDLMMs[0].pool.address

            const dlmmPool = await DLMM.create(connection, new PublicKey(poolAddr));

            if (distribution == "spot") {
                const positionSpot = await createImbalancePosition(newPosition,dlmmPool, 0, solAmount, 1);
                openPositionMessage( poolAddr ,solAmount, tp , closeByTime, sl);

                if (positionSpot) {
                    const monitoring = await startMonitor(true,dlmmPool,  solAmount * solPrice, tp, closeByTime, undefined,sl);
                } 

            } else if (distribution == "bidask") {
                const positionBidAsk = await  createBidAskPosition(newPosition,dlmmPool, 0, solAmount, 1);
                openPositionMessage( poolAddr ,solAmount, tp , closeByTime, sl);

                if (positionBidAsk) {
                    const monitoring = await startMonitor(true,dlmmPool,  solAmount * solPrice,  tp, closeByTime, undefined,sl);
                } 
            } else if (distribution == "spotbid") {

                const positionSpotBid = await createSpotBidPosition(newPosition,newPosition2,dlmmPool, 0, solAmount, 1);
                openPositionMessage( poolAddr ,solAmount, tp , closeByTime, sl);

                if (positionSpotBid) {
                    const monitoring = await startMonitor(true,dlmmPool, solAmount * solPrice, tp, closeByTime, undefined,sl);
                }
            } else {
                console.error(`\x1b[94m+\x1b[0m  ~ Invalid distribution: ${distribution}`);
            }

            console.log(`\x1b[94m+\x1b[0m  ~ Restarting ${strategy}...`);
        } catch (error) {
            if (error instanceof Error) {
                console.error(`Error in simulation loop: ${error.message}`);
            } else {
            console.error(`Error in simulation loop: ${error}`);
            }
            await new Promise((resolve) => setTimeout(resolve, 5000)); 
        }
    }
}

export { startFarmingLoop }