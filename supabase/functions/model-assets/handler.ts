import { allowedAsset, allowedOrigin, cors, snapshot, viewerHash } from '../_shared/policy.ts';
export function modelAssetHandler(verify: (token:string)=>Promise<boolean>, upstream:typeof fetch=fetch) {
  return async (request:Request):Promise<Response> => {
    const origin=request.headers.get('origin'), headers=cors(origin);
    const fail=(status:number,error:string)=>Response.json({error},{status,headers});
    if(origin && !allowedOrigin(origin)) return fail(403,'This website is not allowed.');
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
    if(!['GET','HEAD'].includes(request.method)) return fail(405,'Use GET or HEAD.');
    const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if(!token || !await verify(token)) return fail(401,'Sign in to load models.');
    const url=new URL(request.url), prefix=`/model-assets/wow-assets/${snapshot}/`;
    const offset=url.pathname.indexOf(prefix);
    if(offset<0 || url.search) return fail(400,'Unknown asset snapshot or request.');
    let path=url.pathname.slice(offset+prefix.length).replace(/^view-\d{1,9}\//,'').replace(/^q-(?:low|medium|high)\//,'');
    if(!allowedAsset(path)) return fail(400,'Unsupported asset path.');
    try {
      const response=await upstream(`https://wow.zamimg.com/modelviewer/live/${path}`,{redirect:'error',signal:AbortSignal.timeout(45000)});
      if(!response.ok) return fail(response.status===404?404:502,`Model provider returned HTTP ${response.status}.`);
      if(Number(response.headers.get('content-length'))>64*1024*1024) return fail(413,'Asset exceeds the size limit.');
      let body:BodyInit|null=response.body;
      if(path==='viewer/viewer.min.js') {
        const bytes=await response.arrayBuffer();
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
        if(!hash.startsWith(viewerHash)) return fail(409,'The game viewer changed. The app needs an updated snapshot.');
        body=bytes;
      }
      return new Response(request.method==='HEAD'?null:body,{headers:{...headers,'Content-Type':path.endsWith('.json')?'application/json':path.endsWith('.js')?'text/javascript':path.endsWith('.webp')?'image/webp':'application/octet-stream','Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'}});
    } catch {return fail(502,'The model provider is unavailable. Please try again.');}
  };
}
