/* ================= LANDING ================= */
function updateLandingUI(){
  var name=salesConfig.event_name||'BLEED IT LOUD';
  var sub=salesConfig.event_sub||'CONTROL DE ACCESO Y ENTRADAS';
  var date=salesConfig.event_date||'31 / 07 / 2026';
  var city=salesConfig.event_city||'Maracaibo, estado Zulia';
  var wm=document.getElementById('landing-title');
  wm.innerHTML=name.trim().split(/\s+/).map(function(w,i){return '<span class="'+(i%2?'w-out':'')+'">'+esc(w)+'</span>';}).join('');
  document.getElementById('landing-subtitle').textContent=sub;
  document.getElementById('landing-date').textContent=date;
  document.getElementById('landing-city').textContent=city;
  var seg=(name+' /// '+date+' /// '+city+' /// '+sub+' /// ').toUpperCase();
  document.getElementById('mq-a').textContent=seg.repeat(3);
  document.getElementById('mq-b').textContent=seg.repeat(3);
  var logo=salesConfig.event_logo,img=document.getElementById('landing-logo');
  if(logo){img.src=logo;img.style.display='block';document.getElementById('hero-logo-wrap').style.display='block';document.getElementById('ft').style.display='none';}
  else{img.style.display='none';document.getElementById('hero-logo-wrap').style.display='none';document.getElementById('ft').style.display='block';}
  updateCountdown();
}
function updateCountdown(){
  var el=document.getElementById('countdown');if(!el)return;
  var m=(salesConfig.event_date||'').match(/(\d{1,2})\D+(\d{1,2})\D+(\d{2,4})/);
  if(!m){el.style.display='none';return;}
  var d=+m[1],mo=+m[2],y=+m[3];if(y<100)y+=2000;
  var ev=new Date(y,mo-1,d);
  if(isNaN(ev.getTime())){el.style.display='none';return;}
  var today=new Date();today.setHours(0,0,0,0);
  var dd=Math.round((ev-today)/86400000);
  if(dd>1){el.style.display='';el.innerHTML='<i class="fa-solid fa-bolt"></i> FALTAN '+dd+' DÍAS';}
  else if(dd===1){el.style.display='';el.innerHTML='<i class="fa-solid fa-bolt"></i> ¡MAÑANA ES EL SHOW!';}
  else if(dd===0){el.style.display='';el.innerHTML='<i class="fa-solid fa-bolt"></i> ¡ES HOY!';}
  else{el.style.display='';el.innerHTML='EVENTO REALIZADO';}
}
