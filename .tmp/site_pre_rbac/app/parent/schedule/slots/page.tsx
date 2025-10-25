"use client";
import React from "react";
import Link from "next/link";
import useSWR from "swr";
import { createBooking } from "../actions";
import MobileToast from "@/components/mobile/MobileToast";

const fetcher = (key: string) => fetch(key).then((r) => r.json());

export default function ParentSlotsPage() {
  const [from, setFrom] = React.useState(() => new Date().toISOString().slice(0, 16));
  const [to, setTo] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 16);
  });
  const [logopedId, setLogopedId] = React.useState("");
  const [logopeds, setLogopeds] = React.useState<{id:string;name:string|null;email:string}[]>([]);
  React.useEffect(()=>{
    let ignore = false;
    (async()=>{
      try { const r = await fetch('/api/org-logopeds'); const j = await r.json(); if (!ignore && Array.isArray(j?.logopeds)) setLogopeds(j.logopeds); } catch {}
    })();
    return ()=>{ ignore = true };
  },[]);

  const q = new URLSearchParams();
  if (from) q.set("from", new Date(from).toISOString());
  if (to) q.set("to", new Date(to).toISOString());
  if (logopedId) q.set("logopedId", logopedId);

  const { data, isLoading, error, mutate } = useSWR(`/api/lessons?${q.toString()}`, fetcher, { revalidateOnFocus: false });
  const lessons = data?.lessons || [];

  const [toast, setToast] = React.useState("");

  return (
    <div className="max-w-screen-md mx-auto p-3 relative">
      <div className="flex items-center gap-2 mb-3">
        <Link href="/parent/schedule" className="btn btn-ghost btn-sm">← Назад</Link>
        <div className="ml-auto">
          <button className="btn btn-outline btn-sm" onClick={()=>mutate()}>Обновить</button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-4 mb-3">
        <div>
          <label className="label"><span className="label-text">С</span></label>
          <input type="datetime-local" className="input input-bordered w-full" value={from} onChange={e=>setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label"><span className="label-text">По</span></label>
          <input type="datetime-local" className="input input-bordered w-full" value={to} onChange={e=>setTo(e.target.value)} />
        </div>
        <div>
          <label className="label"><span className="label-text">Логопед (опц.)</span></label>
          <select className="select select-bordered w-full" value={logopedId} onChange={e=>setLogopedId(e.target.value)}>
            <option value="">Любой</option>
            {logopeds.map(l=> (
              <option key={l.id} value={l.id}>{l.name || l.email}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-1 items-end">
          <button className="btn btn-sm" onClick={()=>{ const d=new Date(); setFrom(d.toISOString().slice(0,16)); const d2=new Date(); d2.setDate(d.getDate()+1); setTo(d2.toISOString().slice(0,16)); }}>Сегодня</button>
          <button className="btn btn-sm" onClick={()=>{ const d=new Date(); setFrom(d.toISOString().slice(0,16)); const d2=new Date(); d2.setDate(d.getDate()+3); setTo(d2.toISOString().slice(0,16)); }}>3 дня</button>
          <button className="btn btn-sm" onClick={()=>{ const d=new Date(); setFrom(d.toISOString().slice(0,16)); const d2=new Date(); d2.setDate(d.getDate()+7); setTo(d2.toISOString().slice(0,16)); }}>Неделя</button>
        </div>
      </div>

      <div className="grid gap-2">
        {isLoading ? <div className="p-3 border rounded-lg" style={{ background: 'var(--card-bg)' }}>Загрузка…</div> : null}
        {error ? <div className="p-3 border rounded-lg text-red-600" style={{ background: 'var(--card-bg)' }}>Ошибка загрузки</div> : null}
        {lessons.length === 0 && !isLoading ? <div className="p-3 border rounded-lg" style={{ background: 'var(--card-bg)' }}>Нет доступных занятий</div> : null}
        {lessons.map((l:any)=> {
          const busy = (l._count?.bookings || 0) > 0;
          return (
            <div key={l.id} className="p-3 border rounded-lg flex items-center gap-2" style={{ background: 'var(--card-bg)' }}>
              <div className="text-sm">
                <div className="font-medium">{l.title}</div>
                <div className="text-muted">{new Date(l.startsAt).toLocaleString()} — {new Date(l.endsAt).toLocaleTimeString()}</div>
                <div className="text-xs text-muted">Логопед: {l.logoped?.name || l.logoped?.email}</div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className={`badge ${busy ? 'badge-error' : 'badge-success'}`}>{busy ? 'Занято' : 'Свободно'}</span>
                <form
                  action={async (fd)=>{ try { await createBooking(fd); setToast('Заявка отправлена'); mutate(); } catch(e:any){ setToast(e?.message||'Ошибка'); } }}
                >
                  <input type="hidden" name="lessonId" value={l.id} />
                  <button className="btn btn-primary btn-sm" disabled={busy}>Записаться</button>
                </form>
              </div>
            </div>
          )
        })}
      </div>
      {toast ? <MobileToast message={toast} onClose={()=>setToast("")} /> : null}
    </div>
  );
}
