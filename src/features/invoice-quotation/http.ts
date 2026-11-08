import {NextResponse} from 'next/server';
import {foundationError,fail} from '@/lib/foundation-server';
export function iqError(e:{message?:string;code?:string}){
 const messages:Record<string,string>={USAGE_LIMIT:'Batas dokumen bulan ini tercapai. Lihat paket PRCUISA di Pengaturan.',VERSION_CONFLICT:'Draft berubah di perangkat lain. Muat ulang sebelum melanjutkan.',IMMUTABLE_DOCUMENT:'Dokumen terbit tidak dapat ditulis ulang. Batalkan lalu buat dokumen baru.',OVERPAYMENT:'Pembayaran melebihi sisa tagihan atau bukan Rupiah utuh.',ACCEPTED_REQUIRED:'Catat penerimaan penawaran sebelum membuat invoice.',EXPIRED_QUOTATION:'Masa berlaku penawaran sudah habis.',REVERSE_PAYMENTS_FIRST:'Koreksi pembayaran terlebih dahulu sebelum membatalkan invoice.',INVALID_CUSTOMER:'Pilih pelanggan aktif dari bisnis ini.',INVALID_DATE:'Periksa tanggal dokumen dan pembayaran.',IDEMPOTENCY_CONFLICT:'Permintaan pembayaran ini sudah digunakan. Muat ulang dokumen.',READ_ONLY:'Akses bisnismu hanya dapat melihat dokumen.',PLAN_REQUIRED:'Fitur ini belum tersedia di paket bisnismu.'};
 for(const [key,msg] of Object.entries(messages))if(e.message?.includes(key))return fail(msg,key==='USAGE_LIMIT'?429:409);
 if(e.message?.includes('RATE_LIMIT'))return fail('Terlalu banyak tindakan. Coba lagi sebentar.',429);
 return foundationError(e);
}
