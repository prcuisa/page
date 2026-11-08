'use client';

import { useEffect, useState } from 'react';
import { UsersRound } from 'lucide-react';

type Proof = { available: true; userBucket: number; windowDays: number; activityDaysRequired: number };

export default function PublicUsageProof() {
  const [proof, setProof] = useState<Proof | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/public/routine-usage', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (live && result?.available && Number(result.userBucket) >= 10) setProof(result as Proof);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (!proof) return null;
  return (
    <aside className="public-usage-proof" aria-label="Penggunaan PRCUISA">
      <span className="public-usage-proof-icon" aria-hidden="true"><UsersRound size={17} /></span>
      <p><strong>{proof.userBucket}+</strong> pengguna menyelesaikan aktivitas tool PRCUISA di beberapa hari berbeda dalam 7 hari terakhir.</p>
    </aside>
  );
}
