export function mode(): "SANDBOX" | "RESEND" | "SMTP";
export function sender(provider?: "SANDBOX" | "RESEND" | "SMTP"): string | null;
export function hash(value: string): string;
export function seal(value: unknown, id: string): string;
export function open(
  value: string,
  id: string,
): { to: string; subject: string; text: string; code?: string };
export function message(
  to: string,
  locale: string,
  path: string,
  code?: string,
): { to: string; subject: string; text: string; code?: string };
export function enqueue(
  db: any,
  input: {
    accountId?: string;
    to?: string;
    region?: string;
    eventId?: string;
    dedupeKey: string;
    requestHash?: string;
    topic: string;
    locale?: string;
    actionPath?: string;
    code?: string;
    otpHash?: string;
    expiresAt?: Date;
  },
): Promise<any>;
export function deliver(db: any, id: string): Promise<any>;
export function tick(db: any): Promise<any>;
export function applyReceipts(db: any, delivery: any): Promise<any>;
export function verifySignature(
  headers: { id?: string; timestamp?: string; signature?: string },
  body: Buffer,
): string;

export function enqueueEvent(
  db: any,
  job: { id: string; type: string; aggregateId: string; createdAt?: Date },
): Promise<void>;
