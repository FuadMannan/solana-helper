const solWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const bs58 = require('bs58');
const fs = require('fs');
const path = require('path')

const WALLET_DIR = '.\\wallets\\'

function getKeyPairFromFile(walletPath) {
    const keypairPath = path.resolve(walletPath);
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    const keypair = solWeb3.Keypair.fromSecretKey(Uint8Array.from(keypairData));
    return keypair;
}

async function main() {
    const conn = new solWeb3.Connection(solWeb3.clusterApiUrl('devnet'), 'confirmed');
    const walletKeyPairs = {
        0: getKeyPairFromFile('.\\wallets\\id.json'),
        1: getKeyPairFromFile('.\\wallets\\t2.json')
    };
    let balances = {
        0: await conn.getBalance(walletKeyPairs[0].publicKey),
        1: await conn.getBalance(walletKeyPairs[1].publicKey)
    };
    console.log(`wallet 1: ${balances[0]/solWeb3.LAMPORTS_PER_SOL}`);
    console.log(`wallet 2: ${balances[1]/solWeb3.LAMPORTS_PER_SOL}`);
}

main();