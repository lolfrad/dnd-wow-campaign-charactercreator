import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { allowedOrigin,cors } from '../_shared/policy.ts';
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async request=>{
  const origin=request.headers.get('origin'),headers=cors(origin);
  const result=(status:number,error?:string)=>Response.json(error?{error}:{created:true},{status,headers});
  if(origin && !allowedOrigin(origin)) return result(403,'This website is not allowed.');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return result(405,'Use POST.');
  if(!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length'))>4096)return result(400,'Invalid signup request.');
  try {
    const text=await request.text();if(text.length>4096)return result(400,'Invalid signup request.');
    const {username,password}=JSON.parse(text);
    if(typeof username!=='string' || !/^[a-z0-9_]{3,24}$/.test(username) || typeof password!=='string' || password.length<8 || password.length>72) return result(400,'Use a 3–24 character username and an 8–72 character password.');
    const address=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret+address));
    const key=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
    const {data:allowed,error:limitError}=await admin.rpc('forge_signup_allowed',{p_key:key});
    if(limitError || !allowed)return result(429,'Too many signup attempts. Please try again later.');
    const {error}=await admin.auth.admin.createUser({email:`${username}@users.tokenforge.invalid`,password,email_confirm:true,user_metadata:{username}});
    if(error)return result(400,'This username is unavailable. Choose another username.');
    return result(201);
  } catch {return result(400,'The account could not be created. Please try again.');}
});
