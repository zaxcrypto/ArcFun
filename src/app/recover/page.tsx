import { MainApp } from "@/components/main-app";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recover | ArcFun",
  description: "Recover your ArcFun wallet.",
  alternates: {
    canonical: "https://www.thearcfun.xyz/recover",
  },
};

export default function RecoverPage() {
  return <MainApp />;
}
