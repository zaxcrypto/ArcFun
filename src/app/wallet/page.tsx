import { MainApp } from "@/components/main-app";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Wallet | ArcFun",
  description: "Manage your ArcFun wallet and portfolio.",
  alternates: {
    canonical: "https://www.thearcfun.xyz/wallet",
  },
};

export default function WalletPage() {
  return <MainApp />;
}
