import {redirect} from 'next/navigation';
import {serverClient} from '@/lib/supabase/server';
import AdminConsole from '@/components/admin-console';
export default async function Page(){const db=await serverClient();const {data,error}=await db.rpc('is_platform_admin');if(error||!data)redirect('/dashboard');return <AdminConsole/>;}
