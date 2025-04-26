import DLMM from '@meteora-ag/dlmm'
import { connection,user} from '../../../common'
import { PublicKey} from "@solana/web3.js";
import "../../others/loggers"


async function prinUserPositions() {
    console.log("\x1b[94m+\x1b[0m  ~ user: ", user.publicKey.toString());

    const lbPairsMap = await DLMM.getAllLbPairPositionsByUser(connection, user.publicKey)

    for (const [key, value] of lbPairsMap) {
        console.log("\x1b[94m+\x1b[0m  ","#".repeat(60));
        console.log("\x1b[94m+\x1b[0m  ~ Pool publicKey: ", key);
        console.log("\x1b[94m+\x1b[0m  ~ Bin Step: ", value.lbPair.binStep);
        console.log("\x1b[94m+\x1b[0m  ~ TokenX publicKey: ", value.lbPair.tokenXMint.toString());
        console.log("\x1b[94m+\x1b[0m  ~ TokenY publicKey: ", value.lbPair.tokenYMint.toString());
    
        const dlmmPool = await DLMM.create(connection, new PublicKey(key));
        
        const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(
            user.publicKey
        );
        const activeBin = await dlmmPool.getActiveBin();
        let contador = 0

        for (const position of userPositions) {
            
            
            const active = position.positionData.positionBinData[0].binId < activeBin.binId &&  activeBin.binId < position.positionData.positionBinData[position.positionData.positionBinData.length - 1].binId  ? "🟢" : "🔴"

            console.log("\x1b[94m+\x1b[0m  ~ " + active + " position " + contador + ": " + position.publicKey.toString());
            console.log("\x1b[94m+\x1b[0m  ~       Price Range: ", position.positionData.positionBinData[0].pricePerToken, " - ",position.positionData.positionBinData[position.positionData.positionBinData.length - 1].pricePerToken);
            console.log("\x1b[94m+\x1b[0m  ~       TokenX Amount: ", position.positionData.positionBinData.reduce((sum,item) => sum + parseInt(item.positionXAmount),0) / Math.pow(10, value.tokenX.decimal));
            console.log("\x1b[94m+\x1b[0m  ~       TokenY Amount: ", position.positionData.positionBinData.reduce((sum,item) => sum + parseInt(item.positionYAmount),0) / Math.pow(10, value.tokenY.decimal));
            console.log("\x1b[94m+\x1b[0m  ~       TokenX Fees: ", position.positionData.feeX.toNumber() / Math.pow(10, value.tokenX.decimal));
            console.log("\x1b[94m+\x1b[0m  ~       TokenY Fees: ", position.positionData.feeY.toNumber() / Math.pow(10, value.tokenY.decimal));

            contador ++
        }
    }
}


async function getUserPositions() {
    const lbPairsMap = await DLMM.getAllLbPairPositionsByUser(connection, user.publicKey)
    return lbPairsMap
}


export { getUserPositions, prinUserPositions }