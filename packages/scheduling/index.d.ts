import type {Prisma,RecurringSchedule} from '@prisma/client';
export function intervals(schedule:Pick<RecurringSchedule,'validFrom'|'validUntil'|'slots'>,now?:Date):{startsAt:Date;endsAt:Date}[];
export function materialize(db:Prisma.TransactionClient,schedule:RecurringSchedule,now?:Date):Promise<{created:number;horizonDays:number}>;
