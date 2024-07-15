import { existsSync, writeFileSync, readFileSync } from 'fs';
import { unlink } from 'fs/promises';
import { Connection, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";

export const WALLET_DIR = '.\\wallets';
export const MINT_DIR = '.\\mints';
export const MINT_KEYPAIRS_DIR = `${MINT_DIR}\\keypairs`;
export const MINT_RESULTS_DIR = `${MINT_DIR}\\mint-results`;
export const SAVE_DIR = '.\\SavedFiles';
export const SEED_DIR = `${WALLET_DIR}\\seeds`;
const QUICKNODE_URL =
  'https://cool-tame-violet.solana-mainnet.quiknode.pro/09d2604e1934ac268d5af7e2c906bfc3ace7ba00/';

export let PUB_CONN_MAIN, PUB_CONN_DEV, QUICKNODE_CONN_MAIN, CONN;

/**
 * Sets connection
 * @param {number} choice 1: mainnet, 2: devnet, 3: quicknode mainnet
 */
export function setConnection(choice) {
  switch (choice) {
    case 1:
      if (!PUB_CONN_MAIN) {
        PUB_CONN_MAIN = new Connection(
          clusterApiUrl('mainnet-beta'),
          'confirmed'
        );
      }
      CONN = PUB_CONN_MAIN;
      break;
    case 2:
      if (!PUB_CONN_DEV) {
        PUB_CONN_DEV = new Connection(clusterApiUrl('devnet'), 'confirmed');
      }
      CONN = PUB_CONN_DEV;
      break;
    case 3:
      if (!QUICKNODE_CONN_MAIN) {
        QUICKNODE_CONN_MAIN = new Connection(QUICKNODE_URL, 'confirmed');
      }
      CONN = QUICKNODE_CONN_MAIN;
      break;
    default:
      console.log('Incompatible choice');
      break;
  }
}

/**
 * Returns Stringified representation of objects, including BigInts
 * @param {Object} jsonObject Any object
 * @returns {string} Stringified representation of object
 */
export function stringify(jsonObject) {
  return JSON.stringify(jsonObject, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  );
}

/**
 * Saves an object to a file
 * @param {Object} content Any object
 * @param {string} filename
 * @param {string} directory
 * @param {string} key JSON key to append object to
 */
export function saveToFile(
  content,
  filename = null,
  directory = SAVE_DIR,
  key = null
) {
  filename = !filename ? `${Date.now()}.json` : filename;
  const fullPath = `${directory.replace('.\\', '')}\\${filename}`;
  let fileContent = content;
  if (existsSync(fullPath)) {
    fileContent = JSON.parse(readFileSync(fullPath, 'utf-8'));
    writeFileSync(
      fullPath.replace('.json', '-copy.json'),
      stringify(fileContent)
    );
    if (!key) {
      fileContent instanceof Array
        ? (fileContent = [...fileContent, content])
        : (fileContent[`${Date.now()}`] = content);
    } else {
      fileContent[key] instanceof Array
        ? fileContent[key].push(content)
        : (fileContent[key][`${Date.now()}`] = content);
    }
  }
  fileContent = stringify(fileContent);
  writeFileSync(fullPath, fileContent);
  if (existsSync(fullPath.replace('.json', '-copy.json'))) {
    unlink(fullPath.replace('.json', '-copy.json'));
  }
}

/**
 * Convert lamports to SOL
 * @param {number} lamports Amount of lamports to convert
 * @returns {number} Amount of SOL
 */
export function convertLamportsToSol(lamports) {
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Convert SOL to lamports
 * @param {number} sol Amount of SOL to convert
 * @returns {number} Amount of lamports
 */
export function convertSolToLamports(sol) {
  return sol * LAMPORTS_PER_SOL;
}

/**
 * Generates random seed string
 * @param {number} length
 * @returns {string}
 */
export function createRandomSeed(length) {
  let seed = crypto
    .getRandomValues(new Uint8Array(length))
    .map((x) => Math.round((x / 255) * 94) + 32);
  return String.fromCharCode(...seed);
}

/**
 * Returns array of random seed strings
 * @param {number} length
 * @param {number} num Amount of seeds to generate
 * @returns {Array<string>}
 */
export function createRandomSeeds(length, num) {
  let result = [];
  for (let index = 0; index < num; index++) {
    result.push(createRandomSeed(length));
  }
  return result;
}
