import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { modelAssetHandler } from './handler.ts';
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(modelAssetHandler(async token=>{
  const {data,error}=await client.auth.getClaims(token);
  return !error && !!data?.claims?.sub && data.claims.role==='authenticated';
}));
