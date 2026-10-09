(()=>{'use strict';
const API='https://auth.justminecraft.org/news';
const feed=document.getElementById('newsFeed'),preview=document.getElementById('jmcNewsPreview'),filter=document.getElementById('newsFilter');
const date=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})};
function renderMarkdown(root,source){
  root.replaceChildren();
  const lines=String(source||'').split(/\r?\n/);
  let list=null;
  const inline=(parent,text)=>{
    const regex=/(\[([^\]]{1,120})\]\((https:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
    let last=0,match;
    while((match=regex.exec(text))){parent.append(document.createTextNode(text.slice(last,match.index)));let el;
      if(match[2]){el=document.createElement('a');try{const url=new URL(match[3]);if(url.protocol==='https:'){el.href=url.href;el.target='_blank';el.rel='noopener noreferrer'}else el=null}catch{el=null}if(el)el.textContent=match[2]}
      else if(match[4]){el=document.createElement('strong');el.textContent=match[4]}
      else if(match[5]){el=document.createElement('em');el.textContent=match[5]}
      parent.append(el||document.createTextNode(match[0]));last=regex.lastIndex
    }
    parent.append(document.createTextNode(text.slice(last)));
  };
  for(const line of lines){if(!line.trim()){list=null;continue}
    const heading=line.match(/^(#{1,3})\s+(.+)$/),bullet=line.match(/^\s*[-*]\s+(.+)$/);
    if(bullet){if(!list){list=document.createElement('ul');root.append(list)}const li=document.createElement('li');inline(li,bullet[1]);list.append(li);continue}
    list=null;const node=document.createElement(heading?'h'+Math.min(heading[1].length+2,5):'p');inline(node,heading?heading[2]:line);root.append(node)
  }
}
window.JmcNewsRender=renderMarkdown;
const card=p=>{const article=document.createElement('article');article.className='news-card';if(p.image_key){const image=document.createElement('img');image.className='news-cover';image.loading='lazy';image.alt='';image.src='https://auth.justminecraft.org/news/images/'+encodeURIComponent(p.image_key);article.append(image)}
  const tag=document.createElement('span');tag.className='news-tag';tag.textContent=p.category||'Announcement';article.append(tag);if(p.pinned){const pinned=document.createElement('span');pinned.className='news-tag';pinned.textContent='Pinned';pinned.style.marginLeft='8px';article.append(pinned)}
  const title=document.createElement('h3');title.textContent=p.title||'Untitled';const body=document.createElement('div');body.className='news-body';if(p.body_format==='markdown')renderMarkdown(body,p.body);else body.textContent=p.body||'';const meta=document.createElement('div');meta.className='news-meta';meta.textContent=[p.author_name||'JMC Staff',date(p.created_at)].filter(Boolean).join(' · ');article.append(title,body,meta);return article};
const render=(target,posts,limit)=>{if(!target)return;target.replaceChildren();if(!posts.length){const p=document.createElement('p');p.className='news-empty';p.textContent='No announcements yet. Check back soon!';target.append(p);return}posts.slice(0,limit||posts.length).forEach(p=>target.append(card(p)))};
fetch(API,{credentials:'include',cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{const posts=(d.posts||[]).filter(p=>Number(p.published)!==0).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||new Date(b.created_at)-new Date(a.created_at));const show=()=>render(feed,filter?.value&&filter.value!=='all'?posts.filter(p=>p.category===filter.value):posts);show();filter?.addEventListener('change',show);render(preview,posts,3)}).catch(()=>{[feed,preview].forEach(t=>{if(!t)return;t.replaceChildren();const p=document.createElement('p');p.className='news-empty';p.textContent='Announcements are temporarily unavailable.';t.append(p)})});
})();