import { Keypair, PublicKey } from '@solana/web3.js';
import {
  burnChecked,
  createMint,
  getAssociatedTokenAddress,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  transfer,
} from '@solana/spl-token';
import { writeFile } from 'fs/promises';
import {
  CONN,
  MINT_DIR,
  convertSolToLamports,
  stringify,
} from './utilities/helper.js';
import { closeTokenAccount } from './utilities/account.js';

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
export async function createAndMintOriginalToken(
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
      jsonResult
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
export async function getTokenInfo(mintAddress, logToConsole = true) {
  const mintInfo = await getMint(CONN, mintAddress, TOKEN_PROGRAM_ID);
  if (logToConsole) console.log('Mint info:', stringify(mintInfo));
  return mintInfo;
}

/**
 * Get all token accounts for an owner of a given program
 * @param {PublicKey} owner Public key of owner
 * @param {PublicKey} program Public key of program
 * @returns Response and context
 */
export async function getTokenAccounts(owner, program = TOKEN_PROGRAM_ID) {
  return await CONN.getParsedTokenAccountsByOwner(owner, {
    programId: program,
  });
}

/**
 * Sends tokens between wallets
 * @param {Keypair} fromWallet Wallet of sender
 * @param {PublicKey} mint Public key of token mint
 * @param {PublicKey} toWallet Public key of wallet to receive token
 * @param {number|string} amount Amount of token to send
 * @param {PublicKey} program Public key of program that owns token
 * @returns {import('@solana/web3.js').TransactionSignature}
 */
export async function sendToken(
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
export async function closeAllTokenAccounts(
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
        const mint = new PublicKey(tokenAccount.account.data.parsed.info.mint);
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
 * @returns {import('@solana/web3.js').TransactionSignature}
 */
export async function burnTokens(
  payer,
  mint,
  owner,
  amount,
  program = TOKEN_2022_PROGRAM_ID,
  logToConsole = true
) {
  const tokenAccount = await getAssociatedTokenAddress(
    mint,
    owner.publicKey,
    false,
    program
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
