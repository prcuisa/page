import {notFound} from 'next/navigation';
import Platform from '@/components/platform';
const sections=new Set(['quotations','invoices','customers','items','settings']);
export default async function Page({params}:{params:Promise<{slug:string[]}>}){const {slug}=await params;if(slug.length<1||slug.length>2||!sections.has(slug[0]))notFound();if(slug.length===2&&!/^[0-9a-f-]{36}$/i.test(slug[1]))notFound();return <Platform view="invoice-quotation" iqPath={slug}/>;}
