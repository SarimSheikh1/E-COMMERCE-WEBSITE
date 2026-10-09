export const STORE_DEFAULTS={name:'VELORA',region:'Pakistan',currency:'PKR',shipping:250,freeShippingMinimum:15000} as const;
export type FulfillmentStatus='placed'|'confirmed'|'shipped'|'delivered'|'cancelled';
export type PaymentStatus='pending'|'collected'|'refunded';
