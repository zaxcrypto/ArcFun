import { MainApp } from "@/components/main-app";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Circle Gateway | ArcFun",
  description: "Unified cross-chain liquidity and routing powered by Circle Gateway on ArcFun.",
  alternates: {
    canonical: "https://www.thearcfun.xyz/gateway",
  },
};

export default function GatewayPage() {
  return <MainApp />;
}
