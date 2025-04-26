import { getAllPairs } from "./getPairs";
import "../../others/loggers"


async function printNewPairs() {
  const pairs = await getAllPairs();
  console.log(pairs);
}