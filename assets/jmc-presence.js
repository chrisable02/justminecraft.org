(()=>{'use strict';
const A='https://auth.justminecraft.org';
const INTERVAL=5*60*1000;
let lastBeat=0,inFlight=false;
const beat=async()=>{
  if(document.hidden||inFlight||Date.now()-lastBeat<INTERVAL)return;
  lastBeat=Date.now();
  inFlight=true;
  try{
    await fetch(A+'/heartbeat',{method:'POST',credentials:'include',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({page:location.pathname})});
  }catch{}finally{inFlight=false}
};
beat();
setInterval(beat,INTERVAL);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)beat()});
})();