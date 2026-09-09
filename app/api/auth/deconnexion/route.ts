import { NextResponse } from 'next/server';
import { supprimerSession } from '../../../../lib/auth';

export async function POST() {
  try {
    await supprimerSession();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
