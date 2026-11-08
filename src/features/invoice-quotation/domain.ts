import {z} from 'zod';
export const decimal=(whole=12,places=2)=>z.union([z.string(),z.number()]).transform(String).pipe(z.string().regex(new RegExp(places ? `^[0-9]{1,${whole}}(\\.[0-9]{1,${places}})?$` : `^[0-9]{1,${whole}}$`)));
const percent=decimal(3).refine(v=>Number(v)<=100,'Maksimal 100%');
const date=z.iso.date();
export const lineSchema=z.object({description:z.string().trim().min(1).max(2000),quantity:decimal(6,3).refine(v=>Number(v)>0),unit_price:decimal(),unit:z.string().max(30).default(''),discount_rate:percent.default('0')});
export const customerSchema=z.object({id:z.uuid().optional(),name:z.string().trim().min(1).max(120),company_name:z.string().max(120).default(''),email:z.union([z.literal(''),z.email()]).default(''),phone:z.string().max(40).default(''),address:z.string().max(1000).default(''),tax_identifier:z.string().max(80).default(''),notes:z.string().max(2000).default(''),archived:z.boolean().default(false)});
export const itemSchema=z.object({id:z.uuid().optional(),name:z.string().trim().min(1).max(120),description:z.string().max(2000).default(''),type:z.enum(['product','service']).default('service'),unit:z.string().max(30).default(''),default_price:decimal(),archived:z.boolean().default(false)});
export const settingsSchema=z.object({name:z.string().trim().min(1).max(120),address:z.string().max(1000).default(''),email:z.union([z.literal(''),z.email()]).default(''),phone:z.string().max(40).default(''),notes:z.string().max(4000).default(''),terms:z.string().max(4000).default(''),payment_instructions:z.string().max(2000).default(''),quotation_prefix:z.string().regex(/^[A-Z0-9]{1,8}$/).default('QT'),invoice_prefix:z.string().regex(/^[A-Z0-9]{1,8}$/).default('INV'),quotation_days:z.coerce.number().int().min(0).max(365).default(14),due_days:z.coerce.number().int().min(0).max(365).default(14),logo:z.string().max(2800000).regex(/^(data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+)?$/).default('')});
export const draftSchema=z.object({id:z.uuid().optional(),version:z.number().int().positive().optional(),document_type:z.enum(['quotation','invoice']),customer_id:z.uuid(),issue_date:date,valid_until:z.union([date,z.literal('')]).default(''),due_date:z.union([date,z.literal('')]).default(''),discount_rate:percent.default('0'),tax_rate:percent.default('0'),notes:z.string().max(4000).default(''),terms:z.string().max(4000).default(''),payment_instructions:z.string().max(2000).default(''),items:z.array(lineSchema).min(1).max(100)});
const id=z.object({id:z.uuid()});
export const mutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('customer'),payload:customerSchema}),z.object({action:z.literal('item'),payload:itemSchema}),z.object({action:z.literal('settings'),payload:settingsSchema}),z.object({action:z.literal('draft'),payload:draftSchema}),
 z.object({action:z.literal('issue'),payload:id.extend({version:z.number().int().positive()})}),
 ...(['accept','reject','cancel','void','convert'] as const).map(action=>z.object({action:z.literal(action),payload:id})),
 z.object({action:z.literal('payment'),payload:id.extend({amount:decimal(15,0).refine(v=>Number(v)>0),payment_date:date,method:z.enum(['bank','cash','qris','wallet','other']),reference:z.string().max(120).default(''),notes:z.string().max(1000).default(''),idempotency_key:z.uuid()})}),
 z.object({action:z.literal('reverse'),payload:id.extend({payment_id:z.uuid(),reason:z.string().trim().min(3).max(1000)})})]);
export type Line=z.infer<typeof lineSchema>;
export type Customer=z.infer<typeof customerSchema>&{id:string};
export type CatalogItem=z.infer<typeof itemSchema>&{id:string};
export type Settings=z.infer<typeof settingsSchema>;
export type Draft=z.infer<typeof draftSchema>;
export type Payment={id:string;amount:string|number;payment_date:string;method:string;reference:string;reversed_at:string|null;reversal_reason:string|null};
export type Document=Draft & {id:string;version:number;document_number:string|null;lifecycle_status:string;customer_snapshot:Customer;issuer_snapshot:Settings;subtotal:string|number;discount_total:string|number;tax_total:string|number;grand_total:string|number;amount_paid?:number;amount_due?:number;display_status?:string;payments:Payment[];events:{id:string;event:string;created_at:string}[];linked_invoice?:string;source_document_id?:string;created_at:string};
export const statusLabels:Record<string,string>={draft:'Draft',issued:'Diterbitkan',accepted:'Diterima (dicatat manual)',rejected:'Ditolak (dicatat manual)',cancelled:'Dibatalkan',void:'Dibatalkan',unpaid:'Belum dibayar',partially_paid:'Dibayar sebagian',paid:'Lunas',overdue:'Lewat jatuh tempo',expired:'Kedaluwarsa'};
export const money=(n:unknown)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
export const localDate=(zone='Asia/Jakarta')=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function addDays(day:string,n:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
// Fixed-point preview only. PostgreSQL NUMERIC remains the authority for persisted totals.
function fixed(v:string|number,places:number){const [a,b='']=String(v||0).split('.');if(!/^\d+$/.test(a)||!/^\d*$/.test(b)||b.length>places)throw Error('Periksa angka.');return BigInt(a)*10n**BigInt(places)+BigInt(b.padEnd(places,'0'));}
const round=(n:bigint,d:bigint)=>(n+d/2n)/d;
export function calculate(lines:Line[],discount='0',tax='0'){
 const subtotal=lines.reduce((sum,i)=>{const base=round(fixed(i.quantity,3)*fixed(i.unit_price,2),100000n);const rate=fixed(i.discount_rate,2);if(rate>10000n)throw Error('Diskon maksimal 100%.');return sum+base-round(base*rate,10000n);},0n);
 const dr=fixed(discount,2),tr=fixed(tax,2);if(dr>10000n||tr>10000n)throw Error('Persentase maksimal 100%.');const disc=round(subtotal*dr,10000n),tx=round((subtotal-disc)*tr,10000n);
 return {subtotal:subtotal.toString(),discount_total:disc.toString(),tax_total:tx.toString(),grand_total:(subtotal-disc+tx).toString()};
}
export function paymentState(d:Document,today=localDate()) {const paid=(d.payments||[]).filter(p=>!p.reversed_at).reduce((s,p)=>s+BigInt(String(p.amount).split('.')[0]),0n);const due=BigInt(String(d.grand_total).split('.')[0])-paid;const status=d.lifecycle_status!=='issued'?d.lifecycle_status:d.document_type==='quotation'?(d.valid_until&&d.valid_until<today?'expired':'issued'):due<=0?'paid':d.due_date&&d.due_date<today?'overdue':paid>0?'partially_paid':'unpaid';return {paid:paid.toString(),due:due.toString(),status};}
