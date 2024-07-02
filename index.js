const solWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const bs58 = require('bs58');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const WALLET_DIR = '.\\wallets';
const MINT_DIR = '.\\mints';
const QUICKNODE_URL =
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

let CONN = setConnection(2);

function stringify(jsonObject) {
  return JSON.stringify(jsonObject, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  );
}

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
async function getBalances(walletKeyPairs, logToConsole = true) {
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

/**
 * Creates new mint, associated token account, and mints tokens
 * @param {solWeb3.Keypair} walletKeypair Payer of fees
 * @param {solWeb3.PublicKey} freezeAuthority Public Key of freeze authority
 * @param {number} decimals
 * @param {solWeb3.keypair||undefined} newKeyPair Public key of mint, default to undefined for new random key
 * @param {object} opt Options
 * @param {number} amount Amount of tokens to be minted
 * @returns {object}
 */
async function createMintToken(
  walletKeypair,
  freezeAuthority = null,
  decimals,
  newKeyPair = undefined,
  opt = undefined,
  amount = 1000000000
) {
  const mint = await splToken.createMint(
    CONN,
    walletKeypair,
    walletKeypair.publicKey,
    freezeAuthority.publicKey,
    decimals,
    newKeyPair,
    opt,
    splToken.TOKEN_PROGRAM_ID
  );
  const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
    CONN,
    walletKeypair,
    mint,
    walletKeypair.publicKey
  );
  const signature = await splToken.mintTo(
    CONN,
    walletKeypair,
    mint,
    tokenAccount.address,
    walletKeypair.publicKey,
    amount
  );
  const result = {
    mint: mint,
    tokenAccount: tokenAccount,
    signature: signature,
  };
  try {
    const jsonResult = stringify(result);
    await fsp.writeFile(
      `${MINT_DIR.slice(2)}\\${result.mint.toString()}.json`,
      jsonResult,
    );
  } catch (error) {
    console.log(result);
  }
  return result;
}

/**
 *
 * @param {solWeb3.Keypair} fromWallet Wallet of sender
 * @param {solWeb3.PublicKey} mint Public key of token mint
 * @param {solWeb3.PublicKey} toWallet Public key of wallet to receive token
 * @param {number} amount Amount of token to send
 * @returns {solWeb3.TransactionSignature}
 */
async function sendToken(
  fromWallet,
  mint,
  toWallet,
  amount,
  logToConsole = true
) {
  const fromTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
    CONN,
    fromWallet,
    mint,
    fromWallet.publicKey
  );
  const toTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
    CONN,
    toWallet,
    mint,
    toWallet.publicKey
  );
  const signature = await splToken.transfer(
    CONN,
    fromWallet,
    fromTokenAccount.address,
    toTokenAccount.address,
    fromWallet.publicKey,
    convertSolToLamports(amount)
  );
  if (logToConsole) console.log(`transaction signature: ${signature}`);
  return signature;
}

/**
 *
 * @param {solWeb3.PublicKey} mintAddress Public key of token mint
 * @returns {splToken.Mint} Mint info
 */
async function getTokenInfo(mintAddress, logToConsole = true) {
  const mintInfo = await splToken.getMint(
    CONN,
    mintAddress,
    splToken.TOKEN_PROGRAM_ID
  );
  if (logToConsole) console.log('Mint info:', stringify(mintInfo));
  return mintInfo;
}

/**
 *
 * @param {solWeb3.PublicKey} tokenAccount Public key of token account to close
 * @param {solWeb3.Keypair} destination Wallet to receive reclaimed rent
 * @param {solWeb3.Keypair} authority Wallet that owns token account
 * @returns {string} Transaction Signature
 */
async function closeAccount(tokenAccount, destination, authority) {
  const tx = new solWeb3.Transaction().add(
    splToken.createCloseAccountInstruction(
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
 * Close all token accounts of a given program ID for a wallet
 * @param {solWeb3.Keypair} owner Wallet that owns token accounts
 * @param {boolean} burn Burn all tokens in accounts with non-zero balance
 * @param {solWeb3.PublicKey} program Program ID of accounts to search for
 * @param {boolean} logToConsole Output success results to console
 */
async function closeAllTokenAccounts(
  owner,
  burn = true,
  program = splToken.TOKEN_PROGRAM_ID,
  logToConsole = true
) {
  let tokenAccounts = (await getTokenAccounts(owner.publicKey, program)).value;
  const num = tokenAccounts.length;
  let failures = 0;
  if (!burn) {
    tokenAccounts.filter(
      (tokenAccount) =>
        tokenAccount.account.data.parsed.info.tokenAmount.uiAmount != 0
    );
  }
  tokenAccounts.forEach(async (tokenAccount) => {
    try {
      if (tokenAccount.account.data.parsed.info.tokenAmount.uiAmount > 0) {
        const mint = new solWeb3.PublicKey(
          tokenAccount.account.data.parsed.info.mint
        );
        await burnTokens(owner, tokenAccount.pubkey, mint, owner, 'all', false);
      }
      await closeAccount(tokenAccount.pubkey, owner, owner);
    } catch (error) {
      console.log(error);
      ++failures;
    }
  });
  if (logToConsole) {
    console.log('Accounts closed:', num, ', failures:', failures);
  }
  const result = {
    closed: num,
    failures: failures,
  };
  return result;
}

/**
 *
 * @param {solWeb3.Keypair} payer Fee payer
 * @param {solWeb3.PublicKey} tokenAccount Public key of token account
 * @param {solWeb3.PublicKey} mint Public key of token mint
 * @param {solWeb3.PublicKey||solWeb3.KeyPair} owner Public key/wallet of token account owner
 * @param {number||string} amount Amount of tokens to burn
 */
async function burnTokens(
  payer,
  tokenAccount,
  mint,
  owner,
  amount,
  logToConsole = true
) {
  const mintInfo = await getTokenInfo(mint, false);
  const decimals = mintInfo.decimals;
  let newAmount = amount;
  if (typeof amount === 'string') {
    if (amount.toLowerCase().trim() === 'all') {
      newAmount = (await CONN.getTokenAccountBalance(tokenAccount)).value
        .uiAmount;
    }
    if (!isNaN(Number(amount))) {
      newAmount = Number(amount);
    }
  }
  newAmount *= 10 ** decimals;
  let tx = await splToken.burnChecked(
    CONN,
    payer,
    tokenAccount,
    mint,
    owner,
    newAmount,
    decimals
  );
  if (logToConsole) console.log('Burn tokens hash:', tx);
  return tx;
}

/**
 * Get all token accounts for an owner of a given program
 * @param {solWeb3.PublicKey} owner Public key of owner
 * @param {solWeb3.PublicKey} program Public key of program
 * @returns Response and context
 */
async function getTokenAccounts(owner, program = splToken.TOKEN_PROGRAM_ID) {
  return await CONN.getParsedTokenAccountsByOwner(owner, {
    programId: program,
  });
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
