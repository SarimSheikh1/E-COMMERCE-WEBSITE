import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
dotenv.config({path:fileURLToPath(new URL('../../../.env',import.meta.url))});
export const config={mongo:process.env.MONGODB_URI||'mongodb://localhost:27017/velora?replicaSet=rs0',origin:process.env.WEB_ORIGIN||'http://localhost:5173',production:process.env.NODE_ENV==='production',port:Number(process.env.PORT||4000)};
