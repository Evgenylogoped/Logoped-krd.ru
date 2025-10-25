"use client";
import React from "react";

export default function Screens() {
  return (
    <section className="mx-auto max-w-screen-xl px-4 py-10 sm:py-14">
      <h2 className="text-2xl sm:text-3xl font-bold">Как это выглядит</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DemoCard title="Расписание (оценки, быстрые действия)" tagline="Меньше кликов — быстрее оценка и связь"><DemoSchedule /></DemoCard>
        <DemoCard title="Запись и оплата занятия" tagline="Конверсия записи + оплаты за 1 минуту"><DemoPayment /></DemoCard>
        <DemoCard title="Абонементы (остаток, срок)" tagline="Контроль без Excel и ручных подсчётов"><DemoPasses /></DemoCard>
        <DemoCard title="Орг. финансы (выплаты)" tagline="Прозрачные начисления раз в спринт"><DemoPayouts /></DemoCard>
        <DemoCard title="Чат и уведомления" tagline="Быстро отвечайте — без мессенджер‑хаоса"><DemoChat /></DemoCard>
        <DemoCard title="Профиль родителя" tagline="Документы и дети — в одном месте"><DemoParent /></DemoCard>
      </div>
    </section>
  );
}

function DemoCard({ title, children, tagline }: { title: string; children: React.ReactNode; tagline?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left; // mouse x within card
    const my = e.clientY - rect.top;  // mouse y within card
    const px = (mx / rect.width) * 2 - 1;  // -1..1
    const py = (my / rect.height) * 2 - 1; // -1..1
    el.style.setProperty('--mx', `${mx}px`);
    el.style.setProperty('--my', `${my}px`);
    el.style.setProperty('--px', `${px}`);
    el.style.setProperty('--py', `${py}`);
    el.style.setProperty('--rx', `${-py * 6}deg`);
    el.style.setProperty('--ry', `${px * 6}deg`);
    el.style.setProperty('--tz', `6px`);
  };
  const onLeave = () => {
    const el = ref.current; if (!el) return;
    el.style.setProperty('--rx', `0deg`);
    el.style.setProperty('--ry', `0deg`);
    el.style.setProperty('--tz', `0px`);
  };
  return (
    <div className="tilt-wrap" onMouseLeave={onLeave}>
      <div ref={ref} className="tilt rounded-2xl border p-3 glass hover-card">
        <div className="shine" />
        <div className="aspect-[9/16] rounded-xl border overflow-hidden bg-white">
          <div className="h-full w-full p-3 sm:p-4" onMouseMove={onMove}>
            {children}
          </div>
        </div>
        <div className="mt-2 text-sm text-gray-700 line-clamp-1" title={title}>{title}</div>
        {tagline && <div className="text-xs text-gray-500 mt-0.5">{tagline}</div>}
      </div>
    </div>
  )
}

function DemoSchedule() {
  return (
    <div className="h-full w-full grid grid-rows-[auto,1fr]">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="font-semibold text-gray-800">Сегодня</div>
        <div className="flex items-center gap-2 parallax">
          <span className="chip3d chip3d-green" title="Оценка 5">5</span>
          <span className="chip3d chip3d-amber" title="Оценка 3">3</span>
          <span className="badge badge-info">Оценить: 2</span>
        </div>
      </div>
      <div className="mt-2 grid gap-2">
        {[
          { time: '10:00', child: 'Иван Петров', action: 'Оценить', accent: 'badge-amber' },
          { time: '12:00', child: 'Мария Сидорова', action: 'Чат', accent: 'badge-gray' },
          { time: '15:00', child: 'Артём К.', action: 'Отменить', accent: 'badge-red' },
        ].map((s) => (
          <div key={s.time} className="flex items-center justify-between rounded-lg border p-2 text-xs hover:bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800 w-12">{s.time}</span>
              <span className="truncate max-w-[120px]">{s.child}</span>
            </div>
            <span className={`badge ${s.accent} parallax`}>{s.action}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DemoPayment() {
  return (
    <div className="h-full w-full flex flex-col gap-2">
      <div className="rounded-lg border p-2 text-xs">
        <div className="font-semibold text-gray-800">Запись на 12:00</div>
        <div className="text-gray-500">30 сентября · очно</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <input className="input" placeholder="Имя ребёнка" />
        <input className="input" placeholder="Email" />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <input className="input" placeholder="Сумма ₽" />
        <select className="input default-select"><option>Картой</option><option>Наличными</option></select>
      </div>
      <button className="btn btn-primary btn-sm mt-1 btn-shine parallax">Оплатить</button>
    </div>
  )
}

function DemoPasses() {
  return (
    <div className="h-full w-full grid gap-2 text-xs">
      {[{ left: 6, total: 10, date: '30.11' }, { left: 2, total: 8, date: '05.10' }].map((p, i) => (
        <div key={i} className="rounded-lg border p-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-gray-800">Осталось: {p.left} из {p.total}</div>
            <span className="badge badge-green">До: {p.date}</span>
          </div>
          <div className="mt-2 bar">
            <div className="fill parallax" style={{ width: `${Math.max(0, Math.min(100, (p.left/p.total)*100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function DemoPayouts() {
  return (
    <div className="h-full w-full flex flex-col gap-2 text-xs">
      <div className="flex items-center gap-2 parallax">
        <span className="badge badge-info">В ожидании: 4</span>
        <span className="badge badge-green">Сумма: 19 600 ₽</span>
      </div>
      <div className="rounded-lg border overflow-hidden">
        <table className="min-w-full text-xs table-zebra leading-tight">
          <thead>
            <tr className="text-left text-gray-500"><th className="py-2 px-2">Дата</th><th className="py-2 px-2">Логопед</th><th className="py-2 px-2 text-right">Сумма</th></tr>
          </thead>
          <tbody>
            <tr><td className="py-2 px-2">30.09</td><td className="py-2 px-2">Ирина</td><td className="py-2 px-2 text-right">12 500 ₽</td></tr>
            <tr><td className="py-2 px-2">29.09</td><td className="py-2 px-2">Антон</td><td className="py-2 px-2 text-right">7 100 ₽</td></tr>
            <tr><td className="py-2 px-2" colSpan={3}><span className="text-gray-500">…</span></td></tr>
          </tbody>
        </table>
      </div>
      <button className="btn btn-secondary btn-sm self-start">Подтвердить выплаты</button>
    </div>
  )
}

function DemoChat() {
  return (
    <div className="h-full w-full flex flex-col gap-2 text-xs">
      <div className="self-start bg-blue-50 border rounded-2xl px-3 py-2 max-w-[80%]">Здравствуйте! Уточните, будет ли урок в 12:00?</div>
      <div className="self-end bg-gray-100 border rounded-2xl px-3 py-2 max-w-[80%]">Да, ждём вас по адресу. Могу прислать памятку.</div>
      <div className="self-start bg-blue-50 border rounded-2xl px-3 py-2 max-w-[80%]">Спасибо! Пришлите, пожалуйста.</div>
      <div className="mt-auto flex items-center gap-2">
        <input className="input" placeholder="Сообщение" />
        <button className="btn btn-primary btn-sm btn-shine parallax">Отправить</button>
        <span className="typing ml-1 parallax"><span className="dot"></span><span className="dot"></span><span className="dot"></span></span>
      </div>
    </div>
  )
}

function DemoParent() {
  return (
    <div className="h-full w-full grid gap-2 text-xs">
      <div className="rounded-lg border p-2 parallax">
        <div className="font-semibold text-gray-800">Профиль родителя</div>
        <div className="text-gray-500">Ирина Петрова · Москва</div>
      </div>
      <div className="rounded-lg border p-2">
        <div className="font-semibold text-gray-800">Документы</div>
        <div className="text-gray-500">Договор №123 · Паспорт · Согласие</div>
      </div>
      <div className="rounded-lg border p-2">
        <div className="font-semibold text-gray-800">Дети</div>
        <div className="text-gray-500">Иван (6 лет) · логопед Анна</div>
      </div>
    </div>
  )
}
