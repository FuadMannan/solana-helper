const solWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const fsp = require('fs').promises;
const Limiter = require('../limiter.js');

const DEFAULT_DIR = '.\\investigations\\records';

const QUICKNODE =
  'ENTER URL HERE';

let PUB_CONN_MAIN, PUB_CONN_DEV, QUICKNODE_CONN_MAIN;

/**
 * Sets connection
 * @param {number} choice 1: mainnet, 2: devnet, 3: quicknode mainnet
 */
function setConnection(choice) {
  switch (choice) {
    case 1:
      if (!PUB_CONN_MAIN) {
        PUB_CONN_MAIN = new solWeb3.Connection(
          solWeb3.clusterApiUrl('mainnet-beta'),
          'confirmed'
        );
      }
      CONN = PUB_CONN_MAIN;
      break;
    case 2:
      if (!PUB_CONN_DEV) {
        PUB_CONN_DEV = new solWeb3.Connection(
          solWeb3.clusterApiUrl('devnet'),
          'confirmed'
        );
      }
      CONN = PUB_CONN_DEV;
      break;
    case 3:
      if (!QUICKNODE_CONN_MAIN) {
        QUICKNODE_CONN_MAIN = new solWeb3.Connection(
          QUICKNODE_URL,
          'confirmed'
        );
      }
      CONN = QUICKNODE_CONN_MAIN;
      break;
    default:
      console.log('Incompatible choice');
      break;
  }
}

const limit = new Limiter(100, '10s');
async function makeRequest(fn, params) {
  return limit.enqueue(CONN, fn, params);
}

function stringify(jsonObject) {
  return JSON.stringify(jsonObject, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ).replaceAll(',', ',\n');
}

function saveToFile(filename, data, directory = DEFAULT_DIR) {
  fsp.writeFile(`${directory.slice(2)}\\${filename}.json`, `[${data}]`);
}

async function searchMintInstructions(mint, startTX = null) {
  return await searchAddressForInstructionType(mint, ['mintTo'], startTX);
}

/**
 *
 * @param {solWeb3.PublicKey} address Address to search
 * @param {string} instructionType Instruction type to search for
 * @param {solWeb3.TransactionSignature} startTX Search before this transaction
 */
async function searchAddressForInstructionType(
  address,
  instructionType = [],
  startTX = null
) {
  let options = {};
  if (startTX) {
    options.before = startTX;
  }
  let txns = [];
  let results = [];
  let signatures = [];
  do {
    // Get signatures of confirmed transactions
    // results = await CONN.getConfirmedSignaturesForAddress2(address, options);
    results = await makeRequest(CONN.getConfirmedSignaturesForAddress2, [
      address,
      options,
    ]);
    // If there are results, else finish loop
    if (results.length > 0) {
      // Sort transactions by blocktime just in case
      results.sort((a, b) => b.blockTime - a.blockTime);
      results.forEach((confirmedTX) => {
        signatures.push(confirmedTX.signature);
      });
      // loop transactions
      for (const signature of signatures) {
        // Get transaction info
        // let txDetails = await CONN.getParsedTransaction(signature);
        let completed = false;
        let delay = 500;
        let txDetails;
        while (!completed) {
          setTimeout(() => {
            console.log('making request');
          }, delay);
          try {
            txDetails = await makeRequest(CONN.getParsedTransaction, [
              signature,
              { maxSupportedTransactionVersion: 0 },
            ]);
            if (txDetails) {
              completed = true;
            }
          } catch (error) {
            delay += 500;
            console.log(error);
          }
        }
        // Instruction type(s) to filter by provided parameter
        let instructionsDetails = txDetails.transaction.message.instructions
          .filter((i) => i.parsed)
          .filter((i) => i.parsed.type);
        let instructionTypeList = instructionsDetails.map((i) => i.parsed.type);
        if (instructionType.length > 0) {
          // Skip if transaction doesn't include desired instruction type
          if (!instructionType.some((e) => instructionTypeList.includes(e))) {
            continue;
          }
        }
        let txn = {};
        txn[`${signature}`] = txDetails;
        txns.push(txn);
        let msg = `Signature(s): ${signature}\n`;
        instructionsDetails.forEach((instr, i) => {
          msg += `Instruction ${i}: ${instr.parsed.type}\nInfo:\n${stringify(
            instr.parsed.info
          )}`;
        });
        console.log(msg);
      }
    }
    if (results.length < 1000) {
      results = [];
    } else {
      options.before = signatures.at(-1);
      signatures = [];
    }
  } while (results.length > 0);
  await saveToFile(
    `${address}-${instructionType.join()}-${Date.now()}.json`,
    `${stringify(txns)}`
  );
}

async function main() {
  setConnection(1);
  const token = new solWeb3.PublicKey(
    '6chtKGVAjd1wk8yy2Un4tMNo7wJ5iRRcznjsW8zHSppX'
  );
  await searchMintInstructions(token);
}

main();
