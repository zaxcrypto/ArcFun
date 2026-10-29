import { MainApp } from "@/components/main-app";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Token Deployer | ArcFun",
  description: "Deploy your custom ERC-20 tokens instantly on ArcFun.",
  alternates: {
    canonical: "https://www.thearcfun.xyz/token-deployer",
  },
};

export default function TokenDeployerPage() {
  return <MainApp />;
}
