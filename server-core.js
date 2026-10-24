'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const APP_NAME = 'RAM Sawit';
const APP_VERSION = '3.0.0';
const MAX_BODY = 25 * 1024 * 1024;
const SESSION_DAYS = 21;

function freshDB(){return {schemaVersion:3,purchases:[],sales:[],expenses:[],settings:{businessName:'RAM Sawit',businessAddress:'',businessPhone:'',logoData:'',prices:{'Grade A':0,'Grade B':0,Brondol:0},priceHistory:[],updatedAt:new Date().toISOString()},_deletedIds:[]};}
function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
function hash(s){return crypto.createHash('sha256').update(String(s)).digest('hex');}
function stableHash(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(36);}
function stamp(x){return Date.parse(x?.updatedAt||x?.createdAt||'')||0;}
function normalizeRecord(raw,kind){const item={...(raw||{})};if(!item.id)item.id='legacy-'+kind+'-'+stableHash(item.no||canonical(item));if(!item.updatedAt)item.updatedAt=item.createdAt||'1970-01-01T00:00:00.000Z';return item;}
function normalizeDB(raw){const base=freshDB(),v=raw&&typeof raw==='object'?raw:{};const settings={...base.settings,...(v.settings||{})};settings.prices={...base.settings.prices,...((v.settings||{}).prices||{})};settings.priceHistory=Array.isArray(settings.priceHistory)?settings.priceHistory:[];return {...base,...v,schemaVersion:3,purchases:Array.isArray(v.purchases)?v.purchases:[],sales:Array.isArray(v.sales)?v.sales:[],expenses:Array.isArray(v.expenses)?v.expenses:[],settings,_deletedIds:Array.isArray(v._deletedIds)?[...new Set(v._deletedIds.map(x=>String(typeof x==='object'?x.id:x)).filter(Boolean))]:[]};}
function mergeList(a,b,kind,deleted){const records=new Map();for(const raw of [...(a||[]),...(b||[])]){const item=normalizeRecord(raw,kind),id=String(item.id);if(deleted.has(id))continue;const old=records.get(id);if(!old||stamp(item)>stamp(old)||(stamp(item)===stamp(old)&&canonical(item)>canonical(old)))records.set(id,item);}return [...records.values()].sort((x,y)=>String(x.createdAt||x.date||'').localeCompare(String(y.createdAt||y.date||''))||String(x.id).localeCompare(String(y.id)));}
function mergeDB(current,incoming){const a=normalizeDB(current),b=normalizeDB(incoming),deleted=new Set([...a._deletedIds,...b._deletedIds].map(String));const sa=a.settings||{},sb=b.settings||{},settings=stamp(sb)>=stamp(sa)?sb:sa;const history=new Map();for(const item of [...(sa.priceHistory||[]),...(sb.priceHistory||[])]){const id=String(item.id||stableHash(canonical(item)));if(!history.has(id))history.set(id,{...item,id:item.id||'ph-'+id});}const merged={schemaVersion:3,purchases:mergeList(a.purchases,b.purchases,'purchase',deleted),sales:mergeList(a.sales,b.sales,'sale',deleted),expenses:mergeList(a.expenses,b.expenses,'expense',deleted),settings:{...settings,logoData:settings.logoData||sa.logoData||sb.logoData||'',priceHistory:[...history.values()].sort((x,y)=>String(x.changedAt||x.date||'').localeCompare(String(y.changedAt||y.date||'')))},_deletedIds:[...deleted]};return normalizeDB(merged);}

function createAppServer(options={}){
  const dataDir=path.resolve(options.dataDir||path.join(__dirname,'data'));
  const publicDir=path.resolve(options.publicDir||path.join(__dirname,'public'));
  const cloudMode=Boolean(options.cloudMode);
  let port=Number(options.port||process.env.PORT||37851);
  const dbPath=path.join(dataDir,'database.json');
  const historyPath=path.join(dataDir,'history.jsonl');
  const authPath=path.join(dataDir,'auth.json');
  let server;
  const loginAttempts=new Map();
  fs.mkdirSync(dataDir,{recursive:true});

  function readJSON(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;try{const recovered=file+'.corrupt-'+new Date().toISOString().replace(/[:.]/g,'-');fs.copyFileSync(file,recovered);}catch{}return fallback;}}
  function readDB(){return normalizeDB(readJSON(dbPath,freshDB()));}
  function appendAudit(event,data){const line=JSON.stringify({at:new Date().toISOString(),event,counts:{purchases:data.purchases.length,sales:data.sales.length,expenses:data.expenses.length},data});fs.appendFileSync(historyPath,line+'\n','utf8');}
  function writeDB(data,event='merge'){const normalized=normalizeDB(data),temp=dbPath+'.tmp';fs.writeFileSync(temp,JSON.stringify(normalized,null,2),'utf8');fs.renameSync(temp,dbPath);appendAudit(event,normalized);return normalized;}
  function readAuth(){const x=readJSON(authPath,{username:'',salt:'',passwordHash:'',sessions:[]});if(!Array.isArray(x.sessions))x.sessions=[];return x;}
  function writeAuth(auth){const tmp=authPath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(auth,null,2),'utf8');fs.renameSync(tmp,authPath);}
  function makeSession(auth){const token=crypto.randomBytes(32).toString('base64url');auth.sessions=(auth.sessions||[]).filter(s=>Date.parse(s.expiresAt)>Date.now());auth.sessions.push({tokenHash:hash(token),expiresAt:new Date(Date.now()+SESSION_DAYS*86400000).toISOString()});writeAuth(auth);return token;}
  function currentUser(req){const match=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i);if(!match)return null;const auth=readAuth(),tokenHash=hash(match[1]),now=Date.now();const item=(auth.sessions||[]).find(s=>s.tokenHash===tokenHash&&Date.parse(s.expiresAt)>now);if(!item)return null;return {username:auth.username,auth};}
  function requireAuth(req,res){const user=currentUser(req);if(!user){send(res,401,{ok:false,message:'Sesi tidak sah atau sudah berakhir. Silakan masuk kembali.'});return null;}return user;}
  function send(res,status,payload,headers={}){if(res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization',...headers});res.end(JSON.stringify(payload));}
  function readBody(req){return new Promise((resolve,reject)=>{let body='',size=0;req.setEncoding('utf8');req.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>MAX_BODY){reject(Object.assign(new Error('Ukuran permintaan melewati batas 25 MB.'),{statusCode:413}));req.destroy();return;}body+=chunk;});req.on('end',()=>{try{resolve(JSON.parse(body||'{}'));}catch{reject(Object.assign(new Error('Format JSON tidak valid.'),{statusCode:400}));}});req.on('error',reject);});}
  function ipOf(req){return req.socket.remoteAddress||'unknown';}
  function allowLogin(req){const ip=ipOf(req),now=Date.now(),v=loginAttempts.get(ip)||{count:0,start:now};if(now-v.start>15*60*1000){loginAttempts.set(ip,{count:1,start:now});return true;}if(v.count>=12)return false;v.count++;loginAttempts.set(ip,v);return true;}
  function scrypt(password,salt){return crypto.scryptSync(password,salt,64).toString('hex');}
  function verifyPassword(password,auth){const actual=Buffer.from(scrypt(password,auth.salt),'hex'),expected=Buffer.from(auth.passwordHash,'hex');return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);}
  function mime(file){const ext=path.extname(file).toLowerCase();return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'})[ext]||'application/octet-stream';}
  function serveStatic(req,res,url){let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return send(res,400,{ok:false,message:'URL tidak valid.'});}if(pathname==='/')pathname='/index.html';const candidate=path.resolve(publicDir,'.'+pathname);if(candidate!==publicDir&&!candidate.startsWith(publicDir+path.sep))return send(res,403,{ok:false,message:'Path tidak diizinkan.'});fs.stat(candidate,(err,st)=>{if(err||!st.isFile())return send(res,404,{ok:false,message:'File tidak ditemukan.'});res.writeHead(200,{'Content-Type':mime(candidate),'Cache-Control':path.basename(candidate)==='index.html'?'no-cache':'public, max-age=86400','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http: https:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"});fs.createReadStream(candidate).pipe(res);});}

  server=http.createServer(async(req,res)=>{
    const base=`http://${req.headers.host||'127.0.0.1:'+port}`;let url;try{url=new URL(req.url,base);}catch{return send(res,400,{ok:false,message:'URL permintaan tidak valid.'});}
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Max-Age':'86400'});return res.end();}
    if(url.pathname==='/api/health'&&req.method==='GET'){const auth=readAuth();return send(res,200,{ok:true,app:APP_NAME,version:APP_VERSION,mode:cloudMode?'online-server':'localhost-lan',setupRequired:!auth.username,authenticated:Boolean(currentUser(req)),time:new Date().toISOString(),dataCounts: (()=>{const d=readDB();return {purchases:d.purchases.length,sales:d.sales.length,expenses:d.expenses.length};})()});}
    if(url.pathname==='/api/auth/setup'&&req.method==='POST'){
      if(!allowLogin(req))return send(res,429,{ok:false,message:'Terlalu banyak percobaan. Coba lagi setelah 15 menit.'});
      try{const b=await readBody(req),auth=readAuth();if(auth.username)return send(res,409,{ok:false,message:'Akun administrator sudah dibuat. Silakan masuk.'});const username=String(b.username||'').trim();const password=String(b.password||'');if(!/^[a-zA-Z0-9._-]{3,48}$/.test(username))return send(res,400,{ok:false,message:'Nama pengguna 3–48 karakter; gunakan huruf, angka, titik, garis bawah, atau tanda hubung.'});if(password.length<10)return send(res,400,{ok:false,message:'Kata sandi minimal 10 karakter.'});if(password!==String(b.confirmPassword||''))return send(res,400,{ok:false,message:'Konfirmasi kata sandi tidak cocok.'});const salt=crypto.randomBytes(16).toString('hex');const created={username,salt,passwordHash:scrypt(password,salt),sessions:[]};const token=makeSession(created);return send(res,201,{ok:true,token,username,expiresInDays:SESSION_DAYS});}catch(e){return send(res,e.statusCode||400,{ok:false,message:e.message||'Gagal menyiapkan akun.'});}
    }
    if(url.pathname==='/api/auth/login'&&req.method==='POST'){
      if(!allowLogin(req))return send(res,429,{ok:false,message:'Terlalu banyak percobaan. Coba lagi setelah 15 menit.'});
      try{const b=await readBody(req),auth=readAuth();if(!auth.username)return send(res,409,{ok:false,message:'Buat akun administrator terlebih dahulu.'});if(String(b.username||'')!==auth.username||!verifyPassword(String(b.password||''),auth))return send(res,401,{ok:false,message:'Nama pengguna atau kata sandi salah.'});const token=makeSession(auth);return send(res,200,{ok:true,token,username:auth.username,expiresInDays:SESSION_DAYS});}catch(e){return send(res,e.statusCode||400,{ok:false,message:e.message||'Gagal masuk.'});}
    }
    if(url.pathname==='/api/auth/logout'&&req.method==='POST'){const user=requireAuth(req,res);if(!user)return;const tokenMatch=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i);user.auth.sessions=(user.auth.sessions||[]).filter(x=>x.tokenHash!==hash(tokenMatch?.[1]||''));writeAuth(user.auth);return send(res,200,{ok:true});}
    if(url.pathname==='/api/db'&&req.method==='GET'){if(!requireAuth(req,res))return;const data=readDB();return send(res,200,{ok:true,data,revision:new Date().toISOString()});}
    if(url.pathname==='/api/db'&&req.method==='POST'){
      if(!requireAuth(req,res))return;
      try{const incoming=normalizeDB(await readBody(req));const current=readDB();const merged=mergeDB(current,incoming);const saved=writeDB(merged,'sync-merge');return send(res,200,{ok:true,data:saved,revision:new Date().toISOString(),counts:{purchases:saved.purchases.length,sales:saved.sales.length,expenses:saved.expenses.length}});}catch(e){return send(res,e.statusCode||400,{ok:false,message:e.message||'Gagal menyimpan data.'});}
    }
    if(url.pathname.startsWith('/api/'))return send(res,404,{ok:false,message:'Endpoint API tidak ditemukan.'});
    if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{ok:false,message:'Metode tidak diizinkan.'});
    return serveStatic(req,res,url);
  });
  server.on('clientError',(err,socket)=>{if(socket.writable)socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');});
  return {server,dataDir,readDB,writeDB,mergeDB,async listen(startPort=port,host='0.0.0.0'){for(let p=startPort;p<startPort+10;p++){try{await new Promise((resolve,reject)=>{const onError=e=>{server.removeListener('listening',onListen);reject(e);};const onListen=()=>{server.removeListener('error',onError);resolve();};server.once('error',onError);server.once('listening',onListen);server.listen(p,host);});port=p;return {port,host,server};}catch(e){if(e.code!=='EADDRINUSE')throw e;}}throw new Error(`Tidak ada port tersedia antara ${startPort} sampai ${startPort+9}.`);},close(){return new Promise(resolve=>{if(!server.listening)return resolve();server.close(()=>resolve());});}};
}

function localIPv4s(){const out=[];for(const list of Object.values(os.networkInterfaces()))for(const nic of(list||[]))if(nic.family==='IPv4'&&!nic.internal)out.push(nic.address);return [...new Set(out)];}
module.exports={createAppServer,freshDB,normalizeDB,mergeDB,localIPv4s,APP_VERSION};
