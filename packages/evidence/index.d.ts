export function put(id:string,bytes:Buffer):void;
export function read(id:string):Buffer;
export function remove(id:string):void;
export function digest(bytes:Buffer):string;
export function validContent(bytes:Buffer,type:string):boolean;
export function scan(bytes:Buffer):Promise<{status:'CLEAN'|'INFECTED';scannerVersion:string}>;
