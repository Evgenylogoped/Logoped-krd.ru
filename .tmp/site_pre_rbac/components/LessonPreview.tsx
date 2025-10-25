"use client"
import React from "react"

type Eval = {
  status?: string | null
  showToParent?: boolean | null
  homeworkRating?: number | null
  lessonRating?: number | null
  behaviorRating?: number | null
  comment?: string | null
}

type Props = {
  trigger: React.ReactNode
  child: { name: string; photoUrl?: string | null }
  evaluations?: Eval[]
}

export default function LessonPreview({ trigger, child, evaluations = [] }: Props) {
  const [open, setOpen] = React.useState(false)
  const publicEvs = (evaluations || []).filter(ev => ev && (ev.status === 'DONE' || ev.showToParent))
  return (
    <>
      <button type="button" className="underline" onClick={() => setOpen(true)}>
        {trigger}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={()=>setOpen(false)}>
          <div className="w-[92%] max-w-sm rounded-xl bg-white p-4 shadow-lg" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <img src={child.photoUrl || '/avatar-child.svg'} alt={child.name} className="h-16 w-16 rounded-md object-cover" />
              <div className="min-w-0">
                <div className="font-semibold text-base break-words">{child.name}</div>
              </div>
            </div>
            {publicEvs.length > 0 && (
              <div className="mt-3 space-y-2 text-sm">
                <div className="text-muted text-xs">Оценка логопеда</div>
                {publicEvs.map((ev, idx)=> (
                  <div key={idx} className="rounded border p-2 bg-gray-50">
                    <div className="grid gap-1 sm:grid-cols-3">
                      <div>Д/З: {ev.homeworkRating ?? '—'}</div>
                      <div>Занятие: {ev.lessonRating ?? '—'}</div>
                      <div>Поведение: {ev.behaviorRating ?? '—'}</div>
                    </div>
                    {ev.comment && <div className="text-xs text-muted mt-1">Комментарий: {ev.comment}</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-end">
              <button className="btn btn-outline btn-sm" onClick={()=>setOpen(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
