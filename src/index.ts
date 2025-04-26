import clear from 'clear'; 
import figlet from 'figlet';
import * as readline from 'readline';
import { createASTposition, createBidAskPosition, createImbalancePosition, createSpotBidPosition, getJitoTipBucle } from './meteora/sdk/createPosition';
import { Keypair, PublicKey } from '@solana/web3.js';
import { connection, user,config } from '../common';
import DLMM from '@meteora-ag/dlmm';
import { getSolPrice, hotkeyMonitoringSpecificDLMM, SOL, startMonitor } from './meteora/sdk/monitorPosition';
import  {solPrice} from "./meteora/sdk/monitorPosition";
import { getTokenBalance } from './others/getTokenBalance';
import { getPrice } from './jupiter/getPrice';
import { checkEnoughBalance, roundToTwo } from './others/enoughBalance';
import { swap } from './jupiter/swaps';
import { getUserPositions } from './meteora/sdk/getUserPositions';
import { startSimulationLoop } from './meteora/api/simulate';
import { startFarmingLoop } from './meteora/sdk/autoFarming';
import clc from 'cli-color';
import { getPairInfo } from './meteora/api/getPairs';
import "../src/others/loggers";

interface PositionInfo {
    poolAddress: string,
    distribution: string,
    dollarAmount: number,
    lowerCoef: number,
    tp: number | undefined,
    tpTime: number | undefined,
    tpPrice: number | undefined,
    sl: number | undefined
    
}

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught exception: "+ err);
});
  
process.on("unhandledRejection", (reason, promise) => {
   console.error("⚠️ Unhandled promise: "+ reason);
});

function limpiarPantalla(): void {
    clear();
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function pregunta(pregunta: string): Promise<string> {
    return new Promise((resolve) => {
      rl.question(pregunta, (respuesta) => {
        resolve(respuesta);
      });
    });
}

async function main(){
    await getPrice(SOL)
    await getTokenBalance(SOL)
    clear();
    figlet(">  TEMPEST  <", (err: any, data: any) => {
    if (err) {
        console.log('Something went wrong...');
        console.dir(err);
        return;
    }
    console.log('\x1b[94m' + data + '\x1b[0m')
    });

    getSolPrice()
    getJitoTipBucle()

    await mostrarMenu();
}

async function mostrarMenu(): Promise<void> {
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log("-".repeat(57));
    console.log("User: " + clc.blueBright(user.publicKey.toString()));
    console.log("Solana price: " + clc.blueBright( (await getPrice(SOL)).price )+ "   Balance: " + clc.blueBright( (await getTokenBalance(SOL)).toFixed(2)));
    console.log("-".repeat(44));
    console.log(clc.blueBright("1 -> ") + " Pulse");
    console.log(clc.blueBright("2 -> ") + " Auto Farming");
    //console.log(clc.blueBright("3 -> ") + " One sided positions");
    //console.log(clc.blueBright("4 -> ") + " Spot & Monitor");
    //console.log(clc.blueBright("5 -> ") + " Live Simulations");

    rl.question(' ', (answer) => {

        switch (answer) {
            case "1":
                limpiarPantalla()
                justMonitor()
                break;
            case "2":
                limpiarPantalla()
                autoFarming()
                break;
            // case "3":
            //     limpiarPantalla()
            //     OneSidedPositions()
            //     break;
            // case "4":
            //     limpiarPantalla()
            //     SpotAndMonitor()
            //     break;
            // case "5":
            //     limpiarPantalla()
            //     justMonitor()
            //     break;
            // case "6":
            //     console.log("+  ~ exiting..");
            //     return;
            default:
                console.log("Invalid option, restart");
                break;
        }
    })

}

async function SpotAndMonitor(){

    console.log("\x1b[94m+\x1b[0m  ~ Create & Monitor SELECTED");

    const numberOfPools = parseInt(await pregunta("\x1b[94m+\x1b[0m  ~ How many positions do you want to create? "));
    const poolsInfo: PositionInfo[] = []

    for (let i = 0; i < numberOfPools; i++) {
        const poolAddress = await pregunta("\x1b[94m+\x1b[0m  ~ Input DLMM address: ");

        //const distribution = (await pregunta("\x1b[94m+\x1b[0m  ~ Input distribution (spot/bidask/spotbid (80-20)): ")).trim().toLowerCase();
        //if (!(distribution == "spot" || distribution == "bidask" || distribution == "spotbid")) {console.error("\x1b[91m✖  Invalid distribution. Please try again.\x1b[0m"), process.exit(1)}
    
        let dollarAmount: number;
        config.currency == "SOL" ? 
            dollarAmount = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input SOL amount (ej: 1): ")) * solPrice :
            dollarAmount = parseInt(await pregunta("\x1b[94m+\x1b[0m  ~ Input $ amount (ej: 100): "));
        const lowerCoef = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input Lower Coef (Ej 0.8 for a 80-20 distribution): "));
        console.log("\x1b[94m+\x1b[0m  ~ Do you want to set a Take Profit?");
        console.log(`   \x1b[94m1 ->\x1b[0m Time tp`)
        console.log(`   \x1b[94m2 ->\x1b[0m % tp`)
        console.log(`   \x1b[94m3 ->\x1b[0m time OR % tp`)
        console.log(`   \x1b[94m4 ->\x1b[0m price AND % tp`)
        let wantTP = parseInt(await pregunta("Input number (enter to ignore): "));

        let tpTime: number | undefined = 0
        let tpPrice: number | undefined = 0
        let tp: number | undefined = 0

        if ( wantTP == 1 ) {
            tpTime = parseInt(await pregunta("\x1b[94m+\x1b[0m  ~ Input time in minutes to take profit: ")) * 60000;
        } else if ( wantTP == 2 ) {
            tp = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input Take Profit (Ej 10 -> +10%): "));
        } else if ( wantTP == 3 ) {
            tpTime = parseInt(await pregunta("\x1b[94m+\x1b[0m  ~ Input time in minutes to take profit: ")) * 60000;
            tp = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input Take Profit (Ej 10 -> +10%): "));
        } else if ( wantTP == 4 ) {
            tpPrice = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input DLMM price: "));
            tp = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input Take Profit (Ej 10 -> +10%): "));
        }
        let sl: number | undefined = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input Stop Loss (Ej -10 -> -10%, enter to ignore): "));

        if (isNaN(tp) || tp <= 0) {tp = undefined}
        if (isNaN(tpPrice) || tpPrice == 0) {tpPrice = undefined}
        if (isNaN(tpTime) || tpTime == 0) {tpTime = undefined}
        if (isNaN(sl) || sl >= 0) {sl = undefined}
        if (lowerCoef < 0 || lowerCoef > 1) {throw new Error(clc.red("●") +' Lower Coef must be between 0 and 1. '+ clc.red("●"))}

        poolsInfo.push({ poolAddress, distribution: "spot",dollarAmount, lowerCoef, tp, tpTime, tpPrice, sl})
    }
    
    for (const pool of poolsInfo) {

        config.currency == "SOL" ? 
            console.log("\x1b[94m+\x1b[0m  ~ Processing request: " + pool.poolAddress + " , " + pool.dollarAmount/solPrice + " SOL , " + pool.lowerCoef) :
            console.log("\x1b[94m+\x1b[0m  ~ Processing request: " + pool.poolAddress + " , " + pool.dollarAmount + "$ , "  + pool.lowerCoef);

        const dlmmPool = await DLMM.create(connection, new PublicKey(pool.poolAddress));

        const balanceX = await getTokenBalance(dlmmPool.tokenX.publicKey.toString());
        const balanceY = await getTokenBalance(dlmmPool.tokenY.publicKey.toString());

        const xAmount = pool.dollarAmount * (1- pool.lowerCoef) / (await getPrice(dlmmPool.tokenX.publicKey.toString())).price;
        const yAmount = pool.dollarAmount * pool.lowerCoef / (await getPrice(dlmmPool.tokenY.publicKey.toString())).price;

        const enoughBalance = await checkEnoughBalance(dlmmPool, balanceX, balanceY, xAmount, yAmount, pool.dollarAmount);
        if (enoughBalance.result == false) {
            console.log(clc.red("●") +" Not enough balance to create position. " +clc.red("●"))
            console.log(clc.red("●") +" Tokens Balance + sol = "+ enoughBalance.totalBalance.toFixed(2) + "$ " +clc.red("●"))
            console.log(clc.red("●") +" Requested position = " + pool.dollarAmount.toFixed(2) + "$ " + clc.red("●"))
            console.log(clc.red("●") +" Module stopped " +clc.red("●"))
            return;
        }

        if (balanceX < xAmount) {
            console.log("\x1b[94m+\x1b[0m  ~ Swap needed for " + dlmmPool.tokenX.publicKey.toString())
            const neededAmount = (xAmount - balanceX) * (await getPrice(dlmmPool.tokenX.publicKey.toString())).price;
            const solToSwap = roundToTwo(neededAmount / solPrice);
            const swapResult = await swap(SOL, dlmmPool.tokenX.publicKey.toString(), solToSwap * Math.pow(10, 9));

            if (swapResult == 0) {
                console.log(clc.red("●") +" Every Swap failed " + clc.red("●"))
                console.log(clc.red("●") +" Module stopped " + clc.red("●"))
                return;
            }
        }

        if (balanceY < yAmount) {
            console.log("\x1b[94m+\x1b[0m  ~ Swap needed for " + dlmmPool.tokenY.publicKey.toString())
            const neededAmount = (yAmount - balanceY) * (await getPrice(dlmmPool.tokenY.publicKey.toString())).price;
            const solToSwap = roundToTwo(neededAmount / solPrice);
            const swapResult = await swap(SOL, dlmmPool.tokenY.publicKey.toString(), solToSwap * Math.pow(10, 9));

            if (swapResult == 0) {
                console.log(clc.red("●") +" Every Swap failed " + clc.red("●"))
                console.log(clc.red("●") +" Module stopped " + clc.red("●"))
                return;
            }
        }

        const newPosition = new Keypair();

        const positionCreated = await createImbalancePosition(newPosition,dlmmPool, xAmount, yAmount, pool.lowerCoef);

        if (positionCreated) {
            startMonitor(false,dlmmPool, xAmount * (await getPrice(dlmmPool.tokenX.publicKey.toString())).price + yAmount * (await getPrice(dlmmPool.tokenY.publicKey.toString())).price, pool.tp, pool.tpTime, pool.tpPrice, pool.sl);
        }
    }
}

async function OneSidedPositions(){
    console.log("\x1b[94m+\x1b[0m  ~ QuickPlay SELECTED");

    const numberOfPools = parseInt(await pregunta("\x1b[94m+\x1b[0m  ~ How many positions do you want to create? "));
    const poolsInfo: PositionInfo[] = []

    for (let i = 0; i < numberOfPools; i++) {
        const poolAddress = await pregunta("\x1b[94m+\x1b[0m  ~ Input DLMM address: ");
        const distribution = (await pregunta("\x1b[94m+\x1b[0m  ~ Input distribution (spot/bidask/spotbid (80-20)): ")).trim().toLowerCase();
        if (!(distribution == "spot" || distribution == "bidask" || distribution == "spotbid")) {console.error("\x1b[91m✖  Invalid distribution. Please try again.\x1b[0m"), process.exit(1)}
        let dollarAmount: number;
        config.currency == "SOL" ? 
            dollarAmount = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input SOL amount (ej: 1): ")) * solPrice :
            dollarAmount = parseInt(await pregunta("\x1b[94m+\x1b[0m  ~ Input $ amount (ej: 100): "));

        console.log("\x1b[94m+\x1b[0m  ~ Do you want to set a Take Profit?");
        console.log(`   \x1b[94m1 ->\x1b[0m Time tp`)
        console.log(`   \x1b[94m2 ->\x1b[0m % tp`)
        console.log(`   \x1b[94m3 ->\x1b[0m time OR % tp`)
        console.log(`   \x1b[94m4 ->\x1b[0m price AND % tp`)
        let wantTP = parseInt(await pregunta("Input number (enter to ignore): "));

        let tpTime: number | undefined = 0
        let tpPrice: number | undefined = 0
        let tp: number | undefined = 0

        if ( wantTP == 1 ) {
            tpTime = parseInt(await pregunta("\x1b[94m+\x1b[0m  ~ Input time in minutes to take profit: ")) * 60000;
        } else if ( wantTP == 2 ) {
            tp = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input Take Profit (Ej 10 -> +10%): "));
        } else if ( wantTP == 3 ) {
            tpTime = parseInt(await pregunta("\x1b[94m+\x1b[0m  ~ Input time in minutes to take profit: ")) * 60000;
            tp = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input Take Profit (Ej 10 -> +10%): "));
        } else if ( wantTP == 4 ) {
            tpPrice = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input DLMM price target: "));
            tp = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input Take Profit (Ej 10 -> +10%): "));
        }
        
        let sl: number | undefined = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input Stop Loss (Ej -10 -> -10%, enter to ignore): "));

        if (isNaN(tp) || tp <= 0) {tp = undefined}
        if (isNaN(tpTime) || tpTime == 0) {tpTime = undefined}
        if (isNaN(tpPrice) || tpPrice == 0) {tpPrice = undefined}
        if (isNaN(sl) || sl >= 0) {sl = undefined}

        poolsInfo.push({ poolAddress, distribution,dollarAmount, lowerCoef: 1, tp, tpTime, tpPrice, sl})
    }


    for (const pool of poolsInfo) {

        config.currency == "SOL" ? 
            console.log("\x1b[94m+\x1b[0m  ~ Processing request -> One Sided: " + pool.poolAddress + " , " + pool.distribution + " , " + pool.dollarAmount / solPrice + " SOL") :
            console.log("\x1b[94m+\x1b[0m  ~ Processing request -> One Sided: " + pool.poolAddress + " , " + pool.distribution + " , " + pool.dollarAmount + "$");

        const dlmmPool = await DLMM.create(connection, new PublicKey(pool.poolAddress));

        const balanceX = await getTokenBalance(dlmmPool.tokenX.publicKey.toString());
        const balanceY = await getTokenBalance(dlmmPool.tokenY.publicKey.toString());

        const yAmount = pool.dollarAmount / (await getPrice(dlmmPool.tokenY.publicKey.toString())).price;

        const enoughBalance = await checkEnoughBalance(dlmmPool, balanceX, balanceY, 0, yAmount, pool.dollarAmount,0.12);

        if (enoughBalance.result == false) {
            console.log(clc.red("●") +" Not enough balance to create position. "+ clc.red("●"))
            console.log(clc.red("●") +" Tokens Balance + sol = "+ enoughBalance.totalBalance.toFixed(2) + "$ "+ clc.red("●"))
            console.log(clc.red("●") +" Requested position = " + pool.dollarAmount.toFixed(2) + "$ " + clc.red("●"))
            console.log(clc.red("●") +" Module stopped " + clc.red("●"))
            return;
        }

        if (balanceY < yAmount) {
            console.log("\x1b[94m+\x1b[0m  ~ Swap needed for " + dlmmPool.tokenY.publicKey.toString())
            const neededAmount = (yAmount + 0.12 - balanceY) * (await getPrice(dlmmPool.tokenY.publicKey.toString())).price;
            const solToSwap = roundToTwo(neededAmount / solPrice);
            const swapResult = await swap(SOL, dlmmPool.tokenY.publicKey.toString(), solToSwap * Math.pow(10, 9));

            if (swapResult == 0) {
                console.log(clc.red("●") +" Every Swap failed "+ clc.red("●"))
                console.log(clc.red("●") +" Module stopped " + clc.red("●"))
                return;
            }
        }

        const newPosition = new Keypair();
        const newPosition2 = new Keypair();

        let newPositionCreated = false

        if (pool.distribution == "spot") {
            newPositionCreated = await createImbalancePosition(newPosition,dlmmPool, 0, yAmount, 1);
        } else if (pool.distribution == "bidask") {
            newPositionCreated = await createBidAskPosition(newPosition,dlmmPool,0,yAmount,1);
        } else if (pool.distribution == "spotbid") {
            newPositionCreated = await createSpotBidPosition(newPosition,newPosition2,dlmmPool,0,yAmount,1);
        }

        if (newPositionCreated) {
            startMonitor(false,dlmmPool, yAmount * (await getPrice(dlmmPool.tokenY.publicKey.toString())).price, pool.tp, pool.tpTime, pool.tpPrice, pool.sl);
        } else {
            console.log(clc.red("●") +" Position creation failed "+ clc.red("●"))
            console.log(clc.red("●") +" Module stopped " + clc.red("●"))
            return;
        }
    }   
}

async function autoFarming() {
    console.log("\x1b[94m+\x1b[0m  ~ Auto Farming SELECTED");

    let dollarAmount: number;

    config.currency == "SOL" ? 
        dollarAmount = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input SOL amount (ej: 1): ")) * solPrice :
        dollarAmount = parseInt(await pregunta("\x1b[94m+\x1b[0m  ~ Input $ amount (ej: 100): "));

    if (isNaN(dollarAmount)) { console.error("\x1b[91m✖ Invalid number. Please try again.\x1b[0m", process.exit(1))}
    const solAmount = dollarAmount / solPrice;

    const moduleNames = Object.keys(config.modules).map((moduleName) => moduleName.toLowerCase());

    console.log("\x1b[94m+\x1b[0m  ~ Available Modules:");
    moduleNames.forEach((moduleName) => { console.log(`   \x1b[94m->\x1b[0m ${moduleName}`)});
    
    const strategy = (await pregunta("\x1b[94m+\x1b[0m  ~ Input strategy: ")).trim().toLowerCase();
    
    if (moduleNames.includes(strategy.toLowerCase())) {
        console.log(`\x1b[94m+\x1b[0m  \x1b[92m✔\x1b[0m  Selected strategy: ${strategy}`);
    } else {
        console.error("\x1b[94m+\x1b[0m  \x1b[91m✖  Invalid strategy. Please try again.\x1b[0m");
        mostrarMenu();
        return 
    }

    console.log("\x1b[94m+\x1b[0m  ~ Avaiable distributions: **ALL OF THEM ONE SIDED SOL** ");
    console.log(`   \x1b[94m->\x1b[0m spot`);
    console.log(`   \x1b[94m->\x1b[0m bidask`);
    console.log(`   \x1b[94m->\x1b[0m spotbid (20-80)`);
    
    const distribution = (await pregunta("\x1b[94m+\x1b[0m  ~ Input distribution: ")).trim().toLowerCase();
    if (!(distribution == "spot" || distribution == "bidask" || distribution == "spotbid")) {console.error("\x1b[94m+\x1b[0m  \x1b[91m✖  Invalid distribution. Please try again.\x1b[0m"); mostrarMenu(); return}
    else {console.log(`\x1b[94m+\x1b[0m  \x1b[92m✔\x1b[0m  Selected distribution: ${distribution}`);}

    const solBalance = await getTokenBalance(SOL);
    if (solAmount + 0.07 > solBalance) { console.error(clc.red("●") + ' Not enough balance to run auto Farming '+ clc.red("●") ) ; mostrarMenu(); return}
    
 
    startFarmingLoop(strategy,distribution,dollarAmount)
}

async function justMonitor(){
    console.log("\x1b[94m+\x1b[0m  ~ Pulse SELECTED");
    console.log("\x1b[94m+\x1b[0m  ~ Fetching positions..");

    const lbPairsMap = await getUserPositions()
    const initialValues = new Map<string, number>();

    for (const [key, value] of lbPairsMap) {

        const name = (await getPairInfo(key)).name
    
        const poolAddress = await pregunta("\x1b[94m+\x1b[0m  ~ Found position: " + key + " (" + name + ") do you want to monitor it? (y/n): ");
        if (poolAddress.trim().toLowerCase() == "n" || poolAddress.trim().toLowerCase() == "no") {
            lbPairsMap.delete(key)
            continue
        }

        let initialValue: number;
        config.currency == "SOL" ? 
            initialValue = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input SOL amount as initial value (ej: 1 , enter to skip): ")) * solPrice :
            initialValue = parseInt(await pregunta("\x1b[94m+\x1b[0m  ~ Input $ amount (ej: 100, enter to skip): "));

        initialValues.set(key, initialValue);
    }

    for (const [key, value] of lbPairsMap) {
    
        const dlmmPool = await DLMM.create(connection, new PublicKey(key));
        
        const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(
            user.publicKey
        );

        let initialValue = initialValues.get(key)!;

        if (isNaN(initialValues.get(key)!)) {


            let xAmount = 0
            let yAmount = 0 

            for (const position of userPositions) {

                xAmount += position.positionData.positionBinData.reduce((sum,item) => sum + parseInt(item.positionXAmount),0) / Math.pow(10, value.tokenX.decimal);
                yAmount += position.positionData.positionBinData.reduce((sum,item) => sum + parseInt(item.positionYAmount),0) / Math.pow(10, value.tokenY.decimal);
                xAmount += position.positionData.feeX.toNumber() / Math.pow(10, value.tokenX.decimal);
                yAmount += position.positionData.feeY.toNumber() / Math.pow(10, value.tokenY.decimal);
            }

            initialValue =  xAmount * (await getPrice(dlmmPool.tokenX.publicKey.toString())).price + yAmount * (await getPrice(dlmmPool.tokenY.publicKey.toString())).price
        }

        let defaultTp: number | undefined = undefined;
        let defaultSl: number | undefined = undefined;
        let defaultTime: number | undefined = undefined;

        config.pulseDefaultValues.takeProfit != "disable" ?  defaultTp = Number(config.pulseDefaultValues.takeProfit) : undefined;
        config.pulseDefaultValues.stopLoss != "disable" ?  defaultSl = Number(config.pulseDefaultValues.stopLoss) : undefined;
        config.pulseDefaultValues.closeAfterMinutes != "disable" ?  defaultTime = Number(config.pulseDefaultValues.closeAfterMinutes) *60*1000 : undefined;

        startMonitor(false,dlmmPool, initialValue, defaultTp, defaultTime, undefined, defaultSl);
    }

    hotkeyMonitoringSpecificDLMM()
    console.log("\x1b[94m+\x1b[0m  ~ No more positions to monitor");
}

async function startMonitoringSpecificDLMM(address: string){
    try {
        const dlmmPool = await DLMM.create(connection, new PublicKey(address));

        let initialValue: number;
        config.currency == "SOL" ? 
            initialValue = parseFloat(await pregunta("\x1b[94m+\x1b[0m  ~ Input SOL amount as initial value (ej: 1 , enter to skip): ")) * solPrice :
            initialValue = parseInt(await pregunta("\x1b[94m+\x1b[0m  ~ Input $ amount (ej: 100, enter to skip): "));

        const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(
            user.publicKey
        );

        let xAmount = 0
        let yAmount = 0 

        for (const position of userPositions) {

            xAmount += position.positionData.positionBinData.reduce((sum,item) => sum + parseInt(item.positionXAmount),0) / Math.pow(10, dlmmPool.tokenX.decimal);
            yAmount += position.positionData.positionBinData.reduce((sum,item) => sum + parseInt(item.positionYAmount),0) / Math.pow(10, dlmmPool.tokenY.decimal);
            xAmount += position.positionData.feeX.toNumber() / Math.pow(10, dlmmPool.tokenX.decimal);
            yAmount += position.positionData.feeY.toNumber() / Math.pow(10, dlmmPool.tokenY.decimal);
        }

        initialValue =  xAmount * (await getPrice(dlmmPool.tokenX.publicKey.toString())).price + yAmount * (await getPrice(dlmmPool.tokenY.publicKey.toString())).price
        

        let defaultTp: number | undefined = undefined;
        let defaultSl: number | undefined = undefined;
        let defaultTime: number | undefined = undefined;

        config.pulseDefaultValues.takeProfit != "disable" ?  defaultTp = Number(config.pulseDefaultValues.takeProfit) : undefined;
        config.pulseDefaultValues.stopLoss != "disable" ?  defaultSl = Number(config.pulseDefaultValues.stopLoss) : undefined;
        config.pulseDefaultValues.closeAfterMinutes != "disable" ?  defaultTime = Number(config.pulseDefaultValues.closeAfterMinutes) *60*1000 : undefined;

        startMonitor(false,dlmmPool, initialValue, defaultTp, defaultTime, undefined, defaultSl);
    } catch (error) {

        if (error instanceof Error) {
        console.error(clc.red("● ") + " Error adding monitor " + address + clc.red(" ● ") + error.message)
        } else {
            console.error(clc.red("● ") + " Error adding monitor " + address + clc.red(" ● ") + error)
        }
    }
}

async function simulations(){
    console.log("\x1b[94m+\x1b[0m  ~ Live Simulations SELECTED");

    const dollarAmount = parseInt(await pregunta("\x1b[94m+\x1b[0m  ~ Input $ amount (ej: 100): "));
    const solAmount = dollarAmount / solPrice;

    const strategy = (await pregunta("\x1b[94m+\x1b[0m  ~ Input strategy (safe/degen/both): ")).trim().toLowerCase();
    const distribution = (await pregunta("\x1b[94m+\x1b[0m  ~ Input distribution (spot/bidask): ")).trim().toLowerCase();

    if (strategy == "both") {
        startSimulationLoop("safe",distribution,solAmount)
        startSimulationLoop("degen",distribution,solAmount)
    } else {
        startSimulationLoop(strategy,distribution,solAmount)
    }
}

main();

export {rl, startMonitoringSpecificDLMM}