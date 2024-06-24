const solWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const bs58 = require('bs58');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const WALLET_DIR = '.\\wallets';
const MINT_DIR = '.\\mints';

const CONN = new solWeb3.Connection(
  solWeb3.clusterApiUrl('devnet'),
  'confirmed'
);

/**
 * Creates new Keypair and saves to file system
 * @returns {solWeb3.Keypair} Keypair
 */
function saveNewFSKeyPair() {
  const keypair = solWeb3.Keypair.generate();
  let filename = keypair.publicKey.toString();
  fsp.writeFile(
    `${WALLET_DIR.slice(2)}\\${filename}.json`,
    `[${keypair.secretKey.toString()}]`
  );
  return keypair;
}

/**
 * Loads a keypair from a file
 * @async
 * @param {string} filename Name of file with keypair
 * @returns {solWeb3.Keypair} Keypair
 */
async function getKeyPairFromFile(filename) {
  const keypairPath = path.resolve(WALLET_DIR + '\\' + filename);
  const keypairData = JSON.parse(await fsp.readFile(keypairPath, 'utf-8'));
  const keypair = solWeb3.Keypair.fromSecretKey(Uint8Array.from(keypairData));
  return keypair;
}

/**
 * Load keypairs from .json files in a directory
 * @async
 * @param {string} directory Location of .json files with keypairs to load. Default is .\wallets\
 * @returns {Array<solWeb3.Keypair>} Array of keypairs
 */
async function getFSWallets(directory = WALLET_DIR) {
  const files = await fsp.readdir(directory);
  const jsonFiles = files.filter(
    (file) => path.extname(file).toLowerCase() === '.json'
  );
  const walletPromises = jsonFiles.map(async (file) => {
    return getKeyPairFromFile(file);
  });
  const wallets = await Promise.all(walletPromises);
  return wallets;
}

/**
 * Convert lamports to SOL
 * @param {number} lamports Amount of lamports to convert
 * @returns {number} Amount of SOL
 */
function convertLamportsToSol(lamports) {
  return lamports / solWeb3.LAMPORTS_PER_SOL;
}

/**
 * Convert SOL to lamports
 * @param {number} sol Amount of SOL to convert
 * @returns {number} Amount of lamports
 */
function convertSolToLamports(sol) {
  return sol * solWeb3.LAMPORTS_PER_SOL;
}

/**
 * Gets SOL balance for wallet keypairs
 * @async
 * @param {Array<solWeb3.Keypair>} walletKeyPairs Array of keypairs
 * @returns {Array<object>} Array of objects containing a keypair and its balance
 */
async function getBalances(walletKeyPairs) {
  const balancePromises = walletKeyPairs.map(async (wallet) => {
    const balance = convertLamportsToSol(
      await CONN.getBalance(wallet.publicKey)
    );
    console.log(`Balance for ${wallet.publicKey}: ${balance}`);
    return { wallet: wallet, balance: balance };
  });
  const balances = await Promise.all(balancePromises);
  return balances;
}

/**
 * Creates Transaction object to transfer SOL from one account to another
 * @param {solWeb3.Keypair} fromKeypair Address transaction is sending from
 * @param {solWeb3.Keypair} toKeypair Address receiving transaction
 * @param {number} sol Amount of SOL being transferred
 * @returns {solWeb3.Transaction} Transaction object
 */
function createTXN(fromKeypair, toKeypair, sol) {
  let txn = new solWeb3.Transaction();
  return createTransferInstruction(txn, fromKeypair, toKeypair, sol);
}

/**
 * Helper function to create transfer instruction for a transaction
 * @param {solWeb3.Transaction} txn Transaction to add transfer instruction to
 * @param {solWeb3.Keypair} fromKeypair Address transaction is sending from
 * @param {solWeb3.Keypair} toKeypair Address receiving transaction
 * @param {number} sol Amount of SOL being transferred
 * @returns {solWeb3.Transaction} Transaction object
 */
function createTransferInstruction(txn, fromKeypair, toKeypair, sol) {
  txn.add(
    solWeb3.SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: toKeypair.publicKey,
      lamports: convertSolToLamports(sol),
    })
  );
  return txn;
}

/**
 * Helper function to replace transfer instruction for a transaction
 * @param {solWeb3.Transaction} txn Transaction to add transfer instruction to
 * @param {solWeb3.Keypair} fromKeypair Address transaction is sending from
 * @param {solWeb3.Keypair} toKeypair Address receiving transaction
 * @param {number} sol Amount of SOL being transferred
 * @returns {solWeb3.Transaction} Transaction object
 */
function replaceTransferInstruction(txn, fromKeypair, toKeypair, sol) {
  txn.instructions.pop();
  txn.createTransferInstruction(txn, fromKeypair, toKeypair, sol);
  return txn;
}

/**
 * Creates, sends, and confirms a SOL transfer transaction
 * @param {solWeb3.Keypair} fromKeypair Address transaction is sending from
 * @param {solWeb3.Keypair} toKeypair Address receiving transaction
 * @param {number} sol Amount of SOL being transferred
 * @returns
 */
async function transferSol(fromKeypair, toKeypair, sol) {
  const transferTransaction = createTXN(fromKeypair, toKeypair, sol);
  const result = await solWeb3.sendAndConfirmTransaction(
    CONN,
    transferTransaction,
    [fromKeypair]
  );
  return result;
}

/**
 * Calculates estimated transaction fee for a Transaction object
 * @param {solWeb3.Transaction} transaction
 * @returns {number} Estimated fee for transaction, returns -1 if null
 */
async function calculateTXFee(transaction) {
  const blockhash = await CONN.getLatestBlockhash();
  if (transaction.feePayer == null) {
    transaction.feePayer = transaction.instructions[0].keys.filter(
      (key) => key.isSigner
    )[0].pubkey;
  }
  transaction.recentBlockhash = blockhash.blockhash;
  try {
    return await transaction.getEstimatedFee(CONN);
  } catch (error) {
    console.log(error);
    return -1;
  }
}

async function main() {
  const walletKeyPairs = await getFSWallets();
  const balances = (await getBalances(walletKeyPairs, CONN)).sort((a, b) => {
    return b.balance - a.balance;
  });
  console.log(balances);
  // let result = await transferSol(balances[0].wallet, balances[1].wallet, balances[0].balance - convertLamportsToSol(5000));
  // console.log(result);
}

main();
