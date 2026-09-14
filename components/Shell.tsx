export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="shell-header px-8 py-4">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between text-[0.64rem] font-medium tracking-[0.05em] text-[#B9D6F2]">
            <span>REGPATH — MULTI-JURISDICTION REGULATORY STRATEGY</span>
            <span>INTERNAL STRATEGY TOOL · NOT LEGAL ADVICE</span>
          </div>
          <h1 className="serif mt-2 text-[1.42rem] font-semibold tracking-[-0.01em] text-white">Regulatory Pathway Mapper</h1>
          <p className="mt-1 max-w-2xl text-[0.82rem] text-[#CFE3F5]">
            Paste a pitch or upload a deck, answer a short set of strategy questions, and get a dependency-mapped pathway from your home
            market into the EU and its member states.
          </p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-6">{children}</main>
      <footer className="shell-footer flex justify-between px-8 py-3 text-[0.66rem] tracking-[0.02em]">
        <span>RegPath</span>
        <span>Internal strategy tool — not legal advice. Verify with qualified regulatory counsel before acting.</span>
      </footer>
    </div>
  );
}
