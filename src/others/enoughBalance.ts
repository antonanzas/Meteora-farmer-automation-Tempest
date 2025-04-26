import DLMM from "@meteora-ag/dlmm";
import { SOL, solPrice } from "../meteora/sdk/monitorPosition";
import { getPrice } from "../jupiter/getPrice";
import { getTokenBalance } from "./getTokenBalance";
import "./loggers";

async function checkEnoughBalance(dlmm: DLMM,balanceX: number, balanceY: number, amountX: number, amountY: number,dollarAmount:number, extraSol:number = 0) {

    if (dlmm.tokenX.publicKey.toString() == SOL || dlmm.tokenY.publicKey.toString() == SOL) {
        const totalBalance = balanceX * (await getPrice(dlmm.tokenX.publicKey.toString())).price + balanceY * (await getPrice(dlmm.tokenY.publicKey.toString())).price
        const result = totalBalance >= dollarAmount + (0.06+extraSol) * solPrice

        return {result: result, totalBalance: totalBalance}
    } else {
        const totalBalance = balanceX * (await getPrice(dlmm.tokenX.publicKey.toString())).price + balanceY * (await getPrice(dlmm.tokenY.publicKey.toString())).price + await getTokenBalance(SOL) * solPrice
        const result = totalBalance >= dollarAmount + (0.06+extraSol) * solPrice
        return {result: result, totalBalance: totalBalance}
    }
}

function roundToTwo(num:number) {
    return Math.ceil(num * 100) / 100;
}

export { checkEnoughBalance,roundToTwo }