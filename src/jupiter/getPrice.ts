import axios from 'axios';
import {setSolPrice, solPrice} from '../meteora/sdk/monitorPosition'
import "../others/loggers"

async function getPrice(mintA : string, mintB: string = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") {
    try {
        const url = `https://api.jup.ag/price/v2?ids=${mintA}&vsToken=${mintB}`;
        const response = await axios.get(url);

        if (mintA == "So11111111111111111111111111111111111111112" && mintB == "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"){
            setSolPrice(response.data.data[mintA].price)
        }
        return response.data.data[mintA] 
    } catch (error) {
        if (error instanceof Error) {
            console.error('Error fetching prices: ', error.message);
        } else {
            console.error('Error fetching prices: ', error);
        }
    }
}

export {getPrice}