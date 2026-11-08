export type PDFFont={widthOfTextAtSize(s:string,n:number):number};
export type PDFPage={drawText(s:string,o:Record<string,unknown>):void;drawLine(o:Record<string,unknown>):void;drawImage(i:unknown,o:Record<string,unknown>):void};
export class PDFDocument {static create():Promise<PDFDocument>;addPage(size:number[]):PDFPage;getPages():PDFPage[];embedFont(name:string):Promise<PDFFont>;embedPng(b:Uint8Array):Promise<{width:number;height:number}>;embedJpg(b:Uint8Array):Promise<{width:number;height:number}>;save():Promise<Uint8Array>;setTitle(s:string):void;setAuthor(s:string):void;setCreationDate(d:Date):void;setModificationDate(d:Date):void;}
export const StandardFonts:{Helvetica:string;HelveticaBold:string};
export function rgb(r:number,g:number,b:number):unknown;
