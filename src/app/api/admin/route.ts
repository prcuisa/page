import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {foundationSession,foundationBody,foundationError,fail} from '@/lib/foundation-server';
export const dynamic='force-dynamic';
const statuses=z.enum(['reviewing','planned','building','beta','released','declined']);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('app'),payload:z.object({slug:z.string().regex(/^[a-z][a-z0-9-]{1,59}$/),name:z.string().trim().min(1).max(80),description:z.string().trim().min(1).max(300),category:z.enum(['Bisnis','Utilitas','AI']),status:z.enum(['active','beta','coming_soon','deprecated','private']),is_public:z.boolean(),keywords:z.string().max(500).default('')})}),
 z.object({action:z.literal('group'),payload:z.object({id:z.uuid().optional(),title:z.string().trim().min(3).max(120),description:z.string().max(1000),status:statuses,is_public:z.boolean(),app_id:z.string().max(60).nullable()})}),
 z.object({action:z.literal('request'),payload:z.object({id:z.uuid(),status:z.enum(['submitted','reviewing','planned','building','beta','released','declined']),group_id:z.uuid().nullable()})}),
 z.object({action:z.literal('entitlement'),payload:z.object({plan_id:z.enum(['free','pro','business']),capability:z.string().min(1).max(60),enabled:z.boolean(),monthly_limit:z.number().int().min(0).max(2147483647).nullable()})}),
 z.object({action:z.literal('billing'),payload:z.object({plan_id:z.enum(['pro','business']),amount_idr:z.number().int().min(1).max(100000000),period_days:z.number().int().min(1).max(366),active:z.boolean()})}),
]);
export async function GET(){try{const s=await foundationSession();if('error' in s)return s.error;const {data,error}=await s.db.rpc('admin_snapshot');if(error)return foundationError(error);return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});}catch{return fail('Panel admin belum berhasil dimuat.',503);}}
export async function POST(req:NextRequest){try{const body=schema.parse(await foundationBody(req));const s=await foundationSession();if('error' in s)return s.error;const {data,error}=await s.db.rpc('admin_action',{p_action:body.action,p_payload:body.payload});if(error)return foundationError(error);return NextResponse.json(data);}catch(e){return foundationError(e as Error);}}
