import Platform from '@/components/platform';
import {configured,serverClient} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function Page(){let authenticated=false;if(configured()){const db=await serverClient();const {data:{user}}=await db.auth.getUser();authenticated=!!user;}return <Platform view="home" preview={!authenticated}/>}
