import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {foundationSession,foundationBody,foundationError,fail} from '@/lib/foundation-server';
export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('invite'),workspace:z.uuid(),payload:z.object({email:z.email().max(254),role:z.enum(['viewer','editor'])})}),
 z.object({action:z.literal('accept'),workspace:z.uuid().optional(),payload:z.object({id:z.uuid()})}),
 z.object({action:z.literal('revoke'),workspace:z.uuid(),payload:z.object({id:z.uuid()})}),
 z.object({action:z.literal('remove'),workspace:z.uuid(),payload:z.object({user_id:z.uuid()})}),
 z.object({action:z.literal('role'),workspace:z.uuid(),payload:z.object({user_id:z.uuid(),role:z.enum(['viewer','editor'])})}),
 z.object({action:z.literal('vote'),workspace:z.uuid(),payload:z.object({id:z.uuid(),voted:z.boolean()})}),
]);
export async function GET(req:NextRequest){try{
 const session=await foundationSession();if('error' in session)return session.error;
 const workspace=req.nextUrl.searchParams.get('workspace');if(workspace&&!z.uuid().safeParse(workspace).success)return fail('Pilih bisnis yang valid.');
 const {data,error}=await session.db.rpc('foundation_snapshot',{p_workspace:workspace});if(error)return foundationError(error);
 return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
}catch{return fail('Data belum berhasil dimuat.',503);}}
export async function POST(req:NextRequest){try{
 const body=schema.parse(await foundationBody(req));const session=await foundationSession();if('error' in session)return session.error;
 const {data,error}=await session.db.rpc('foundation_action',{p_action:body.action,p_workspace:body.workspace||null,p_payload:body.payload});if(error)return foundationError(error);
 return NextResponse.json(data);
}catch(e){return foundationError(e as Error);}}
