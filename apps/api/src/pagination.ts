import {z} from 'zod';
import {uuid} from './shared';
export const pageQuery=z.object({limit:z.coerce.number().int().min(1).max(50).default(50),cursor:uuid.optional()}).strict();
export const pageBefore=(anchor:{id:string;createdAt:Date}|null)=>anchor?{OR:[{createdAt:{lt:anchor.createdAt}},{createdAt:anchor.createdAt,id:{lt:anchor.id}}]}:{};
export function pageResult<T extends {id:string}>(rows:T[],limit:number){const items=rows.slice(0,limit);return {items,nextCursor:rows.length>limit?items.at(-1)!.id:null};}
