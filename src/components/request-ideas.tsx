'use client';
import {useEffect,useState} from 'react';
import {ThumbsUp} from 'lucide-react';
import {type Idea,ideaLabels} from '@/lib/foundation';
export default function RequestIdeas({workspaceId,preview}:{workspaceId:string;preview:boolean}){
 const [ideas,setIdeas]=useState<Idea[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(!preview),[busy,setBusy]=useState('');
 async function load(){if(preview)return;setLoading(true);setError('');try{const r=await fetch('/api/foundation?workspace='+workspaceId,{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setIdeas(d.ideas);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{void load();},[workspaceId,preview]);
 async function vote(idea:Idea){setBusy(idea.id);setError('');try{const r=await fetch('/api/foundation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'vote',workspace:workspaceId,payload:{id:idea.id,voted:!idea.voted}})});const d=await r.json();if(!r.ok)throw Error(d.error);await load();}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 return <section className="foundation-section"><h2>Dukung kebutuhan yang sama</h2><p className="meta">Ide yang sedang ditinjau PRCUISA. Satu dukungan per PRCUISA ID.</p>{error&&<p role="alert">{error}<button onClick={()=>void load()}>Coba lagi</button></p>}{loading?<p role="status">Memuat ide…</p>:ideas.length?ideas.map(i=><article key={i.id} className="idea-row"><div><span className="tag">{ideaLabels[i.status]}</span><h3>{i.title}</h3><p>{i.description}</p></div><button disabled={!!busy||['released','declined'].includes(i.status)} aria-pressed={i.voted} aria-label={(i.voted?'Batalkan dukungan ':'Dukung ')+i.title} onClick={()=>void vote(i)}><ThumbsUp size={16}/>{i.votes} dukungan</button></article>):<div className="quiet-empty"><p>Belum ada ide yang dipublikasikan.</p><span className="meta">Ceritakan kebutuhanmu melalui formulir di atas. Isi permintaan pribadimu tidak otomatis ditampilkan kepada pengguna lain.</span></div>}</section>;
}
