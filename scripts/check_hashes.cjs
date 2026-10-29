const { createPublicClient, http } = require('viem');
const { baseSepolia, sepolia, avalancheFuji } = require('viem/chains');

const hashes = [
  '0x65f068868e7efad392b2205ec186dd8d08e3240aaa07769ed07fa7cdc75809cf',
  '0xd2d29f48a3bbf6be1200cd1b6f6019c6a0d209cd6b90ca84b287491e5d79ff17'
];

const chains = [
  { name: 'Base Sepolia', client: createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') }) },
  { name: 'Ethereum Sepolia', client: createPublicClient({ chain: sepolia, transport: http('https://rpc.ankr.com/eth_sepolia') }) },
  { name: 'Avalanche Fuji', client: createPublicClient({ chain: avalancheFuji, transport: http('https://api.avax-test.network/ext/bc/C/rpc') }) },
  { name: 'Arc Testnet', client: createPublicClient({ transport: http('https://subnets.avax.network/arc/testnet/rpc') }) }
];

async function check() {
  for (const h of hashes) {
    console.log('\n=== Checking Hash:', h, '===');
    let found = false;
    for (const c of chains) {
      try {
        const tx = await c.client.getTransaction({ hash: h });
        if (tx) {
          const receipt = await c.client.getTransactionReceipt({ hash: h });
          console.log(`FOUND on ${c.name}! Status: ${receipt.status}, Block: ${receipt.blockNumber}, From: ${tx.from}, To: ${tx.to}`);
          found = true;
        }
      } catch (e) {
        // ignore
      }
    }
    if (!found) {
      console.log(`NOT FOUND on any testnet RPC for ${h}`);
    }
  }

  // Also check Circle Gateway API deposits directly for user
  const user = '0xd448777940dfabf65fd259fa8a9903e60e1ff178';
  console.log('\n=== Checking Circle Gateway API getDeposits ===');
  const depRes = await fetch(`https://gateway.circle.com/v1/deposits?depositor=${user}`);
  const depJson = await depRes.json();
  console.log('Circle Gateway Deposits:', JSON.stringify(depJson, null, 2));

  console.log('\n=== Checking Circle Gateway API getBalances ===');
  const balRes = await fetch(`https://gateway.circle.com/v1/balances?depositor=${user}`);
  const balJson = await balRes.json();
  console.log('Circle Gateway Balances:', JSON.stringify(balJson, null, 2));
}

check().catch(console.error);
