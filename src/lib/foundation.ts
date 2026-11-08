export type Idea = {id:string;title:string;description:string;status:string;app_id:string|null;votes:number;voted:boolean};
export type TeamData = {
 is_admin:boolean;role:'owner'|'editor'|'viewer'|null;
 members:{user_id:string;email:string|null;role:'owner'|'editor'|'viewer'}[];
 sent:{id:string;email:string;role:string;expires_at:string}[];
 invitations:{id:string;business:string;role:string;expires_at:string}[];
 ideas:Idea[];
};
export const emptyFoundation:TeamData={is_admin:false,role:null,members:[],sent:[],invitations:[],ideas:[]};
export const roleLabels:Record<string,string>={owner:'Pemilik',editor:'Bisa mencatat',viewer:'Hanya melihat'};
export const ideaLabels:Record<string,string>={submitted:'Diterima',reviewing:'Ditinjau',planned:'Direncanakan',building:'Dikerjakan',beta:'Uji coba',released:'Tersedia',declined:'Belum dilanjutkan'};
