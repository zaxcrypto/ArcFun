export const ADMIN_WALLETS = [
  "0xd448777940dfabf65fd259fa8a9903e60e1ff178",
  "0x4a6b6887e6f0dd99ea9cc1a36a6bc02c14c80d5a",
  "0xdd1c0bdefce4e5ca334753b58cf7009d97473df0",
  "0xe2ed006dbb1726e0f577733f65d30a94d34bdd77",
];

export function isAdmin(address: string | undefined): boolean {
  if (!address) return false;
  return ADMIN_WALLETS.includes(address.toLowerCase());
}
