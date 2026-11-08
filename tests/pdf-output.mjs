import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import {PDFDocument} from '../src/vendor/pdf-lib.js';
const root=new URL('../',import.meta.url);
const source=await readFile(new URL('src/features/invoice-quotation/pdf.ts',root),'utf8');
const directory=await mkdtemp(join(tmpdir(),'prcuisa-pdf-'));
const compiled=stripTypeScriptTypes(source,{mode:'transform'})
 .replace('@/vendor/pdf-lib',new URL('src/vendor/pdf-lib.js',root).href)
 .replace('./domain',new URL('src/features/invoice-quotation/domain.ts',root).href);
await writeFile(join(directory,'renderer.mjs'),compiled);
const {renderPDF}=await import(pathToFileURL(join(directory,'renderer.mjs')).href);
const doc={document_type:'quotation',document_number:'DEMO-QT-0001',created_at:'2026-10-14T00:00:00Z',issue_date:'2026-10-14',valid_until:'2026-10-28',items:[{description:'Jasa konsultasi',quantity:'1',unit:'jam',unit_price:'50000',discount_rate:'0',line_total:50000}],issuer_snapshot:{name:'Bisnis Uji',logo:'',email:'bisnis@example.test',phone:'',address:''},customer_snapshot:{name:'Pelanggan Uji',company_name:'',email:'pelanggan@example.test',phone:'',address:''},subtotal:50000,discount_total:0,tax_total:0,grand_total:50000,discount_rate:'0',tax_rate:'0',notes:'Terima kasih',terms:'',payment_instructions:'',due_date:''};
const bytes=await renderPDF(doc,{demo:true});
assert.equal(Buffer.from(bytes).subarray(0,5).toString(),'%PDF-');
const pdf=await PDFDocument.load(bytes);
assert.equal(pdf.getPageCount(),1);
assert.match(pdf.getTitle(),/DEMO-QT-0001/);
assert.deepEqual(pdf.getPage(0).getSize(),{width:595.28,height:841.89});
assert.deepEqual(await renderPDF(doc,{demo:true}),bytes,'A repeated snapshot produces the same PDF');
const large=await renderPDF({...doc,items:Array.from({length:70},(_,index)=>({...doc.items[0],description:`${index+1}. Jasa dengan deskripsi panjang `.repeat(7)}))});
assert.ok((await PDFDocument.load(large)).getPageCount()>1);
await assert.rejects(()=>renderPDF({...doc,issuer_snapshot:{...doc.issuer_snapshot,logo:'data:image/png;base64,broken'}}));
await writeFile('/tmp/prcuisa-quotation-qa.pdf',bytes);
await rm(directory,{recursive:true});
console.log('PASS PDF: A4, real file output, deterministic snapshots, demo numbering, multiple pages and invalid logo handling.');
