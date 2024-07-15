import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from '@solana/web3.js';
import('@solana/web3.js').TransactionSignature;
import {
  AuthorityType,
  closeAccount,
  createInitializeInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createInitializeMintCloseAuthorityInstruction,
  createSetAuthorityInstruction,
  ExtensionType,
  getMintLen,
  getOrCreateAssociatedTokenAccount,
  LENGTH_SIZE,
  mintTo,
  tokenMetadataUpdateFieldWithRentTransfer,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
} from '@solana/spl-token';
import { pack } from '@solana/spl-token-metadata';
import {
  CONN,
  MINT_RESULTS_DIR,
  convertSolToLamports,
  saveToFile,
} from './utilities/helper.js';
import { saveNewFSKeyPair } from './utilities/account.js';

/**
 * Creates a Token-2022 mint
 * @param {Keypair} payer
 * @param {Keypair} mintAuthority
 * @param {Keypair} updateAuthority
 * @param {string} name
 * @param {string} symbol
 * @param {string} uri
 * @param {string} description
 * @param {number} decimals
 * @param {boolean} freeze
 * @param {Keypair} freezeAuthority
 * @param {boolean} close
 * @param {Keypair} closeAuthority
 * @returns {import('@solana/web3.js').TransactionSignature}
 */
export async function createToken2022(
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

  console.log(
    `Mint: ${mint}\nhttps://solana.fm/tx/${
      import('@solana/web3.js').TransactionSignature
    }`
  );
  return transactionSignature;
}

/**
 * Mints tokens from Token2022 program to a wallet
 * @param {PublicKey} mint Mint public key
 * @param {Keypair} authority Mint authority keypair
 * @param {Keypair} destination Target wallet
 * @param {number} amount Amount of token to mint
 * @returns {import('@solana/web3.js').TransactionSignature}
 */
export async function mintToken2022(mint, authority, destination, amount) {
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
 * Updates 1 or more authority types for a token mint
 * @param {PublicKey} mint Mint public key
 * @param {Keypair} payer Payer wallet
 * @param {Keypair} currentAuthority Current authority wallet
 * @param {PublicKey|null} newAuthority New authority public key or null
 * @param {Array<AuthorityType>} authorityTypes Array of authority types to update
 * @returns {import('@solana/web3.js').TransactionSignature} Transaction signature
 */
export async function updateAuthority(
  mint,
  payer,
  currentAuthority,
  newAuthority,
  authorityTypes
) {
  const tx = new Transaction();
  authorityTypes.forEach((type) => {
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
 * @returns {import('@solana/web3.js').TransactionSignature}
 */
export async function updateToken2022Metadata(
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
 * Closes Token2022 program mint account
 * @param {Keypair} payer Payer of transaction fees
 * @param {PublicKey} account Mint account to close
 * @param {PublicKey} destination Account to reclaim lamports
 * @param {Keypair} authority Close authority of mint
 * @returns {import('@solana/web3.js').TransactionSignature}
 */
export async function closeToken2022MintAccount(
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
