import { appendFileSync, existsSync, mkdirSync, writeFileSync} from 'fs';
import path from 'path';
import os from 'os';

function tradeToFile(token: string, initTVLusd: number, initTVLsOL:number, endTVLusd: number, endTVLsol: number,
    feesusd: number, feessol: number, tp: boolean, sl: boolean, time: boolean,
    closedManually: boolean, automated: boolean){

    const timestamp = new Date().toISOString();
    const profitusdPercent = (endTVLusd - initTVLusd) / initTVLusd;
    const profitsolPercent = (endTVLsol - initTVLsOL) / initTVLsOL ;
        
    const desktopDir: string = path.join(os.homedir(), 'Desktop');
    
    const userLogDir: string = path.join(desktopDir, 'Tempest Data');
    
    if (!existsSync(userLogDir)) {
      mkdirSync(userLogDir, { recursive: true });
      console.log(`Created dir for trades: ${userLogDir}`);
    }

    const tradesFile: string = path.join(userLogDir, `trades.csv`);   
    
    if (!existsSync(tradesFile)) {
        const headers = 'closureDate,token,initTVLusd,initTVLsol,endTVLusd,endTVLsol,feesusd,feessol,profitusd,profitsol,tp,sl,time,closedManually,automated\n';
        writeFileSync(tradesFile, headers, 'utf8');
    }

    const entry = `${timestamp},${token},${initTVLusd},${initTVLsOL},${endTVLusd},${endTVLsol},${feesusd},${feessol},${profitusdPercent},${profitsolPercent},${tp},${sl},${time},${closedManually},${automated}\n`;
    appendFileSync(tradesFile, entry, 'utf8');
    console.log("\x1b[94m+\x1b[0m  ~ Trade saved on trades.csv");
}


export { tradeToFile };