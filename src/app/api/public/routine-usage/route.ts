import { NextResponse } from 'next/server';
import { configured, serverClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Public social proof is a coarse aggregate only; never return identity data. */
export async function GET() {
  const headers = { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' };
  if (!configured()) return NextResponse.json({ available: false }, { headers });

  try {
    const db = await serverClient();
    const { data, error } = await db.rpc('public_routine_usage_proof');
    if (error || !data?.available || !Number.isFinite(Number(data.user_bucket)) || Number(data.user_bucket) < 10) {
      return NextResponse.json({ available: false }, { headers });
    }
    return NextResponse.json(
      { available: true, userBucket: Number(data.user_bucket), windowDays: 7, activityDaysRequired: 2 },
      { headers },
    );
  } catch {
    return NextResponse.json({ available: false }, { headers });
  }
}
