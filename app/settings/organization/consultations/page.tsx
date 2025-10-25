"use client";
import React from "react";
import MobileFAB from "@/components/mobile/MobileFAB";
import {
  approveOrgConsultationRequest,
  rejectOrgConsultationRequest,
  listOrgConsultationsInbox,
  listOrgConsultationsOutbox,
  createOrgConsultationRequest,
} from "./actions";

// no-op fetcher was unused; removed to satisfy eslint

export default function ConsultationsPage() {
  const [tab, setTab] = React.useState<"inbox" | "outbox">("inbox");
  const [newTargetId, setNewTargetId] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [note, setNote] = React.useState("");
  const [newOpen, setNewOpen] = React.useState(false);
  const [people, setPeople] = React.useState<{id:string;name:string|null;email:string;role:string;branchId:string|null}[]>([]);
  const [loadingPeople, setLoadingPeople] = React.useState(false);
  const [peopleQuery, setPeopleQuery] = React.useState("");
  const [onlyLogopeds, setOnlyLogopeds] = React.useState(false);
  const [summary, setSummary] = React.useState<{inboxPending:number; inboxNew:number; outboxPending:number} | null>(null);

  React.useEffect(()=>{
    if (!newOpen) return;
    let ignore = false;
    (async()=>{
      setLoadingPeople(true);
      try {
        const res = await fetch('/api/org-people');
        const json = await res.json();
        if (!ignore && Array.isArray(json?.users)) setPeople(json.users);
      } catch {}
      finally { if (!ignore) setLoadingPeople(false); }
    })();
    return ()=>{ ignore = true };
  }, [newOpen]);

  React.useEffect(()=>{
    let ignore = false;
    (async()=>{
      try { const r = await fetch('/api/org-consultations/summary'); const j = await r.json(); if (!ignore && !j?.error) setSummary(j); } catch {}
    })();
    return ()=>{ ignore = true };
  }, [tab]);

  // SSR actions are not directly callable on client, so we provide API routes later if needed.
  // For MVP, we'll call actions through forms.

  return (
    <div className="max-w-screen-md mx-auto p-3 relative">
      <div className="mb-3 flex items-center gap-2">
        <button
          className={`btn btn-sm ${tab === "inbox" ? "btn-primary" : "btn-outline"}`}
          onClick={() => setTab("inbox")}
        >
          Входящие {summary?.inboxNew ? (<span className="ml-1 badge badge-error">{summary.inboxNew}</span>) : null}
        </button>
        <button
          className={`btn btn-sm ${tab === "outbox" ? "btn-primary" : "btn-outline"}`}
          onClick={() => setTab("outbox")}
        >
          Исходящие {summary?.outboxPending ? (<span className="ml-1 badge">{summary.outboxPending}</span>) : null}
        </button>
      </div>

      {/* Модалка создания запроса */}
      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" role="dialog" aria-modal>
          <div className="w-full sm:max-w-md rounded-t-xl sm:rounded-xl shadow-lg" style={{ background: 'var(--card-bg)' }}>
            <div className="p-3 border-b flex items-center">
              <div className="font-medium">Новый запрос консультации</div>
              <button className="ml-auto btn btn-ghost btn-sm" onClick={()=>setNewOpen(false)}>Закрыть</button>
            </div>
            <form
              action={async (formData) => {
                try {
                  await createOrgConsultationRequest(formData);
                  setNewTargetId("");
                  setTopic("");
                  setNote("");
                  setNewOpen(false);
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : "Ошибка";
                  alert(msg);
                }
              }}
              className="p-3 grid gap-2"
              style={{ background: 'var(--card-bg)' }}
            >
              <label className="text-sm text-muted">Адресат</label>
              <select
                name="targetId"
                value={newTargetId}
                onChange={(e)=>setNewTargetId(e.target.value)}
                className="select select-bordered w-full"
                required
              >
                <option value="" disabled>{loadingPeople ? 'Загрузка…' : 'Выберите пользователя'}</option>
                {people
                  .filter(p=> !onlyLogopeds || p.role === 'LOGOPED')
                  .filter(p=> {
                    const q = peopleQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (p.name||'').toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
                  })
                  .map(p=> (
                  <option key={p.id} value={p.id}>{p.name || p.email} • {p.role}</option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <input className="input input-bordered w-full" placeholder="Поиск (имя/почта)" value={peopleQuery} onChange={e=>setPeopleQuery(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox checkbox-sm" checked={onlyLogopeds} onChange={e=>setOnlyLogopeds(e.target.checked)} /> Только логопеды</label>
              </div>
              <label className="text-sm text-muted">Тема</label>
              <input
                name="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="input input-bordered w-full"
                placeholder="Коротко о запросе"
              />
              <label className="text-sm text-muted">Примечание</label>
              <textarea
                name="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="textarea textarea-bordered w-full"
                placeholder="Дополнительная информация"
              />
              <div className="mt-2">
                <button className="btn btn-primary w-full">Отправить</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConsultationsList tab={tab} />
      <MobileFAB icon="➕" label="Запрос" onClick={()=>setNewOpen(true)} />
    </div>
  );
}

function ConsultationsList({ tab }: { tab: "inbox" | "outbox" }) {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [reason, setReason] = React.useState("");
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  type OrgConsultationItem = {
    id: string;
    createdAt: string | Date;
    status: "PENDING" | "APPROVED" | "REJECTED" | (string & {});
    topic: string | null;
    note: string | null;
    requester?: { name?: string | null; email?: string | null } | null;
    target?: { name?: string | null; email?: string | null } | null;
  };

  const onApprove = async (id: string) => {
    setLoadingId(id);
    const fd = new FormData();
    fd.set("id", id);
    try {
      await approveOrgConsultationRequest(fd);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      alert(msg);
    } finally {
      setLoadingId(null);
      setRefreshKey((v) => v + 1);
    }
  };
  const onReject = async (id: string) => {
    setLoadingId(id);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("reason", reason);
    try {
      await rejectOrgConsultationRequest(fd);
      setReason("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      alert(msg);
    } finally {
      setLoadingId(null);
      setRefreshKey((v) => v + 1);
    }
  };

  const [items, setItems] = React.useState<OrgConsultationItem[]>([]);
  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const list = tab === "inbox" ? await listOrgConsultationsInbox() : await listOrgConsultationsOutbox();
        if (!ignore) setItems((list as unknown as OrgConsultationItem[]) || []);
      } catch {
        if (!ignore) setItems([]);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [tab, refreshKey]);

  return (
    <div className="grid gap-2">
      {items.length === 0 ? (
        <div className="p-6 text-center text-muted border rounded-lg" style={{ background: 'var(--card-bg)' }}>Нет записей</div>
      ) : (
        items.map((it) => (
          <div key={it.id} className="border rounded-lg p-3" style={{ background: 'var(--card-bg)' }}>
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted">{new Date(it.createdAt).toLocaleString()}</div>
              <div className="ml-auto text-xs">
                <StatusBadge status={it.status} />
              </div>
            </div>
            <div className="mt-1 font-medium">{it.topic || "(без темы)"}</div>
            <div className="text-sm text-muted whitespace-pre-line">{it.note || ""}</div>
            <div className="text-xs text-muted mt-1">
              {tab === "inbox" ? (
                <>
                  От: {it.requester?.name || it.requester?.email}
                </>
              ) : (
                <>
                  Кому: {it.target?.name || it.target?.email}
                </>
              )}
            </div>
            {tab === "inbox" && it.status === "PENDING" ? (
              <div className="mt-2 flex items-center gap-2">
                <button className="btn btn-sm btn-success" disabled={loadingId === it.id} onClick={() => onApprove(it.id)}>Подтвердить</button>
                <input
                  className="input input-sm input-bordered"
                  placeholder="Причина (необязательно)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <button className="btn btn-sm btn-error" disabled={loadingId === it.id} onClick={() => onReject(it.id)}>Отклонить</button>
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "badge badge-warning",
    APPROVED: "badge badge-success",
    REJECTED: "badge badge-error",
  };
  return <span className={map[status] || "badge"}>{status}</span>;
}
