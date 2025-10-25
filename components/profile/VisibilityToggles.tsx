"use client"
import React from "react"

type Props = {
  initialShowAbout: boolean
  initialShowEducation: boolean
}

export default function VisibilityToggles({ initialShowAbout, initialShowEducation }: Props) {
  const [showAbout, setShowAbout] = React.useState<boolean>(initialShowAbout)
  const [showEdu, setShowEdu] = React.useState<boolean>(initialShowEducation)

  // Sync with props after server redirect so that the UI reflects saved values immediately
  React.useEffect(() => { setShowAbout(initialShowAbout) }, [initialShowAbout])
  React.useEffect(() => { setShowEdu(initialShowEducation) }, [initialShowEducation])

  return (
    <>
      <label className="inline-flex items-center gap-2 text-xs text-muted mt-1">
        {/* ensure a value is always submitted */}
        <input type="hidden" name="showAboutToParents" value="off" />
        <input
          type="checkbox"
          name="showAboutToParents"
          value="on"
          checked={showAbout}
          onChange={(e)=>setShowAbout(e.target.checked)}
        />
        Показывать раздел «О себе» родителям
      </label>
      <label className="inline-flex items-center gap-2 text-xs text-muted mt-1">
        <input type="hidden" name="showEducationToParents" value="off" />
        <input
          type="checkbox"
          name="showEducationToParents"
          value="on"
          checked={showEdu}
          onChange={(e)=>setShowEdu(e.target.checked)}
        />
        Показывать раздел «Образование» родителям
      </label>
    </>
  )
}
