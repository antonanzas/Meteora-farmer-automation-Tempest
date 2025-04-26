import { connection,user } from "../../common";
import { PublicKey } from "@solana/web3.js";
import "./loggers";

async function getTokenBalance(mint: String, intentos = 5): Promise<number> {

    try {
        if (mint == "So11111111111111111111111111111111111111112") {return await connection.getBalance(user.publicKey) / Math.pow(10, 9)}

        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(user.publicKey, {mint: new PublicKey(mint)});

        let balance = 0;
        if (!(tokenAccounts.value.length === 0)) {
            const tokenBalance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount;
            balance = parseFloat(tokenBalance.uiAmountString || "0");
        }

        return balance

    } catch (error) {
        if (error instanceof Error) {
            console.error('Error in getTokenBalance:', error.message);
        } else {
            console.error('Error in getTokenBalance:', error);
        }
        await new Promise(r => setTimeout(r, 2000));
        return await getTokenBalance(mint, intentos - 1);
    }
}

export { getTokenBalance }