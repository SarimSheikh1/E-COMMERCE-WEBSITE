export function calculateSubtotal(items:{price:number;quantity:number}[]){return items.reduce((total,item)=>total+item.price*item.quantity,0);}
export const transitions:Record<string,string[]>={placed:['confirmed','cancelled'],confirmed:['shipped','cancelled'],shipped:['delivered'],delivered:[],cancelled:[]};
