'use client'

import { useEffect, useRef } from 'react'

/**
 * Cloudflare Turnstile widget (explicit render, dark theme). Rendered only when
 * the parent has a site key. `resetSignal` bumps after a failed submit: tokens
 * are single-use, so the widget must re-challenge before a retry. `onToken`
 * receives '' on expiry/error so the form can hold submit until a fresh token.
 */
type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export function Turnstile({
  siteKey,
  onToken,
  resetSignal = 0
}: {
  siteKey: string
  onToken: (token: string) => void
  resetSignal?: number
}): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const cb = useRef(onToken)
  cb.current = onToken

  useEffect(() => {
    let cancelled = false
    const mount = () => {
      if (cancelled || !box.current || !window.turnstile || widgetId.current) return
      widgetId.current = window.turnstile.render(box.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (t: string) => cb.current(t),
        'expired-callback': () => cb.current(''),
        'error-callback': () => cb.current('')
      })
    }
    let script: HTMLScriptElement | null = null
    if (window.turnstile) mount()
    else {
      script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
      if (!script) {
        script = document.createElement('script')
        script.src = SCRIPT_SRC
        script.async = true
        document.head.appendChild(script)
      }
      script.addEventListener('load', mount)
    }
    return () => {
      cancelled = true
      script?.removeEventListener('load', mount)
      if (widgetId.current) window.turnstile?.remove(widgetId.current)
      widgetId.current = null
    }
  }, [siteKey])

  useEffect(() => {
    if (resetSignal && widgetId.current) {
      cb.current('')
      window.turnstile?.reset(widgetId.current)
    }
  }, [resetSignal])

  return <div ref={box} className="flex min-h-[65px] justify-center" data-testid="turnstile" />
}

/** Header the better-auth captcha plugin reads; omitted when captcha is off. */
export const captchaFetchOptions = (token: string) =>
  token ? { headers: { 'x-captcha-response': token } } : undefined
