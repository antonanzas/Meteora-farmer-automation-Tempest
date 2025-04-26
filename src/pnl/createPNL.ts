import sharp from "sharp";
import { createCanvas, Image, loadImage, registerFont } from "canvas";
import { sendPNLimage } from "../discord/webhook";
import { getPairInfo } from "../meteora/api/getPairs";
import { PublicKey } from "@solana/web3.js";
import { connection } from "../../common";
import DLMM from "@meteora-ag/dlmm";
import "../others/loggers"

async function generatePNLCard(address: string,startTime: number, TVL: number, liquidityValue:number,fees: number,pnl: number,binStep: number, baseFee: number) {
    const outputPath = "data/emptyPNLs/output.jpeg";

    const duration = formatTimestamp(startTime,Date.now())
    const profit = liquidityValue + fees - TVL
    const name = (await getPairInfo(address)).name

    let image: Image
    if (pnl > 0){
        image = await loadImage("data/emptyPNLs/baseProfit.jpg");
    } else {
        image = await loadImage("data/emptyPNLs/baseLoss.jpg");
    }

    const width = image.width;
    const height = image.height;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(image, 0, 0);

    ctx.textAlign = "left";

    ctx.fillStyle = "white";
    ctx.font = 'bold 35px Tahoma';
    ctx.fillText("MANAGED BY ", 920, 80);
    ctx.fillStyle = "#59ddec"
    ctx.fillText("TEMPEST", 1170, 80);

    ctx.font = 'bold 35px Tahoma';
    ctx.fillStyle = "#8d8d8d";
    ctx.fillText("TIME", 85, 210);
    ctx.fillText("DLMM", 85, 380);
    if (pnl > 0){
        ctx.fillText("PROFIT", 85, 575);
    } else {
        ctx.fillText("LOSS", 85, 575);
    }
    

    ctx.fillStyle = "white";

    ctx.font = 'bold 85px Tahoma';
    ctx.fillText(`${duration}`, 85, 310);

    ctx.font = 'bold 85px Tahoma';
    ctx.fillText(`${name}`, 85, 490);

    if (pnl > 0){
        ctx.fillStyle = "#92e029";
    } else {
        ctx.fillStyle = "#ff0000";
    }

    ctx.font = 'bold 200px Tahoma';
    ctx.fillText(`$${profit.toFixed(1)}`, 85, 780);

    ctx.fillStyle = "white";
    ctx.font = 'bold 30px Tahoma';
    ctx.fillText("TWITTER", 85, 890);
    ctx.fillText("DISCORD", 515, 890);
    
    ctx.font = 'bold 35px Tahoma';
    ctx.fillStyle = "#8d8d8d"
    ctx.fillText("TVL", 85, height - 80);
    ctx.fillText("BIN STEP", 620, height - 80);
    ctx.fillText("BASE FEE", 1150, height - 80);
    ctx.fillText("PNL", 1750, height - 80);

    ctx.fillStyle = "#59ddec";
    ctx.fillText(`$${TVL.toFixed(1)}`, 175, height - 80);
    ctx.fillText(`${binStep}`, 800, height - 80);
    ctx.fillText(`${baseFee}%`, 1325, height - 80);
    ctx.fillText(`${pnl.toFixed(2)}%`, 1835, height - 80);

    const buffer = canvas.toBuffer("image/jpeg");

    await sharp(buffer).toFile(outputPath);
    sendPNLimage(name,outputPath);
}

function formatTimestamp(startTimestamp: number, currentTimestamp: number): string {
    const diffInSeconds = Math.floor((currentTimestamp - startTimestamp) / 1000); 

    const days = Math.floor(diffInSeconds / (3600 * 24)); 
    const hours = Math.floor((diffInSeconds % (3600 * 24)) / 3600); 
    const minutes = Math.floor((diffInSeconds % 3600) / 60); 

    const formattedTime = `${String(days).padStart(2, '0')}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    
    return formattedTime;
}

export { generatePNLCard };