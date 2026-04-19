import { NextResponse } from 'next/server';
import { getIdentityHeader } from '@/lib/identity';
import { db } from '@/lib/db';

const headers = { 'X-Powered-By': getIdentityHeader() };

export async function GET() {
  try {
    const baseUrl = process.env.STOCK_SERVER_BASE_URL || 'http://localhost:9999';
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/clients`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Stock server clients failed: ${res.status}`,
          details: json,
          timestamp: new Date().toISOString(),
        },
        { status: 502, headers }
      );
    }

    // Persist client snapshot (best-effort)
    try {
      const payload = json as any;
      const clients = payload?.data?.clients || payload?.clients || [];
      if (Array.isArray(clients)) {
        const now = new Date();
        for (const c of clients) {
          const clientId = typeof c?.clientId === 'string' ? c.clientId : null;
          const sessionId = typeof c?.sessionId === 'string' ? c.sessionId : null;
          if (!clientId || !sessionId) continue;
          await db.editorClientConnection.upsert({
            where: { clientId },
            create: {
              clientId,
              sessionId,
              lastPingAt: now,
            },
            update: {
              sessionId,
              lastPingAt: now,
              disconnectedAt: null,
            },
          });
        }
      }
    } catch {
      // best-effort, do not fail request
    }

    return NextResponse.json(
      { success: true, data: json, timestamp: new Date().toISOString() },
      { status: 200, headers }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch stock clients',
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers }
    );
  }
}
