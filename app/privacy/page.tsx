export default function Privacy() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-10 text-sm leading-relaxed text-gray-700">
      <h1 className="text-2xl font-bold mb-6">개인정보 처리방침</h1>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">1. 수집 항목</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>이메일 (@cju.ac.kr)</li>
          <li>성별 (M/F)</li>
          <li>한 줄 소개</li>
          <li>인스타그램 ID</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">2. 수집 목적</h2>
        <p>청대 시그널 매칭 서비스 운영 (사용자 인증, 카드 게시, 인스타그램 ID 1회 노출).</p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">3. 보유 기간</h2>
        <p>행사 종료 시각 도달 후 운영자의 폐기 확정 시점까지. 폐기 후 복구 불가.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">4. 처리 위탁</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Supabase Inc. (데이터베이스, 인증)</li>
          <li>Resend Inc. (이메일 발송)</li>
          <li>Vercel Inc. (호스팅)</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">5. 사용자 권리</h2>
        <p>로그인 후 "내 카드 관리" 페이지에서 즉시 본인 정보를 삭제할 수 있습니다.</p>
      </section>
    </main>
  );
}
