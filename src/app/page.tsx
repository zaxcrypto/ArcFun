import { MainApp } from "@/components/main-app";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "ArcFun",
  alternates: {
    canonical: "https://www.thearcfun.xyz",
  },
};

export default function Home() {
  return <MainApp />;
}
