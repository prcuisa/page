import 'server-only';
import { NextRequest,NextResponse } from 'next/server';
import { configured,serverClient } from './supabase/server';
export const fail=(error:string,status=400)=>NextResponse.json({error},{status,headers:{'Cache-Control':'private, no-store'}});
export async function foundationSession(){
 if(!configured())return {error:fail('Layanan akun belum tersedia.',503)};
 const db=await serverClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return {error:fail('Silakan masuk kembali.',401)};
 return {db,user};
}
export async function foundationBody(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)throw new Error('ORIGIN');
 if(Number(req.headers.get('content-length')||0)>12000)throw new Error('SIZE');
 const raw=await req.text();if(new TextEncoder().encode(raw).length>12000)throw new Error('SIZE');return JSON.parse(raw);
}
export function foundationError(e:{code?:string;message?:string}){
 if(e.code==='42501')return fail('Kamu belum memiliki izin untuk tindakan ini, atau undangannya tidak berlaku.',403);
 if(e.message?.includes('RATE_LIMIT'))return fail('Terlalu banyak tindakan. Tunggu sebentar lalu coba lagi.',429);
 if(e.message?.includes('ALREADY_MEMBER'))return fail('Akun tersebut sudah menjadi anggota bisnis ini.',409);
 if(e.message?.includes('TOOL_NOT_INTEGRATED'))return fail('Tool harus terhubung dan tersedia sebelum ditandai aktif atau dirilis.');
 if(e.message==='ORIGIN')return fail('Permintaan tidak dapat diproses.',403);
 if(e.message==='SIZE')return fail('Isian terlalu panjang.',413);
 return fail('Periksa isian dan aksesmu, lalu coba lagi.',400);
}
