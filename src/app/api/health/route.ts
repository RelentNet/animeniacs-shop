import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'animeniacs-app',
    version: process.env.npm_package_version ?? '0.0.0',
    uptimeSec: Math.floor(process.uptime())
  })
}
