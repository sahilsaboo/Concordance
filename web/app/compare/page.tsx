import type { Metadata } from "next";
import { loadMatrix } from "@/lib/matrix";
import Compare from "./Compare";

export const metadata: Metadata = { title: "Compare options · Concordance" };

// Server component: loads the reviewed matrix once, then hands it to the client-side flow.
// Answers and scoring stay in the browser; nothing about the user is sent back.
export default function ComparePage() {
  return <Compare matrix={loadMatrix()} />;
}
