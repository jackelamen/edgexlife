import { useEffect, useState } from 'react'

const QUERY = '(max-width: 1023px)'

/**
 * True below the desktop breakpoint (the same 1024px the CSS uses for the
 * sidebar/bottom-nav switch). For the few places where the phone layout
 * needs different structure rather than different styling, e.g. cards that
 * fold away (Card's `fold` prop in components/ui/Kit.jsx).
 */
export function usePhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const on = () => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}
