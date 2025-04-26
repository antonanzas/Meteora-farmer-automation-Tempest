import DLMM from '@meteora-ag/dlmm'
import { connection,user,config} from '../../../common'
import BN from "bn.js"
import {StrategyType } from "@meteora-ag/dlmm"
import {Keypair, sendAndConfirmTransaction, ComputeBudgetProgram} from "@solana/web3.js";
import clc from 'cli-color';
import "../../others/loggers"

async function addLiquidityToExistingPositionBidAsk(keypair: Keypair,dlmmPool: DLMM, notParsedXAmount: number, notParsedYAmount: number,lowerCoef: number , bins: number = 69) {

    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
        microLamports: config.priorityFeeInMicroLamports
    });

    let confirmed = false;
    let tries = 4

    while (!confirmed && tries > 0 ) {
        tries --

        const activeBin = await dlmmPool.getActiveBin();
        const minBinId = activeBin.binId - Math.floor(bins*lowerCoef);
        const maxBinId = activeBin.binId + Math.floor(bins*(1 - lowerCoef));
    
        const totalXAmount = new BN(notParsedXAmount * Math.pow(10,dlmmPool.tokenX.decimal))
        const totalYAmount = new BN(notParsedYAmount * Math.pow(10,dlmmPool.tokenY.decimal))

        const addLiquidityTx = await dlmmPool.addLiquidityByStrategy({
            positionPubKey: keypair.publicKey,
            user: user.publicKey,
            totalXAmount,
            totalYAmount,
            strategy: {
                maxBinId,
                minBinId,
                strategyType: StrategyType.BidAskImBalanced,
            },
        });

        let ixs = addLiquidityTx.instructions
        ixs.unshift(addPriorityFee)
        addLiquidityTx.instructions = ixs

        const lastBlockhash = await connection.getLatestBlockhash();
        addLiquidityTx.recentBlockhash = lastBlockhash.blockhash
        addLiquidityTx.lastValidBlockHeight = lastBlockhash.lastValidBlockHeight

        console.log("\x1b[94m+\x1b[0m  ~ Adding liquidity BidAsk, awaiting  confirmation.. ");
    
        try {
            const addLiquidityTxHash = await sendAndConfirmTransaction(
                connection,
                addLiquidityTx,
                [user],
                {commitment: "confirmed"}
            );

            console.log("\x1b[94m+\x1b[0m  ~ ",clc.green("●")," BidAsk Addition TxHash ", clc.green("● "),addLiquidityTxHash);
            confirmed = true
            return confirmed
        } catch (error) {
            const errorObj = JSON.parse(JSON.stringify(error));

        if (errorObj.transactionMessage) {
          console.log(clc.red("●") + " Failed tx " + clc.red("● ") + errorObj.transactionMessage);
        } else if (errorObj.signature) {
          console.log(clc.red("●") + " Failed tx " + clc.red("● ")+ errorObj.signature);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return false
}

export { addLiquidityToExistingPositionBidAsk }