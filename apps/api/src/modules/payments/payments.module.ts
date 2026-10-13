import {Module,Controller,Get,Post,Param,Query,Body,Req,Headers,Inject} from '@nestjs/common';
import {z} from 'zod';
import {AppService,PersistenceModule,HttpRequest,uuid,version,text,parse,fail,development} from '../../shared';
import {available} from '../scheduling/calendar';
import {fetchRazorpayOrder,paymentMode,verifyWebhook} from './razorpay';
import {completeCheckout} from './checkout';
import {mode as meetingMode} from '@bcs/meetings';
import {createRevisionFulfillment} from '../revision/fulfillment';

@Controller('api/v1')
class PaymentsController{
  constructor(@Inject(AppService) private readonly service:AppService){}
  @Get('payables') async payables(@Req() req:HttpRequest,@Query() query:unknown){
    const actor=await this.service.actor(req,['TEACHER','FINANCE','ADMIN']);const data=parse(z.object({status:z.enum(['HELD_SERVICE','HELD_CONFIRMATION','HELD_DISPUTE','ELIGIBLE','REFUND_PENDING','REVIEW_REQUIRED']).optional()}).strict(),query),teacher=actor.role==='TEACHER'?await this.service.db.teacher.findUnique({where:{accountId:actor.id}}):null;
    if(actor.role==='TEACHER'&&!teacher)fail(404,'NOT_FOUND','Teacher profile not found.');
    const items=await this.service.db.teacherPayable.findMany({where:{...(teacher?{teacherId:teacher.id}:{}),...(data.status?{status:data.status}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:50,select:{id:true,lessonId:true,teacherId:true,amountPaise:true,currency:true,policyVersion:true,status:true,eligibleAt:true,version:true,createdAt:true}});return {items};
  }
  @Get('checkout-orders') async current(@Req() req:HttpRequest,@Query() query:unknown){
    const actor=await this.service.actor(req,['GUARDIAN','TEACHER']);const data=parse(z.object({kind:z.enum(['INVOICE','REVISION']),resourceId:uuid}).strict(),query);
    if(data.kind==='INVOICE'){
      const invoice=await this.service.db.invoice.findUnique({where:{id:data.resourceId}});if(!invoice||invoice.payerId!==actor.id)fail(404,'NOT_FOUND','Invoice not found.');
    }else{
      if(actor.role!=='GUARDIAN')fail(403,'FORBIDDEN','Only the booking guardian can read its checkout.');const reservation=await this.service.db.reservation.findUnique({where:{id:data.resourceId}});if(!reservation||reservation.guardianId!==actor.id||reservation.kind!=='REVISION')fail(404,'NOT_FOUND','Booking not found.');
    }
    const where={accountId:actor.id,kind:data.kind,resourceId:data.resourceId};
    const order=await this.service.db.checkoutOrder.findFirst({where:{...where,status:'PAID'},orderBy:{createdAt:'desc'}})||await this.service.db.checkoutOrder.findFirst({where,orderBy:{createdAt:'desc'}});
    const enabled=(await this.service.db.featureFlag.findUnique({where:{name:'checkout'}}))?.enabled;
    return {order,publicKeyId:enabled&&order?.providerMode==='LIVE'?process.env.RAZORPAY_KEY_ID||null:null};
  }
  @Post('checkout-orders') async create(@Req() req:HttpRequest,@Body() body:unknown){
    const actor=await this.service.actor(req,['GUARDIAN','TEACHER']);const data=parse(z.object({kind:z.enum(['INVOICE','REVISION']),resourceId:uuid,expectedVersion:version}).strict(),body);
    const saved=await this.service.once(req,actor,'checkout.create',data,async db=>{
      const flag=await db.featureFlag.findUnique({where:{name:'checkout'}});if(!flag?.enabled)fail(503,'CHECKOUT_PAUSED','Checkout is temporarily unavailable.');
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id+':checkout:'+data.kind+':'+data.resourceId},0))`;
      let amount=0;
      if(data.kind==='INVOICE'){
        const invoice=await db.invoice.findUnique({where:{id:data.resourceId}});if(!invoice||invoice.payerId!==actor.id)fail(404,'NOT_FOUND','Invoice not found.');if(invoice.version!==data.expectedVersion||invoice.status!=='DUE')fail(409,'CONFLICT','Invoice changed or is not due.');amount=invoice.amountPaise;
      }else{
        if(actor.role!=='GUARDIAN')fail(403,'FORBIDDEN','Only the booking guardian can pay.');const reservation=await db.reservation.findUnique({where:{id:data.resourceId}});if(!reservation||reservation.guardianId!==actor.id||reservation.kind!=='REVISION')fail(404,'NOT_FOUND','Booking not found.');
        if(reservation.version!==data.expectedVersion||reservation.status!=='HOLD'||!reservation.expiresAt||reservation.expiresAt<=new Date()||!reservation.scopeAccepted)fail(409,'CONFLICT','The accepted revision hold changed or expired.');amount=reservation.amountPaise;
      }
      const where={accountId:actor.id,kind:data.kind,resourceId:data.resourceId};
      const existing=await db.checkoutOrder.findFirst({where:{...where,status:'PAID'},orderBy:{createdAt:'desc'}})||await db.checkoutOrder.findFirst({where,orderBy:{createdAt:'desc'}});
      if(existing){if(existing.amountPaise!==amount||existing.currency!=='INR')fail(409,'ORDER_CHANGED','The existing order needs finance review before another payment.');return existing;}
      return db.checkoutOrder.create({data:{accountId:actor.id,kind:data.kind,resourceId:data.resourceId,amountPaise:amount,providerMode:paymentMode()}});
    });
    if(saved.status==='CREATING'&&!(await this.service.db.featureFlag.findUnique({where:{name:'checkout'}}))?.enabled)fail(503,'CHECKOUT_PAUSED','Checkout is temporarily unavailable.');
    try{return await completeCheckout(this.service.db,saved.id);}catch{fail(503,'PAYMENT_PROVIDER_UNAVAILABLE','The saved order needs provider review. Check its status before attempting another payment.');}
  }
  @Get('checkout-orders/:id') async get(@Req() req:HttpRequest,@Param('id') id:string){
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','TEACHER','FINANCE','ADMIN']);const order=await this.service.db.checkoutOrder.findUnique({where:{id}});if(!order||(!['FINANCE','ADMIN'].includes(actor.role)&&order.accountId!==actor.id))fail(404,'NOT_FOUND','Checkout order not found.');return order;
  }
  @Post('billing/webhooks/razorpay') async webhook(@Req() req:HttpRequest,@Headers('x-razorpay-signature') signature:string|undefined,@Headers('x-razorpay-event-id') eventId:string|undefined){
    if(!req.rawBody||!signature||!eventId||eventId.length>200)fail(400,'INVALID_WEBHOOK','Signed webhook headers and raw payload are required.');
    try{if(!verifyWebhook(req.rawBody,signature))fail(401,'INVALID_SIGNATURE','Webhook signature is invalid.');}catch(error){if(error instanceof Error&&error.message==='RAZORPAY_WEBHOOK_NOT_CONFIGURED')fail(503,'WEBHOOK_UNAVAILABLE','Payment webhook is not configured.');throw error;}
    let input:unknown;try{input=JSON.parse(req.rawBody.toString('utf8'));}catch{fail(400,'INVALID_WEBHOOK','Webhook JSON is invalid.');}
    const event=parse(z.object({event:z.literal('payment.captured'),payload:z.object({payment:z.object({entity:z.object({id:text(100),order_id:text(100),amount:z.number().int().positive(),currency:z.literal('INR'),status:z.literal('captured')}).passthrough()}).passthrough()}).passthrough()}).passthrough(),input),entity=event.payload.payment.entity;
    return this.service.db.$transaction(async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${eventId},0))`;const prior=await db.billingEvent.findUnique({where:{id:eventId}});if(prior)return {status:prior.result};
      const order=await db.checkoutOrder.findUnique({where:{providerOrderId:entity.order_id}});if(!order){await db.billingEvent.create({data:{id:eventId,provider:'RAZORPAY',type:event.event,result:'IGNORED_UNKNOWN_ORDER',processedAt:new Date()}});return {status:'IGNORED_UNKNOWN_ORDER'};}
      if(order.amountPaise!==entity.amount||order.currency!==entity.currency){await db.billingEvent.create({data:{id:eventId,provider:'RAZORPAY',type:event.event,checkoutOrderId:order.id,result:'AMOUNT_MISMATCH',processedAt:new Date()}});await db.supportCase.create({data:{accountId:order.accountId,category:'PAYMENT',description:`Checkout ${order.id} captured with amount mismatch; finance review required.`}});return {status:'AMOUNT_MISMATCH'};}
      if(order.status==='PAID'){await db.billingEvent.create({data:{id:eventId,provider:'RAZORPAY',type:event.event,checkoutOrderId:order.id,result:'ALREADY_PAID',processedAt:new Date()}});return {status:'ALREADY_PAID'};}
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${order.accountId},0))`;
      const current=await db.checkoutOrder.findUniqueOrThrow({where:{id:order.id}});if(current.status==='PAID'){await db.billingEvent.create({data:{id:eventId,provider:'RAZORPAY',type:event.event,checkoutOrderId:order.id,result:'ALREADY_PAID',processedAt:new Date()}});return {status:'ALREADY_PAID'};}
      let result='PAID';
      if(order.kind==='INVOICE'){
        const invoice=await db.invoice.findUniqueOrThrow({where:{id:order.resourceId}});if(invoice.status!=='DUE')result='REVIEW_REQUIRED';else await db.invoice.update({where:{id:invoice.id},data:{status:'PAID',version:{increment:1}}});
        await db.payment.create({data:{invoiceId:invoice.id,checkoutOrderId:order.id,providerEventId:entity.id,amountPaise:entity.amount}});
      }else{
        const reservation=await db.reservation.findUniqueOrThrow({where:{id:order.resourceId}});await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${reservation.teacherId},0))`;await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${reservation.id},0))`;
        const teacher=await db.teacher.findUniqueOrThrow({where:{id:reservation.teacherId}}),account=await db.account.findUniqueOrThrow({where:{id:teacher.accountId}}),collision=await db.reservation.findFirst({where:{id:{not:reservation.id},teacherId:reservation.teacherId,status:{in:['HOLD','CONFIRMED']},startsAt:{lt:reservation.endsAt},endsAt:{gt:reservation.startsAt}}});
        const payment=await db.payment.create({data:{reservationId:reservation.id,checkoutOrderId:order.id,providerEventId:entity.id,amountPaise:entity.amount}}),guardian=await db.account.findUniqueOrThrow({where:{id:reservation.guardianId}}),consent=await db.consent.findUnique({where:{guardianId:reservation.guardianId}}),privacyPending=await db.privacyRequest.findFirst({where:{accountId:reservation.guardianId,kind:'DELETION',scope:{in:['ACCOUNT','CHILD']},status:'PENDING'}});
        if(guardian.disabled||!guardian.verified||!consent||consent.withdrawnAt||privacyPending||teacher.status!=='APPROVED'||!teacher.screeningComplete||!teacher.screeningValidUntil||teacher.screeningValidUntil<=new Date()||account.disabled||collision||!await available(db,teacher.id,'REVISION',reservation.startsAt,reservation.endsAt,reservation.id,0)||reservation.status==='CANCELLED'||reservation.startsAt<=new Date()){
          await db.reservation.update({where:{id:reservation.id},data:{status:'PAID_UNALLOCATED',version:{increment:1}}});await db.refund.create({data:{paymentId:payment.id,amountPaise:payment.amountPaise,reason:'SLOT_UNAVAILABLE'}});await this.service.event(db,'refund.requested',payment.id);result='PAID_UNALLOCATED';
        }else {const confirmed=await db.reservation.update({where:{id:reservation.id},data:{status:'CONFIRMED',expiresAt:null,version:{increment:1}}});await createRevisionFulfillment(db,confirmed,payment);const meeting=await db.meeting.upsert({where:{reservationId:reservation.id},create:{reservationId:reservation.id,providerMode:meetingMode()},update:{status:'PENDING',joinUrl:null,providerSpaceId:null,failureCode:null,retryAt:null,attempts:0,providerMode:meetingMode(),version:{increment:1}}});await this.service.event(db,'meeting.create_requested',meeting.id,meeting.version);}
      }
      await db.checkoutOrder.update({where:{id:order.id},data:{status:'PAID',version:{increment:1}}});await db.billingEvent.create({data:{id:eventId,provider:'RAZORPAY',type:event.event,checkoutOrderId:order.id,result,processedAt:new Date()}});await this.service.event(db,'payment.captured',order.id);return {status:result};
    });
  }
  @Post('admin/checkout-orders/:id/reconciliations') async reconcile(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
    parse(uuid,id);const actor=await this.service.actor(req,['ADMIN','FINANCE']);const data=parse(z.object({expectedVersion:version,reason:text(500)}).strict(),body);
    return this.service.once(req,actor,'checkout.reconcile',data,async db=>{
      const order=await db.checkoutOrder.findUnique({where:{id}});if(!order)fail(404,'NOT_FOUND','Checkout order not found.');if(order.version!==data.expectedVersion)fail(409,'CONFLICT','Checkout order changed.');
      if(order.providerMode==='SANDBOX')return {order,status:'LOCAL_SANDBOX_ONLY'};if(!order.providerOrderId)fail(409,'ORDER_NOT_CREATED','Provider order was not created.');
      let provider;try{provider=await fetchRazorpayOrder(order.providerOrderId);}catch{fail(503,'PAYMENT_PROVIDER_UNAVAILABLE','Provider reconciliation is unavailable.');}
      if(provider.amount!==order.amountPaise||provider.currency!==order.currency){await db.supportCase.create({data:{accountId:order.accountId,category:'PAYMENT',description:`Checkout ${order.id} provider reconciliation mismatch.`}});}
      await this.service.audit(db,actor,req,'CHECKOUT_RECONCILED',id,data.reason,undefined,{providerStatus:provider.status});return {order,status:provider.status};
    });
  }
}
@Module({imports:[PersistenceModule],controllers:[PaymentsController]})
export class PaymentsModule{}
