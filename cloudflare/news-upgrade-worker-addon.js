// Add this block at the END of the existing jmc-auth Worker.
// At the top of fetch(), immediately after: const url = new URL(request.url);
// insert: if (url.pathname === '/news' || url.pathname.startsWith('/news/')) return newsUpgrade(request, env, url);
// Existing login, /me, heartbeat, and staff routes remain unchanged.
const JMC_NEWS_ROLES = new Set(['Admin','Maintainer','Moderator','Helper']);
async function newsUpgrade(request,env,url){
  const path=url.pathname, method=request.method;
  const origin=request.headers.get('Origin'), site=String(env.SITE_URL||'').replace(/\/$/,'');
  const reply=(data,status=200)=>{const h=corsHeaders(env);h.set('Content-Type','application/json');h.set('Cache-Control','no-store');return new Response(JSON.stringify(data),{status,headers:h})};
  if(origin&&origin.replace(/\/$/,'')!==site)return reply({error:'Forbidden origin'},403);
  if(method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(env)});
  if(method!=='GET'&&origin!==site)return reply({error:'Origin required'},403);
  if(!env.NEWS_DB)return reply({error:'NEWS_DB binding missing'},503);
  const verify=async()=>{
    const session=await getSessionUser(request,env);
    if(!session)return {error:'Login required',status:401};
    if(!env.JMC_SESSIONS)return {error:'Session cache binding unavailable',status:503};
    const cacheKey='news:staff:'+env.DISCORD_GUILD_ID+':'+session.id;
    const cooldownKey='news:discord:cooldown:'+env.DISCORD_GUILD_ID;
    // Only cache a successful, server-verified staff result for 60 seconds.
    try{
      const cached=await env.JMC_SESSIONS.get(cacheKey,'json');
      if(cached&&cached.expires>Date.now()&&cached.id===session.id&&cached.member){
        return {session,member:cached.member};
      }
    }catch(e){console.error('News cache read failed',e)}
    try{
      const cooldown=Number(await env.JMC_SESSIONS.get(cooldownKey)||0);
      if(cooldown>Date.now())return {error:'Discord rate limit active; please retry shortly',status:503};
    }catch(e){console.error('News cooldown read failed',e)}
    const check=async(endpoint)=>{
      const response=await fetch(endpoint,{headers:{Authorization:'Bot '+env.DISCORD_BOT_TOKEN}});
      if(response.status===429){
        let wait=60;
        const retryHeader=Number(response.headers.get('Retry-After'));
        if(Number.isFinite(retryHeader)&&retryHeader>0)wait=retryHeader;
        else try{
          const body=await response.json();
          if(Number.isFinite(Number(body.retry_after)))wait=Number(body.retry_after);
        }catch{}
        wait=Math.max(1,Math.min(Math.ceil(wait),3600));
        try{await env.JMC_SESSIONS.put(cooldownKey,String(Date.now()+wait*1000),{expirationTtl:Math.max(60,wait)})}
        catch(e){console.error('News cooldown write failed',e)}
        console.warn('News Discord rate limited; retry after seconds:',wait);
      }
      return response;
    };
    const membershipResponse=await check(DISCORD_API+'/guilds/'+env.DISCORD_GUILD_ID+'/members/'+encodeURIComponent(session.id));
    if(membershipResponse.status===404)return {error:'Discord account is not in JMC',status:403};
    if(!membershipResponse.ok){
      console.error('News membership lookup failed',membershipResponse.status);
      return {error:'Discord membership verification temporarily unavailable',status:503};
    }
    const member=await membershipResponse.json();
    const roles=await check(DISCORD_API+'/guilds/'+env.DISCORD_GUILD_ID+'/roles');
    if(!roles.ok){
      console.error('News role lookup failed',roles.status);
      return {error:'Role verification unavailable',status:503};
    }
    const all=await roles.json();
    if(!all.some(role=>member.roles.includes(role.id)&&JMC_NEWS_ROLES.has(role.name)))return {error:'Staff only',status:403};
    const safeMember={nick:member.nick||null};
    try{await env.JMC_SESSIONS.put(cacheKey,JSON.stringify({id:session.id,member:safeMember,expires:Date.now()+60000}),{expirationTtl:60})}
    catch(e){console.error('News cache write failed',e)}
    return {session,member:safeMember};
  };
  const input=async()=>{
    if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))return null;
    if(Number(request.headers.get('Content-Length')||0)>20000)return null;
    let x;try{x=await request.json()}catch{return null}
    const cats=['Announcement','Server Update','Event','Maintenance','Community'];
    if(!x||typeof x.title!=='string'||!x.title.trim()||x.title.length>140||typeof x.body!=='string'||!x.body.trim()||x.body.length>10000||!cats.includes(x.category))return null;
    const key=x.image_key==null?null:x.image_key;
    if(key!==null&&!/^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/.test(key))return null;
    return {title:x.title.trim(),body:x.body.trim(),category:x.category,pinned:x.pinned===true?1:0,published:x.published===false?0:1,image_key:key};
  };
  try{
    const image=path.match(/^\/news\/images\/([0-9a-f-]{36}\.(?:png|jpg|webp|gif))$/);
    if(image&&method==='GET'){
      if(!env.NEWS_IMAGES)return reply({error:'NEWS_IMAGES binding missing'},503);
      const obj=await env.NEWS_IMAGES.get(image[1]);if(!obj)return reply({error:'Not found'},404);
      const headers=new Headers({'Content-Type':obj.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'});
      return new Response(obj.body,{headers});
    }
    if(path==='/news/images'&&method==='POST'){
      const staff=await verify();if(staff.error)return reply({error:staff.error},staff.status);
      if(!env.NEWS_IMAGES)return reply({error:'NEWS_IMAGES binding missing'},503);
      const type=(request.headers.get('Content-Type')||'').split(';')[0].toLowerCase();
      const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[type];
      if(!ext)return reply({error:'Unsupported image'},415);
      if(Number(request.headers.get('Content-Length')||0)>5242880)return reply({error:'Max 5MB'},413);
      const bytes=new Uint8Array(await request.arrayBuffer());if(!bytes.length||bytes.length>5242880)return reply({error:'Max 5MB'},413);
      const valid=type==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:type==='image/jpeg'?bytes[0]===255&&bytes[1]===216:type==='image/gif'?bytes[0]===71&&bytes[1]===73&&bytes[2]===70:bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80;
      if(!valid)return reply({error:'Invalid image'},415);
      const key=crypto.randomUUID()+'.'+ext;
      await env.NEWS_IMAGES.put(key,bytes,{httpMetadata:{contentType:type}});
      return reply({key},201);
    }
    if(path==='/news'&&method==='GET'){
      const d=await env.NEWS_DB.prepare('SELECT id,title,body,category,author_name,pinned,published,created_at,updated_at,body_format,image_key FROM announcements WHERE published=1 ORDER BY pinned DESC,created_at DESC,id DESC LIMIT 100').all();
      return reply({posts:d.results});
    }
    if(path==='/news/manage'&&method==='GET'){
      const staff=await verify();if(staff.error)return reply({error:staff.error},staff.status);
      const d=await env.NEWS_DB.prepare('SELECT id,title,body,category,author_name,pinned,published,created_at,updated_at,body_format,image_key FROM announcements ORDER BY created_at DESC,id DESC LIMIT 200').all();
      return reply({posts:d.results});
    }
    const item=path.match(/^\/news\/([1-9]\d*)$/);
    if(!(path==='/news'&&method==='POST')&&!(item&&['PUT','DELETE'].includes(method)))return reply({error:'Not found'},404);
    const staff=await verify();if(staff.error)return reply({error:staff.error},staff.status);
    if(item){
      const id=Number(item[1]);if(!Number.isSafeInteger(id))return reply({error:'Invalid ID'},400);
      const exists=await env.NEWS_DB.prepare('SELECT id FROM announcements WHERE id=?').bind(id).first();
      if(!exists)return reply({error:'Post not found'},404);
      if(method==='DELETE'){await env.NEWS_DB.prepare('DELETE FROM announcements WHERE id=?').bind(id).run();return reply({ok:true})}
      const x=await input();if(!x)return reply({error:'Invalid post'},400);
      await env.NEWS_DB.prepare('UPDATE announcements SET title=?,body=?,category=?,pinned=?,published=?,body_format=?,image_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(x.title,x.body,x.category,x.pinned,x.published,'markdown',x.image_key,id).run();
      return reply({ok:true,id});
    }
    const x=await input();if(!x)return reply({error:'Invalid post'},400);
    const author=staff.member.nick||staff.session.global_name||staff.session.username;
    const result=await env.NEWS_DB.prepare('INSERT INTO announcements (title,body,category,author_id,author_name,pinned,published,body_format,image_key) VALUES (?,?,?,?,?,?,?,?,?)').bind(x.title,x.body,x.category,staff.session.id,author,x.pinned,x.published,'markdown',x.image_key).run();
    return reply({ok:true,id:result.meta.last_row_id},201);
  }catch(e){console.error('JMC News upgrade',e);return reply({error:'News service error'},500)}
}
