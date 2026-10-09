export type Variant={_id:string;sku:string;size:string;color:string;price:number;stock:number};
export type Product={_id:string;name:string;slug:string;description:string;category:string;images:string[];status:string;featured:boolean;variants:Variant[]};
let csrf='';
export async function api<T=unknown>(path:string,method='GET',body?:unknown):Promise<T>{const response=await fetch(`/api${path}`,{method,credentials:'include',headers:{'Content-Type':'application/json',...(csrf?{'x-csrf-token':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.message||'Request failed');if(data.csrf)csrf=data.csrf;return data;}
export const money=(value:number)=>new Intl.NumberFormat('en-PK',{style:'currency',currency:'PKR',maximumFractionDigits:0}).format(value);
