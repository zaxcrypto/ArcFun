import { MainApp } from "@/components/main-app";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Panel | ArcFun",
  description: "Platform and smart contract management.",
};

export default function AdminPage() {
  return <MainApp />;
}
