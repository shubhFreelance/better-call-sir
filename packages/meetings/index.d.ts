export function mode(): 'SANDBOX'|'LIVE';
export function create(reservationId:string):Promise<{providerMode:'SANDBOX'|'LIVE';providerSpaceId:string;joinUrl:string}>;
