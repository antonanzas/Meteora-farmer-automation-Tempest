import axios from 'axios';
import { user,wallet, connection } from '../../common';
import { Transaction, VersionedTransaction, SystemProgram, PublicKey} from '@solana/web3.js';
import { jitoTip, getRandomTipAccount, jitoUrlStatus, jitoUrl } from '../meteora/sdk/createPosition';
import { getFinalSwapAmount } from './parseSwap';
import clc from 'cli-color';
import "../others/loggers"

async function getQuote(tokenX: string, tokenY: string, amount: number) {

    let config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `https://api.jup.ag/swap/v1/quote?inputMint=${tokenX}&outputMint=${tokenY}&amount=${amount}&slippageBps=500&restrictIntermediateTokens=true`,
        headers: { 
            'Accept': 'application/json'
        }
    };

    try {
        const response = await axios.request(config);
        return response.data;
    } catch (error) {
        console.error(clc.red('●') , " Error getting swap quote: ", error);
    }
}

async function getQuoteLegacy(tokenX: string, tokenY: string, amount: number) {

    let config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `https://api.jup.ag/swap/v1/quote?inputMint=${tokenX}&outputMint=${tokenY}&amount=${amount}&slippageBps=500&restrictIntermediateTokens=true&asLegacyTransaction=true`,
        headers: { 
            'Accept': 'application/json'
        }
    };

    try {
        const response = await axios.request(config);
        return response.data;
    } catch (error) {
        console.error(clc.red('●') , " Error getting swap quote: ", error);
    }
}

async function swapTx(quote: any) {

    let data = JSON.stringify({
        "userPublicKey": user.publicKey.toString(),
        "prioritizationFeeLamports": {"priorityLevelWithMaxLamports": {"priorityLevel": "high", "maxLamports": 1000000}},
        "quoteResponse": quote
    });


    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://api.jup.ag/swap/v1/swap',
        headers: { 
            'Content-Type': 'application/json', 
            'Accept': 'application/json'
        },
        data : data
    };


    try {
        const response = await axios.request(config);
        return response.data;
    } catch (error) {
        console.error(clc.red('●') + " Error building swap tx: " + error);
    }
}

async function swapTxLegacy(quote: any) {

    let data = JSON.stringify({
        "userPublicKey": user.publicKey.toString(),
        "asLegacyTransaction": true,
        "quoteResponse": quote
    });


    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://api.jup.ag/swap/v1/swap',
        headers: { 
            'Content-Type': 'application/json', 
            'Accept': 'application/json'
        },
        data : data
    };


    try {
        const response = await axios.request(config);
        return response.data;
    } catch (error) {
        console.error(clc.red('●') + " Error building swap tx: " + error);
    }
}

async function signAndSendSwap(tx: any,tokenReceived: string) {
    const swapTransactionBuf = Buffer.from(tx.swapTransaction, 'base64');
    let transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // sign the transaction
    transaction.sign([wallet.payer]);

    // get the latest block hash
    const latestBlockHash = await connection.getLatestBlockhash();

    // Execute the transaction
    const rawTransaction = transaction.serialize()

    try {
        console.log("\x1b[94m+\x1b[0m  ~ Tx sent, waiting confirmation.. ");
        const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        maxRetries: 2
        });

        await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: txid
        });
        console.log("\x1b[94m+\x1b[0m  ~ "+clc.green("●")+" Swap TxHash "+clc.green("● ")+ txid)

        await new Promise(resolve => setTimeout(resolve, 2000));
        return await getFinalSwapAmount(txid,tokenReceived);

    } catch (error){
        const errorObj = JSON.parse(JSON.stringify(error));

        if (errorObj.transactionMessage) {
        
        console.log(clc.red("●") + " Failed tx " + clc.red("● ") + errorObj.transactionMessage);
        } else if (errorObj.signature) {
        console.log(clc.red("●") + " Failed tx " + clc.red("● ")+ errorObj.signature);
        }

        return 0
    }

    
}

async function swap(tokenX: string,tokenY: string,amount: number,tries: number = 0): Promise<number> {
    let confirmedAmount = 0

    try {
        let quote = await getQuote(tokenX,tokenY,amount)
        let tx = await swapTx(quote)
        confirmedAmount = await signAndSendSwap(tx,tokenY)
    } catch (error) {
        console.error(clc.red('●')+" ~ Error during swap operation: "+ error);
    }

    if (confirmedAmount > 0){
        return confirmedAmount
    } else if (tries < 4){
        return await swap(tokenX,tokenY,amount,tries+1)
    } else { return 0 }
}

async function buildSwapLegacy(tokenX: string, tokenY: string, amount: number, tryCount: number = 5): Promise<any> {   
    try {
        let quote = await getQuoteLegacy(tokenX,tokenY,amount)
        let txInBase64 = (await swapTxLegacy(quote)).swapTransaction

        const swapTransactionBuf = Buffer.from(txInBase64, 'base64');
        let transaction = Transaction.from(swapTransactionBuf);
        return transaction
    } catch (error) {
        console.error(clc.red('●')+" ~ Error during swap operation: "+ error);
        if (tryCount > 0) return await buildSwapLegacy(tokenX,tokenY,amount,tryCount-1)
    }
}

async function swapWithJitoLegacy(tokenX: string,tokenY: string,amount: number,tries: number = 0): Promise<any> {
    console.log("Initiating jito swap..")

    let confirmed = false;
    //Jito tip ix
    const jitoTipInstruction = SystemProgram.transfer({
        fromPubkey: user.publicKey,
        toPubkey: new PublicKey(getRandomTipAccount()),
        lamports: jitoTip
    });

    const jitoTipTx = new Transaction().add(jitoTipInstruction);
    console.log("Jito tip tx created..")

    let confirmedAmount = 0

    try {
        let tx = await buildSwapLegacy(tokenX,tokenY,amount)
        
        const lastBlockhash = await connection.getLatestBlockhash();
        tx.recentBlockhash = lastBlockhash.blockhash
        tx.lastValidBlockHeight = lastBlockhash.lastValidBlockHeight
        jitoTipTx.recentBlockhash = lastBlockhash.blockhash
        jitoTipTx.lastValidBlockHeight = lastBlockhash.lastValidBlockHeight

        tx.sign(user)
        jitoTipTx.sign(user)

        let txs = [tx,jitoTipTx]

        console.log("Serializing closure txs..")
        const serializedTxs = txs.map(tx => tx.serialize())

        console.log("Converting to base64..")
        const base64txs = serializedTxs.map(tx => tx.toString("base64"))

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
            console.log("\x1b[94m+\x1b[0m  ~ Sent swap in bundle, awaiting  confirmation (Jito bundle).. ");
      
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


    } catch (error) {
        console.error(clc.red('●')+" ~ Error during swap operation: "+ error);
    }

    if (confirmedAmount > 0){
        return confirmedAmount
    } else if (tries < 4){
        return await swapWithJitoLegacy(tokenX,tokenY,amount,tries+1)
    } else { return 0 }
}

export { swap, buildSwapLegacy}