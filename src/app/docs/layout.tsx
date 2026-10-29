import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ArcFun Documentation | Multi-Chain Web3 DeFi, Wallet & Bridge Protocol',
  description: 'Official documentation for ArcFun: cross-chain bridge and swap, non-custodial smart wallet, Web3 chat, Circle Gateway, and security policy engine.',
  alternates: {
    canonical: 'https://www.thearcfun.xyz/docs',
  },
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
