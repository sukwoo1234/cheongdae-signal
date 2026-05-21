import "./globals.css";

export const metadata = {
  title: "청대 시그널",
  description: "한 줄로 시작하는 인스타 매칭 — 청주대학교 학생 전용",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
