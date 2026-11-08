import {NextRequest} from 'next/server';
import {z} from 'zod';
import {foundationSession,fail} from '@/lib/foundation-server';
import {renderPDF} from '@/features/invoice-quotation/pdf';
import {iqError} from '@/features/invoice-quotation/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{const s=await foundationSession();if('error'in s)return s.error;const w=z.uuid().parse(req.nextUrl.searchParams.get('workspace')),id=z.uuid().parse(req.nextUrl.searchParams.get('id'));const {data,error}=await s.db.rpc('iq_pdf_document',{w,doc:id});if(error)return iqError(error);const bytes=await renderPDF(data);const {error:meterError}=await s.db.rpc('iq_pdf_record',{w,doc:id});if(meterError)return iqError(meterError);return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${String(data.document_number||'draft').replace(/[^a-zA-Z0-9_-]/g,'_')}.pdf"`,'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});}catch{return fail('PDF belum berhasil dibuat. Coba lagi atau periksa logo bisnis.',503);}}
