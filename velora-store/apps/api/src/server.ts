import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import {randomBytes,createHash} from 'node:crypto';
import {z,ZodError} from 'zod';
import {config} from './config.js';
import {User,Session,Product,Cart,Order,Audit,Coupon,Ticket} from './models.js';
import {calculateSubtotal,transitions} from './commerce.js';
const app=express();
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function fail(status:number,message:string):never{throw Object.assign(new Error(message),{status});}
app.use(helmet(),cors({origin:config.origin,credentials:true}),express.json({limit:'100kb'}),cookieParser());
app.use('/api',rateLimit({windowMs:60000,limit:180}));
const cookie={httpOnly:true,secure:config.production,sameSite:'lax' as const,path:'/'};
app.use(async(req,res,next)=>{try{
 const raw=req.cookies.sid;
 const session=raw?await Session.findOne({token:hash(raw),expires:{$gt:new Date()}}):null;
 const user=session?await User.findById(session.user):null;
 res.locals.user=user&&!user.suspended?user:null;res.locals.session=session;
 if(!req.cookies.guest){const guest=randomBytes(24).toString('hex');res.cookie('guest',guest,{...cookie,maxAge:2592000000});req.cookies.guest=guest;}
 if(!['GET','HEAD','OPTIONS'].includes(req.method)){
  if(req.get('origin')!==config.origin)fail(403,'Invalid request origin');
  if(session&&req.get('x-csrf-token')!==session.csrf)fail(403,'Invalid CSRF token');
 }
 next();
}catch(error){next(error);}});
const auth:express.RequestHandler=(_req,res,next)=>{if(!res.locals.user)return next(Object.assign(new Error('Sign in required'),{status:401}));next();};
const admin:express.RequestHandler=(_req,res,next)=>{if(res.locals.user?.role!=='admin')return next(Object.assign(new Error('Administrator access required'),{status:403}));next();};
const owner=(req:express.Request,res:express.Response)=>res.locals.user?`user:${res.locals.user.id}`:`guest:${hash(req.cookies.guest)}`;
const credentials=z.object({email:z.email().transform(v=>v.toLowerCase()),password:z.string().min(12).max(128)});
const loginLimit=rateLimit({windowMs:900000,limit:15});
app.get('/api/health',(_req,res)=>res.json({ok:true}));
app.get('/api/auth/me',(_req,res)=>res.json({user:res.locals.user,csrf:res.locals.session?.csrf}));
app.post('/api/auth/register',loginLimit,async(req,res)=>{const data=credentials.extend({name:z.string().trim().min(2).max(100)}).parse(req.body);if(await User.exists({email:data.email}))fail(409,'Email already registered');await User.create({...data,password:await bcrypt.hash(data.password,12)});res.status(201).json({message:'Account created. Sign in to continue.'});});
app.post('/api/auth/login',loginLimit,async(req,res)=>{
 const data=credentials.parse(req.body);const user=await User.findOne({email:data.email}).select('+password');
 if(!user||user.suspended||!await bcrypt.compare(data.password,user.password))fail(401,'Invalid email or password');
 const raw=randomBytes(32).toString('hex');const csrf=randomBytes(32).toString('hex');
 await Session.create({token:hash(raw),csrf,user:user._id,expires:new Date(Date.now()+604800000)});
 await mongoose.connection.transaction(async session=>{
 const guest=await Cart.findOne({owner:`guest:${hash(req.cookies.guest)}`}).session(session);
 let cart=await Cart.findOne({owner:`user:${user.id}`}).session(session);if(!cart)cart=new Cart({owner:`user:${user.id}`,items:[]});
 for(const item of guest?.items||[]){const existing=cart.items.find(v=>v.product===item.product&&v.variant===item.variant);if(existing)existing.quantity=Math.min(99,(existing.quantity||0)+(item.quantity||0));else cart.items.push(item);}
 await cart.save({session});if(guest)await guest.deleteOne({session});
 });
 res.cookie('sid',raw,{...cookie,maxAge:604800000});res.json({user:{id:user.id,name:user.name,email:user.email,role:user.role},csrf});
});
app.post('/api/auth/logout',auth,async(req,res)=>{await Session.deleteOne({_id:res.locals.session._id});res.clearCookie('sid',cookie);res.json({ok:true});});
app.post('/api/auth/revoke',auth,async(_req,res)=>{await Session.deleteMany({user:res.locals.user._id});res.clearCookie('sid',cookie);res.json({ok:true});});
app.get('/api/products',async(req,res)=>{const query=z.object({q:z.string().max(100).optional(),category:z.string().max(100).optional(),size:z.string().optional(),color:z.string().optional(),min:z.coerce.number().min(0).optional(),max:z.coerce.number().min(0).optional(),page:z.coerce.number().int().min(1).default(1),sort:z.enum(['newest','price-asc','price-desc']).default('newest')}).parse(req.query);const filter:Record<string,unknown>={status:'active'};if(query.q)filter.$text={$search:query.q};if(query.category)filter.category=query.category;
 const variant:Record<string,unknown>={};if(query.size)variant.size=query.size;if(query.color)variant.color=query.color;if(query.min!==undefined||query.max!==undefined)variant.price={...(query.min!==undefined?{$gte:query.min}:{}),...(query.max!==undefined?{$lte:query.max}:{})};if(Object.keys(variant).length)filter.variants={$elemMatch:variant};
 const sort:Record<string,1|-1>=query.sort==='newest'?{createdAt:-1}:{'variants.price':query.sort==='price-asc'?1:-1};
 res.json({items:await Product.find(filter).sort(sort).skip((query.page-1)*12).limit(12),total:await Product.countDocuments(filter),page:query.page});});
app.get('/api/products/:slug',async(req,res)=>{const product=await Product.findOne({slug:req.params.slug,status:'active'});if(!product)fail(404,'Product not found');res.json(product);});
app.get('/api/cart',async(req,res)=>{const cart=await Cart.findOne({owner:owner(req,res)});const items=[];for(const line of cart?.items||[]){const product=await Product.findById(line.product);const variant=product?.variants.id(line.variant!);if(product&&variant)items.push({product:product.id,variant:variant.id,name:product.name,image:product.images[0],size:variant.size,color:variant.color,price:variant.price,stock:variant.stock,quantity:line.quantity});}res.json({items,subtotal:calculateSubtotal(items as {price:number;quantity:number}[])});});
app.put('/api/cart',async(req,res)=>{const data=z.object({product:z.string().regex(/^[a-f0-9]{24}$/),variant:z.string().regex(/^[a-f0-9]{24}$/),quantity:z.number().int().min(0).max(99)}).parse(req.body);const product=await Product.findOne({_id:data.product,status:'active'});const variant=product?.variants.id(data.variant);if(!variant)fail(400,'Select an available variant');if(data.quantity>variant.stock!)fail(409,'Insufficient stock');let cart=await Cart.findOne({owner:owner(req,res)});if(!cart)cart=new Cart({owner:owner(req,res)});cart.items=cart.items.filter(v=>v.product!==data.product||v.variant!==data.variant) as typeof cart.items;if(data.quantity)cart.items.push(data);await cart.save();res.json({ok:true});});
const address=z.object({name:z.string().trim().min(2).max(100),phone:z.string().regex(/^\+?[0-9 -]{10,16}$/),line:z.string().trim().min(5).max(200),city:z.string().trim().min(2).max(100),postalCode:z.string().regex(/^\d{5}$/)});
app.post('/api/checkout',auth,async(req,res)=>{const data=z.object({address,coupon:z.string().max(40).optional(),key:z.string().uuid()}).parse(req.body);const key=`${res.locals.user.id}:${data.key}`;let result=await Order.findOne({key});if(result)return res.json(result);
 await mongoose.connection.transaction(async session=>{
 result=await Order.findOne({key}).session(session);if(result)return;
 const cart=await Cart.findOne({owner:owner(req,res)}).session(session);if(!cart?.items.length)fail(400,'Cart is empty');const items=[];
 for(const line of cart.items){const product=await Product.findOne({_id:line.product,status:'active'}).session(session);const variant=product?.variants.id(line.variant!);if(!variant)fail(409,'Product unavailable');const changed=await Product.updateOne({_id:product!._id,variants:{$elemMatch:{_id:variant._id,stock:{$gte:line.quantity}}}},{$inc:{'variants.$.stock':-line.quantity!}},{session});if(!changed.modifiedCount)fail(409,'Stock changed. Review your cart.');items.push({product:product!.id,variant:variant.id,name:product!.name,sku:variant.sku,size:variant.size,color:variant.color,price:variant.price!,quantity:line.quantity!});}
 const subtotal=calculateSubtotal(items);let discount=0;
 if(data.coupon){const coupon=await Coupon.findOne({code:data.coupon.toUpperCase(),expires:{$gt:new Date()}}).session(session);if(!coupon||subtotal<(coupon.minimum||0)||coupon.used!>=coupon.limit!)fail(400,'Coupon unavailable');const eligible=calculateSubtotal(items.filter(item=>!coupon.categories.length||false));if(coupon.categories.length)fail(400,'Category coupons are not supported yet');discount=Math.min(subtotal,coupon.type==='percentage'?Math.round(subtotal*coupon.value!/100):coupon.value!);void eligible;await Coupon.updateOne({_id:coupon._id},{$inc:{used:1}},{session});}
 const shipping=subtotal>=15000?0:250;const created=await Order.create([{user:res.locals.user._id,key,items,address:data.address,subtotal,shipping,discount,total:subtotal+shipping-discount}],{session});result=created[0];cart.items.splice(0);await cart.save({session});
 });res.status(201).json(result);});
app.get('/api/orders',auth,async(_req,res)=>res.json(await Order.find({user:res.locals.user._id}).sort({createdAt:-1})));
app.get('/api/account',auth,async(_req,res)=>res.json(res.locals.user));
app.put('/api/account/addresses',auth,async(req,res)=>{const data=z.array(address).max(10).parse(req.body);await User.updateOne({_id:res.locals.user._id},{addresses:data});res.json({ok:true});});
app.put('/api/wishlist',auth,async(req,res)=>{const ids=z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(100).parse(req.body);await User.updateOne({_id:res.locals.user._id},{wishlist:ids});res.json({ok:true});});
app.get('/api/support',auth,async(_req,res)=>res.json(await Ticket.find({user:res.locals.user._id})));
app.post('/api/support',auth,async(req,res)=>{const data=z.object({subject:z.string().min(3).max(150),text:z.string().min(10).max(4000)}).parse(req.body);res.status(201).json(await Ticket.create({user:res.locals.user._id,subject:data.subject,messages:[{text:data.text,author:res.locals.user.name,date:new Date()}]}));});
app.use('/api/admin',auth,admin);
app.get('/api/admin/products',async(_req,res)=>res.json(await Product.find().sort({createdAt:-1})));
const productInput=z.object({name:z.string().min(2).max(150),slug:z.string().regex(/^[a-z0-9-]+$/),description:z.string().max(5000),category:z.string().min(1),images:z.array(z.string().refine(v=>/^\/images\/[a-z0-9-]+\.svg$/.test(v)||/^https:\/\//.test(v),'Use an HTTPS URL or bundled illustration')).max(8),status:z.enum(['draft','active','archived']),featured:z.boolean(),variants:z.array(z.object({sku:z.string().min(1),size:z.string().min(1),color:z.string().min(1),price:z.number().int().min(1),stock:z.number().int().min(0)})).min(1).max(100)});
app.post('/api/admin/products',async(req,res)=>{res.status(201).json(await Product.create(productInput.parse(req.body)));});
app.put('/api/admin/products/:id',async(req,res)=>{const data=productInput.parse(req.body);const previous=await Product.findById(req.params.id);if(!previous)fail(404,'Product not found');const variants=data.variants.map(v=>({...v,_id:previous.variants.find(old=>old.sku===v.sku)?._id||new mongoose.Types.ObjectId()}));const product=await Product.findByIdAndUpdate(req.params.id,{...data,variants},{new:true,runValidators:true});await Audit.create({actor:res.locals.user.id,action:'product.update',target:req.params.id});res.json(product);});
app.get('/api/admin/orders',async(_req,res)=>res.json(await Order.find().populate('user','name email').sort({createdAt:-1})));
app.patch('/api/admin/orders/:id',async(req,res)=>{const data=z.object({status:z.enum(['confirmed','shipped','delivered','cancelled']).optional(),tracking:z.string().max(150).optional(),collect:z.boolean().optional()}).parse(req.body);await mongoose.connection.transaction(async session=>{const order=await Order.findById(req.params.id).session(session);if(!order)fail(404,'Order not found');if(data.status){if(!transitions[order.status!]!.includes(data.status))fail(409,'Invalid fulfillment transition');if(data.status==='cancelled'&&!order.stockRestored){for(const item of order.items)await Product.updateOne({_id:item.product,'variants._id':item.variant},{$inc:{'variants.$.stock':item.quantity}},{session});order.stockRestored=true;}order.status=data.status;}if(data.collect){if(order.status!=='delivered'||order.payment==='collected')fail(409,'COD can only be collected once after delivery');order.payment='collected';}if(data.tracking!==undefined)order.tracking=data.tracking;await order.save({session});await Audit.create([{actor:res.locals.user.id,action:'order.update',target:order.id,detail:data}],{session});});res.json({ok:true});});
app.get('/api/admin/customers',async(_req,res)=>res.json(await User.find().select('name email role suspended createdAt')));
app.patch('/api/admin/customers/:id',async(req,res)=>{const {suspended}=z.object({suspended:z.boolean()}).parse(req.body);if(req.params.id===res.locals.user.id)fail(400,'Cannot suspend your own account');await User.updateOne({_id:req.params.id,role:'customer'},{suspended});if(suspended)await Session.deleteMany({user:req.params.id});res.json({ok:true});});
app.get('/api/admin/audit',async(_req,res)=>res.json(await Audit.find().sort({createdAt:-1}).limit(100)));
app.get('/api/admin/support',async(_req,res)=>res.json(await Ticket.find().populate('user','name email')));
app.get('/api/admin/overview',async(_req,res)=>{const orders=await Order.find();res.json({orders:orders.length,deliveredSales:orders.filter(v=>v.status==='delivered').reduce((s,v)=>s+v.total!,0),collectedPayments:orders.filter(v=>v.payment==='collected').reduce((s,v)=>s+v.total!,0),outstandingCOD:orders.filter(v=>v.status!=='cancelled'&&v.payment!=='collected').reduce((s,v)=>s+v.total!,0),lowStock:await Product.countDocuments({'variants.stock':{$lte:5}})});});
app.use((_req,_res,next)=>next(Object.assign(new Error('Route not found'),{status:404})));
app.use((error:Error&{status?:number;code?:number},_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(error instanceof ZodError)return res.status(400).json({message:error.issues.map(v=>v.message).join('; ')});if(error.code===11000)return res.status(409).json({message:'Record already exists. Retry or refresh.'});res.status(error.status||500).json({message:error.status?error.message:'Server error'});if(!error.status)console.error(error);});
await mongoose.connect(config.mongo);await Promise.all([User.init(),Session.init(),Product.init(),Cart.init(),Order.init()]);app.listen(config.port,()=>console.log(`VELORA API listening on ${config.port}`));


