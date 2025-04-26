import DLMM from '@meteora-ag/dlmm'
import axios from "axios";
import { config, connection,user} from '../../../common'
import BN from "bn.js"
import { StrategyType } from "@meteora-ag/dlmm"
import { Keypair, PublicKey, sendAndConfirmTransaction, ComputeBudgetProgram,SystemProgram} from "@solana/web3.js";
import clc from 'cli-color';
import "../../others/loggers"
import { solDecimals } from './monitorPosition';



let jitoTip = 100000; // 0.0001 SOL
const jitoUrl = 'https://mainnet.block-engine.jito.wtf:443/api/v1/bundles';
const jitoUrlStatus = 'https://mainnet.block-engine.jito.wtf/api/v1/getBundleStatuses';

async function getJitoTipBucle(): Promise<void> {
  while (true) {
    try {
      await getJitoTip()
    }
    catch (error) {
      console.error("Error updating Jito tip");
    }
    await new Promise(resolve => setTimeout(resolve, 60000));
  }
}

async function getJitoTip(){
  try {
    const response = await axios.get('https://bundles.jito.wtf/api/v1/bundles/tip_floor');
    jitoTip = (Number(response.data[0].landed_tips_95th_percentile.toFixed(6)))* Math.pow(10, solDecimals);
  } catch (error) {
    console.error('Error fetching tip floor:'+ error);
  }
}

function getRandomTipAccount() {
  const accounts = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT"
  ];
  return accounts[Math.floor(Math.random() * accounts.length)];
}

async function createImbalancePosition(newImbalancePosition: Keypair,dlmmPool: DLMM, notParsedXAmount: number, notParsedYAmount: number,lowerCoef: number , bins: number = 69) {

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
      
      const createPositionTx =
        await dlmmPool.initializePositionAndAddLiquidityByStrategy({
          positionPubKey: newImbalancePosition.publicKey,
          user: user.publicKey,
          totalXAmount,
          totalYAmount,
          strategy: {
            maxBinId,
            minBinId,
            strategyType: StrategyType.SpotImBalanced,
          },
      });

      let ixs = createPositionTx.instructions
      ixs.unshift(addPriorityFee)
      createPositionTx.instructions = ixs

      const lastBlockhash = await connection.getLatestBlockhash();
      createPositionTx.recentBlockhash = lastBlockhash.blockhash
      createPositionTx.lastValidBlockHeight = lastBlockhash.lastValidBlockHeight

      //console.log("\x1b[94m+\x1b[0m  ~ createPositionTx: ", createPositionTx);
      console.log("\x1b[94m+\x1b[0m  ~ Initiating spot position, awaiting  confirmation.. ");
    
      try {
        const createImbalancePositionTxHash = await sendAndConfirmTransaction(
          connection,
          createPositionTx,
          [user, newImbalancePosition],
          {commitment: "confirmed"}
        );
        console.log("\x1b[94m+\x1b[0m  ~ "+ clc.green('●')," Entry TxHash " +clc.green('● ') +  createImbalancePositionTxHash);
        confirmed = true
        return confirmed
      } catch (error) {
        const errorObj = JSON.parse(JSON.stringify(error));

        if (errorObj.transactionMessage) {
          console.log(clc.red('●') + " Failed tx "+ clc.red('● ') + errorObj.transactionMessage);
        } else if (errorObj.signature) {
          console.log(clc.red('●') + " Failed tx " + clc.red('● ')+ errorObj.signature);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return false
}

async function createBalancePosition(newBalancePosition: Keypair,dlmmPool: DLMM, notParsedXAmount: number, notParsedYAmount: number,lowerCoef: number , bins: number = 69) {

  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
    microLamports: config.priorityFeeInMicroLamports
  });

  const activeBin = await dlmmPool.getActiveBin();
  const minBinId = activeBin.binId - Math.floor(bins*lowerCoef);
  const maxBinId = activeBin.binId + Math.floor(bins*(1 - lowerCoef));

  const totalXAmount = new BN(notParsedXAmount * Math.pow(10,dlmmPool.tokenX.decimal))
  const totalYAmount = new BN(notParsedYAmount * Math.pow(10,dlmmPool.tokenY.decimal))

  let confirmed = false;
  let tries = 4

  while (!confirmed && tries > 0 ) {
    tries --

    const createPositionTx =
      await dlmmPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newBalancePosition.publicKey,
        user: user.publicKey,
        totalXAmount,
        totalYAmount,
        strategy: {
          maxBinId,
          minBinId,
          strategyType: StrategyType.SpotBalanced,
        },
      });

    let ixs = createPositionTx.instructions
    ixs.unshift(addPriorityFee)
    createPositionTx.instructions = ixs

    const lastBlockhash = await connection.getLatestBlockhash();
    createPositionTx.recentBlockhash = lastBlockhash.blockhash
    createPositionTx.lastValidBlockHeight = lastBlockhash.lastValidBlockHeight

    //console.log("+  ~ createPositionTx: ", createPositionTx);
    console.log("\x1b[94m+\x1b[0m  ~ Tx sent, waiting confirmation.. ");
  
    try {
      const createBalancePositionTxHash = await sendAndConfirmTransaction(
        connection,
        createPositionTx,
        [user, newBalancePosition],
        {commitment: "confirmed"}
      );
      console.log("\x1b[94m+\x1b[0m  ~ "+clc.green('●')+" Entry TxHash "+clc.green('● ')+createBalancePositionTxHash);
      confirmed = true
      return confirmed
    } catch (error) {
      const errorObj = JSON.parse(JSON.stringify(error));

      if (errorObj.transactionMessage) {
        console.log(clc.red('●') + " Failed tx "+ clc.red('● ') + errorObj.transactionMessage);
      } else if (errorObj.signature) {
        console.log(clc.red('●') + " Failed tx " + clc.red('● ')+ errorObj.signature);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return false
}

//For One Sided Positions lowerCoef = 0 or lowerCoef = 1
async function createBidAskPosition(newBidAskPosition: Keypair,dlmmPool: DLMM, notParsedXAmount: number, notParsedYAmount: number,lowerCoef: number , bins: number = 69) {

    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
      microLamports: config.priorityFeeInMicroLamports
    });

    const activeBin = await dlmmPool.getActiveBin();
    const minBinId = activeBin.binId - Math.floor(bins*lowerCoef);
    const maxBinId = activeBin.binId + Math.floor(bins*(1 - lowerCoef));

    const totalXAmount = new BN(notParsedXAmount * Math.pow(10,dlmmPool.tokenX.decimal))
    const totalYAmount = new BN(notParsedYAmount * Math.pow(10,dlmmPool.tokenY.decimal))

    let confirmed = false;
    let tries = 4

    while (!confirmed && tries > 0 ) {
      tries --

      const createPositionTx =
        await dlmmPool.initializePositionAndAddLiquidityByStrategy({
          positionPubKey: newBidAskPosition.publicKey,
          user: user.publicKey,
          totalXAmount,
          totalYAmount,
          strategy: {
            maxBinId,
            minBinId,
            strategyType: StrategyType.BidAskImBalanced,
          },
        });

      let ixs = createPositionTx.instructions
      ixs.unshift(addPriorityFee)
      createPositionTx.instructions = ixs

      const lastBlockhash = await connection.getLatestBlockhash();
      createPositionTx.recentBlockhash = lastBlockhash.blockhash
      createPositionTx.lastValidBlockHeight = lastBlockhash.lastValidBlockHeight

      console.log("\x1b[94m+\x1b[0m  ~ Initiating BidAsk position, awaiting  confirmation.. ");
    
      try {
        const createImbalancePositionTxHash = await sendAndConfirmTransaction(
          connection,
          createPositionTx,
          [user, newBidAskPosition],
          {commitment: "confirmed"}
        );
        console.log("\x1b[94m+\x1b[0m  ~ "+clc.green('●')+" Entry TxHash "+clc.green('● ')+createImbalancePositionTxHash);
        confirmed = true
        return confirmed
      } catch (error) {
        const errorObj = JSON.parse(JSON.stringify(error));

        if (errorObj.transactionMessage) {
          console.log(clc.red('●') + " Failed tx "+ clc.red('● ') + errorObj.transactionMessage);
        } else if (errorObj.signature) {
          console.log(clc.red('●') + " Failed tx " + clc.red('● ')+ errorObj.signature);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return false
}

async function createCurvePosition(newCurvePoition: Keypair,dlmmPool: DLMM, notParsedXAmount: number, notParsedYAmount: number,lowerCoef: number , bins: number = 69) {

  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
    microLamports: config.priorityFeeInMicroLamports
  });

  const activeBin = await dlmmPool.getActiveBin();
  const minBinId = activeBin.binId - Math.floor(bins*lowerCoef);
  const maxBinId = activeBin.binId + Math.floor(bins*(1 - lowerCoef));

  const totalXAmount = new BN(notParsedXAmount * Math.pow(10,dlmmPool.tokenX.decimal))
  const totalYAmount = new BN(notParsedYAmount * Math.pow(10,dlmmPool.tokenY.decimal))

  let confirmed = false;
  let tries = 4

  while (!confirmed && tries > 0 ) {
    tries --

    const createPositionTx =
      await dlmmPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newCurvePoition.publicKey,
        user: user.publicKey,
        totalXAmount,
        totalYAmount,
        strategy: {
          maxBinId,
          minBinId,
          strategyType: StrategyType.CurveImBalanced,
        },
      });

    let ixs = createPositionTx.instructions
    ixs.unshift(addPriorityFee)
    createPositionTx.instructions = ixs

    const lastBlockhash = await connection.getLatestBlockhash();
    createPositionTx.recentBlockhash = lastBlockhash.blockhash
    createPositionTx.lastValidBlockHeight = lastBlockhash.lastValidBlockHeight

    console.log("\x1b[94m+\x1b[0m  ~ Initiating curve position, awaiting  confirmation.. ");
  
    try {
      const createImbalancePositionTxHash = await sendAndConfirmTransaction(
        connection,
        createPositionTx,
        [user, newCurvePoition],
        {commitment: "confirmed"}
      );
      console.log("\x1b[94m+\x1b[0m  ~ "+clc.green('●')+" Entry TxHash "+clc.green('● ')+ createImbalancePositionTxHash);
      confirmed = true
      return confirmed
    } catch (error) {
      const errorObj = JSON.parse(JSON.stringify(error));

      if (errorObj.transactionMessage) {
        console.log(clc.red('●') + " Failed tx "+ clc.red('● ') + errorObj.transactionMessage);
      } else if (errorObj.signature) {
        console.log(clc.red('●') + " Failed tx " + clc.red('● ')+ errorObj.signature);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return false
}

async function createSpotBidPosition(newImbalancePosition: Keypair,newBidPosition: Keypair,dlmmPool: DLMM, notParsedXAmount: number, notParsedYAmount: number,lowerCoef: number , bins: number = 69){

  const jitoTipInstruction = SystemProgram.transfer({
    fromPubkey: user.publicKey,
    toPubkey: new PublicKey(getRandomTipAccount()),
    lamports: jitoTip
  });

  let confirmed = false;
  let tries = 4

  while (!confirmed && tries > 0 ) {

    tries --

    const activeBin = await dlmmPool.getActiveBin();
    const minBinId = activeBin.binId - Math.floor(bins*lowerCoef);
    const maxBinId = activeBin.binId + Math.floor(bins*(1 - lowerCoef));

    const totalXAmountSpot = new BN(notParsedXAmount * Math.pow(10,dlmmPool.tokenX.decimal))
    const totalXAmountBid = new BN(notParsedXAmount * Math.pow(10,dlmmPool.tokenX.decimal))
    const totalYAmountBid = new BN(notParsedYAmount* 0.8 * Math.pow(10,dlmmPool.tokenY.decimal)) 
    const totalYAmountSpot = new BN(notParsedYAmount* 0.2 * Math.pow(10,dlmmPool.tokenY.decimal))
    
    const createSpotPositionTx =
      await dlmmPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newImbalancePosition.publicKey,
        user: user.publicKey,
        totalXAmount: totalXAmountSpot,
        totalYAmount: totalYAmountSpot,
        strategy: {
          maxBinId,
          minBinId,
          strategyType: StrategyType.SpotImBalanced,
        },
    });

    const createBidPositionTx =
    await dlmmPool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: newBidPosition.publicKey,
      user: user.publicKey,
      totalXAmount: totalXAmountBid,
      totalYAmount: totalYAmountBid,
      strategy: {
        maxBinId,
        minBinId,
        strategyType: StrategyType.BidAskImBalanced,
      },
    });

    createBidPositionTx.add(jitoTipInstruction)

    const lastBlockhash = await connection.getLatestBlockhash();
    createSpotPositionTx.recentBlockhash = lastBlockhash.blockhash
    createBidPositionTx.lastValidBlockHeight = lastBlockhash.lastValidBlockHeight

    createBidPositionTx.sign(user, newBidPosition)
    createSpotPositionTx.sign(user, newImbalancePosition)

    const serializedSpotTx = createSpotPositionTx.serialize();
    const serializedSBidTx = createBidPositionTx.serialize();

    const base64SpotTx = serializedSpotTx.toString("base64");
    const base64BidTx = serializedSBidTx.toString("base64");

    const base64txs = [base64SpotTx,base64BidTx]

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
      console.log("\x1b[94m+\x1b[0m  ~ Initiating SpotBid position, awaiting  confirmation (Jito bundle).. ");

      await new Promise(resolve => setTimeout(resolve, 2000));

      let intentosConfirmacion = 20

      while (!confirmed && intentosConfirmacion > 0) {
        
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
          confirmed = true;
          return confirmed
        } else if ( responseStatus.data.result.value.length > 0 && responseStatus.data.result.value[0].err.ok != null) {
          console.log("\x1b[94m+\x1b[0m  ~ "+clc.red('●')+" Jito bundle failed "+clc.red('● ')+ responseData.result);
          console.log(responseStatus.data.result.value[0].err)
          break
        }else {
          intentosConfirmacion --
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        if (intentosConfirmacion == 0) {
          console.log("\x1b[94m+\x1b[0m  ~ "+clc.red('●')+" Jito bundle failed "+clc.red('● ')+ responseData.result);
        }
      }
    } catch (error) {
      const errorObj = JSON.parse(JSON.stringify(error));

      if (errorObj.transactionMessage) {
        console.log(clc.red('●') + " Failed tx "+ clc.red('● ') + errorObj.transactionMessage);
      } else if (errorObj.signature) {
        console.log(clc.red('●') + " Failed tx " + clc.red('● ')+ errorObj.signature);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
   }
  }

  return false
}

async function createASTposition(newASTPosition: Keypair, dlmmPool: DLMM,notParsedYamount:number){

  let activeBin = await dlmmPool.getActiveBin();
  let targetPrice = parseFloat(activeBin.price) * 0.28
  let targetBinId =  dlmmPool.getBinIdFromPrice(targetPrice,true)
  const binRange = Math.abs(targetBinId - activeBin.binId-1)

  const bidPosition = await createBidAskPosition(newASTPosition,dlmmPool,0,notParsedYamount * 0.8,1,binRange)
}

async function createPositionTest(XAmount: number, YAmount: number, lowerCoef: number) {

    const dlmmPool = await DLMM.create(connection, new PublicKey("BzYJfKAEFqBU91mv63JeMMWKRMjd6mR5eLnwsc5VcVYf"));

    const newPosition = new Keypair();
    const newPositionSecond = new Keypair();
    //console.log("New Position: ",newPosition.publicKey.toBase58())

    //createImbalancePosition(newPosition,dlmmPool,XAmount,YAmount, lowerCoef)
    //createBalancePosition(newPosition,dlmmPool,XAmount,YAmount, lowerCoef)
    //createBidAskPosition(newPosition,dlmmPool,XAmount,YAmount, lowerCoef)
    //createCurvePosition(newPosition,dlmmPool,XAmount,YAmount, lowerCoef)
    //createSpotBidPosition(newPosition,newPositionSecond,dlmmPool,XAmount,YAmount, lowerCoef)
    //createASTposition(newPosition,dlmmPool,YAmount)
}


export { createImbalancePosition,createBidAskPosition,createCurvePosition, createSpotBidPosition,createASTposition, getJitoTipBucle, getRandomTipAccount,jitoTip,jitoUrl,jitoUrlStatus}
  