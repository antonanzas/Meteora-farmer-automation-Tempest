import { WebhookClient, EmbedBuilder, Webhook } from "discord.js";
import { getTokenStats } from "../dexscreener/getTokenStats";
import { WebHookLink} from "../../common";
import axios from "axios";
import fs from 'fs';
import FormData from 'form-data';
import "../others/loggers"
import { getPairInfo } from "../meteora/api/getPairs";
import {config } from "../../common";
import { solPrice } from "../meteora/sdk/monitorPosition";


let webhookClient: WebhookClient | null = null;
if (WebHookLink) {
  webhookClient = new WebhookClient({ url: WebHookLink });
}

async function openPositionMessageUSD ( pair: string, entryValue:number,closeByTime: string, takeProfit?:number,  stopLoss?:number) {
    if (webhookClient) {

        if (!takeProfit) {takeProfit = 0}
        if (!stopLoss) {stopLoss = 0}
        let ChangeEmoji1 = "🔼🟢"
        let ChangeEmoji6 = "🔼🟢"
        let ChangeEmoji24 = "🔼🟢"

        let color = "#2BB9D5"

        const dlmmInfo = await getPairInfo(pair);
        const pairInfo = await getTokenStats(dlmmInfo.mint_x);
        
        const name = pairInfo.baseToken.symbol + "/" + pairInfo.quoteToken.symbol
        const url = 'https://app.meteora.ag/dlmm/' + pair

        if (pairInfo.priceChange.h1< 0){ChangeEmoji1 = "🔽🔴"}
        if (pairInfo.priceChange.h6< 0){ChangeEmoji6 = "🔽🔴"}
        if (pairInfo.priceChange.h24< 0){ChangeEmoji24 = "🔽🔴"}
        
        const embed = new EmbedBuilder()
            .setTitle("🪙 " + name)
            .setDescription(`Position opened`)
            .setURL(url)
            .setThumbnail(pairInfo.info.imageUrl)
            .setColor(color as any)
            .addFields(
                { name: '*** Position Stats ***', value: '\u200B' },
                { name: '💧 Entry:', value: `${formatNumberToEmbed(entryValue)} $`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '⏱️ Close By Time:', value: `${closeByTime} `, inline: false },
                { name: '🟢 Take Profit:', value: `${takeProfit} %`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '🔴 Stop Loss:', value: `${stopLoss} %`, inline: false },
                
                { name: `*** Token Stats ***`, value: '\u200B' },
                { name: `💰 Mktcap:`, value: `${formatNumberToEmbed(pairInfo.marketCap)} $`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: `📈 volume 1h:`, value: `${formatNumberToEmbed(pairInfo.volume.h1)} $`, inline: true },
                { name: `📅 age:`, value: `${parseDuration(pairInfo.pairCreatedAt, Date.now())}`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: `📊 volume 24h:`, value: `${formatNumberToEmbed(pairInfo.volume.h24)} $`, inline: true },
                
                { name: `*** Price Changes ***`, value: '\u200B' },
                { name: `${ChangeEmoji1} 1h:`, value: `${pairInfo.priceChange.h1} %`, inline: true },
                { name: `${ChangeEmoji6} 6h:`, value: `${pairInfo.priceChange.h6} %`, inline: true },
                { name: `${ChangeEmoji24} 24h:`, value: `${pairInfo.priceChange.h24} %`, inline: true },

                { name: `*** DLMM stats ***`, value: '\u200B' },
                { name: `🪜 binStep:`, value: `${String(dlmmInfo.bin_step)} `, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: `⚙️ baseFee:`, value: `${dlmmInfo.base_fee_percentage} %`, inline: true },
                { name: `🏦 TVL:`, value: `${formatNumberToEmbed(dlmmInfo.liquidity)} $`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: `💵 fees 24h:`, value: `${formatNumberToEmbed(dlmmInfo.fees_24h)} $`, inline: true },
            )
            .setFooter({
            text: "Tempest"
        })
        .setTimestamp();

        const webhookObject = {
            content: '',
            embeds: [embed],
        }

        webhookClient.send(webhookObject as any)
    }
}

async function openPositionSOLMessage (pair: string,  entryValueSOL:number, closeByTime: string,takeProfit?:number, stopLoss?:number) {
    if (webhookClient) {
        if (!takeProfit) {takeProfit = 0}
        if (!stopLoss) {stopLoss = 0}

        let ChangeEmoji1 = "🔼🟢"
        let ChangeEmoji6 = "🔼🟢"
        let ChangeEmoji24 = "🔼🟢"

        let color = "#2BB9D5"

        const dlmmInfo = await getPairInfo(pair);
        const pairInfo = await getTokenStats(dlmmInfo.mint_x);
        
        const name = pairInfo.baseToken.symbol + "/" + pairInfo.quoteToken.symbol
        const url = 'https://app.meteora.ag/dlmm/' + pair

        if (pairInfo.priceChange.h1< 0){ChangeEmoji1 = "🔽🔴"}
        if (pairInfo.priceChange.h6< 0){ChangeEmoji6 = "🔽🔴"}
        if (pairInfo.priceChange.h24< 0){ChangeEmoji24 = "🔽🔴"}
        
        const embed = new EmbedBuilder()
            .setTitle("🪙 " + name)
            .setDescription(`Position opened`)
            .setURL(url)
            .setThumbnail(pairInfo.info.imageUrl)
            .setColor(color as any)
            .addFields(
                { name: '*** Position Stats ***', value: '\u200B' },
                { name: '💧 Entry:', value: `${entryValueSOL.toFixed(3)} SOL`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '⏱️ Close By Time:', value: `${closeByTime} `, inline: true },
                { name: '🟢 Take Profit:', value: `${takeProfit} %`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: '🔴 Stop Loss:', value: `${stopLoss} %`, inline: true },
                
                { name: `*** Token Stats ***`, value: '\u200B' },
                { name: `💰 Mktcap:`, value: `${formatNumberToEmbed(pairInfo.marketCap)} $`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: `📈 volume 1h:`, value: `${formatNumberToEmbed(pairInfo.volume.h1)} $`, inline: true },
                { name: `📅 age:`, value: `${parseDuration(pairInfo.pairCreatedAt, Date.now())}`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: `📊 volume 24h:`, value: `${formatNumberToEmbed(pairInfo.volume.h24)} $`, inline: true },
                
                { name: `*** Price Changes ***`, value: '\u200B' },
                { name: `${ChangeEmoji1} 1h:`, value: `${pairInfo.priceChange.h1} %`, inline: true },
                { name: `${ChangeEmoji6} 6h:`, value: `${pairInfo.priceChange.h6} %`, inline: true },
                { name: `${ChangeEmoji24} 24h:`, value: `${pairInfo.priceChange.h24} %`, inline: true },

                { name: `*** DLMM stats ***`, value: '\u200B' },
                { name: `🪜 bin step:`, value: `${String(dlmmInfo.bin_step)} `, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: `⚙️ base fee:`, value: `${dlmmInfo.base_fee_percentage} %`, inline: true },
                { name: `🏦 TVL:`, value: `${formatNumberToEmbed(dlmmInfo.liquidity)} $`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: `💵 fees 24h:`, value: `${formatNumberToEmbed(dlmmInfo.fees_24h)} $`, inline: true },
            )
            .setFooter({
            text: "Tempest"
        })
        .setTimestamp();

        const webhookObject = {
            content: '',
            embeds: [embed],
        }

        webhookClient.send(webhookObject as any)
    }

}

async function openPositionMessage (pair: string, entryValue:number, takeProfit?:number, closeByTime?: number, stopLoss?:number) {  

    let closeByTimeString = "-"
    if (closeByTime != undefined) {closeByTimeString = calculateCountDown(Date.now() + closeByTime)}
    
    try{

        if (config.currency == "SOL") {
            openPositionSOLMessage(pair, entryValue , closeByTimeString, takeProfit,stopLoss)
        } else  {
            openPositionMessageUSD(pair, entryValue * solPrice, closeByTimeString, takeProfit,stopLoss)
        }

    } catch (error) {
        console.error("Error sending open position message: "+ error)
    }
}

async function limitOrderTriggered(reason: string, pair: string, startTime: number, EntryValue:number, estimatedFinalValue: number, estimatedPNL:number, estimatedFees:number,simulation?:boolean) {

    if (webhookClient) {
        let ChangeEmoji1 = "🔼🟢"
        let ChangeEmoji6 = "🔼🟢"
        let ChangeEmoji24 = "🔼🟢"

        let color = "#00F85B"
        if (estimatedPNL < 0) {color = "#FF0000"}

        const pairInfo = await getTokenStats(pair);
        const name = pairInfo.baseToken.symbol + "/" + pairInfo.quoteToken.symbol
        const url = 'https://app.meteora.ag/dlmm/' + pairInfo.pairAddress
        const duration = parseDuration(startTime, Date.now())

        if (pairInfo.priceChange.h1< 0){ChangeEmoji1 = "🔽🔴"}
        if (pairInfo.priceChange.h6< 0){ChangeEmoji6 = "🔽🔴"}
        if (pairInfo.priceChange.h24< 0){ChangeEmoji24 = "🔽🔴"}
        
        const embed = new EmbedBuilder()
            .setTitle("🪙 " + name)
            .setDescription(`${reason}`)
            .setURL(url)
            .setThumbnail(pairInfo.info.imageUrl)
            .setColor(color as any)
            .addFields(
                { name: '*** Position Stats ***', value: '\u200B' },
                { name: '💧 Entry:', value: `${EntryValue.toFixed(2)} $`, inline: true },
                { name: '💧 Exit:', value: `${estimatedFinalValue.toFixed(2)} $`, inline: true },
                { name: '💵 Fees :', value: `${estimatedFees.toFixed(2)} $`, inline: true },
                { name: '🕑 Duration:', value: `${duration}  `, inline: true},
                { name: '📊 PNL:', value: `${estimatedPNL.toFixed(2)} % -> ${(estimatedFinalValue + estimatedFees - EntryValue).toFixed(2)}$ `, inline: true },
                
                { name: `*** Price Changes ***`, value: '\u200B' },
                { name: `${ChangeEmoji1} 1h:`, value: `${pairInfo.priceChange.h1} %`, inline: true },
                { name: `${ChangeEmoji6} 6h:`, value: `${pairInfo.priceChange.h6} %`, inline: true },
                { name: `${ChangeEmoji24} 24h:`, value: `${pairInfo.priceChange.h24} %`, inline: true },
            )
            .setFooter({
            text: "Tempest"
        })
        .setTimestamp();

        const webhookObject = {
            content: '',
            embeds: [embed],
        }

        webhookClient.send(webhookObject as any)
    }
}

async function limitOrderTriggeredSOL(reason: string, pair: string, startTime: number, EntryValue:number, estimatedFinalValue: number, estimatedPNL:number, estimatedFees:number,simulation?:boolean) {

    if (webhookClient) {
    let ChangeEmoji1 = "🔼🟢"
    let ChangeEmoji6 = "🔼🟢"
    let ChangeEmoji24 = "🔼🟢"

    let color = "#fffdce"
    if (estimatedPNL < -0.5) {color = "#FF0000"}
    if (estimatedPNL > 0.5) {color = "#00F85B"}

    const pairInfo = await getTokenStats(pair);
    const name = pairInfo.baseToken.symbol + "/" + pairInfo.quoteToken.symbol
    const url = 'https://app.meteora.ag/dlmm/' + pairInfo.pairAddress
    const duration = parseDuration(startTime, Date.now())

    if (pairInfo.priceChange.h1< 0){ChangeEmoji1 = "🔽🔴"}
    if (pairInfo.priceChange.h6< 0){ChangeEmoji6 = "🔽🔴"}
    if (pairInfo.priceChange.h24< 0){ChangeEmoji24 = "🔽🔴"}
    
    const embed = new EmbedBuilder()
	    .setTitle("🪙 " + name)
        .setDescription(`${reason}`)
        .setURL(url)
        .setThumbnail(pairInfo.info.imageUrl)
	    .setColor(color as any)
        .addFields(
             { name: '*** Position Stats ***', value: '\u200B' },
             { name: '💧 Entry:', value: `${EntryValue.toFixed(3)} SOL`, inline: true },
             { name: '💧 Exit:', value: `${estimatedFinalValue.toFixed(3)} SOL`, inline: true },
             { name: '💵 Fees :', value: `${estimatedFees.toFixed(3)} SOL`, inline: true },
             { name: '🕑 Duration:', value: `${duration}  `, inline: true},
             { name: '📊 PNL:', value: `${estimatedPNL.toFixed(3)} % -> ${(estimatedFinalValue + estimatedFees - EntryValue).toFixed(3)} SOL `, inline: true },
             
             { name: `*** Price Changes ***`, value: '\u200B' },
             { name: `${ChangeEmoji1} 1h:`, value: `${pairInfo.priceChange.h1} %`, inline: true },
             { name: `${ChangeEmoji6} 6h:`, value: `${pairInfo.priceChange.h6} %`, inline: true },
             { name: `${ChangeEmoji24} 24h:`, value: `${pairInfo.priceChange.h24} %`, inline: true },
         )
         .setFooter({
         text:"Tempest"
       })
       .setTimestamp();

    const webhookObject = {
        content: '',
        embeds: [embed],
    }

    webhookClient.send(webhookObject as any)    
    }
}

async function sendPNLimage(namePosition: string,relativePath: string) { 
    if (WebHookLink ) {
        const imagePath = relativePath;

        const formData = new FormData();
        formData.append('file', fs.createReadStream(imagePath), 'pnl.png');

        formData.append('content', `⬇️ ${namePosition} PNL card ⬇️` );

        try {
            const response = await axios.post(WebHookLink, formData, {
                headers: formData.getHeaders(),
            });

            console.log("\x1b[94m+\x1b[0m  ~ PNL card sent");
        } catch (error) {
            console.error("Error sending image:"+ error);
        }
    }
}

function parseDuration(tiempoInicial: number, tiempoFinal: number) {
    if (tiempoFinal < tiempoInicial) {
      throw new Error('El tiempo final debe ser mayor o igual al tiempo inicial.');
    }
  
    const milisegundosTranscurridos = tiempoFinal - tiempoInicial;
  
    const minutosTotales = Math.floor(milisegundosTranscurridos / (1000 * 60));
    const dias = Math.floor(minutosTotales / (60 * 24));
    const horas = Math.floor((minutosTotales % (60 * 24)) / 60);
    const minutos = minutosTotales % 60;
  
    const partes: string[] = [];
    if (dias > 0) partes.push(`${dias}d`);
    if (horas > 0) partes.push(`${horas}h`);
    if (minutos > 0) partes.push(`${minutos}m`);
  
    return partes.join(' ');
}

function calculateCountDown(tiempoFinal: number) {
    const tiempoActual = Date.now();

    if (tiempoFinal < tiempoActual) {
        return "0";
    }

    const milisegundosRestantes = tiempoFinal - tiempoActual;

    const segundosTotales = Math.floor(milisegundosRestantes / 1000);
    const dias = Math.floor(segundosTotales / (60 * 60 * 24));
    const horas = Math.floor((segundosTotales % (60 * 60 * 24)) / (60 * 60));
    const minutos = Math.floor((segundosTotales % (60 * 60)) / 60);
    const segundos = segundosTotales % 60;

    const partes: string[] = [];
    if (dias > 0) partes.push(`${dias}d`);
    if (horas > 0) partes.push(`${horas}h`);
    if (minutos > 0) partes.push(`${minutos}m`);
    if (segundos > 0) partes.push(`${segundos}s`);

    return partes.join(' ');
}

function formatNumberToEmbed(num: number): string {
    num = Number(num);
    if (num >= 1_000_000) {
        return (num / 1_000_000).toFixed(2).replace(/\.0$/, '') + 'M';
    } else if (num >= 1_000) {
        return (num / 1_000).toFixed(2).replace(/\.0$/, '') + 'k';
    } else {
        console.log(num.toFixed(2))
        return num.toFixed(2)
        
    }
}

export {openPositionMessage, limitOrderTriggered, limitOrderTriggeredSOL, parseDuration, sendPNLimage,calculateCountDown}