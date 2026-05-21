export default function Terms() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-10 text-sm leading-relaxed text-gray-700">
      <h1 className="text-2xl font-bold mb-6">이용약관</h1>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">1. 서비스의 목적</h2>
        <p>
          "청대 시그널"은 청주대학교 학생 간 1:1 인스타그램 매칭을 위한 한정 기간 운영 서비스입니다.
          본 서비스는 행사 종료 시 모든 데이터가 영구 폐기됩니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">2. 이용 자격</h2>
        <p>청주대학교 이메일 (@cju.ac.kr) 보유자에 한합니다.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">3. 사용자 책임</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>본인의 인스타그램 ID를 정확히 입력할 책임</li>
          <li>한 줄 소개에 욕설, 광고, 타인의 연락처를 작성하지 않을 의무</li>
          <li>매칭으로 얻은 타인의 인스타 ID를 본 서비스 외부 (단톡방·SNS 등)에 무단 유포하지 않을 의무</li>
          <li>1 계정당 1개의 카드만 작성하는 규칙 준수</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">4. 서비스 종료</h2>
        <p>운영자가 설정한 종료 시각에 자동으로 모든 매칭이 정지되며, 운영자의 확정 후 전체 데이터가 폐기됩니다.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">5. 면책</h2>
        <p>매칭 후 발생하는 외부 연락·만남 등에 대해 본 서비스는 책임지지 않습니다.</p>
      </section>
    </main>
  );
}
