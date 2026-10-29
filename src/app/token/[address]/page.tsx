import React from "react";
import { MainApp } from "@/components/main-app";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  return {
    title: `Trade Token ${address.slice(0, 6)}...${address.slice(-4)} | ArcFun`,
    description: `Real-time on-chain bonding curve trading paired with Dinari tokenized stock on Ethereum Sepolia.`,
    alternates: {
      canonical: `https://www.thearcfun.xyz/token/${address}`,
    },
  };
}

export default async function TokenPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return <MainApp tokenAddress={address.toLowerCase()} />;
}
