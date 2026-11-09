import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: TrustPage,
})

type Pledge = { th: string; en: string; detail: string }

// Every line here is a promise the app and the API keep in code: the privacy
// screen's PromiseList, the AI consent sheet and the GoGoCash bridge rules.
const PROMISES: readonly Pledge[] = [
  {
    th: 'ไม่เชื่อมบัญชีธนาคาร',
    en: 'No bank connection',
    detail: 'Your diary holds only what you type, scan or import from a file you choose.',
  },
  {
    th: 'ไม่ขายข้อมูล ไม่มีโฆษณา',
    en: 'Never sold, no ads',
    detail: 'Your spending is never sold, shared with advertisers or used to target you.',
  },
  {
    th: 'บันช่วยคิดเมื่อคุณเปิดเอง',
    en: 'AI only when you turn it on',
    detail: 'Bun’s AI help is off until you say yes. It sees only what one task needs, never your account details, and nothing is used for training.',
  },
  {
    th: 'ตัวเลขมาจากบันทึกของคุณ',
    en: 'Numbers come from your diary',
    detail: 'Every amount Bun says is checked against your own records before you see it. Bun explains your numbers; it never gives investment or loan advice.',
  },
  {
    th: 'เคล็ดลับเงินคืนคิดบนมือถือ',
    en: 'Cashback tips stay on your phone',
    detail: 'Jotbun can show where GoGoCash, our sister app, might give cashback. The matching runs on your phone. No diary data is ever sent to GoGoCash.',
  },
  {
    th: 'ลบได้ทุกเมื่อ',
    en: 'Yours to keep or remove',
    detail: 'Export your diary or delete your account at any time. A deleted account stays deleted, even after a backup restore.',
  },
]

function TrustPage() {
  return (
    <main className="page">
      <style>{CSS}</style>
      <header className="stage">
        <div className="bun" aria-hidden="true">
          <svg viewBox="0 0 64 56" width="88" height="77">
            <ellipse cx="32" cy="32" rx="28" ry="22" fill="#FFF8EC" stroke="#231B3A" strokeWidth="2.5" />
            <circle cx="23" cy="30" r="2.6" fill="#231B3A" />
            <circle cx="41" cy="30" r="2.6" fill="#231B3A" />
            <ellipse cx="17" cy="37" rx="4" ry="2.4" fill="#F6B6CE" />
            <ellipse cx="47" cy="37" rx="4" ry="2.4" fill="#F6B6CE" />
            <path d="M28 37 Q32 41 36 37" fill="none" stroke="#231B3A" strokeWidth="2" strokeLinecap="round" />
            <rect x="26" y="43" width="12" height="11" rx="1.5" fill="#1F5BFF" stroke="#231B3A" strokeWidth="2" />
          </svg>
        </div>
        <h1>
          Jotbun <span lang="th">บันจดเงิน</span>
        </h1>
        <p className="lede" lang="th">สมุดจดเงินส่วนตัว ใช้ง่าย อยู่กับคุณทุกวัน</p>
        <p className="lede">A private spending diary for Thailand and Southeast Asia.</p>
      </header>

      <section aria-labelledby="promises">
        <h2 id="promises">
          <span lang="th">คำสัญญาของเรา</span> · Our promises
        </h2>
        <ul className="promises">
          {PROMISES.map((p) => (
            <li key={p.en} className="card">
              <p className="th" lang="th">
                {p.th}
              </p>
              <p className="en">{p.en}</p>
              <p className="detail">{p.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="foot">
        <p>
          Service status: <a href="/ready">/ready</a>
        </p>
      </footer>
    </main>
  )
}

const CSS = `
:root {
  --stage: #B9A3F9; --bg: #EDE6FF; --card: #FFF8EC; --ink: #231B3A; --muted: #5B4F80; --accent: #6A4BD4;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root { --stage: #2A2240; --bg: #17131F; --card: #221C30; --ink: #F4EEFF; --muted: #B3A7D6; --accent: #B9A3F9; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font-family: 'Anuphan', 'DM Sans', system-ui, -apple-system, 'Segoe UI', sans-serif; line-height: 1.5; }
.page { max-width: 720px; margin: 0 auto; padding: 0 16px 48px; }
.stage { background: var(--stage); border: 2px solid var(--ink); border-radius: 0 0 24px 24px;
  padding: 32px 20px 24px; margin: 0 -16px 24px; text-align: center; }
.bun svg { display: block; margin: 0 auto 8px; }
h1 { font-size: 34px; margin: 0; }
h1 span { font-weight: 500; }
.lede { margin: 4px 0 0; font-size: 17px; }
h2 { font-size: 22px; margin: 0 0 12px; }
.promises { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.card { background: var(--card); border: 2px solid var(--ink); border-radius: 16px; padding: 16px; }
.th { font-size: 17px; font-weight: 700; margin: 0; line-height: 1.6; }
.en { font-size: 15px; font-weight: 600; margin: 0 0 6px; color: var(--muted); }
.detail { margin: 0; font-size: 15px; }
.foot { margin-top: 24px; color: var(--muted); font-size: 13px; }
a { color: var(--accent); }
@media (min-width: 640px) { .promises { grid-template-columns: 1fr 1fr; } }
`
