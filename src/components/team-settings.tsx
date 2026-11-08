'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Users,UserPlus} from 'lucide-react';
import {emptyFoundation,roleLabels,type TeamData} from '@/lib/foundation';
export default function TeamSettings({workspaceId,preview=false}:{workspaceId?:string;preview?:boolean}){
 const [data,setData]=useState<TeamData>(emptyFoundation),[busy,setBusy]=useState(false),[loading,setLoading]=useState(!preview),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function load(){if(preview)return;setLoading(true);setError('');try{const r=await fetch('/api/foundation'+(workspaceId?'?workspace='+workspaceId:''),{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setData(d);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{void load();},[workspaceId,preview]);
 async function act(action:string,payload:Record<string,unknown>){if(preview){setNotice('Undangan dan perubahan anggota tersedia setelah masuk ke PRCUISA ID.');return;}setBusy(true);setError('');setNotice('');try{const r=await fetch('/api/foundation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,workspace:workspaceId,payload})});const d=await r.json();if(!r.ok)throw Error(d.error);if(action==='accept'){location.assign('/dashboard?workspace='+d.workspace_id);return;}setNotice(action==='invite'?'Undangan dibuat. Akun dengan email tersebut dapat menerima melalui halaman Undangan.':'Perubahan berhasil disimpan.');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="team-settings"><div className="section-head"><h2><Users size={19}/> Anggota bisnis</h2><Link href="/invitations">Undangan saya</Link></div>
 <p className="meta">Pemilik mengelola akses. Anggota menggunakan PRCUISA ID masing-masing untuk bekerja di bisnis yang sama.</p>
 {preview&&<p className="foundation-note">Mode preview. Akses anggota hanya berubah setelah kamu masuk dan mengelola bisnis nyata.</p>}
 {error&&<div role="alert" className="error-box">{error}<button onClick={()=>void load()}>Coba lagi</button></div>}{notice&&<p role="status" className="foundation-note">{notice}</p>}
 {loading?<p role="status">Memuat anggota…</p>:<>
 {data.invitations.length>0&&<section className="foundation-section"><h3>Undangan untukmu</h3>{data.invitations.map(i=><article className="foundation-row" key={i.id}><div><strong>{i.business}</strong><p>{roleLabels[i.role]} · berlaku sampai {new Date(i.expires_at).toLocaleDateString('id-ID')}</p></div><button disabled={busy} onClick={()=>void act('accept',{id:i.id})}>Terima undangan</button></article>)}</section>}
 {!workspaceId&&data.invitations.length===0&&<p className="quiet-empty">Belum ada undangan aktif untuk email PRCUISA ID kamu. Pastikan email sudah diverifikasi.</p>}
 {workspaceId&&<><div className="foundation-list">{data.members.map(m=><article className="foundation-row" key={m.user_id}><div><strong>{m.email||'Anggota bisnis'}</strong><p>{roleLabels[m.role]}</p></div>{data.role==='owner'&&m.role!=='owner'&&<div className="foundation-row-actions"><select aria-label={'Akses '+(m.email||m.user_id)} value={m.role} disabled={busy} onChange={e=>void act('role',{user_id:m.user_id,role:e.target.value})}><option value="viewer">Hanya melihat</option><option value="editor">Bisa mencatat</option></select><button disabled={busy} onClick={()=>{if(confirm('Hapus akses anggota ini dari bisnis?'))void act('remove',{user_id:m.user_id});}}>Hapus akses</button></div>}</article>)}</div>
 {(data.role==='owner'||preview)&&<form className="operational-form foundation-section" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void act('invite',{email:f.get('email'),role:f.get('role')});}}><h3><UserPlus size={17}/> Undang anggota</h3><label>Email PRCUISA ID<input name="email" type="email" placeholder="nama@contoh.com" required maxLength={254}/></label><label>Akses<select name="role" defaultValue="viewer"><option value="viewer">Hanya melihat data</option><option value="editor">Melihat dan menambah catatan</option></select></label><p className="meta">Undangan berlaku 7 hari dan tersedia setelah penerima masuk dengan email terverifikasi. Tidak ada email yang dikirim otomatis. Bagikan alamat halaman Undangan melalui saluran pilihanmu.</p><button className="primary" disabled={busy}>{busy?'Memproses…':'Buat undangan'}</button></form>}
 {data.sent.length>0&&<section className="foundation-section"><h3>Menunggu diterima</h3>{data.sent.map(i=><article className="foundation-row" key={i.id}><div><strong>{i.email}</strong><p>{roleLabels[i.role]}</p></div><button disabled={busy} onClick={()=>void act('revoke',{id:i.id})}>Batalkan undangan</button></article>)}</section>}
 {data.role==='viewer'&&<p className="foundation-note">Aksesmu hanya melihat. Hubungi pemilik bisnis untuk izin menambah catatan.</p>}
 </>}
 </>}
 </section>;
}
