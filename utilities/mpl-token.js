import { MINT_KEYPAIRS_DIR, WALLET_DIR, stringify } from "./helper.js";
import { publicKey } from "@metaplex-foundation/umi";
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  createFungible,
  mplTokenMetadata,
  fetchMetadataFromSeeds,
  updateV1,
  mintV1,
  TokenStandard
} from '@metaplex-foundation/mpl-token-metadata';
import { clusterApiUrl, Keypair, PublicKey } from '@solana/web3.js';
import {
  generateSigner,
  keypairIdentity,
  percentAmount,
  some,
} from '@metaplex-foundation/umi';
import { writeFileSync, readFileSync, readdirSync } from 'fs';

/**
 * Loads MPL keypair from file
 * @param {Umi} umi Umi context
 * @param {string} filename filename of keypair
 * @returns {Keypair} MPL keypair
 */
export function loadMPLKeyPair(umi, filename) {
  let fullPath;
  const dirs = [WALLET_DIR, MINT_KEYPAIRS_DIR, '.\\test'];
  dirs.some((d) => {
    const files = readdirSync(d);
    return files.some((file) => {
      if (file.startsWith(filename)) {
        fullPath = `${d}\\${file}`;
        return true;
      }
      return false;
    });
  });
  if (fullPath) {
    const secretKey = JSON.parse(readFileSync(fullPath, 'utf-8'));
    const keypair = umi.eddsa.createKeypairFromSecretKey(
      new Uint8Array(secretKey)
    );
    return keypair;
  } else {
    throw 'Nonexistent keypair';
  }
}

/**
 * Saves keypair to file
 * @param {Keypair} keypair Umi keypair
 */
export function saveWallet(keypair) {
  writeFileSync(
    `test\\${keypair.publicKey}.json`,
    stringify(Array.from(keypair.secretKey))
  );
}

/**
 * Load Umi context
 * @param {Keypair|string} wallet Signer to use
 * @param {string} rpc URL of RPC to use
 * @returns umi context
 */
export function loadUmi(wallet = null, rpc = clusterApiUrl('devnet')) {
  const umi = createUmi(rpc).use(mplTokenMetadata());
  let signer;
  if (wallet) {
    const keys = Object.keys(wallet);
    if (keys.includes('_keypair') || keys.includes('publicKey')) {
      signer = wallet;
    } else if (typeof wallet == 'string') {
      signer = loadMPLKeyPair(umi, wallet);
    }
    umi.use(keypairIdentity(signer));
  }
  return umi;
}

/**
 * Create MPL Mint
 * @param {Umi} umiCtx Umi context
 * @param {string} name Token name
 * @param {string} symbol Token symbol
 * @param {string} uri URI of off-chain JSON file
 * @param {number} decimals decimals for token
 * @param {Keypair} authority Mint authority (MPL)
 * @param {Keypair} updateAuthority Update authority (MPL)
 * @returns Transaction Signature and RPC results
 */
export async function createMetaplexMint(
  umiCtx,
  name,
  symbol,
  uri,
  decimals,
  authority,
  updateAuthority
) {
  const mint = generateSigner(umiCtx);

  saveWallet(mint);

  const result = await createFungible(umiCtx, {
    mint,
    name: name,
    symbol: symbol,
    uri: uri,
    decimals: some(decimals),
    sellerFeeBasisPoints: percentAmount(0),
    authority: authority,
    updateAuthority: updateAuthority,
  }).sendAndConfirm(umiCtx);

  console.log(result);
  return result;
}

/**
 * Mints MPL tokens to an address
 * @param {Umi} umi Umi context
 * @param {PublicKey} mint Mint address
 * @param {Keypair} authority Mint authority (MPL)
 * @param {number} amount Amount of tokens to mint
 * @param {Keypair} tokenOwner Address to be minted to (MPL)
 * @returns Transaction Signature, RPC confirmation
 */
export async function mintTokens(umi, mint, authority, amount, tokenOwner) {
  const result = await mintV1(umi, {
    mint,
    authority,
    amount,
    tokenOwner,
    tokenStandard: TokenStandard.Fungible
  }).sendAndConfirm(umi);
  console.log(result);
  return result;
}

/**
 * Gets MPL token metadata
 * @param {Umi} umi Umi context
 * @param {string|PublicKey} mintAddress Mint public key
 * @returns Token metadata
 */
export async function getMPLMetadata(umi, mintAddress) {
  const result = await fetchMetadataFromSeeds(umi, { mint: mintAddress });
  console.log(result);
  return result;
}

/**
 * Update MPL Token Metadata
 * @param {Umi} umi Umi context
 * @param {string|PublicKey} mintAddress Mint address
 * @param {Object} updateData Data to be updated
 * @returns Transaction Signature, RPC confirmation
 */
export async function updateMPLMetadata(umi, mintAddress, updateData) {
  const initialMetadata = await getMPLMetadata(umi, mintAddress);

  const result = await updateV1(umi, {
    mint: mintAddress,
    data: {...initialMetadata, ...updateData}
  }).sendAndConfirm(umi)
  console.log(result);
  return result;
}
