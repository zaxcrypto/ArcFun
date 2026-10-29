import { MainApp } from "@/components/main-app";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat & Pay | ArcFun",
  description: "Seamlessly chat and send payments on ArcFun.",
  alternates: {
    canonical: "https://www.thearcfun.xyz/chat",
  },
};

export default function ChatPage() {
  return <MainApp />;
}
