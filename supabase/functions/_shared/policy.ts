export const snapshot = '1794041972-ce4ceffb2208-v1';
export const viewerHash = 'ce4ceffb2208';
export function allowedOrigin(origin: string | null) {
  return origin === 'https://lolfrad.github.io' || !!origin?.match(/^http:\/\/(?:localhost|127\.0\.0\.1):(?:4173|5173|5174)$/);
}
export function cors(origin: string | null) {
  return {'Access-Control-Allow-Origin': allowedOrigin(origin) ? origin! : 'https://lolfrad.github.io', 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,HEAD,POST,OPTIONS','Access-Control-Max-Age':'86400','Vary':'Origin'};
}
export function allowedAsset(path: string) {
  return /^(?:viewer\/viewer\.min\.js|meta\/(?:character|charactercustomization|npc|item|itemvisual|spellvisualkit)\/\d+\.json|meta\/armor\/\d+\/\d+\.json|(?:m2|skin|skel|anim|bone)\/\d+\.(?:m2|skin|skel|anim|bone)|textures\/[a-zA-Z0-9/_-]+\.(?:webp|png|jpg))$/.test(path) && !path.includes('..');
}
