import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from '@solana/web3.js';
import { CONN, convertSolToLamports } from './utilities/helper.js';

/**
 * Helper function to create transfer instruction for a transaction
 * @param {Transaction} txn Transaction to add transfer instruction to
 * @param {Keypair} fromKeypair Address transaction is sending from
 * @param {PublicKey} toPubkey Public key receiving transaction
 * @param {number} sol Amount of SOL being transferred
 * @returns {Transaction} Transaction object
 */
export function createAndAddTransferInstruction(txn, fromKeypair, toPubkey, sol) {
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
export async function addTransferInstructions(txn, fromKeypair, toPubKeys, sol) {
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
export async function createTXN(fromKeypair, toPubKeys, sol) {
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
export function replaceTransferInstruction(txn, fromKeypair, toKeypair, sol) {
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
export async function transferSol(fromKeypair, toPubKeys, sol) {
  const transferTransaction = await createTXN(fromKeypair, toPubKeys, sol);
  const result = await sendAndConfirmTransaction(CONN, transferTransaction, [
    fromKeypair,
  ]);
  return result;
}

/**
 * Calculates estimated transaction fee for a Transaction object
 * @param {Transaction} transaction
 * @returns {number} Estimated fee for transaction, returns -1 if null
 */
export async function calculateTXFee(transaction) {
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
export async function addComputeBudgetToTransaction(tx) {
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
 * @returns {import('@solana/web3.js').TransactionSignature}
 */
export async function transferSolFromSeedAccount(
  baseAccount,
  fromPubKey,
  seed,
  toPubKey,
  amount
) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      basePubkey: baseAccount.publicKey,
      fromPubkey: fromPubKey,
      lamports: convertSolToLamports(amount),
      programId: SystemProgram.programId,
      seed: seed,
      toPubkey: toPubKey,
    })
  );
  const result = await sendAndConfirmTransaction(CONN, tx, [baseAccount]);
  console.log(`tx hash: ${result}`);
  return result;
}
