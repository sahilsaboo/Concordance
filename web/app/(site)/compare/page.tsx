import type { Metadata } from "next";
import { loadMatrix } from "@/lib/matrix";
import Compare from "./Compare";

export const metadata: Metadata = {
  title: "Compare your options",
  description: "Rate what matters to you, then see GLP-1 options ranked on independent, cited evidence.",
};

// Server component: loads the reviewed matrix once, then hands it to the client-side flow.
// Answers and scoring stay in the browser; nothing about the user is sent back.
export default function ComparePage() {
  return <Compare matrix={loadMatrix()} />;
}
