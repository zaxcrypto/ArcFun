import { MainApp } from "@/components/main-app";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Swap & Bridge | ArcFun",
  description: "Instant cross-chain bridge and token swap on ArcFun.",
  alternates: {
    canonical: "https://www.thearcfun.xyz/swap",
  },
};

export default function SwapPage() {
  return <MainApp />;
}
