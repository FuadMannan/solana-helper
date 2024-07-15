import { PublicKey } from '@solana/web3.js';
import {
  AuthorityType,
  closeAccount,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import { CONN, setConnection, stringify } from './utilities/helper.js';
import {
  createSeedAccountWithFunds,
  createSeedAccounts,
  getBalances,
  getFSWallets,
  getKeyPairFromFile,
  saveNewFSKeyPair,
} from './utilities/account.js';
import {
  transferSol,
  transferSolFromSeedAccount,
} from './utilities/transactions.js';
import {
  burnTokens,
  closeAllTokenAccounts,
  createAndMintOriginalToken,
  getTokenAccounts,
  getTokenInfo,
  sendToken,
} from './utilities/spl-token.js';
import {
  createMetaplexMint,
  getMPLMetadata,
  loadMPLKeyPair,
  loadUmi,
  mintTokens,
  updateMPLMetadata,
} from './utilities/mpl-token.js';

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

  // METAPLEX

  // const umi = loadUmi();
  // const mainWallet = loadMPLKeyPair(umi, 'id.json');
  // umi.use(keypairIdentity(mainWallet));
  // const mint = publicKey('4JRqJ3WfpCstHWPYum5jmf2ZGVAhB8a4WTBHGHqsz5hT');

  // CREATE MPL MINT
  // const result = await createMetaplexMint(
  //   umi,
  //   'POTATO',
  //   'POTATO',
  //   'https://bafybeiblxkv766rkkdyt2l7fjqn3rkv4tmshqpdbo57ratmsn5kcbzibum.ipfs.w3s.link/ipfs/bafybeiblxkv766rkkdyt2l7fjqn3rkv4tmshqpdbo57ratmsn5kcbzibum/potato.json',
  //   7,
  //   mainWallet,
  //   mainWallet
  // );

  // UPDATE MPL METADATA
  // const result = await updateMPLMetadata(umi, mint, { symbol: 'POTATO' });

  // MINT MPL TOKENS
  // const result = await mintTokens(umi, mint, mainWallet, 100, mainWallet);

  // GET MPL METADATA
  // const result = await getMPLMetadata(umi, mint);
}

main();
