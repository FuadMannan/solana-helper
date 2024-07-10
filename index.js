const solWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const meta = require('@solana/spl-token-metadata');
const bs58 = require('bs58');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const WALLET_DIR = '.\\wallets';
const MINT_DIR = '.\\mints';
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
  if (fs.existsSync(fullPath)) {
    fileContent = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    fs.writeFileSync(
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
  fs.writeFileSync(fullPath, fileContent);
  if (fs.existsSync(fullPath.replace('.json', '-copy.json'))) {
    fsp.unlink(fullPath.replace('.json', '-copy.json'));
  }
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
 * @returns {solWeb3.Keypair} Keypair
 */
function saveNewFSKeyPair(location = 1) {
  let directory;
  switch (location) {
    default:
    case 1:
      directory = WALLET_DIR;
      break;
    case 2:
      directory = MINT_DIR;
      break;
  }
  const keypair = solWeb3.Keypair.generate();
  let filename = keypair.publicKey.toString() + '.json'
  saveToFile(Array.from(keypair.secretKey), filename, directory);
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
 * Create accounts from base account with seed(s)
 * @param {solWeb3.PublicKey} baseAccount Account generating seed
 * @param {number} seedLength Length of seed(s) to be generated
 * @param {number} numberOfAccounts Number of accounts to be created
 * @returns {Array<Object>} Array of objects containing new public keys and associated seed
 */
async function createSeedAccounts(baseAccount, seedLength, numberOfAccounts) {
  const seeds = createRandomSeeds(seedLength, numberOfAccounts);
  let newAccounts = [];
  const ID = solWeb3.SystemProgram.programId;
  for (let i = 0; i < seeds.length; i++) {
    const newAccount = await solWeb3.PublicKey.createWithSeed(baseAccount, seeds[i], ID);
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
 * @param {solWeb3.Keypair} baseAccount Keypair/wallet of base account
 * @param {number} seedLength Length of seed to generate
 * @param {number} numberOfAccounts Number of accounts to create
 * @param {number} sol Amount of Sol to transfer to seed accounts
 * @returns {solWeb3.TransactionSignature}
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
  let tx = new solWeb3.Transaction();
  for (let i = 0; i < newAccounts.length; i++) {
    const account = newAccounts[i];
    tx.add(
      solWeb3.SystemProgram.createAccountWithSeed({
        fromPubkey: baseAccount.publicKey,
        newAccountPubkey: account.pubkey,
        basePubkey: baseAccount.publicKey,
        seed: account.seed,
        lamports: convertSolToLamports(sol),
        space: 0,
        programId: solWeb3.SystemProgram.programId,
      })
    );
  }
  tx.feePayer = baseAccount.publicKey;
  tx = await addComputeBudgetToTransaction(tx);
  const result = await solWeb3.sendAndConfirmTransaction(
    CONN,
    tx,
    [baseAccount]
  );
  if (result) {
    const fullPath = `${SEED_DIR.replace('.\\', '')}\\${
      baseAccount.publicKey
    }.json`;
    let content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    const key = Object.keys(content.createdWithSeed).at(-1);
    const newSeedAccounts = content.createdWithSeed[key];
    delete content.createdWithSeed[key];
    content.createdWithSeedAndFunds[key] = newSeedAccounts;
    fsp.writeFile(fullPath, stringify(content));
  }
  return result;
}

/*
* TRANSACTIONS
*/

/**
 * Helper function to create transfer instruction for a transaction
 * @param {solWeb3.Transaction} txn Transaction to add transfer instruction to
 * @param {solWeb3.Keypair} fromKeypair Address transaction is sending from
 * @param {solWeb3.PublicKey} toPubkey Public key receiving transaction
 * @param {number} sol Amount of SOL being transferred
 * @returns {solWeb3.Transaction} Transaction object
 */
function createAndAddTransferInstruction(txn, fromKeypair, toPubkey, sol) {
  txn.add(
    solWeb3.SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: toPubkey,
      lamports: convertSolToLamports(sol),
    })
  );
  return txn;
}

/**
 * Helper function to add 1 or more transfer instructions to a transaction
 * @param {solWeb3.Transaction} txn Transaction to add transfer instruction to
 * @param {solWeb3.Keypair} fromKeypair Address transaction is sending from
 * @param {Array<solWeb3.PublicKey>} toPubKeys Public key(s) receiving transaction(s)
 * @param {number} sol Amount of SOL being transferred
 * @returns {solWeb3.Transaction} Transaction object
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
 * @param {solWeb3.Keypair} fromKeypair Address transaction is sending from
 * @param {Array<solWeb3.PublicKey>} toPubKeys Public key(s) receiving transaction
 * @param {number} sol Amount of SOL being transferred
 * @returns {solWeb3.Transaction} Transaction object
 */
async function createTXN(fromKeypair, toPubKeys, sol) {
  let txn = new solWeb3.Transaction();
  return await addTransferInstructions(txn, fromKeypair, toPubKeys, sol);
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
 * @param {solWeb3.Keypair} fromKeypair Keypair/wallet transaction is sending from
 * @param {Array<solWeb3.PublicKey>} toPubKeys Public key of address receiving transaction
 * @param {number} sol Amount of SOL being transferred
 * @returns
 */
async function transferSol(fromKeypair, toPubKeys, sol) {
  const transferTransaction = await createTXN(fromKeypair, toPubKeys, sol);
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
 * Adds compute budget program instruction to a transaction
 * @param {solWeb3.Transaction} tx Transaction to compute budget for
 * @returns Transaction with compute budget program instruction
 */
async function addComputeBudgetToTransaction(tx) {
  let budgetIx = solWeb3.ComputeBudgetProgram.setComputeUnitLimit({
    units: 1.4e6,
  });
  let budgetTx = new solWeb3.Transaction().add(budgetIx, ...tx.instructions);
  budgetTx.feePayer = tx.feePayer;
  const computeBudget = (await CONN.simulateTransaction(budgetTx)).value
    .unitsConsumed;
  budgetTx.instructions[0] = solWeb3.ComputeBudgetProgram.setComputeUnitLimit({
    units: computeBudget + 100,
  });
  return budgetTx;
}

/**
 * Transfers Sol from a Seed account
 * @param {solWeb3.Keypair} baseAccount Base account for seed account
 * @param {solWeb3.PublicKey} fromPubKey Public Key of account sending Sol
 * @param {string} seed Seed string
 * @param {solWeb3.PublicKey} toPubKey
 * @param {number} amount Amount of Sol to send
 * @returns {solWeb3.TransactionSignature}
 */
async function transferSolFromSeedAccount (baseAccount, fromPubKey, seed, toPubKey, amount) {
  const tx = new solWeb3.Transaction().add(
    solWeb3.SystemProgram.transfer({
      basePubkey: baseAccount.publicKey,
      fromPubkey: fromPubKey,
      lamports: convertSolToLamports(amount),
      programId: solWeb3.SystemProgram.programId,
      seed: seed,
      toPubkey: toPubKey
    })
  );
  const result = await solWeb3.sendAndConfirmTransaction(CONN, tx, [baseAccount]);
  console.log(`tx hash: ${result}`);
  return result;
}

/*
 * TOKENS
 */

// TOKEN-2022

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
  freezeAuthority = mintAuthority
) {
  CONN = new solWeb3.Connection(solWeb3.clusterApiUrl('devnet'));
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

  const metadataExtension = splToken.TYPE_SIZE + splToken.LENGTH_SIZE;
  const metadataLen = meta.pack(metaData).length;
  const mintLen = splToken.getMintLen([splToken.ExtensionType.MetadataPointer]);
  const lamports = await CONN.getMinimumBalanceForRentExemption(
    mintLen + metadataExtension + metadataLen
  );

  const createAccountInstruction = solWeb3.SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: mint,
    space: mintLen,
    lamports,
    programId: splToken.TOKEN_2022_PROGRAM_ID,
  });

  const initializeMetadataPointerInstruction =
    splToken.createInitializeMetadataPointerInstruction(
      mint,
      updateAuthority.publicKey,
      mint,
      splToken.TOKEN_2022_PROGRAM_ID
    );

  const initializeMintInstruction = splToken.createInitializeMintInstruction(
    mint,
    decimals,
    mintAuthority.publicKey,
    freeze ? freezeAuthority.publicKey : null,
    splToken.TOKEN_2022_PROGRAM_ID
  );

  const initializeMetadataInstruction = splToken.createInitializeInstruction({
    programId: splToken.TOKEN_2022_PROGRAM_ID,
    metadata: mint,
    updateAuthority: updateAuthority.publicKey,
    mint: mint,
    mintAuthority: mintAuthority.publicKey,
    name: metaData.name,
    symbol: metaData.symbol,
    uri: metaData.uri,
  });

  const transaction = new solWeb3.Transaction().add(
    createAccountInstruction,
    initializeMetadataPointerInstruction,
    initializeMintInstruction,
    initializeMetadataInstruction
  );

  const transactionSignature = await solWeb3.sendAndConfirmTransaction(
    CONN,
    transaction,
    [payer, mintKeypair]
  );

  console.log(`Mint: ${mint}\nhttps://solana.fm/tx/${transactionSignature}`);
  return transactionSignature;
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

async function updateAuthority(
  mint,
  payer,
  currentAuthority,
  newAuthority,
  authorityTypes
) {
  const tx = new solWeb3.Transaction();
  authorityTypes.forEach(type => {
    tx.add(
      splToken.createSetAuthorityInstruction(
        mint,
        currentAuthority.publicKey,
        type,
        newAuthority,
        [],
        splToken.TOKEN_2022_PROGRAM_ID
      )
    );
  });
  const signature = await solWeb3.sendAndConfirmTransaction(
    CONN,
    tx,
    payer == currentAuthority ? [payer] : [payer, currentAuthority]
  );
  console.log('Confirmation signature:', signature);
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
  // let result = await transferSol(balances[0].wallet, balances[1].wallet, balances[0].balance - convertLamportsToSol(5000));
  // console.log(result);

  // MINT TOKEN
  // let result = await createMintToken(balances[0].wallet, balances[0].wallet, 9);
  // console.log(result);
  // console.log(JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v));

  // TRANSFER TOKEN
  // const mint = new solWeb3.PublicKey('ZkBzQBxXyVY4jmwVDnb3wnyezVfqbFaDDKnpjHDVn4b');
  // let result = await sendToken(secondWallet, mint, mainWallet, 1);
  // console.log(result);

  // GET TOKEN INFO
  // const mintAddress = new solWeb3.PublicKey(
  //   'ZkBzQBxXyVY4jmwVDnb3wnyezVfqbFaDDKnpjHDVn4b'
  // );
  // getTokenInfo(mintAddress)

  // ADD METADATA
  // const mint = new solWeb3.PublicKey('ZkBzQBxXyVY4jmwVDnb3wnyezVfqbFaDDKnpjHDVn4b');
  // const wallet = await getKeyPairFromFile('id.json');
  // let result = await addTokenMetadata(mint, wallet, wallet, wallet, 'TEST', 'TEST', 'https://pastebin.com/raw/2p2K6k1V', 420);
  // console.log(result);

  // CLOSE TOKEN ACCOUNT
  // const mint = new solWeb3.PublicKey('ZkBzQBxXyVY4jmwVDnb3wnyezVfqbFaDDKnpjHDVn4b');
  // const ataToClose = await splToken.getOrCreateAssociatedTokenAccount(
  //   CONN, mainWallet, mint, mainWallet.publicKey
  // );
  // console.log(ataToClose.address.toString());
  // let result = closeAccount(ataToClose.address, mainWallet, mainWallet);
  // console.log(result);

  // BURN TOKENS
  // const tokenAcc = await splToken.getOrCreateAssociatedTokenAccount(
  //   CONN, mainWallet, mintAddress, mainWallet.publicKey
  // );
  // let result = await burnTokens(mainWallet, tokenAcc.address, mintAddress, mainWallet, 'all');
  // console.log(result);

  // GET TOKEN ACCOUNTS
  // let result = await getTokenAccounts(mainWallet.publicKey);
  // console.log(stringify(result));

  // CLOSE ALL TOKEN ACCOUNTS
  // walletKeyPairs.forEach(async wallet => await closeAllTokenAccounts(wallet));

  // CREATE SEED ACCOUNT
  // const newAccount = await createSeedAccounts(mainWallet, 10, 10);
}

main();
