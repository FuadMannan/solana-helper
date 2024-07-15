import {
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from '@solana/web3.js';
import { createCloseAccountInstruction } from '@solana/spl-token';
import { readFileSync } from 'fs';
import { readFile, readdir, writeFile } from 'fs/promises';
import { extname, resolve } from "path";
import {
  CONN,
  MINT_KEYPAIRS_DIR,
  SEED_DIR,
  WALLET_DIR,
  convertLamportsToSol,
  convertSolToLamports,
  createRandomSeeds,
  saveToFile,
  stringify
} from './helper.js';

/**
 * Creates new Keypair and saves to file system
 * @param {number} location choice of location
 * @returns {Keypair} Keypair
 */
export function saveNewFSKeyPair(location = 1) {
  let directory;
  switch (location) {
    default:
    case 1:
      directory = WALLET_DIR;
      break;
    case 2:
      directory = MINT_KEYPAIRS_DIR;
      break;
  }
  const keypair = Keypair.generate();
  let filename = keypair.publicKey.toString() + '.json';
  saveToFile(Array.from(keypair.secretKey), filename, directory);
  return keypair;
}

/**
 * Loads a keypair from a file
 * @async
 * @param {string} filename Name of file with keypair
 * @returns {Keypair} Keypair
 */
export async function getKeyPairFromFile(filename, directory = WALLET_DIR) {
  const keypairPath = resolve(directory + '\\' + filename);
  const keypairData = JSON.parse(await readFile(keypairPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  return keypair;
}

/**
 * Load keypairs from .json files in a directory
 * @async
 * @param {string} directory Location of .json files with keypairs to load. Default is .\wallets\
 * @returns {Array<Keypair>} Array of keypairs
 */
export async function getFSWallets(directory = WALLET_DIR) {
  const files = await readdir(directory);
  const jsonFiles = files.filter(
    (file) => extname(file).toLowerCase() === '.json'
  );
  const walletPromises = jsonFiles.map(async (file) => {
    return getKeyPairFromFile(file);
  });
  const wallets = await Promise.all(walletPromises);
  return wallets;
}

/**
 * Gets SOL balance for wallet keypairs
 * @async
 * @param {Array<Keypair>} walletKeyPairs Array of keypairs
 * @returns {Array<object>} Array of objects containing a keypair and its balance
 */
export async function getBalances(walletKeyPairs, logToConsole = true) {
  const balancePromises = walletKeyPairs.map(async (wallet) => {
    const balance = convertLamportsToSol(
      await CONN.getBalance(wallet.publicKey)
    );
    if (logToConsole) {
      console.log(`Balance for ${wallet.publicKey}: ${balance}`);
    }
    return { wallet: wallet, balance: balance };
  });
  const balances = await Promise.all(balancePromises);
  return balances;
}

/**
 *
 * @param {PublicKey} tokenAccount Public key of token account to close
 * @param {Keypair} destination Wallet to receive reclaimed rent
 * @param {Keypair} authority Wallet that owns token account
 * @returns {string} Transaction Signature
 */
export async function closeTokenAccount(tokenAccount, destination, authority) {
  const tx = new Transaction().add(
    createCloseAccountInstruction(
      tokenAccount,
      destination.publicKey,
      authority.publicKey
    )
  );
  let result;
  try {
    result = await CONN.sendTransaction(tx, [destination, authority]);
    console.log(result);
  } catch (error) {
    console.log(error);
    result = null;
  }
  return result;
}

/**
 * Create accounts from base account with seed(s)
 * @param {PublicKey} baseAccount Account generating seed
 * @param {number} seedLength Length of seed(s) to be generated
 * @param {number} numberOfAccounts Number of accounts to be created
 * @returns {Array<Object>} Array of objects containing new public keys and associated seed
 */
export async function createSeedAccounts(baseAccount, seedLength, numberOfAccounts) {
  const seeds = createRandomSeeds(seedLength, numberOfAccounts);
  let newAccounts = [];
  const ID = SystemProgram.programId;
  for (let i = 0; i < seeds.length; i++) {
    const newAccount = await PublicKey.createWithSeed(
      baseAccount,
      seeds[i],
      ID
    );
    newAccounts.push({ pubkey: newAccount, seed: seeds[i] });
    console.log(newAccount);
  }
  saveToFile(newAccounts, `${baseAccount}.json`, SEED_DIR, 'createdWithSeed');
  return newAccounts;
}

/**
 * Creates seed accounts with starting balance for a base account
 * @param {Keypair} baseAccount Keypair/wallet of base account
 * @param {number} seedLength Length of seed to generate
 * @param {number} numberOfAccounts Number of accounts to create
 * @param {number} sol Amount of Sol to transfer to seed accounts
 * @returns {import('@solana/web3.js').TransactionSignature}
 */
export async function createSeedAccountWithFunds(
  baseAccount,
  seedLength,
  numberOfAccounts,
  sol
) {
  const newAccounts = await createSeedAccounts(
    baseAccount.publicKey,
    seedLength,
    numberOfAccounts
  );
  let tx = new Transaction();
  for (let i = 0; i < newAccounts.length; i++) {
    const account = newAccounts[i];
    tx.add(
      SystemProgram.createAccountWithSeed({
        fromPubkey: baseAccount.publicKey,
        newAccountPubkey: account.pubkey,
        basePubkey: baseAccount.publicKey,
        seed: account.seed,
        lamports: convertSolToLamports(sol),
        space: 0,
        programId: SystemProgram.programId,
      })
    );
  }
  tx.feePayer = baseAccount.publicKey;
  tx = await addComputeBudgetToTransaction(tx);
  const result = await sendAndConfirmTransaction(CONN, tx, [baseAccount]);
  if (result) {
    const fullPath = `${SEED_DIR.replace('.\\', '')}\\${
      baseAccount.publicKey
    }.json`;
    let content = JSON.parse(readFileSync(fullPath, 'utf-8'));
    const key = Object.keys(content.createdWithSeed).at(-1);
    const newSeedAccounts = content.createdWithSeed[key];
    delete content.createdWithSeed[key];
    content.createdWithSeedAndFunds[key] = newSeedAccounts;
    writeFile(fullPath, stringify(content));
  }
  return result;
}
