"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-[#faf6e8]">
      <h1 className="text-lg font-bold text-gray-800">문제가 생겼어요</h1>
      <p className="text-sm text-gray-600">
        잠시 후 다시 시도해주세요. 계속 반복되면 조금 뒤에 접속해주세요.
      </p>
      <button
        onClick={reset}
        className="bg-gray-800 text-white text-xs font-semibold px-4 py-2 rounded-md"
      >
        다시 시도
      </button>
    </main>
  );
}
