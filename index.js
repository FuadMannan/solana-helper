import {
  clusterApiUrl,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from '@solana/web3.js';
import('@solana/web3.js').TransactionSignature;
import {
  AuthorityType,
  burnChecked,
  closeAccount,
  createCloseAccountInstruction,
  createInitializeInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createInitializeMintCloseAuthorityInstruction,
  createMint,
  createSetAuthorityInstruction,
  ExtensionType,
  getAssociatedTokenAddress,
  getMintLen,
  getMint,
  getOrCreateAssociatedTokenAccount,
  LENGTH_SIZE,
  mintTo,
  tokenMetadataUpdateFieldWithRentTransfer,
  TOKEN_2022_PROGRAM_ID,
  transfer,
  TYPE_SIZE,
} from '@solana/spl-token';
import { pack } from '@solana/spl-token-metadata';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { unlink, readFile, readdir, writeFile } from 'fs/promises';
import { extname, resolve } from "path";

const WALLET_DIR = '.\\wallets';
const MINT_DIR = '.\\mints';
const MINT_KEYPAIRS_DIR = `${MINT_DIR}\\keypairs`;
const MINT_RESULTS_DIR = `${MINT_DIR}\\mint-results`;
const SAVE_DIR = '.\\SavedFiles';
const SEED_DIR = `${WALLET_DIR}\\seeds`
const QUICKNODE_URL =
  'ENTER URL HERE';

let PUB_CONN_MAIN, PUB_CONN_DEV, QUICKNODE_CONN_MAIN, CONN;

/*
 * UTILITIES
 */

/**
 * Sets connection
 * @param {number} choice 1: mainnet, 2: devnet, 3: quicknode mainnet
 */
function setConnection(choice) {
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
        PUB_CONN_DEV = new Connection(
          clusterApiUrl('devnet'),
          'confirmed'
        );
      }
      CONN = PUB_CONN_DEV;
      break;
    case 3:
      if (!QUICKNODE_CONN_MAIN) {
        QUICKNODE_CONN_MAIN = new Connection(
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

/**
 * Returns Stringified representation of objects, including BigInts
 * @param {Object} jsonObject Any object
 * @returns {string} Stringified representation of object
 */
function stringify(jsonObject) {
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
function saveToFile(
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
function convertLamportsToSol(lamports) {
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Convert SOL to lamports
 * @param {number} sol Amount of SOL to convert
 * @returns {number} Amount of lamports
 */
function convertSolToLamports(sol) {
  return sol * LAMPORTS_PER_SOL;
}

/**
 * Generates random seed string
 * @param {number} length
 * @returns {string}
 */
function createRandomSeed(length) {
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
function createRandomSeeds(length, num) {
  let result = [];
  for (let index = 0; index < num; index++) {
    result.push(createRandomSeed(length));
  }
  return result;
}

/**
 * ACCOUNT INFO
 */

/**
 * Creates new Keypair and saves to file system
 * @param {number} location choice of location
 * @returns {Keypair} Keypair
 */
function saveNewFSKeyPair(location = 1) {
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
  let filename = keypair.publicKey.toString() + '.json'
  saveToFile(Array.from(keypair.secretKey), filename, directory);
  return keypair;
}

/**
 * Loads a keypair from a file
 * @async
 * @param {string} filename Name of file with keypair
 * @returns {Keypair} Keypair
 */
async function getKeyPairFromFile(filename, directory = WALLET_DIR) {
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
async function getFSWallets(directory = WALLET_DIR) {
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
 *
 * @param {PublicKey} tokenAccount Public key of token account to close
 * @param {Keypair} destination Wallet to receive reclaimed rent
 * @param {Keypair} authority Wallet that owns token account
 * @returns {string} Transaction Signature
 */
async function closeTokenAccount(tokenAccount, destination, authority) {
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
async function createSeedAccounts(baseAccount, seedLength, numberOfAccounts) {
  const seeds = createRandomSeeds(seedLength, numberOfAccounts);
  let newAccounts = [];
  const ID = SystemProgram.programId;
  for (let i = 0; i < seeds.length; i++) {
    const newAccount = await PublicKey.createWithSeed(baseAccount, seeds[i], ID);
    newAccounts.push({pubkey: newAccount, seed: seeds[i]});
    console.log(newAccount);
  };
  saveToFile(
    newAccounts,
    `${baseAccount}.json`,
    SEED_DIR,
    'createdWithSeed'
  );
  return newAccounts;
}

/**
 * Creates seed accounts with starting balance for a base account
 * @param {Keypair} baseAccount Keypair/wallet of base account
 * @param {number} seedLength Length of seed to generate
 * @param {number} numberOfAccounts Number of accounts to create
 * @param {number} sol Amount of Sol to transfer to seed accounts
 * @returns {TransactionSignature}
 */
async function createSeedAccountWithFunds(
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
  const result = await sendAndConfirmTransaction(
    CONN,
    tx,
    [baseAccount]
  );
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

/*
* TRANSACTIONS
*/

/**
 * Helper function to create transfer instruction for a transaction
 * @param {Transaction} txn Transaction to add transfer instruction to
 * @param {Keypair} fromKeypair Address transaction is sending from
 * @param {PublicKey} toPubkey Public key receiving transaction
 * @param {number} sol Amount of SOL being transferred
 * @returns {Transaction} Transaction object
 */
function createAndAddTransferInstruction(txn, fromKeypair, toPubkey, sol) {
  txn.add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: toPubkey,
      lamports: convertSolToLamports(sol),
    })
  );
  return txn;
}

/**
 * Helper function to add 1 or more transfer instructions to a transaction
 * @param {Transaction} txn Transaction to add transfer instruction to
 * @param {Keypair} fromKeypair Address transaction is sending from
 * @param {Array<PublicKey>} toPubKeys Public key(s) receiving transaction(s)
 * @param {number} sol Amount of SOL being transferred
 * @returns {Transaction} Transaction object
 */
async function addTransferInstructions(txn, fromKeypair, toPubKeys, sol) {
  toPubKeys.forEach(
    (address) =>
      (txn = createAndAddTransferInstruction(txn, fromKeypair, address, sol))
  );
  return txn;
}

/**
 * Creates Transaction object to transfer SOL from one account to another
 * @param {Keypair} fromKeypair Address transaction is sending from
 * @param {Array<PublicKey>} toPubKeys Public key(s) receiving transaction
 * @param {number} sol Amount of SOL being transferred
 * @returns {Transaction} Transaction object
 */
async function createTXN(fromKeypair, toPubKeys, sol) {
  let txn = new Transaction();
  return await addTransferInstructions(txn, fromKeypair, toPubKeys, sol);
}

/**
 * Helper function to replace transfer instruction for a transaction
 * @param {Transaction} txn Transaction to add transfer instruction to
 * @param {Keypair} fromKeypair Address transaction is sending from
 * @param {Keypair} toKeypair Address receiving transaction
 * @param {number} sol Amount of SOL being transferred
 * @returns {Transaction} Transaction object
 */
function replaceTransferInstruction(txn, fromKeypair, toKeypair, sol) {
  txn.instructions.pop();
  txn.createTransferInstruction(txn, fromKeypair, toKeypair, sol);
  return txn;
}

/**
 * Creates, sends, and confirms a SOL transfer transaction
 * @param {Keypair} fromKeypair Keypair/wallet transaction is sending from
 * @param {Array<PublicKey>} toPubKeys Public key of address receiving transaction
 * @param {number} sol Amount of SOL being transferred
 * @returns
 */
async function transferSol(fromKeypair, toPubKeys, sol) {
  const transferTransaction = await createTXN(fromKeypair, toPubKeys, sol);
  const result = await sendAndConfirmTransaction(
    CONN,
    transferTransaction,
    [fromKeypair]
  );
  return result;
}

/**
 * Calculates estimated transaction fee for a Transaction object
 * @param {Transaction} transaction
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
 * Adds compute budget program instruction to a transaction
 * @param {Transaction} tx Transaction to compute budget for
 * @returns Transaction with compute budget program instruction
 */
async function addComputeBudgetToTransaction(tx) {
  let budgetIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 1.4e6,
  });
  let budgetTx = new Transaction().add(budgetIx, ...tx.instructions);
  budgetTx.feePayer = tx.feePayer;
  const computeBudget = (await CONN.simulateTransaction(budgetTx)).value
    .unitsConsumed;
  budgetTx.instructions[0] = ComputeBudgetProgram.setComputeUnitLimit({
    units: computeBudget + 100,
  });
  return budgetTx;
}

/**
 * Transfers Sol from a Seed account
 * @param {Keypair} baseAccount Base account for seed account
 * @param {PublicKey} fromPubKey Public Key of account sending Sol
 * @param {string} seed Seed string
 * @param {PublicKey} toPubKey
 * @param {number} amount Amount of Sol to send
 * @returns {TransactionSignature}
 */
async function transferSolFromSeedAccount (baseAccount, fromPubKey, seed, toPubKey, amount) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      basePubkey: baseAccount.publicKey,
      fromPubkey: fromPubKey,
      lamports: convertSolToLamports(amount),
      programId: SystemProgram.programId,
      seed: seed,
      toPubkey: toPubKey
    })
  );
  const result = await sendAndConfirmTransaction(CONN, tx, [baseAccount]);
  console.log(`tx hash: ${result}`);
  return result;
}

/*
 * TOKENS
 */

// TOKEN-2022

/**
 * Creates a Token-2022 mint
 * @param {Keypair} payer
 * @param {Keypair} mintAuthority
 * @param {Keypair} updateAuthority
 * @param {String} name
 * @param {String} symbol
 * @param {String} uri
 * @param {String} description
 * @param {number} decimals
 * @param {boolean} freeze
 * @param {Keypair} freezeAuthority
 * @param {boolean} close
 * @param {Keypair} closeAuthority
 * @returns {TransactionSignature}
 */
async function createToken2022(
  payer,
  mintAuthority,
  updateAuthority,
  name,
  symbol,
  uri,
  description,
  decimals,
  freeze = false,
  freezeAuthority = mintAuthority,
  close = false,
  closeAuthority = mintAuthority
) {
  CONN = new Connection(clusterApiUrl('devnet'));
  const mintKeypair = saveNewFSKeyPair(2);
  const mint = mintKeypair.publicKey;
  const metaData = {
    updateAuthority: updateAuthority.publicKey,
    mint: mint,
    name: name,
    symbol: symbol,
    uri: uri,
    additionalMetadata: [['description', description]],
  };

  const metadataExtension = TYPE_SIZE + LENGTH_SIZE;
  const metadataLen = pack(metaData).length;
  const extensions = [ExtensionType.MetadataPointer];
  if (close) {
    extensions.push(ExtensionType.MintCloseAuthority);
  }
  const mintLen = getMintLen(extensions);
  const lamports = await CONN.getMinimumBalanceForRentExemption(
    mintLen + metadataExtension + metadataLen
  );

  const createAccountInstruction = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: mint,
    space: mintLen,
    lamports,
    programId: TOKEN_2022_PROGRAM_ID,
  });

  const initializeMetadataPointerInstruction =
    createInitializeMetadataPointerInstruction(
      mint,
      updateAuthority.publicKey,
      mint,
      TOKEN_2022_PROGRAM_ID
    );

  const initializeMintcloseAuthorityInstruction =
    createInitializeMintCloseAuthorityInstruction(
      mint,
      closeAuthority.publicKey,
      TOKEN_2022_PROGRAM_ID
    );

  const initializeMintInstruction = createInitializeMintInstruction(
    mint,
    decimals,
    mintAuthority.publicKey,
    freeze ? freezeAuthority.publicKey : null,
    TOKEN_2022_PROGRAM_ID
  );

  const initializeMetadataInstruction = createInitializeInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    metadata: mint,
    updateAuthority: updateAuthority.publicKey,
    mint: mint,
    mintAuthority: mintAuthority.publicKey,
    name: metaData.name,
    symbol: metaData.symbol,
    uri: metaData.uri,
  });

  const transaction = new Transaction().add(
    createAccountInstruction,
    initializeMetadataPointerInstruction,
    initializeMintcloseAuthorityInstruction,
    initializeMintInstruction,
    initializeMetadataInstruction
  );

  const transactionSignature = await sendAndConfirmTransaction(
    CONN,
    transaction,
    [payer, mintKeypair]
  );

  console.log(`Mint: ${mint}\nhttps://solana.fm/tx/${transactionSignature}`);
  return transactionSignature;
}

/**
 * Mints tokens from Token2022 program to a wallet
 * @param {PublicKey} mint Mint public key
 * @param {Keypair} authority Mint authority keypair
 * @param {Keypair} destination Target wallet
 * @param {number} amount Amount of token to mint
 * @returns {TransactionSignature}
 */
async function mintToken2022(mint, authority, destination, amount) {
 const tokenAccount = await getOrCreateAssociatedTokenAccount(
  CONN,
  destination,
  mint,
  destination.publicKey,
  false,
  'confirmed',
  {},
  TOKEN_2022_PROGRAM_ID
 );
 amount = convertSolToLamports(amount);
 const signature = await mintTo(
  CONN,
  destination,
  mint,
  tokenAccount.address,
  authority,
  amount,
  [],
  {},
  TOKEN_2022_PROGRAM_ID
 );
 const result = {
  mint: mint,
  tokenAccount: tokenAccount,
  signature: signature,
};
saveToFile(result, mint.toString(), MINT_RESULTS_DIR);
console.log(result);
return result;
}

/**
 * Creates new mint, associated token account, and mints tokens
 * @param {Keypair} walletKeypair Payer of fees
 * @param {PublicKey} freezeAuthority Public Key of freeze authority
 * @param {number} decimals
 * @param {Keypair|undefined} newKeyPair Public key of mint, default to undefined for new random key
 * @param {object} opt Options
 * @param {number} amount Amount of tokens to be minted
 * @returns {object}
 */
async function createAndMintOriginalToken(
  walletKeypair,
  freezeAuthority = null,
  decimals,
  newKeyPair = undefined,
  opt = undefined,
  amount = 1000000000
) {
  const mint = await createMint(
    CONN,
    walletKeypair,
    walletKeypair.publicKey,
    freezeAuthority.publicKey,
    decimals,
    newKeyPair,
    opt,
    TOKEN_PROGRAM_ID
  );
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    CONN,
    walletKeypair,
    mint,
    walletKeypair.publicKey
  );
  const signature = await mintTo(
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
    await writeFile(
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
 * @param {PublicKey} mintAddress Public key of token mint
 * @returns {import('@solana/spl-token').Mint} Mint info
 */
async function getTokenInfo(mintAddress, logToConsole = true) {
  const mintInfo = await getMint(
    CONN,
    mintAddress,
    TOKEN_PROGRAM_ID
  );
  if (logToConsole) console.log('Mint info:', stringify(mintInfo));
  return mintInfo;
}

/**
 * Get all token accounts for an owner of a given program
 * @param {PublicKey} owner Public key of owner
 * @param {PublicKey} program Public key of program
 * @returns Response and context
 */
async function getTokenAccounts(owner, program = TOKEN_PROGRAM_ID) {
  return await CONN.getParsedTokenAccountsByOwner(owner, {
    programId: program,
  });
}

/**
 * Updates 1 or more authority types for a token mint
 * @param {PublicKey} mint Mint public key
 * @param {Keypair} payer Payer wallet
 * @param {Keypair} currentAuthority Current authority wallet
 * @param {PublicKey|null} newAuthority New authority public key or null
 * @param {Array<AuthorityType>} authorityTypes Array of authority types to update
 * @returns {TransactionSignature} Transaction signature
 */
async function updateAuthority(
  mint,
  payer,
  currentAuthority,
  newAuthority,
  authorityTypes
) {
  const tx = new Transaction();
  authorityTypes.forEach(type => {
    tx.add(
      createSetAuthorityInstruction(
        mint,
        currentAuthority.publicKey,
        type,
        newAuthority,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
  });
  const signature = await sendAndConfirmTransaction(
    CONN,
    tx,
    payer == currentAuthority ? [payer] : [payer, currentAuthority]
  );
  console.log('Confirmation signature:', signature);
  return signature;
}

/**
 * Updates metadata for Token2022
 * @param {Keypair} payer Fee payer
 * @param {PublicKey} mint Mint public key
 * @param {Keypair|PublicKey} updateAuthority Update authority
 * @param {string} field field to update
 * @param {string} value value to update with
 * @returns {TransactionSignature}
 */
async function updateToken2022Metadata(
  payer,
  mint,
  updateAuthority,
  field,
  value
) {
  const result = await tokenMetadataUpdateFieldWithRentTransfer(
    CONN,
    payer,
    mint,
    updateAuthority,
    field,
    value
  );
  console.log(result);
  return result;
}

/**
 * Sends tokens between wallets
 * @param {Keypair} fromWallet Wallet of sender
 * @param {PublicKey} mint Public key of token mint
 * @param {PublicKey} toWallet Public key of wallet to receive token
 * @param {number|string} amount Amount of token to send
 * @param {PublicKey} program Public key of program that owns token
 * @returns {TransactionSignature}
 */
async function sendToken(
  fromWallet,
  mint,
  toWallet,
  amount,
  program = TOKEN_2022_PROGRAM_ID,
  logToConsole = true
) {
  const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
    CONN,
    fromWallet,
    mint,
    fromWallet.publicKey,
    false,
    'confirmed',
    {},
    program
  );
  const toTokenAccount = await getOrCreateAssociatedTokenAccount(
    CONN,
    toWallet,
    mint,
    toWallet.publicKey,
    false,
    'confirmed',
    {},
    program
  );
  if (typeof amount == 'string' && amount == 'all') {
    amount = Number(
      (await CONN.getTokenAccountBalance(fromTokenAccount.address)).value.amount
    );
  } else {
    amount = convertSolToLamports(amount);
  }
  const signature = await transfer(
    CONN,
    fromWallet,
    fromTokenAccount.address,
    toTokenAccount.address,
    fromWallet.publicKey,
    amount,
    [],
    {},
    program
  );
  if (logToConsole) console.log(`transaction signature: ${signature}`);
  return signature;
}

/**
 * Close all token accounts of a given program ID for a wallet
 * @param {Keypair} owner Wallet that owns token accounts
 * @param {boolean} burn Burn all tokens in accounts with non-zero balance
 * @param {PublicKey} program Program ID of accounts to search for
 * @param {boolean} logToConsole Output success results to console
 */
async function closeAllTokenAccounts(
  owner,
  burn = true,
  program = TOKEN_PROGRAM_ID,
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
        const mint = new PublicKey(
          tokenAccount.account.data.parsed.info.mint
        );
        await burnTokens(owner, tokenAccount.pubkey, mint, owner, 'all', false);
      }
      await closeTokenAccount(tokenAccount.pubkey, owner, owner);
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
 * @param {Keypair} payer Fee payer
 * @param {PublicKey} mint Public key of token mint
 * @param {KeyPair} owner Public key/wallet of token account owner
 * @param {number|string} amount Amount of tokens to burn
 * @param {PublicKey} program Public key of program that owns token
 * @returns {TransactionSignature}
 */
async function burnTokens(
  payer,
  mint,
  owner,
  amount,
  program = TOKEN_2022_PROGRAM_ID,
  logToConsole = true
) {
  const tokenAccount = await getAssociatedTokenAddress(
    mint, owner.publicKey, false, program
  );
  const ataBalance = await CONN.getTokenAccountBalance(tokenAccount);
  const decimals = ataBalance.value.decimals;
  if (typeof amount === 'string' && amount.toLowerCase().trim() === 'all') {
    amount = Number(ataBalance.value.amount);
  }
  let signature = await burnChecked(
    CONN,
    payer,
    tokenAccount,
    mint,
    owner,
    amount,
    decimals,
    [],
    {},
    TOKEN_2022_PROGRAM_ID
  );
  if (logToConsole) console.log('Burn tokens hash:', signature);
  return signature;
}

/**
 * Closes Token2022 program mint account
 * @param {Keypair} payer Payer of transaction fees
 * @param {PublicKey} account Mint account to close
 * @param {PublicKey} destination Account to reclaim lamports
 * @param {Keypair} authority Close authority of mint
 * @returns {TransactionSignature}
 */
async function closeToken2022MintAccount(
  payer,
  account,
  destination,
  authority
) {
  const signature = await closeAccount(
    CONN,
    payer,
    account,
    destination,
    authority,
    [],
    {},
    TOKEN_2022_PROGRAM_ID
  );
  console.log('Close account signature:', signature);
  return signature;
}

async function main() {
  setConnection(/* Enter Choice */);
  const walletKeyPairs = await getFSWallets();
  const balances = (await getBalances(walletKeyPairs, CONN)).sort((a, b) => {
    return b.balance - a.balance;
  });
  // console.log(stringify(balances));

  const mainWallet = balances[0].wallet;
  const secondWallet = balances[1].wallet;

  // CREATE ACCOUNT
  // saveNewFSKeyPair()

  // TRANSFER SOL
  // let result = await transferSol(mainWallet, [new PublicKey('2s4jgexJbLAy81MXt3xQ5Wi6LFJG82ppRobqhSBk2zPr')], 5);
  // console.log(result);

  // MINT TOKEN
  // V1
  // let result = await createAndMintOriginalToken(balances[0].wallet, balances[0].wallet, 9);
  // console.log(result);
  // console.log(JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v));

  // V2
  // let result = await createToken2022(
  //   mainWallet,
  //   mainWallet,
  //   mainWallet,
  //   'POTATO',
  //   'POTATO',
  //   'https://bafybeiblxkv766rkkdyt2l7fjqn3rkv4tmshqpdbo57ratmsn5kcbzibum.ipfs.w3s.link/ipfs/bafybeiblxkv766rkkdyt2l7fjqn3rkv4tmshqpdbo57ratmsn5kcbzibum/potato.json',
  //   'Potato',
  //   2,
  //   true,
  //   mainWallet,
  //   true,
  //   mainWallet
  // );
  // console.log(result);

  // const mint = new PublicKey('4GGovtKKRbD9gRmqWnoMe7XurUKc1Lc12PscqNVvTj8h');
  // let result = await mintToken2022(mint, mainWallet, mainWallet, 2.005);

  // UPDATE METADATA
  // let result = await updateToken2022Metadata(
  //   mainWallet,
  //   new PublicKey('Cfg9Bwzv9Wdh3pec3hGCP5yxDpZ8EEqFy7P1zZ2FEu6g'),
  //   mainWallet,
  //   'uri',
  //   'https://bafybeif7nnqckzi2rerhclfsgqowz5mhmqffijgprr7rfvgbhohhpwszdu.ipfs.w3s.link/8PRyP8tgtyFAPrAJjdG9dS91oDiZ71SLr8qFkrSDRGKv.json'
  // );

  // CLOSE MINT ACCOUNT
  // let result = await closeToken2022MintAccount(
  //   mainWallet,
  //   new PublicKey('Cfg9Bwzv9Wdh3pec3hGCP5yxDpZ8EEqFy7P1zZ2FEu6g'),
  //   mainWallet.publicKey,
  //   mainWallet
  // );

  // UPDATE AUTHORITY
  // const mint = new PublicKey(
  //   '497jWQUNSLBjm9YUsix7SMajLSNp23cBN7WytrAFfByd'
  // );
  // let result = await updateAuthority(
  //   mint,
  //   secondWallet,
  //   mainWallet,
  //   secondWallet.publicKey,
  //   [AuthorityType.MintTokens]
  // );
  // console.log(result);


  // const seedTokenAccount = await getOrCreateAssociatedTokenAccount(
  //   CONN,
  //   mainWallet,
  //   new PublicKey('4xA38i9HKnpkcpyrfpYmgfq2bTv5XiAugVuatBigKH8D'),
  //   new PublicKey('2s4jgexJbLAy81MXt3xQ5Wi6LFJG82ppRobqhSBk2zPr')
  // );
  // console.log(seedTokenAccount);

  // TRANSFER TOKEN
  // const mint = new PublicKey('ZkBzQBxXyVY4jmwVDnb3wnyezVfqbFaDDKnpjHDVn4b');
  // let result = await sendToken(secondWallet, mint, mainWallet, 1);
  // console.log(result);

  // GET TOKEN INFO
  // const mintAddress = new PublicKey(
  //   'ZkBzQBxXyVY4jmwVDnb3wnyezVfqbFaDDKnpjHDVn4b'
  // );
  // getTokenInfo(mintAddress)

  // ADD METADATA
  // const mint = new PublicKey('ZkBzQBxXyVY4jmwVDnb3wnyezVfqbFaDDKnpjHDVn4b');
  // const wallet = await getKeyPairFromFile('id.json');
  // let result = await addTokenMetadata(mint, wallet, wallet, wallet, 'TEST', 'TEST', 'https://pastebin.com/raw/2p2K6k1V', 420);
  // console.log(result);

  // CLOSE TOKEN ACCOUNT
  // const mint = new PublicKey('ZkBzQBxXyVY4jmwVDnb3wnyezVfqbFaDDKnpjHDVn4b');
  // const ataToClose = await getOrCreateAssociatedTokenAccount(
  //   CONN, mainWallet, mint, mainWallet.publicKey
  // );
  // console.log(ataToClose.address.toString());
  // let result = closeAccount(ataToClose.address, mainWallet, mainWallet);
  // console.log(result);

  // BURN TOKENS
  // const mintAddress = new PublicKey('4GGovtKKRbD9gRmqWnoMe7XurUKc1Lc12PscqNVvTj8h');
  // let result = await burnTokens(
  //   mainWallet,
  //   mintAddress,
  //   mainWallet,
  //   'all'
  // );
  // console.log(result);

  // GET TOKEN ACCOUNTS
  // let result = await getTokenAccounts(mainWallet.publicKey);
  // console.log(stringify(result));

  // CLOSE ALL TOKEN ACCOUNTS
  // walletKeyPairs.forEach(async wallet => await closeAllTokenAccounts(wallet));

  // CREATE SEED ACCOUNT
  // const newAccount = await createSeedAccounts(mainWallet.publicKey, 10, 1);
  // const newAccount = await createSeedAccountWithFunds(mainWallet, 10, 1, 0.1);

  // TRANSFER SOL FROM SEED ACCOUNT
  // const fromPubKey = new PublicKey('8ybYihLqh8CmE2YAL3R3bqg3Z3P8seUH2oAxk6vKju8S');
  // const seed = `'!_S1KGFgj`;
  // await transferSolFromSeedAccount(mainWallet, fromPubKey, seed, secondWallet, 0.1)

  // RANDOM
  // let onCurve = false;
  // let pk;
  // while (!onCurve) {
  //   pk = await createSeedAccounts(mainWallet, 10, 1)[0];
  //   onCurve = PublicKey.isOnCurve(pk);
  // }
  // const seedTokenAccount = await getOrCreateAssociatedTokenAccount(
  //   CONN,
  //   mainWallet,
  //   new PublicKey('4xA38i9HKnpkcpyrfpYmgfq2bTv5XiAugVuatBigKH8D'),
  //   new PublicKey('2s4jgexJbLAy81MXt3xQ5Wi6LFJG82ppRobqhSBk2zPr')
  // );
  // console.log(seedTokenAccount);
}

main();
