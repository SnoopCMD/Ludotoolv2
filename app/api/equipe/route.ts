import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase'; // Ajuste le chemin si besoin

export async function GET() {
  const { data, error } = await supabase.from('equipe').select('*').order('nom');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}