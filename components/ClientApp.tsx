"use client";

import dynamic from "next/dynamic";

// The app keeps its session in localStorage, so it is rendered client-only to
// avoid a hydration mismatch between the server's empty state and the
// restored one.
const Home = dynamic(() => import("./Home"), { ssr: false });

export default function ClientApp() {
  return <Home />;
}
