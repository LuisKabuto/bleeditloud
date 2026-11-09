/* ================= MODO PUERTA ================= */
function enterKioskMode(){
  if(!AUTH.role){showToast('Inicia sesión primero','e');return;}
  document.getElementById('kiosk-mode').classList.add('active');
  tone(660,.06,0);
  setTimeout(function(){camStart('kiosk-video','kiosk-status',function(r){kioskShow(r);updateUI();});},250);
}
function exitKioskMode(){
  camStop();
  document.getElementById('kiosk-mode').classList.remove('active');
  document.getElementById('kiosk-anim').style.display='none';
  kioskTok++;
}
async function kioskManual(){
  var el=document.getElementById('kiosk-manual');
  var raw=el.value.trim();if(!raw)return;
  var r=await coreVerify(raw);
  feedback(r);
  el.value='';
  kioskShow(r);updateUI();
}
function kioskShow(r){
  var my=++kioskTok;
  var el=document.getElementById('kiosk-anim');
  var cls=r.s==='ok'?'green':(r.s==='invalid'?'red':'amber');
  var words={ok:'PASA',invalid:'NO VÁLIDA',used:'YA USADA',full:'AGOTADA',unpaid:'SIN PAGO',wrongday:'OTRO DÍA'};
  el.className='kiosk-anim '+cls+' show'+(r.s==='ok'?'':' shake');
  el.style.display='flex';
  var who=r.tk?(r.tk.n||''):(r.a?(r.a.N||''):'');
  var sub=r.tk?(dashSerial(r.tk.s)+' · Nº '+r.tk.i+' · '+esc(r.tk.e||'')):(r.a?(nD(r.a.D)+' · '+esc(r.a.E||'')):'');
  var rest='';
  if(r.s==='ok'&&r.tk){
    var left=ticketsOf(r.tk.d,r.tk.day).filter(function(t){return !t.u;}).length;
    rest='LE QUEDAN '+left+' DE '+ownerTotal(r.tk);
  }
  el.innerHTML='<div class="kiosk-big">'+(words[r.s]||'ERROR')+'</div>'
    +(who?'<div class="kiosk-info">'+esc(who)+'</div>':'')
    +(sub?'<div class="kiosk-sub">'+sub+'</div>':'')
    +(r.m?'<div class="kiosk-sub">'+esc(r.m)+'</div>':'')
    +(rest?'<div class="kiosk-rest">'+rest+'</div>':'');
  if(r.s==='ok')confetti(el);
  setTimeout(function(){if(my===kioskTok){el.style.display='none';el.className='kiosk-anim';}},2400);
}
function confetti(host){
  var cols=['#e0281a','#f3eee3','#d9a441','#3ecf6d'];
  for(var i=0;i<26;i++){
    var p=document.createElement('i');
    p.className='cf';
    p.style.left=(8+Math.random()*84)+'%';
    p.style.background=cols[i%4];
    p.style.animationDelay=(Math.random()*0.25)+'s';
    p.style.animationDuration=(0.9+Math.random()*0.8)+'s';
    p.style.setProperty('--dx',(Math.random()*180-90)+'px');
    host.appendChild(p);
    setTimeout(function(pp){return function(){pp.remove();};}(p),2100);
  }
}
