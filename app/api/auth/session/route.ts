import { NextResponse } from 'next/server';
import { compteCourant } from '../../../../lib/auth';

export async function GET() {
  return NextResponse.json({ compte: await compteCourant() });
}
