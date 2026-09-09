import type { ReactNode } from "react";

export function CampusShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={`relative min-h-screen overflow-hidden bg-[#edf5ff] bg-cover bg-center px-5 py-8 ${className}`}
      style={{ backgroundImage: "url('/hero-campus.webp')" }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(236,246,255,.22)_0%,rgba(255,255,255,.78)_46%,rgba(255,247,248,.34)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-[74%] bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,.86),rgba(255,255,255,.25)_68%,transparent_88%)]" />

      <div aria-hidden className="absolute left-5 top-6 text-[8px] font-semibold leading-4 tracking-[0.30em] text-[#5578a8] sm:left-10 sm:top-9 sm:text-[9px]">
        CHEONGJU<br />UNIVERSITY
        <span className="mt-2 block h-px w-9 bg-[#5578a8]/60" />
      </div>
      <div aria-hidden className="absolute right-5 top-6 text-right text-[8px] font-semibold leading-4 tracking-[0.30em] text-[#5578a8] sm:right-10 sm:top-9 sm:text-[9px]">
        SAME CAMPUS<br />NEW CONNECTIONS
        <span className="ml-auto mt-2 block h-px w-12 bg-[#5578a8]/60" />
      </div>

      <div className="signal-enter relative mx-auto w-full max-w-2xl pt-20 sm:pt-24">
        {children}
      </div>

      <div aria-hidden className="relative mx-auto mt-10 flex max-w-sm items-center justify-center gap-3 text-[8px] font-semibold tracking-[0.30em] text-[#6b86ad]">
        <span className="h-px w-9 bg-[#6b86ad]/60" />
        CHEONGJU UNIVERSITY
        <span className="h-px w-9 bg-[#6b86ad]/60" />
      </div>
    </main>
  );
}
