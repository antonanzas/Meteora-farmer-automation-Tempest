import clc from 'cli-color';
import { user,connection } from '../../common';
import { SOL, solDecimals } from '../meteora/sdk/monitorPosition';
import "../others/loggers"

async function getFinalSwapAmount(txHash: string, token: string) {
    let transaction  = await connection.getParsedTransaction(txHash, {maxSupportedTransactionVersion: 0});

    if (transaction && transaction.meta) {

        if (token == SOL) {
            const preBalanceSOL = transaction.meta.preBalances[0] || 0;
            const postBalanceSOL = transaction.meta.postBalances[0] || 0;

            const swappedAmountSOL = (postBalanceSOL - preBalanceSOL) / Math.pow(10, solDecimals);
            console.log("\x1b[94m+\x1b[0m  ~"+clc.green(" ● ") +"Swapped amount (SOL): "+ swappedAmountSOL);
            return swappedAmountSOL;
        } else {
            const preBalances = Array.isArray(transaction.meta.preTokenBalances) 
            ? transaction.meta.preTokenBalances 
            : [];
            const postBalances = Array.isArray(transaction.meta.postTokenBalances) 
                ? transaction.meta.postTokenBalances 
                : [];
            
            const preBalanceToken = preBalances.find(
                (balance) => balance.mint === token && balance.owner === user.publicKey.toString()
            ) || { uiTokenAmount: { uiAmount: 0 } };
                
            const postBalanceToken = postBalances.find(
                (balance) => balance.mint === token && balance.owner === user.publicKey.toString()
            ) || { uiTokenAmount: { uiAmount: 0 } };
                
                
            const swappedAmount = (postBalanceToken.uiTokenAmount.uiAmount || 0) - (preBalanceToken.uiTokenAmount.uiAmount || 0);
            return swappedAmount
        }
        
    } else {
        console.error(clc.red("●")+" Transaction or metadata is null " + clc.red("●"));
        return 1
    }
}

export { getFinalSwapAmount }