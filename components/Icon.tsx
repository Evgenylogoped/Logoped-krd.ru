"use client"
import React from 'react'

type IconProps = {
  name: 'logoped' | 'clients' | 'calendar' | 'settings' | 'logout' | 'login' | 'star' | 'medal' | 'cup' | 'plus' | 'trash' | 'photo' | 'phone' | 'whatsapp' | 'max' | 'bell' | 'user' | 'lock' | 'home' | 'search'
  className?: string
}

export default function Icon({ name, className }: IconProps) {
  const cn = className || 'w-4 h-4'
  switch (name) {
    case 'logoped':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z"/>
          <path d="M3 21a9 9 0 0 1 18 0"/>
        </svg>
      )
    case 'clients':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"/>
          <path d="M6 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Z"/>
          <path d="M2 21a6 6 0 0 1 12 0"/>
          <path d="M14 21a7 7 0 0 1 8-7"/>
        </svg>
      )
    case 'calendar':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
      )
    case 'settings':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 15a3 3 0 1 0-3-3 3 3 0 0 0 3 3Z"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1.82v.08a2 2 0 1 1-4 0v-.08a1.65 1.65 0 0 0-.33-1.82 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.82-.33H2a2 2 0 1 1 0-4h.08a1.65 1.65 0 0 0 1.82-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 6.94 2.8l.06.06A1.65 1.65 0 0 0 8 3.4a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1.82V1a2 2 0 1 1 4 0v.08a1.65 1.65 0 0 0 .33 1.82 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.6 8a1.65 1.65 0 0 0 .6 1 1.65 1.65 0 0 0 1.82.33H23a2 2 0 1 1 0 4h-.08a1.65 1.65 0 0 0-1.82.33 1.65 1.65 0 0 0-.6 1Z"/>
        </svg>
      )
    case 'logout':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <path d="M16 17l5-5-5-5"/>
          <path d="M21 12H9"/>
        </svg>
      )
    case 'login':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
          <path d="M10 17l-5-5 5-5"/>
          <path d="M3 12h12"/>
        </svg>
      )
    case 'star':
      return (<svg className={cn} viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>)
    case 'medal':
      return (<svg className={cn} viewBox="0 0 24 24" fill="currentColor"><path d="M12 17a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2l3 3 1-4 4-1-3-3"/></svg>)
    case 'cup':
      return (<svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 21h8"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M5 8a2 2 0 0 1-2-2V5h2"/><path d="M19 8a2 2 0 0 0 2-2V5h-2"/></svg>)
    case 'plus':
      return (<svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14"/></svg>)
    case 'trash':
      return (<svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>)
    case 'photo':
      return (<svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M10 10l2 2 3-3 4 5"/><circle cx="7" cy="10" r="2"/></svg>)
    case 'phone':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72 12.66 12.66 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.66 12.66 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z"/>
        </svg>
      )
    case 'whatsapp':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.149-.67.15-.198.297-.767.966-.94 1.165-.173.198-.347.223-.644.074-.297-.148-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.654-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.373-.025-.522-.075-.149-.669-1.613-.916-2.206-.242-.58-.487-.5-.669-.51l-.57-.01c-.198 0-.521.074-.793.372-.272.298-1.041 1.016-1.041 2.479 0 1.462 1.066 2.875 1.213 3.074.149.198 2.1 3.2 5.083 4.487.71.306 1.263.489 1.694.626.712.227 1.36.195 1.872.118.571-.085 1.758-.718 2.006-1.41.248-.69.248-1.282.173-1.41-.074-.124-.272-.198-.57-.347z"/>
          <path d="M20.52 3.48A11.94 11.94 0 0 0 12 0C5.373 0 0 5.373 0 12c0 2.114.553 4.096 1.52 5.82L0 24l6.38-1.48A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12 0-3.19-1.242-6.096-3.48-8.52zM12 22a9.93 9.93 0 0 1-5.062-1.387l-.363-.215-3.778.88.805-3.687-.23-.378A9.94 9.94 0 1 1 12 22z"/>
        </svg>
      )
    case 'max':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 5h18v14H3z"/>
          <path d="M3 5l9 7 9-7"/>
        </svg>
      )
    case 'bell':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 8a6 6 0 1 1 12 0v5l2 3H4l2-3V8Z"/>
          <path d="M10 19a2 2 0 0 0 4 0"/>
        </svg>
      )
    case 'user':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z"/>
          <path d="M3 21a9 9 0 0 1 18 0"/>
        </svg>
      )
    case 'lock':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="5" y="11" width="14" height="10" rx="2"/>
          <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
        </svg>
      )
    case 'home':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 11l9-7 9 7"/>
          <path d="M5 10v10h14V10"/>
        </svg>
      )
    case 'search':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="7"/>
          <path d="M20 20l-3.5-3.5"/>
        </svg>
      )
    default:
      return null
  }
}
