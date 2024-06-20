const solWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const bs58 = require('bs58');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const WALLET_DIR = '.\\wallets';

const CONN = new solWeb3.Connection(
  solWeb3.clusterApiUrl('devnet'), 'confirmed'
);

function saveNewFSKeyPair() {
  const keypair = solWeb3.Keypair.generate();
  let filename = keypair.publicKey.toString();
  fsp.writeFile(
    `${WALLET_DIR.slice(2)}\\${filename}.json`,
    `[${keypair.secretKey.toString()}]`
  );
  return keypair;
}

async function getKeyPairFromFile(filename) {
  const keypairPath = path.resolve(WALLET_DIR + '\\' + filename);
  const keypairData = JSON.parse(await fsp.readFile(keypairPath, 'utf-8'));
  const keypair = solWeb3.Keypair.fromSecretKey(Uint8Array.from(keypairData));
  return keypair;
}

async function getFSWallets() {
  const files = await fsp.readdir(WALLET_DIR);
  const jsonFiles = files.filter(
    (file) => path.extname(file).toLowerCase() === '.json'
  );
  const walletPromises = jsonFiles.map(async (file) => {
    return getKeyPairFromFile(file);
  });
  const wallets = await Promise.all(walletPromises);
  return wallets;
}

function convertLamportsToSol(lamports) {
  return lamports / solWeb3.LAMPORTS_PER_SOL;
}

function convertSolToLamports(sol) {
  return sol * solWeb3.LAMPORTS_PER_SOL;
}

async function getBalances(walletKeyPairs, conn) {
  const balancePromises = walletKeyPairs.map(async (wallet) => {
    const balance = convertLamportsToSol(
      await conn.getBalance(wallet.publicKey)
    );
    console.log(`Balance for ${wallet.publicKey}: ${balance}`);
    return { wallet: wallet, balance: balance };
  });
  const balances = await Promise.all(balancePromises);
  return balances;
}

function createTXN(fromKeypair, toKeypair, sol) {
  let txn = new solWeb3.Transaction();
  return createTransferInstruction(txn, fromKeypair, toKeypair, sol);
}

function createTransferInstruction(txn, fromKeypair, toKeypair, sol) {
  txn.add(
    solWeb3.SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: toKeypair.publicKey,
      lamports: convertSolToLamports(sol)
    })
  );
  return txn;
}

function replaceTransferInstruction(txn, fromKeypair, toKeypair, sol) {
  txn.instructions.pop();
  txn.createTransferInstruction(txn, fromKeypair, toKeypair, sol);
  return txn;
}

async function transferSol(fromKeypair, toKeypair, sol) {
  const transferTransaction = createTXN(fromKeypair, toKeypair, sol);
  const result = await solWeb3.sendAndConfirmTransaction(
    CONN, transferTransaction, [fromKeypair]
  );
  return result;
}

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
  const balances = await getBalances(walletKeyPairs, CONN)
  balances.sort((a, b) => {
    return b.balance - a.balance;
  });
  console.log(balances);
  // let result = await transferSol(balances[0].wallet, balances[1].wallet, balances[0].balance - convertLamportsToSol(5000));
  // console.log(result);
}

main();
