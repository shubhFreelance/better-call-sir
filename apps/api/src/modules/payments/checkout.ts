import {Prisma,PrismaClient} from '@prisma/client';
import {createRazorpayOrder} from './razorpay';
export async function completeCheckout(db:PrismaClient,id:string,create=createRazorpayOrder){
 const order=await db.checkoutOrder.findUniqueOrThrow({where:{id}});if(order.status!=='CREATING')return order;
 try{await db.checkoutAttempt.create({data:{orderId:id}});}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')return db.checkoutOrder.findUniqueOrThrow({where:{id}});throw error;}
 // A durable claim precedes provider I/O. Unknown outcomes require receipt reconciliation, never another automatic create.
 try{const provider=await create(order.id,order.amountPaise);await db.checkoutOrder.updateMany({where:{id,status:'CREATING'},data:{providerOrderId:provider.id,status:'CREATED',version:{increment:1}}});return await db.checkoutOrder.findUniqueOrThrow({where:{id}});}
 catch{await db.checkoutAttempt.update({where:{orderId:id},data:{failureCode:'PROVIDER_OUTCOME_REQUIRES_REVIEW'}}).catch(()=>{});await db.checkoutOrder.updateMany({where:{id,status:'CREATING'},data:{status:'FAILED',version:{increment:1}}}).catch(()=>{});throw new Error('CHECKOUT_OUTCOME_REQUIRES_REVIEW');}
}
