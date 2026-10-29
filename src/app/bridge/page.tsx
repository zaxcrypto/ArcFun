import { MainApp } from "@/components/main-app";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bridge | ArcFun",
  description: "Cross-chain bridge powered by Circle CCTP on ArcFun.",
  alternates: {
    canonical: "https://www.thearcfun.xyz/bridge",
  },
};

export default function BridgePage() {
  return <MainApp />;
}
