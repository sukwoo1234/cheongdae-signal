import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-[#faf6e8]">
      <h1 className="text-lg font-bold text-gray-800">페이지를 찾을 수 없어요</h1>
      <Link href="/" className="text-sm text-blue-600 underline">
        처음으로 돌아가기
      </Link>
    </main>
  );
}
