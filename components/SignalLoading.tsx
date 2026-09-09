import { CampusShell } from "@/components/CampusShell";

export function SignalLoading({ message = "더 좋은 인연을 찾고 있어요." }: { message?: string }) {
  return (
    <CampusShell className="min-h-[900px] sm:min-h-screen">
      <section className="mx-auto mt-20 flex max-w-md flex-col items-center pb-20 text-center sm:mt-28">
        <div className="relative mb-8 h-28 w-36 text-[#4d8fea]">
          <svg viewBox="0 0 150 115" fill="none" className="h-full w-full" aria-hidden>
            <path d="M24 66c12 14 23 13 31 5" stroke="currentColor" strokeWidth="3" strokeDasharray="6 7" />
            <path d="m42 49 86-34-35 78-18-27-33-17Z" fill="white" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="m75 66 53-51-35 78-18-27Z" fill="#dbeaff" />
            <path d="m75 66 53-51" stroke="currentColor" strokeWidth="2" />
            <path d="M117 5v-9M132 15l8-6M129 31l10 3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-3xl font-extrabold tracking-[-0.04em] text-[#244875]">불러오는 중…</h1>
        <p className="mt-3 text-sm leading-6 text-[#617da3]">조금만 기다려주세요!<br />{message}</p>
        <div className="mt-8 h-2 w-64 overflow-hidden rounded-full bg-[#dce9f8]">
          <div className="h-full w-3/4 animate-pulse rounded-full bg-gradient-to-r from-[#3f89eb] to-[#87b7f5]" />
        </div>
        <div className="mt-12 grid w-full grid-cols-3 divide-x divide-[#cad9ec] text-[10px] leading-4 text-[#516f98]">
          <span>같은 학교<br />더 가까운 소통</span>
          <span>좋은 인연이<br />시작되는 곳</span>
          <span>청대생만의<br />특별한 경험</span>
        </div>
      </section>
    </CampusShell>
  );
}
