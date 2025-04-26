import DLMM from '@meteora-ag/dlmm'
import { connection,user,config,wallet} from '../../../common'
import BN from "bn.js"
import {sendAndConfirmTransaction, ComputeBudgetProgram, PublicKey,SystemProgram, Transaction} from "@solana/web3.js";
import axios from "axios";
import { getRandomTipAccount, jitoTip, jitoUrl, jitoUrlStatus} from './createPosition';
import { SOL, solDecimals, solPrice } from './monitorPosition';
import { swap, buildSwapLegacy} from '../../jupiter/swaps';
import { getTokenBalance } from '../../others/getTokenBalance';
import clc from 'cli-color';
import { getPrice } from '../../jupiter/getPrice';
import "../../others/loggers"


async function removePositionLiquidity(dlmmPool: DLMM) {
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: config.priorityFeeInMicroLamports
  });

  let allClosed = false;
  let tries = 5;

  while (!allClosed && tries > 0) {
      try {
          const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(user.publicKey);

          if (userPositions.length === 0) {
              console.log("\x1b[94m+\x1b[0m  ~ "+ clc.green('●')+ " No positions to close "+ clc.green('●'));
              return true;
          }

          for (const { publicKey, positionData } of userPositions) {

              const binIdsToRemove = positionData.positionBinData.map(bin => bin.binId);
              const txs = await dlmmPool.removeLiquidity({
                  position: publicKey,
                  user: user.publicKey,
                  binIds: binIdsToRemove,
                  bps: new BN(100 * 100),
                  shouldClaimAndClose: true
              });

              const transactions = Array.isArray(txs) ? txs : [txs];

              for (const tx of transactions) {
                  tx.instructions.unshift(addPriorityFee);

                  const lastBlockhash = await connection.getLatestBlockhash();
                  tx.recentBlockhash = lastBlockhash.blockhash;
                  tx.lastValidBlockHeight = lastBlockhash.lastValidBlockHeight;

                  console.log("\x1b[94m+\x1b[0m  ~ Tx sent, waiting confirmation..");
                  const txHash = await sendAndConfirmTransaction(
                      connection,
                      tx,
                      [user],
                      { skipPreflight: false, preflightCommitment: "confirmed", commitment: "confirmed" }
                  );
                  console.log("\x1b[94m+\x1b[0m  ~ "+ clc.green('●')+ " Exit TxHash "+ clc.green('● ')+ txHash);
              }
          }
          console.log("\x1b[94m+\x1b[0m  ~ " + clc.green('●') + " All positions closed " + clc.green('●'));
          return true;
      } catch (error) {
          console.log("\x1b[94m+\x1b[0m  ~ "+ clc.red('●')+ " error "+ clc.red('● ')+ JSON.stringify(error, null, 2));
          tries--;
      }
  }
  return false;
}

async function txsremovePositionLiquidity(dlmmPool: DLMM) {
  try {
    const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(user.publicKey);

    let txsList: Transaction[] = []

    for (const { publicKey, positionData } of userPositions) {

        const binIdsToRemove = positionData.positionBinData.map(bin => bin.binId);
        const txs = await dlmmPool.removeLiquidity({
            position: publicKey,
            user: user.publicKey,
            binIds: binIdsToRemove,
            bps: new BN(100 * 100),
            shouldClaimAndClose: true
        });

        Array.isArray(txs) ? txsList.concat(txs) : txsList.push(txs);
    }
  
    return txsList
  } catch (error) {
    console.log("\x1b[94m+\x1b[0m  ~ "+ clc.red('●')+ " error "+ clc.red('● ')+ JSON.stringify(error, null, 2));
  }
}

async function txPayFees(feeToPayInSOL: number): Promise<Transaction> {
  const payFeeInstruction = SystemProgram.transfer({
    fromPubkey: user.publicKey,
    toPubkey: new PublicKey("5yi634mNYSo1mRuTanZ7WRAzWmd2wywzBYr8NmEsBqr8"),
    lamports: feeToPayInSOL * Math.pow(10,solDecimals)
  });

  return new Transaction().add(payFeeInstruction);
}

async function jitoTipTx(){
  const jitoTipInstruction = SystemProgram.transfer({
    fromPubkey: user.publicKey,
    toPubkey: new PublicKey(getRandomTipAccount()),
    lamports: jitoTip
  });

  return new Transaction().add(jitoTipInstruction);

}

async function jitoBundleClosureTxs(dlmmPool: DLMM, tokenXswap: number, tokenYswap: number,feeToPayInSOL: number) {

  console.log("\x1b[94m+\x1b[0m  ~ Building closing txs ")

  let confirmed = false;
  let tries = 4

  while (!confirmed && tries > 0 ) {

    try {

    tries --

    const closureTxs = await txsremovePositionLiquidity(dlmmPool)

    if (!closureTxs) {
      console.log("\x1b[94m+\x1b[0m  ~ "+ clc.red('●')+ " Positions closure failed "+ clc.red('●'));
      return false
    }

    if (tokenXswap != 0 ) {closureTxs.push(await buildSwapLegacy(dlmmPool.tokenX.publicKey.toString(), SOL, tokenXswap * Math.pow(10,dlmmPool.tokenX.decimal ))) }
    if (tokenYswap != 0 ) {closureTxs.push(await buildSwapLegacy(dlmmPool.tokenY.publicKey.toString(), SOL, tokenYswap * Math.pow(10,dlmmPool.tokenY.decimal ))) }
    if (feeToPayInSOL != 0 ) {closureTxs.push(await txPayFees(Number(feeToPayInSOL.toFixed(6))))}
    
    let transactionsChunked = await chunkTransactions(closureTxs)
    let confirmedBundles = 0

    for (let bundle of transactionsChunked) {
    
      const lastBlockhash = await connection.getLatestBlockhash();
      bundle.forEach(tx => {
        tx.recentBlockhash = lastBlockhash.blockhash
        tx.lastValidBlockHeight = lastBlockhash.lastValidBlockHeight
      });

      bundle.forEach(tx => tx.sign(user))

      const serializedTxs = bundle.map(tx => tx.serialize())

      const base64txs = serializedTxs.map(tx => tx.toString("base64"))
    
      let confirmedBundle = false
      try {
        const data = {
          jsonrpc: "2.0",
          id: 1,
          method: "sendBundle",
          params: [
            base64txs,
            {
              encoding: "base64"
            }
          ]
        };

        const response = await axios.post(jitoUrl, data, {
          headers: { "Content-Type": "application/json" }
        });
        const responseData = response.data;
        console.log("\x1b[94m+\x1b[0m  ~ Closing and swapping position, awaiting  confirmation (Jito bundle).. ");

        await new Promise(resolve => setTimeout(resolve, 2000));

        let intentosConfirmacion = 20

        while (!confirmedBundle && intentosConfirmacion > 0) {
          
          const dataStatus = {
            jsonrpc: "2.0",
            id: 1,
            method: "getBundleStatuses",
            params: [
              [responseData.result]
            ]
          };

          const responseStatus = await axios.post(jitoUrlStatus, dataStatus, {
            headers: { "Content-Type": "application/json" }
          });
  
          if ( responseStatus.data.result.value.length > 0 && (responseStatus.data.result.value[0].confirmation_status == "confirmed" || responseStatus.data.result.value[0].confirmation_status == "finalized")) {
            console.log("\x1b[94m+\x1b[0m  ~ "+clc.green('●')+" Jito bundle landed "+clc.green('● ')+ responseData.result);
            confirmedBundles ++ 
            confirmedBundle = true;
          } else if ( responseStatus.data.result.value.length > 0 && responseStatus.data.result.value[0].err.ok != null) {
            console.log("\x1b[94m+\x1b[0m  ~ "+clc.red('●')+" Jito bundle failed "+clc.red('● ')+ responseData.result);
            console.log(responseStatus.data.result.value[0].err)
            break
          }else {
            intentosConfirmacion --
            await new Promise(resolve => setTimeout(resolve, 2000));
          }

          if (intentosConfirmacion == 0) {
            console.log("\x1b[94m+\x1b[0m  ~ "+clc.red('●')+" Jito bundle failed "+clc.red('● ') + responseData.result);
          }
        }
      } catch (error) {
        const errorObj = JSON.parse(JSON.stringify(error));

        if (errorObj.transactionMessage) {
          console.log(clc.red('●') + " Failed tx "+ clc.red('● ') + errorObj.transactionMessage);
        } else if (errorObj.signature) {
          console.log(clc.red('●') + " Failed tx " + clc.red('● ')+ errorObj.signature);
        } else {
          console.log(clc.red('●') + " Failed bundle " + clc.red('● '));
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    if (confirmedBundles == transactionsChunked.length) return true

    } catch (error) {
      console.log(clc.red('●') + " Error on bundle closure " + clc.red('● '));
      console.error(error)
    }
  }

  return false
}

async function removePositionTest(poolAddress: String) {

    const dlmmPool = await DLMM.create(connection, new PublicKey(poolAddress));

    removePositionLiquidity(dlmmPool)
}

async function closeAndSellPosition(dlmmPool: DLMM) {
  const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(
    user.publicKey
  );

  let liquidityXamount = 0
  let feesXamount = 0
  let liquidityYamount = 0
  let feesYamount = 0
  

  for (const position of userPositions) {
    liquidityXamount += position.positionData.positionBinData.reduce((sum,item) => sum + parseInt(item.positionXAmount),0) 
    feesXamount += position.positionData.feeX.toNumber() 
    liquidityYamount += position.positionData.positionBinData.reduce((sum,item) => sum + parseInt(item.positionYAmount),0) 
    feesYamount += position.positionData.feeY.toNumber()
  }

  let totalXamount = liquidityXamount + feesXamount
  let totalYamount = liquidityYamount + feesYamount

  const closed = await removePositionLiquidity(dlmmPool)

  if (!closed) {
    console.log(clc.red('●') + " Positions closure failed "+ clc.red('●'))
    console.log(clc.red('●') + " Module stopped "+ clc.red('●'))
    return;
  }

  await new Promise(resolve => setTimeout(resolve, 5000));

  let soldValue = 0

  if (dlmmPool.tokenX.publicKey.toString() != SOL){
    const balanceX = await getTokenBalance(dlmmPool.tokenX.publicKey.toString())
    if (balanceX * (await getPrice(dlmmPool.tokenX.publicKey.toString())).price < 1) {
      console.log("\x1b[94m+\x1b[0m  ~ Not swapping " + dlmmPool.tokenX.publicKey.toString() + " tokens, value < 1$")
    
    } else {
      console.log("\x1b[94m+\x1b[0m  ~ Swapping all " + dlmmPool.tokenX.publicKey.toString() + " tokens..")
    
      const swapResult = await swap( dlmmPool.tokenX.publicKey.toString(), SOL, balanceX * Math.pow(10,dlmmPool.tokenX.decimal));
      soldValue += swapResult * solPrice
  
      if (swapResult == 0) {
        console.log(clc.red('●') + " Every Swap failed "+ clc.red('●'))
        console.log(clc.red('●') + " Module stopped "+ clc.red('●'))
        return;
      }
    }
  } else {
    soldValue += (totalXamount/Math.pow(10,solDecimals)) * solPrice
  }

  if (dlmmPool.tokenY.publicKey.toString() != SOL){
    const balanceY = await getTokenBalance(dlmmPool.tokenY.publicKey.toString())
    if (balanceY * (await getPrice(dlmmPool.tokenY.publicKey.toString())).price < 1) {
      console.log("\x1b[94m+\x1b[0m  ~ Not swapping " + dlmmPool.tokenY.publicKey.toString() + " tokens, value < 1$")
    } else {
      console.log("\x1b[94m+\x1b[0m  ~ Swapping all " + dlmmPool.tokenY.publicKey.toString() + " tokens..")
      
      const swapResult = await swap( dlmmPool.tokenY.publicKey.toString(), SOL, balanceY * Math.pow(10,dlmmPool.tokenY.decimal));
      soldValue += swapResult * solPrice

      if (swapResult == 0) {
          console.log(clc.red('●') + " Every Swap failed "+ clc.red('●'))
          console.log(clc.red('●') + " Module stopped "+ clc.red('●'))
          return;
      }
    }
  } else {
    soldValue += (totalYamount/Math.pow(10,solDecimals)) *solPrice
  }

  console.log("\x1b[94m+\x1b[0m  ~ All positions closed and tokens swapped to SOL" )
  config.currency == "SOL" ?
      console.log("\x1b[94m+\x1b[0m  ~ Final value: "+ (soldValue / solPrice).toFixed(3) +" SOL" ) :
      console.log("\x1b[94m+\x1b[0m  ~ Final value: "+ soldValue.toFixed(2) +"$" )

  return;
}

async function jitoBundleClosure(dlmmPool: DLMM) {
  const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(
    user.publicKey
  );

  let liquidityXamount = 0
  let feesXamount = 0
  let liquidityYamount = 0
  let feesYamount = 0
  
  for (const position of userPositions) {
    liquidityXamount += position.positionData.positionBinData.reduce((sum,item) => sum + parseInt(item.positionXAmount),0) 
    feesXamount += position.positionData.feeX.toNumber() 
    liquidityYamount += position.positionData.positionBinData.reduce((sum,item) => sum + parseInt(item.positionYAmount),0) 
    feesYamount += position.positionData.feeY.toNumber()
  }

  let totalXamount = (liquidityXamount + feesXamount) / Math.pow(10,dlmmPool.tokenX.decimal)
  let totalYamount = (liquidityYamount + feesYamount) / Math.pow(10,dlmmPool.tokenY.decimal)
  let tokenXprice = (await getPrice(dlmmPool.tokenX.publicKey.toString())).price
  let tokenYprice = (await getPrice(dlmmPool.tokenY.publicKey.toString())).price
  let feesGeneratedUsd = (feesXamount/Math.pow(10,dlmmPool.tokenX.decimal)) * tokenXprice + (feesYamount / Math.pow(10,dlmmPool.tokenY.decimal)) * tokenYprice
  let feeToPayInSOL = (feesGeneratedUsd * 0.04) / solPrice

  let tokenXswap = 0
  let tokenYswap = 0

  console.log("\x1b[94m+\x1b[0m  ~ Total fees generated: "+ feesGeneratedUsd.toFixed(4) +"$")
  console.log("\x1b[94m+\x1b[0m  ~ Fee to pay in SOL: "+ feeToPayInSOL.toFixed(4) +" SOL")

  if (dlmmPool.tokenX.publicKey.toString() == SOL || totalXamount * tokenXprice < 1) {
    console.log("\x1b[94m+\x1b[0m  ~ Not swapping " + dlmmPool.tokenX.publicKey.toString() + " tokens")
  } else {
    tokenXswap = totalXamount
  }

  if (dlmmPool.tokenY.publicKey.toString() == SOL || totalYamount * tokenYprice < 1) {
    console.log("\x1b[94m+\x1b[0m  ~ Not swapping " + dlmmPool.tokenY.publicKey.toString() + " tokens")
  } else {
    tokenYswap = totalYamount
  }

  if (feesGeneratedUsd < 2) {
    console.log("\x1b[94m+\x1b[0m  ~ Not paying fees, value < 2$")
    feeToPayInSOL = 0
  }

  let result = await jitoBundleClosureTxs(dlmmPool,tokenXswap,tokenYswap,feeToPayInSOL)
  if (result) {
    console.log("\x1b[94m+\x1b[0m  ~ "+clc.green('●')+" All positions closed and tokens swapped "+clc.green('● '))
  }

  return result
}

async function removeAndSellPositionTest(poolAddress: String) {

  const dlmmPool = await DLMM.create(connection, new PublicKey(poolAddress));

  closeAndSellPosition(dlmmPool)
}

async function testJitoBundleClosure(poolAddress: String) {

  const dlmmPool = await DLMM.create(connection, new PublicKey(poolAddress));

  jitoBundleClosure(dlmmPool)
}

async function chunkTransactions(transactions: Transaction[]) {
  const chunkSize = 4;
  const bundles: Transaction[][] = [];

  for (let i = 0; i < transactions.length; i += chunkSize) {
    const chunk = transactions.slice(i, i + chunkSize); 
    chunk.push(await jitoTipTx());
    bundles.push(chunk);
  }

  return bundles;
}

export { removePositionLiquidity, closeAndSellPosition, jitoBundleClosure}