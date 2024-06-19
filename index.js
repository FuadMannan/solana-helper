const solWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const bs58 = require('bs58');
const fs = require('fs').promises;
const path = require('path');

const WALLET_DIR = '.\\wallets';

async function getKeyPairFromFile(filename) {
  const keypairPath = path.resolve(WALLET_DIR + '\\' + filename);
  const keypairData = JSON.parse(await fs.readFile(keypairPath, 'utf-8'));
  const keypair = solWeb3.Keypair.fromSecretKey(Uint8Array.from(keypairData));
  return keypair;
}

async function getFSWallets() {
  const files = await fs.readdir(WALLET_DIR);
  const jsonFiles = files.filter(
    (file) => path.extname(file).toLowerCase() === '.json'
  );
  const walletPromises = jsonFiles.map(async (file) => {
    return getKeyPairFromFile(file);
  });
  const wallets = await Promise.all(walletPromises);
  return wallets;
}

function getSolBalance(lamports) {
  return lamports / solWeb3.LAMPORTS_PER_SOL;
}

async function getBalances(walletKeyPairs, conn) {
  const balancePromises = walletKeyPairs.map(async (wallet) => {
    const balance = getSolBalance(await conn.getBalance(wallet.publicKey));
    console.log(`Balance for ${wallet.publicKey}: ${balance}`);
    return balance;
  });
  const balances = await Promise.all(balancePromises);
  return balances;
}

async function main() {
  const conn = new solWeb3.Connection(
    solWeb3.clusterApiUrl('devnet'), 'confirmed'
  );
  const walletKeyPairs = await getFSWallets();
  const balances = getBalances(walletKeyPairs, conn);
}

main();
