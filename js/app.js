/* ================= CONFIGURACIÓN DE ACCESO — EDITAR ================= */
var ADMIN_EMAIL  = 'admin@bleeditloud.com';   /* EDITAR: correo de la cuenta ADMIN en Firebase Authentication */
var PORTERO_EMAIL= 'portero@bleeditloud.com';  /* EDITAR: correo de la cuenta PORTERO en Firebase Authentication */

/* ================= ESTADO ================= */
var _k1="AIzaSyB",_k2="GDm3wNfwKQ1BzNw5XwrOapqG9nlYPiJE";
var _a1="1:838453069044",_a2="web:ce6346a7089385fa628aa1";
var FIREBASE_CONFIG={apiKey:_k1+_k2,authDomain:"bleeditloud-6fb33.firebaseapp.com",databaseURL:"https://bleeditloud-6fb33-default-rtdb.firebaseio.com",projectId:"bleeditloud-6fb33",storageBucket:"bleeditloud-6fb33.firebasestorage.app",messagingSenderId:"838453069044",appId:_a1+_a2};
var FB_EVENT_ID='live-cafe-rock-2026';
/* Backend seguro compatible con Firebase Spark. Configurar la URL después de desplegar el Worker. */
var BACKEND_API_URL='';
async function callBackend(action,payload){
  if(!BACKEND_API_URL||!/^https:\/\/[a-z0-9.-]+$/.test(BACKEND_API_URL)){
    throw new Error('El backend seguro todavía no está configurado. No se realizó ningún cambio.');
  }
  var headers={'Content-Type':'application/json'};
  if(fbAuth&&fbAuth.currentUser)headers.Authorization='Bearer '+await fbAuth.currentUser.getIdToken();
  var response=await fetch(BACKEND_API_URL+'/'+action,{method:'POST',headers:headers,body:JSON.stringify(payload||{})});
  var data=await response.json().catch(function(){return{};});
  if(!response.ok)throw new Error(data.error||'El servidor no pudo completar la operación.');
  return data;
}

var currentRole='admin', attendees=[], pendingPayments=[], salesConfig={}, tickets={}, doorLog={}, pubData={};
salesConfig.s1_name='Preventa 1'; salesConfig.s1_price=10;
salesConfig.s2_name='Preventa 2'; salesConfig.s2_price=15;
salesConfig.payInfo='Banco X: 0102-1234-5678\nPago Móvil: 0414-1234567\nBinance ID: 12345678';
var fbApp=null, fbDB=null, fbAuth=null, fbConnected=false;
var AUTH={user:null,role:null,listenersOn:false};
var wantLogin=false, selectedStage=0, confirmCb=null, SCANLOG=[], kioskTok=0;
var currentTheme=localStorage.getItem('bleedit_theme')||'dark';
var DEFAULT_TICKET_IMG="https://z-cdn-media.chatglm.cn/files/b5514a0a-8209-4f46-8693-d1877cff0de0.jpeg?auth_key=1887157655-9bac99754d044e79b867f92041dfb20c-0-0e1d71ab4f51dfca8b8c9e3a7061b690";

/* ================= UTILIDADES ================= */
function nD(d){return d?String(d).replace(/[^0-9]/g,''):'';}
function esc(t){var d=document.createElement('div');d.textContent=t==null?'':t;return d.innerHTML;}
function normalizeStr(s){if(!s)return'';return s.toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function isPaid(v){if(v===true)return true;var x=String(v).toLowerCase().trim();return x==='si'||x==='pagado'||x==='listo'||x==='confirmado'||x==='cortesia';}
function fmtDT(ts){if(!ts)return'';try{var d=new Date(ts);return d.toLocaleDateString('es-VE',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'});}catch(e){return'';}}
function dashSerial(s){s=String(s||'');return s.length===8?s.slice(0,4)+'-'+s.slice(4):s;}
function showToast(m,t){var c=document.getElementById('toast-container');var el=document.createElement('div');el.className='tt '+(t==='s'?'tt-s':t==='e'?'tt-e':'tt-i');el.innerHTML=m;c.appendChild(el);setTimeout(function(){el.classList.add('out');},2600);setTimeout(function(){el.remove();},3000);}
function openModal(id){document.getElementById(id).style.display='flex';}
function closeModal(id){document.getElementById(id).style.display='none';}
function vib(p){try{if(navigator.vibrate)navigator.vibrate(p);}catch(e){}}

function applyTheme(t){document.documentElement.setAttribute('data-theme',t);document.getElementById('theme-icon').className=t==='dark'?'fa-solid fa-sun':'fa-solid fa-moon';var mt=document.querySelector('meta[name=theme-color]');if(mt)mt.content=t==='dark'?'#0c0a08':'#f1ece0';}
function toggleTheme(){currentTheme=currentTheme==='dark'?'light':'dark';localStorage.setItem('bleedit_theme',currentTheme);applyTheme(currentTheme);}

var AC=null;
function tone(f,d,delay,type,vol){try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume();var o=AC.createOscillator(),g=AC.createGain();o.type=type||'sine';o.frequency.value=f;o.connect(g);g.connect(AC.destination);var t=AC.currentTime+(delay||0);g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(vol||.12,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.start(t);o.stop(t+d+.05);}catch(e){}}
function beepGood(){tone(880,.12,0);tone(1318,.2,.12);}
function beepBad(){tone(150,.35,0,'square',.15);}

/* ================= CIFRADO DE QR (PBKDF2 + AES-GCM) ================= */
function b64(u8){var s='';for(var i=0;i<u8.length;i++)s+=String.fromCharCode(u8[i]);return btoa(s);}
function ub64(str){var s=atob(str),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;}
function hasCrypto(){return !!(window.crypto&&window.crypto.subtle&&window.TextEncoder);}
function deriveKey(ced,phone){
  var enc=new TextEncoder();
  return crypto.subtle.importKey('raw',enc.encode(phone),'PBKDF2',false,['deriveKey']).then(function(base){
    return crypto.subtle.deriveKey({name:'PBKDF2',salt:enc.encode('LCR26|'+ced),iterations:150000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  });
}
function encryptSerials(ced,phone,arr){
  if(!hasCrypto())return Promise.resolve(null);
  return deriveKey(ced,phone).then(function(key){
    var iv=crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({name:'AES-GCM',iv:iv},key,new TextEncoder().encode(JSON.stringify(arr))).then(function(ct){
      return {iv:b64(new Uint8Array(iv)),ct:b64(new Uint8Array(ct))};
    });
  }).catch(function(){return null;});
}
function decryptSerials(ced,phone,blob){
  if(!hasCrypto()||!blob||!blob.iv||!blob.ct)return Promise.resolve(null);
  return deriveKey(ced,phone).then(function(key){
    return crypto.subtle.decrypt({name:'AES-GCM',iv:ub64(blob.iv)},key,ub64(blob.ct));
  }).then(function(buf){
    try{return JSON.parse(new TextDecoder().decode(buf));}catch(e){return null;}
  }).catch(function(){return null;});
}

/* ================= CARGADORES DE LIBRERÍAS ================= */
var LIBQ=['https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js','https://unpkg.com/qrcode@1.5.3/build/qrcode.min.js'];
var LIBJ=['https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js','https://unpkg.com/jsqr@1.4.0/dist/jsQR.js'];
function loadSeq(urls,cb,ix){
  ix=ix||0;
  if(ix>=urls.length){cb(false);return;}
  var s=document.createElement('script');s.src=urls[ix];
  s.onload=function(){cb(true);};
  s.onerror=function(){s.remove();loadSeq(urls,cb,ix+1);};
  document.head.appendChild(s);
}
function ensureJsQR(cb){if(window.jsQR)return cb(true);loadSeq(LIBJ,cb);}
function makeQR(text,size){
  return new Promise(function(resolve){
    function viaSoldair(){
      if(window.QRCode&&typeof QRCode.toDataURL==='function'){
        QRCode.toDataURL(text,{errorCorrectionLevel:'H',margin:2,width:size||640,color:{dark:'#000000',light:'#ffffff'}})
          .then(resolve).catch(function(){resolve(qrcodejsQR(text,size));});
        return true;
      }
      return false;
    }
    if(viaSoldair())return;
    loadSeq(LIBQ,function(){if(!viaSoldair())resolve(qrcodejsQR(text,size));});
  });
}
function qrcodejsQR(text,size){
  try{
    if(!window.QRCode||!QRCode.CorrectLevel)return null;
    var d=document.createElement('div');d.style.cssText='position:fixed;left:-9999px;top:0;';
    document.body.appendChild(d);
    new QRCode(d,{text:text,width:size||640,height:size||640,correctLevel:QRCode.CorrectLevel.H,colorDark:'#000000',colorLight:'#ffffff'});
    var img=d.querySelector('img'),cv=d.querySelector('canvas'),url=null;
    if(img&&img.src&&img.src.indexOf('data:')===0)url=img.src;
    else if(cv&&cv.toDataURL)url=cv.toDataURL('image/png');
    setTimeout(function(){d.remove();},60);
    return url;
  }catch(e){return null;}
}

/* ================= NAVEGACIÓN ================= */
function showView(vn){
  if(vn!=='scanner')camStop();
  var all=document.querySelectorAll('.vw');
  for(var i=0;i<all.length;i++)all[i].style.display='none';
  var t=document.getElementById('view-'+vn);
  if(t)t.style.display='flex';
  if(vn==='buy')renderBuyStages();
  window.scrollTo(0,0);
}
function switchTab(id,btn){
  var tabs=document.querySelectorAll('.tab-c');
  for(var i=0;i<tabs.length;i++)tabs[i].classList.remove('on');
  var el=document.getElementById(id);if(el)el.classList.add('on');
  var bs=document.querySelectorAll('.at');
  for(var j=0;j<bs.length;j++)bs[j].classList.remove('ac');
  if(btn)btn.classList.add('ac');
  if(id==='tab-qr')renderTicketCards();
}
function stopScanner(){camStop();}

/* ================= ARRANQUE ================= */
document.addEventListener('DOMContentLoaded',function(){
  applyTheme(currentTheme);
  buildEq();
  document.getElementById('auth-admin-mail').textContent=ADMIN_EMAIL;
  document.getElementById('auth-portero-mail').textContent=PORTERO_EMAIL;
  loadSeq(LIBQ,function(){});
  ensureJsQR(function(){});
  if(window.location.hash==='#admin'||window.location.hash==='#portero'){
    wantLogin=true;
    currentRole=window.location.hash.replace('#','');
    document.getElementById('login-title').textContent=currentRole==='admin'?'ACCESO ADMINISTRADOR':'ACCESO PORTERO';
    openModal('login-modal');
  }else if(window.location.hash==='#verificar'){showView('verify');}
  else showView('landing');
  updateLandingUI();renderBuyStages();updateSalesUI();
  document.getElementById('payment-info').textContent=salesConfig.payInfo;
  initFirebase();
});
document.addEventListener('keydown',function(e){
  if(e.key==='Enter'&&document.getElementById('login-modal').style.display==='flex')doLogin();
  if(e.key==='Escape'){closeModal('login-modal');closeModal('edit-modal');closeModal('confirm-modal');}
});
function buildEq(){
  var eq=document.getElementById('eq');if(!eq)return;
  for(var i=0;i<28;i++){
    var b=document.createElement('i');
    b.style.animationDuration=(0.5+Math.random()*0.9)+'s';
    b.style.animationDelay=(-Math.random()*1.2)+'s';
    b.style.height=(22+Math.random()*78)+'%';
    eq.appendChild(b);
  }
}

/* ================= FIREBASE + AUTENTICACIÓN ================= */
function classify(email){email=(email||'').toLowerCase();if(email===ADMIN_EMAIL)return 'admin';if(email===PORTERO_EMAIL)return 'portero';return null;}
function enterTeamAccess(role){
  if(role!=='admin'&&role!=='portero')return;
  wantLogin=true;
  currentRole=role;
  window.location.hash=role;
  document.getElementById('login-title').textContent=role==='admin'?'ACCESO ADMINISTRADOR':'ACCESO PORTERO';
  document.getElementById('login-error').style.display='none';
  document.getElementById('login-email').value='';
  document.getElementById('login-pass').value='';
  if(AUTH.user){
    if(AUTH.role===role){enterPanel();return;}
    if(fbAuth){
      fbAuth.signOut().then(function(){location.reload();});
      return;
    }
  }
  openModal('login-modal');
}
function initFirebase(){
  try{
    if(!fbApp)fbApp=firebase.initializeApp(FIREBASE_CONFIG,'live-cafe-app');
    fbDB=fbApp.database();
    fbAuth=fbApp.auth();
    fbConnected=true;
    setBadge('on','Nube online');
    /* config es pública (datos del evento, sin secretos) */
    fbDB.ref('events/'+FB_EVENT_ID+'/config').on('value',function(s){
      salesConfig=s.val()||{};
      if(!salesConfig.s1_name)salesConfig.s1_name='Preventa 1';
      if(salesConfig.s1_price===undefined)salesConfig.s1_price=10;
      if(!salesConfig.s2_name)salesConfig.s2_name='Preventa 2';
      if(salesConfig.s2_price===undefined)salesConfig.s2_price=15;
      if(!salesConfig.payInfo)salesConfig.payInfo='Banco X: 0102-1234-5678\nPago Móvil: 0414-1234567\nBinance ID: 12345678';
      document.getElementById('config-active-day').value=salesConfig.active_day||'';
      document.getElementById('config-day-color').value=salesConfig.day_color||'#e0281a';
      document.getElementById('config-event-name').value=salesConfig.event_name||'BLEED IT LOUD';
      document.getElementById('config-event-sub').value=salesConfig.event_sub||'CONTROL DE ACCESO Y ENTRADAS';
      document.getElementById('config-event-date').value=salesConfig.event_date||'31 / 07 / 2026';
      document.getElementById('config-event-city').value=salesConfig.event_city||'Maracaibo, estado Zulia';
      document.getElementById('config-event-logo').value=salesConfig.event_logo||'';
      document.getElementById('config-payment-info').value=salesConfig.payInfo||'';
      document.getElementById('config-s1-name').value=salesConfig.s1_name;
      document.getElementById('config-s1-price').value=salesConfig.s1_price;
      document.getElementById('config-s1-closed').checked=!!salesConfig.s1_closed;
      document.getElementById('config-s2-name').value=salesConfig.s2_name;
      document.getElementById('config-s2-price').value=salesConfig.s2_price;
      document.getElementById('config-s2-closed').checked=!!salesConfig.s2_closed;
      document.getElementById('payment-info').textContent=salesConfig.payInfo;
      updateLandingUI();renderBuyStages();updateSalesUI();updateTotal();updateUI();
    });
    fbAuth.onAuthStateChanged(function(u){
      AUTH.user=u;
      AUTH.role=u?classify(u.email):null;
      if(AUTH.role){
        if(wantLogin&&AUTH.role!==currentRole){
          fbAuth.signOut().then(function(){
            openModal('login-modal');
            loginError(currentRole==='admin'?'Esta cuenta no tiene acceso de administrador.':'Esta cuenta no tiene acceso de portero.');
          });
          return;
        }
        attachRoleListeners();
        if(wantLogin)enterPanel();
      }else if(u){
        fbAuth.signOut();
        if(wantLogin){loginError('Ese correo no es admin ni portero de este evento');}
      }else{
        setBadge(fbConnected?'on':'','Sin sesión');
        if(wantLogin)openModal('login-modal');
      }
    });
  }catch(e){setBadge('err','Nube error');}
}
function attachRoleListeners(){
  if(AUTH.listenersOn)return;AUTH.listenersOn=true;
  setBadge('on',AUTH.role==='admin'?'Admin online':'Portero online');
  fbDB.ref('events/'+FB_EVENT_ID+'/attendees').on('value',function(s){attendees=s.val()?Object.values(s.val()):[];updateUI();checkMigrationHint();});
  fbDB.ref('events/'+FB_EVENT_ID+'/tickets').on('value',function(s){tickets=s.val()||{};updateUI();});
  fbDB.ref('events/'+FB_EVENT_ID+'/doorLog').on('value',function(s){doorLog=s.val()||{};renderTicketCards();});
  if(AUTH.role==='admin'){
    fbDB.ref('events/'+FB_EVENT_ID+'/pending').on('value',function(s){var v=s.val()||{};pendingPayments=Object.keys(v).map(function(k){var o=v[k]||{};o.id=k;return o;});renderPendingPayments();});
    fbDB.ref('events/'+FB_EVENT_ID+'/pub').on('value',function(s){pubData=s.val()||{};updatePubStatus();});
  }
}
function setBadge(cls,txt){var b=document.getElementById('fb-badge');b.className='fb-badge '+(cls||'');b.textContent=txt;}
function loginError(msg){var e=document.getElementById('login-error');e.textContent=msg;e.style.display='block';}
function doLogin(){
  var em=document.getElementById('login-email').value.trim().toLowerCase();
  var pw=document.getElementById('login-pass').value;
  var errEl=document.getElementById('login-error');errEl.style.display='none';
  if(!em||!pw)return;
  if(!fbAuth){loginError('Firebase no está disponible');return;}
  fbAuth.signInWithEmailAndPassword(em,pw).then(function(){/* onAuthStateChanged enruta */})
  .catch(function(e){loginError(friendlyAuthError(e&&e.code));});
}
function friendlyAuthError(code){
  var m={'auth/invalid-email':'Correo no válido','auth/user-not-found':'Esa cuenta no existe (créala en Firebase Console)','auth/wrong-password':'Contraseña incorrecta','auth/invalid-credential':'Correo o contraseña incorrectos','auth/too-many-requests':'Demasiados intentos — espera un momento','auth/network-request-failed':'Sin conexión','auth/operation-not-allowed':'Habilita Email/Password en Authentication'};
  return m[code]||'No se pudo iniciar sesión';
}
function enterPanel(){
  closeModal('login-modal');
  showView('admin');
  applyRole();
}
function applyRole(){
  var isAdmin=AUTH.role==='admin';
  document.querySelectorAll('[data-admin-only]').forEach(function(el){el.style.display=isAdmin?'':'none';});
  document.getElementById('panel-title').textContent=isAdmin?'ADMINISTRADOR':'PORTERO';
  if(!isAdmin){var vb=document.querySelector('[data-tab="tab-verify"]');if(vb)switchTab('tab-verify',vb);}
}
function signOutNow(){
  if(fbAuth)fbAuth.signOut();
  setTimeout(function(){location.reload();},300);
}
function saveAttendees(){
  if(!fbConnected){updateUI();return;}
  fbDB.ref('events/'+FB_EVENT_ID+'/attendees').set(attendees).catch(function(err){
    showToast('Sin permiso para escribir la lista','e');updateUI();
  });
}

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

/* ================= VENTAS ================= */
function toggleSales(){
  salesConfig.sales_paused=!salesConfig.sales_paused;
  if(fbConnected&&AUTH.role==='admin')fbDB.ref('events/'+FB_EVENT_ID+'/config').update({sales_paused:salesConfig.sales_paused});
  updateSalesUI();renderBuyStages();
  showToast(salesConfig.sales_paused?'Ventas pausadas':'Ventas activadas','i');
}
function updateSalesUI(){
  var btn=document.getElementById('sales-toggle-btn'),lab=document.getElementById('buy-cta-label'),land=document.getElementById('btn-buy-landing');
  if(!btn||!lab||!land)return;
  if(salesConfig.sales_paused){
    btn.innerHTML='<i class="fa-solid fa-play mr-2"></i>Reanudar ventas';btn.classList.add('paused');
    lab.textContent='Ventas cerradas';land.disabled=true;land.style.opacity=.45;land.style.pointerEvents='none';
  }else{
    btn.innerHTML='<i class="fa-solid fa-pause mr-2"></i>Pausar ventas';btn.classList.remove('paused');
    lab.textContent='Comprar entradas';land.disabled=false;land.style.opacity=1;land.style.pointerEvents='auto';
  }
}
function stageCard(n,name,price){
  return '<button type="button" class="stage'+(selectedStage===n?' sel':'')+'" onclick="selectStage('+n+')">'
    +'<span class="stage-name">'+esc(name)+'</span>'
    +'<span class="stage-price">$'+price+'</span>'
    +'<span class="stage-hint mono">'+(selectedStage===n?'SELECCIONADA':'DISPONIBLE')+'</span></button>';
}
function renderBuyStages(){
  var box=document.getElementById('buy-checkout');
  var st=document.getElementById('buy-stages');
  if(salesConfig.sales_paused){st.innerHTML='<div class="notice">Ventas pausadas — vuelve a intentar más tarde</div>';box.style.display='none';return;}
  var c1=!!salesConfig.s1_closed,c2=!!salesConfig.s2_closed;
  if(c1&&c2){st.innerHTML='<div class="notice">Agotado — no quedan etapas disponibles</div>';box.style.display='none';return;}
  var h='<p class="step-label mono">PASO 01 — ELIGE TU ETAPA</p><div class="stages">';
  if(!c1)h+=stageCard(1,salesConfig.s1_name,salesConfig.s1_price);
  if(!c2)h+=stageCard(2,salesConfig.s2_name,salesConfig.s2_price);
  h+='</div>';
  st.innerHTML=h;
  if(selectedStage===1&&c1)selectedStage=0;
  if(selectedStage===2&&c2)selectedStage=0;
  if(selectedStage)box.style.display='block';
  updateTotal();
}
function selectStage(n){selectedStage=n;renderBuyStages();var box=document.getElementById('buy-checkout');box.style.display='block';box.scrollIntoView({behavior:'smooth',block:'nearest'});}
function updateTotal(){
  var input=document.getElementById('buy-qty');
  var qty=Math.max(1,Math.min(20,Math.floor(Number(input&&input.value)||1)));
  var price=selectedStage===1?(Number(salesConfig.s1_price)||0):(Number(salesConfig.s2_price)||0);
  var name=selectedStage===1?salesConfig.s1_name:salesConfig.s2_name;
  var t=document.getElementById('buy-total');if(t)t.textContent='$'+(qty*price).toLocaleString('es-VE',{maximumFractionDigits:2});
  var l=document.getElementById('buy-stage-label');if(l)l.textContent=name||'—';
}
async function copyPaymentInfo(){
  var info=String(salesConfig.payInfo||'').trim();
  var qty=Math.max(1,Math.min(20,Math.floor(Number(document.getElementById('buy-qty').value)||1)));
  var price=selectedStage===1?(Number(salesConfig.s1_price)||0):(Number(salesConfig.s2_price)||0);
  var total='$'+(qty*price).toLocaleString('es-VE',{maximumFractionDigits:2});
  var text='BLEED IT LOUD · DATOS DE PAGO\n'+info+'\nCantidad: '+qty+'\nTotal: '+total;
  try{
    if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);
    else{
      var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
      var ok=document.execCommand('copy');ta.remove();if(!ok)throw new Error('copy failed');
    }
    showToast('Datos de pago y total copiados','s');
  }catch(e){showToast('No se pudo copiar. Selecciona los datos y cópialos manualmente.','e');}
}
async function submitPurchase(){
  var btn=document.querySelector('#buy-checkout button[onclick="submitPurchase()"]');
  var name=document.getElementById('buy-name').value.trim();
  var dni=nD(document.getElementById('buy-dni').value);
  var phone=nD(document.getElementById('buy-phone').value);
  var qtyRaw=Number(document.getElementById('buy-qty').value),qty=Math.floor(qtyRaw);
  var ref=document.getElementById('buy-ref').value.trim();
  if(!selectedStage){showToast('Selecciona una etapa de venta antes de continuar','e');return;}
  if(!name||dni.length<5||!ref){showToast('Completa nombre, cédula válida y referencia de pago','e');return;}
  if(phone.length<7){showToast('Introduce un teléfono válido para recuperar tus entradas','e');return;}
  if(!Number.isFinite(qtyRaw)||qty<1||qty>20){showToast('La cantidad debe estar entre 1 y 20 entradas','e');return;}
  if(salesConfig.sales_paused||(selectedStage===1&&salesConfig.s1_closed)||(selectedStage===2&&salesConfig.s2_closed)){showToast('Esta etapa ya no está disponible','e');renderBuyStages();return;}
  var sc=selectedStage===1?{name:salesConfig.s1_name}:{name:salesConfig.s2_name};
  if(btn){btn.disabled=true;btn.dataset.originalText=btn.innerHTML;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Enviando…';}
  try{
    var result=await callBackend('createPendingOrder',{name:name,dni:dni,phone:phone,qty:qty,ref:ref,stage:sc.name||'Venta'});
    document.getElementById('confirm-name').textContent=name;
    document.getElementById('confirm-ref').textContent=ref;
    document.getElementById('confirm-stage').textContent=(qty+' × '+(sc.name||'Venta'));
    document.getElementById('confirm-total').textContent='$'+result.total;
    ['buy-name','buy-dni','buy-phone','buy-ref'].forEach(function(id){document.getElementById(id).value='';});
    document.getElementById('buy-qty').value=1;showView('ticket');
  }catch(err){showToast(err.message||'No se confirmó el pedido. No se realizó ningún cambio.','e');}
  finally{if(btn){btn.disabled=false;btn.innerHTML=btn.dataset.originalText||'<i class="fa-solid fa-paper-plane"></i>Enviar comprobante';}}
}

async function saveSalesConfig(){
  var nc={
    active_day:document.getElementById('config-active-day').value,
    day_color:document.getElementById('config-day-color').value,
    event_name:document.getElementById('config-event-name').value,
    event_sub:document.getElementById('config-event-sub').value,
    event_date:document.getElementById('config-event-date').value,
    event_city:document.getElementById('config-event-city').value,
    event_logo:document.getElementById('config-event-logo').value,
    payInfo:document.getElementById('config-payment-info').value,
    s1_name:document.getElementById('config-s1-name').value,
    s1_price:parseFloat(document.getElementById('config-s1-price').value)||0,
    s1_closed:document.getElementById('config-s1-closed').checked,
    s2_name:document.getElementById('config-s2-name').value,
    s2_price:parseFloat(document.getElementById('config-s2-price').value)||0,
    s2_closed:document.getElementById('config-s2-closed').checked,
    sales_paused:salesConfig.sales_paused||false
  };
  salesConfig=nc;
  document.getElementById('payment-info').textContent=nc.payInfo;
  if(fbConnected){
    try{await fbDB.ref('events/'+FB_EVENT_ID+'/config').set(nc);showToast('Configuración guardada en la nube','s');}
    catch(error){showToast('Sin permiso para guardar (inicia sesión como admin)','e');}
  }else showToast('Sin conexión con la nube','e');
  updateLandingUI();renderBuyStages();updateSalesUI();updateTotal();
}

/* ================= SERIALES ÚNICOS ================= */
var SERIAL_AB='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genSerial(){
  for(var tries=0;tries<80;tries++){
    var s='';
    for(var i=0;i<8;i++)s+=SERIAL_AB.charAt(Math.floor(Math.random()*SERIAL_AB.length));
    if(s.replace(/[^A-Z]/g,'').length<2)continue;
    if(!tickets[s])return s;
  }
  var fb='X'+Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g,'');
  while(fb.length<8)fb+='Z';
  return fb.slice(0,8);
}
function ticketsArr(){return Object.keys(tickets).map(function(k){return tickets[k];});}
function ticketsOf(dni,day){
  var out=[];
  for(var s in tickets){var t=tickets[s];if(t&&nD(t.d)===nD(dni)){if(!day||t.day===day)out.push(t);}}
  out.sort(function(a,b){return (a.i||0)-(b.i||0);});
  return out;
}
function findAttendeeExact(dni,day){
  dni=nD(dni);
  for(var i=0;i<attendees.length;i++){
    var a=attendees[i];
    if(a&&nD(a.D)===dni&&(a.E_D||'General')===(day||'General'))return a;
  }
  return null;
}
function findByDNI(d){d=nD(d);for(var i=0;i<attendees.length;i++){if(attendees[i]&&nD(attendees[i].D)===d)return attendees[i];}return null;}
function usedCountFor(a){return ticketsOf(nD(a.D),null).filter(function(t){return t.u;}).length;}
function ensureTicketsFor(dni,day){
  dni=nD(dni);if(!dni)return[];
  day=day||'General';
  var a=findAttendeeExact(dni,day);
  if(!a||!isPaid(a.P))return[];
  var have=ticketsOf(dni,day),created=[],nextIx=0;
  have.forEach(function(t){if((t.i||0)>nextIx)nextIx=t.i;});
  for(var k=have.length;k<(a.C||1);k++){
    nextIx++;
    var s=genSerial();
    tickets[s]={s:s,d:dni,n:a.N||'',e:a.E||'General',day:day,i:nextIx,u:false,ua:null,ts:Date.now()};
    created.push(tickets[s]);
  }
  if(created.length&&fbConnected&&AUTH.role==='admin'){
    var upd={};created.forEach(function(t){upd[t.s]=t;});
    fbDB.ref('events/'+FB_EVENT_ID+'/tickets').update(upd).catch(function(){showToast('Sin permiso para emitir entradas','e');});
  }
  return created;
}
function ensureAllTickets(){
  var n=0,seen={};
  attendees.forEach(function(a){
    if(!a||!isPaid(a.P))return;
    var day=a.E_D||'General',key=nD(a.D)+'|'+day;
    if(seen[key])return;seen[key]=1;
    n+=ensureTicketsFor(a.D,day).length;
  });
  return n;
}

/* ================= ÍNDICE PÚBLICO (pub/) ================= */
async function refreshPubFor(dni){
  dni=nD(dni);if(!dni)return;
  var rows=attendees.filter(function(a){return a&&nD(a.D)===dni;});
  if(!rows.length){
    if(fbConnected&&AUTH.role==='admin')fbDB.ref('events/'+FB_EVENT_ID+'/pub/'+dni).remove().catch(function(){});
    return;
  }
  var name='',phone='',paid=true,total=0;
  rows.forEach(function(a){if(a.N&&!name)name=a.N;if(a.T&&!phone)phone=nD(a.T);if(!isPaid(a.P))paid=false;total+=(a.C||1);});
  var ts=ticketsOf(dni,null);
  var qrs=null;
  if(paid&&ts.length&&phone){
    qrs=await encryptSerials(dni,phone,ts.map(function(t){return t.s;}));
  }
  var obj={n:name,p:paid,c:total,qrs:qrs};
  if(fbConnected&&AUTH.role==='admin'){
    fbDB.ref('events/'+FB_EVENT_ID+'/pub/'+dni).set(obj).catch(function(){showToast('Sin permiso para actualizar el índice','e');});
  }
}
async function buildPubAll(){
  if(AUTH.role!=='admin'){showToast('Solo el admin puede regenerar el índice','e');return;}
  var seen={},list=[];
  attendees.forEach(function(a){if(!a)return;var d=nD(a.D);if(!d||seen[d])return;seen[d]=1;list.push(d);});
  if(!list.length){showToast('No hay asistentes cargados','e');return;}
  var el=document.getElementById('pub-progress');
  for(var i=0;i<list.length;i++){
    el.textContent='ÍNDICE: '+(i+1)+' / '+list.length;
    await refreshPubFor(list[i]);
  }
  el.textContent='COMPLETADO — '+list.length+' CÉDULAS';
  showToast('Índice público regenerado','s');
}
function updatePubStatus(){
  var el=document.getElementById('pub-status');if(!el)return;
  var n=Object.keys(pubData).length;
  if(!attendees.length){el.textContent='SIN ASISTENTES CARGADOS';return;}
  if(!n){el.textContent='ÍNDICE VACÍO — PULSA «REGENERAR ÍNDICE PÚBLICO»';return;}
  var total=0,seen={};
  attendees.forEach(function(a){if(a){var d=nD(a.D);if(!seen[d]){seen[d]=1;total++;}}});
  el.textContent=n+' / '+total+' CÉDULAS INDEXADAS';
}
function checkMigrationHint(){
  if(AUTH.role!=='admin'||!attendees.length)return;
  if(!Object.keys(pubData).length&&!checkMigrationHint.done){
    checkMigrationHint.done=true;
    showToast('Datos previos detectados: regenera el índice público en Config','i');
  }
}

/* ================= VERIFICACIÓN (EQUIPO, AUTENTICADO) ================= */
function ownerTotal(t){var a=findAttendeeExact(t.d,t.day);return a?(a.C||1):Math.max(1,ticketsOf(t.d,t.day).length);}
async function coreVerify(code){
  code=String(code||'').trim();
  if(!code)return{s:'invalid',t:'CÓDIGO VACÍO',m:'Nada que verificar.'};
  if(code.indexOf('|')>-1)return await verifyLegacy(code);
  var clean=code.toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(/^\d+$/.test(clean))return await verifyDNIPath(clean);
  if(/^[A-Z2-9]{8}$/.test(clean))return await verifySerial(clean);
  return{s:'invalid',t:'FORMATO NO RECONOCIDO',m:'Escanea un QR válido, un serial (8 caracteres) o una cédula.'};
}
async function verifySerial(sr){
  var t=tickets[sr];
  if(!t)return{s:'invalid',t:'SERIAL DESCONOCIDO',m:'«'+sr+'» no pertenece a este evento.'};
  var owner=findAttendeeExact(t.d,t.day);
  if(owner&&!isPaid(owner.P))return{s:'unpaid',t:'PAGO ANULADO',tk:t,m:'El pago de esta entrada fue anulado. No admite ingreso.'};
  if(t.u)return{s:'used',t:'YA UTILIZADA',tk:t,m:'Entrada Nº '+t.i+' — usada'+(t.ua?' el '+fmtDT(t.ua):'')+'.'};
  var ad=salesConfig.active_day;
  if(ad&&t.day&&t.day!==ad)return{s:'wrongday',t:'ENTRADA DE OTRO DÍA',tk:t,m:'Es para «'+t.day+'» y hoy es «'+ad+'». No se marca.'};
  var checkin=await markTicketUsed(t);
  if(!checkin.committed){
    if(checkin.alreadyUsed){t.u=true;t.ua=checkin.ts||t.ua;return{s:'used',t:'YA UTILIZADA',tk:t,m:'Esta entrada ya fue registrada por otro lector.'};}
    return{s:'error',t:'NO SE PUDO CONFIRMAR EL INGRESO',tk:t,m:'No se autorizó el acceso. Comprueba la conexión y vuelve a consultar.'};
  }
  var left=ticketsOf(t.d,t.day).filter(function(x){return !x.u;}).length;
  return{s:'ok',t:'ACCESO CONCEDIDO',tk:t,m:'Entrada Nº '+t.i+' de '+ownerTotal(t)+(left?' · le quedan '+left:' · era la última')};
}
async function verifyDNIPath(dni){
  var ad=salesConfig.active_day;
  var list=attendees.filter(function(a){return a&&nD(a.D)===nD(dni);});
  if(!list.length)return{s:'invalid',t:'NO ENCONTRADA',m:'Cédula '+dni+' sin entradas registradas.'};
  if(ad){
    var m=list.filter(function(a){return (a.E_D||'General')===ad;});
    if(!m.length){
      var dias={};list.forEach(function(a){dias[a.E_D||'General']=1;});
      return{s:'wrongday',t:'SIN ENTRADAS HOY',a:list[0],m:'Tiene entradas para: '+Object.keys(dias).join(', ')+' — hoy es «'+ad+'».'};
    }
    list=m;
  }
  var a=list[0];
  if(!isPaid(a.P))return{s:'unpaid',t:'PAGO PENDIENTE',a:a,m:'No figura como pagada. No se marca el ingreso.'};
  var day=a.E_D||'General';
  var free=ticketsOf(a.D,ad||null).filter(function(t){return !t.u;});
  if(free.length){
    var t=free[0];
    var checkin=await markTicketUsed(t);
    if(!checkin.committed){
      if(checkin.alreadyUsed)return await verifyDNIPath(dni);
      return{s:'error',t:'NO SE PUDO CONFIRMAR EL INGRESO',a:a,tk:t,m:'No se autorizó el acceso. Comprueba la conexión y vuelve a consultar.'};
    }
    var left=ticketsOf(a.D,ad||null).filter(function(x){return !x.u;}).length;
    return{s:'ok',t:'ACCESO CONCEDIDO',a:a,tk:t,m:'Entrada Nº '+t.i+' · serial '+t.s+(left?' · quedan '+left:' · era la última')};
  }
  return{s:'full',t:'SIN ENTRADAS',a:a,m:'Ya usó todas sus entradas ('+usedCountFor(a)+'/'+(a.C||1)+').'};
}
async function verifyLegacy(code){
  var parts=code.split('|');
  var dni=nD(parts[1]),idx=parseInt(parts[2],10);
  var a=findByDNI(dni);
  if(!a)return{s:'invalid',t:'INVÁLIDA',m:'Esta entrada no existe en la base de datos.'};
  if(!isPaid(a.P))return{s:'unpaid',t:'PAGO PENDIENTE',a:a,m:'No figura como pagada.'};
  var ts=ticketsOf(a.D,null);
  if(ts.length){
    var t=null;
    for(var i=0;i<ts.length;i++)if(ts[i].i===idx+1){t=ts[i];break;}
    if(t)return await verifySerial(t.s);
    return{s:'invalid',t:'INVÁLIDA',a:a,m:'Número de entrada fuera de rango.'};
  }
  return{s:'invalid',t:'ENTRADA ANTIGUA',a:a,m:'Genera las entradas con serial en la pestaña «Entradas».'};
}
/* escritura de puerta: autenticada + acotada por reglas (u=true únicamente) */
async function markTicketUsed(t){
  if(!fbConnected||!fbDB||!AUTH.role)return{committed:false,unavailable:true};
  try{
    var result=await callBackend('checkInTicket',{serial:t.s});
    if(result.alreadyUsed){t.u=true;patchTicketCards();return{committed:false,alreadyUsed:true,ts:result.ts};}
    if(!result.ok)return{committed:false,unknown:!result.exists};
    t.u=true;t.ua=result.ts;patchTicketCards();
    return{committed:true,ts:result.ts};
  }catch(error){showToast(error.message||'No se pudo confirmar el ingreso. No autorices el acceso.','e');return{committed:false,error:error};}
}

function resultHTML(r){
  var cls=r.s==='ok'?'ok':(r.s==='invalid'?'bad':'warn');
  var icon=r.s==='ok'?'fa-circle-check':(r.s==='invalid'?'fa-circle-xmark':'fa-triangle-exclamation');
  var det='';
  if(r.tk){
    var tot=ownerTotal(r.tk),used=ticketsOf(r.tk.d,r.tk.day).filter(function(x){return x.u;}).length;
    det='<div class="res-grid">'
      +'<div><b>Serial</b><span class="mono">'+dashSerial(r.tk.s)+'</span></div>'
      +'<div><b>Comprador</b><span>'+esc(r.tk.n||'—')+'</span></div>'
      +'<div><b>Cédula</b><span class="mono">'+esc(r.tk.d)+'</span></div>'
      +'<div><b>Etapa / Día</b><span>'+esc(r.tk.e||'—')+' · '+esc(r.tk.day||'—')+'</span></div>'
      +'<div><b>Del pedido</b><span class="mono">'+used+' / '+tot+' usadas</span></div>'
      +'<div><b>Nº de entrada</b><span class="mono">'+(r.tk.i||'—')+'</span></div>'
      +'</div>';
  }else if(r.a){
    det='<div class="res-grid">'
      +'<div><b>Nombre</b><span>'+esc(r.a.N||'—')+'</span></div>'
      +'<div><b>Cédula</b><span class="mono">'+esc(r.a.D)+'</span></div>'
      +'<div><b>Etapa</b><span>'+esc(r.a.E||'—')+'</span></div>'
      +'<div><b>Ingresos</b><span class="mono">'+usedCountFor(r.a)+' / '+(r.a.C||1)+'</span></div>'
      +'</div>';
  }
  return '<div class="res res-'+cls+'"><div class="res-head"><i class="fa-solid '+icon+'"></i><span>'+esc(r.t)+'</span></div>'
    +(r.m?'<p class="res-msg">'+esc(r.m)+'</p>':'')+det+'</div>';
}

/* ================= MIS ENTRADAS (PÚBLICO, con cifrado) ================= */
var PV={ced:null,pub:null};
function verifyDNI(){
  var box=document.getElementById('verify-result');box.style.display='block';
  var dni=nD(document.getElementById('verify-dni').value);
  if(!/^[0-9]{5,12}$/.test(dni)){box.innerHTML=resultHTML({s:'invalid',t:'CÉDULA NO VÁLIDA',m:'Escribe la cédula con la que compraste.'});return;}
  PV={ced:dni,pub:{}};
  renderPhoneStep(box);
}
function renderPhoneStep(box){
  box.innerHTML='<div class="res res-ok">'
    +'<div class="res-head"><i class="fa-solid fa-ticket"></i><span>CONSULTAR MIS ENTRADAS</span></div>'
    +'<p class="res-msg">Introduce el teléfono registrado al comprar. La consulta valida la cédula y el teléfono juntos.</p>'
    +'<div class="flex gap-3 mt-4">'
    +'<input type="text" id="pv-phone" class="di" placeholder="Teléfono registrado" inputmode="numeric">'
    +'<button class="bp px-6" onclick="revealPublicQRs()"><i class="fa-solid fa-unlock"></i></button>'
    +'</div>'
    +'<div id="pv-error" style="color:var(--red);font-size:14px;margin-top:10px;display:none"></div>'
    +'</div>';
  document.getElementById('pv-phone').addEventListener('keydown',function(e){if(e.key==='Enter')revealPublicQRs();});
}
async function revealPublicQRs(){
  var box=document.getElementById('verify-result');
  var err=document.getElementById('pv-error');
  var phone=nD(document.getElementById('pv-phone').value);
  if(phone.length<7){err.textContent='Escribe el teléfono completo';err.style.display='block';return;}
  err.style.display='none';
  box.innerHTML='<p class="empty">VALIDANDO DATOS…</p>';
  try{
    var result=await callBackend('getPublicOrderIndex',{dni:PV.ced,phone:phone});
    if(!result.found){
      box.innerHTML=resultHTML({s:'invalid',t:'NO ENCONTRADA',m:'No se encontraron entradas con esa cédula y teléfono. Comprueba los datos e inténtalo de nuevo.'});
      return;
    }
    if(result.status==='pending'||!result.p){
      box.innerHTML=resultHTML({s:'warn',t:'PAGO EN REVISIÓN',m:'Hola'+(result.n?' '+result.n:'')+'. El pago sigue pendiente de aprobación.'});
      return;
    }
    var arr=result.serials||[];
    if(!arr.length){box.innerHTML=resultHTML({s:'warn',t:'ENTRADAS NO DISPONIBLES',m:'Contacta al organizador para revisar tu compra.'});return;}
    var h='<div class="res res-ok">'
      +'<div class="res-head"><i class="fa-solid fa-circle-check"></i><span>TUS ENTRADAS</span></div>'
      +'<p class="res-msg">'+esc(result.n||'Comprador')+' · '+arr.length+' entrada(s)</p>'
      +'<p class="res-share">Cada serial es una entrada independiente · comparte cada QR con quien la vaya a usar</p>'
      +'<div class="tk-list">';
    for(var i=0;i<arr.length;i++){
      var serial=String(arr[i]);
      if(!/^[A-Z2-9]{8}$/.test(serial))continue;
      h+='<div class="tk-chip" id="tkc-'+serial+'"><div id="public-ticket-'+serial+'" style="background:#14110d;color:#f3eee3;padding:14px;border-radius:8px">'
        +'<div style="font-family:Anton,sans-serif;font-size:16px;text-align:center;letter-spacing:.06em">BLEED IT LOUD</div>'
        +'<div class="tk-qr-box" style="display:block;margin:12px auto;width:max-content"><img id="pvq-'+serial+'" alt="QR '+esc(serial)+'" style="width:180px;height:180px;max-width:100%"></div>'
        +'<div class="tk-srl" style="text-align:center">'+dashSerial(serial)+'</div><div class="tk-meta" id="tkm-'+serial+'" style="text-align:center">Cargando datos…</div></div>'
        +'<button type="button" class="bs w-full mt-3" onclick="downloadPublicTicket(\''+serial+'\')"><i class="fa-solid fa-download"></i> Descargar entrada</button></div>';
    }
    h+='</div></div>';box.innerHTML=h;
    arr.forEach(function(serial){
      makeQR(serial,320).then(function(url){var el=document.getElementById('pvq-'+serial);if(el&&url)el.src=url;});
      callBackend('getPublicTicketInfo',{serial:serial}).then(function(t){
        var meta=document.getElementById('tkm-'+serial),chip=document.getElementById('tkc-'+serial);
        if(!t.exists){if(chip)chip.remove();return;}
        if(meta)meta.innerHTML=esc(t.e||'')+(t.day&&t.day!=='General'?' · '+esc(t.day):'')+' · Nº '+t.i+(t.u?' · <b>USADA</b>':'');
        if(t.u&&chip)chip.classList.add('off');
      }).catch(function(){var meta=document.getElementById('tkm-'+serial);if(meta)meta.textContent='No se pudieron cargar los datos';});
    });
  }catch(error){
    box.innerHTML=resultHTML({s:'invalid',t:'ERROR DE CONSULTA',m:error.message||'No se pudo consultar. Inténtalo de nuevo.'});
  }
}


async function downloadPublicTicket(serial){
  var el=document.getElementById('public-ticket-'+serial);
  if(!el){showToast('No se encontró la entrada','e');return;}
  if(!window.html2canvas){showToast('No se pudo cargar el exportador de imágenes','e');return;}
  try{
    var canvas=await html2canvas(el,{scale:3,useCORS:true,backgroundColor:'#14110d',logging:false});
    var blob=await new Promise(function(resolve){canvas.toBlob(resolve,'image/png');});
    if(!blob)throw new Error('No se pudo generar la imagen');
    var file=new File([blob],'entrada-'+serial+'.png',{type:'image/png'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:'Entrada BLEED IT LOUD',text:'Guarda esta entrada para presentarla en la puerta.'});
    }else{
      var url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='entrada-'+serial+'.png';a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
      setTimeout(function(){URL.revokeObjectURL(url);},30000);
      showToast('Entrada preparada para descargar','s');
    }
  }catch(e){showToast('No se pudo compartir/descargar. Mantén visible el QR o toma una captura de pantalla.','e');}
}

/* ================= CÁMARA + jsQR ================= */
var CAM={video:null,statusId:'',onResult:null,stream:null,track:null,running:false,raf:0,lastFrame:0,flip:false,lockUntil:0,lastCode:'',lastShown:0,wantDevice:null,camIx:0,torchOn:false,cv:null,cx:null};
function camStart(videoId,statusId,onResult){
  camStop();
  CAM.video=document.getElementById(videoId);
  CAM.statusId=statusId;
  CAM.onResult=onResult;
  if(!window.isSecureContext){camStatus('<i class="fa-solid fa-lock mr-2"></i>La cámara necesita conexión segura (HTTPS). Mientras tanto: sube la foto del QR o escribe el serial.');return;}
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){camStatus('<i class="fa-solid fa-lock mr-2"></i>Cámara no disponible. Usa la foto o el serial manual.');return;}
  ensureJsQR(function(ok){
    if(!ok){camStatus('No se pudo cargar el motor de lectura QR');return;}
    camOpen();
  });
}
function camStatus(html){var el=document.getElementById(CAM.statusId);if(el)el.innerHTML=html;}
function camOpen(){
  if(CAM.stream){CAM.stream.getTracks().forEach(function(t){t.stop();});CAM.stream=null;}
  var v=CAM.video;if(!v)return;
  v.setAttribute('playsinline','');v.muted=true;v.playsInline=true;
  CAM.running=true;CAM.lastCode='';CAM.lastShown=0;CAM.lockUntil=0;
  camStatus('<i class="fa-solid fa-spinner fa-spin mr-2"></i>Encendiendo cámara…');
  var vc=CAM.wantDevice?{deviceId:{exact:CAM.wantDevice},width:{ideal:1280},height:{ideal:720}}:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}};
  navigator.mediaDevices.getUserMedia({audio:false,video:vc}).then(function(st){
    CAM.stream=st;CAM.track=st.getVideoTracks()[0];
    v.srcObject=st;
    var caps={};try{caps=CAM.track.getCapabilities?CAM.track.getCapabilities():{};}catch(e){}
    setTorchUI(!!(caps&&caps.torch));
    return v.play();
  }).then(function(){
    camStatus('<span class="ok-t"><i class="fa-solid fa-video mr-2"></i>CÁMARA LISTA · APUNTA AL QR</span>');
    CAM.cv=document.createElement('canvas');
    CAM.cx=CAM.cv.getContext('2d',{willReadFrequently:true});
    cancelAnimationFrame(CAM.raf);
    CAM.raf=requestAnimationFrame(camTick);
  }).catch(function(err){
    CAM.running=false;
    var msg='No se pudo abrir la cámara.';
    if(err&&err.name==='NotAllowedError')msg='Permiso denegado. Habilita la cámara y reintenta.';
    else if(err&&err.name==='NotFoundError')msg='Este dispositivo no tiene cámara.';
    else if(err&&err.name==='NotReadableError')msg='La cámara está en uso por otra aplicación.';
    camStatus('<i class="fa-solid fa-video-slash mr-2"></i>'+msg+' — Sube la foto o escribe el serial.');
  });
}
function camTick(){
  if(!CAM.running)return;
  CAM.raf=requestAnimationFrame(camTick);
  var v=CAM.video;
  if(!v||v.readyState<2||!v.videoWidth)return;
  var now=performance.now();
  if(now-CAM.lastFrame<110)return;
  CAM.lastFrame=now;
  var sw=Math.min(v.videoWidth,800),sh=Math.max(1,Math.round(v.videoHeight*sw/v.videoWidth));
  CAM.cv.width=sw;CAM.cv.height=sh;
  CAM.cx.drawImage(v,0,0,sw,sh);
  var d;try{d=CAM.cx.getImageData(0,0,sw,sh);}catch(e){return;}
  CAM.flip=!CAM.flip;
  var r=null;
  try{r=jsQR(d.data,sw,sh,{inversionAttempts:CAM.flip?'dontInvert':'onlyInvert'});}catch(e){}
  if(r&&r.data)camResult(r.data);
}
async function camResult(txt){
  var now=Date.now();
  if(now<CAM.lockUntil)return;
  var key=String(txt).trim().toUpperCase();
  if(key===CAM.lastCode&&now-CAM.lastShown<10000)return;
  CAM.lastCode=key;CAM.lastShown=now;CAM.lockUntil=now+2600;
  var r=await coreVerify(key);
  feedback(r);
  if(CAM.onResult)CAM.onResult(r,txt);
}
function feedback(r){if(r.s==='ok'){beepGood();vib(70);}else{beepBad();vib([120,60,120]);}}
function camStop(){
  CAM.running=false;
  cancelAnimationFrame(CAM.raf);
  if(CAM.stream){CAM.stream.getTracks().forEach(function(t){t.stop();});CAM.stream=null;}
  if(CAM.video){try{CAM.video.srcObject=null;}catch(e){}}
  CAM.track=null;setTorchUI(false);
}
function setTorchUI(av){
  ['torch-btn','kiosk-torch-btn'].forEach(function(id){var b=document.getElementById(id);if(b){b.style.display=av?'inline-flex':'none';b.classList.remove('on');}});
  CAM.torchOn=false;
}
function toggleTorch(){
  if(!CAM.track)return;
  CAM.torchOn=!CAM.torchOn;
  CAM.track.applyConstraints({advanced:[{torch:CAM.torchOn}]}).then(function(){
    ['torch-btn','kiosk-torch-btn'].forEach(function(id){var b=document.getElementById(id);if(b)b.classList.toggle('on',CAM.torchOn);});
  }).catch(function(){showToast('La linterna no está disponible en este equipo','e');});
}
function switchCam(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.enumerateDevices){showToast('Cambio de cámara no disponible','i');return;}
  navigator.mediaDevices.enumerateDevices().then(function(ds){
    var cams=ds.filter(function(d){return d.kind==='videoinput';});
    if(cams.length<2){showToast('Solo hay una cámara disponible','i');return;}
    CAM.camIx=(CAM.camIx+1)%cams.length;
    CAM.wantDevice=cams[CAM.camIx].deviceId;
    camOpen();
  }).catch(function(){});
}
function scanImageFile(file,cb){
  if(!file)return;
  if(!window.jsQR){ensureJsQR(function(ok){if(ok)scanImageFile(file,cb);else showToast('No se pudo cargar el lector QR','e');});return;}
  var url=URL.createObjectURL(file);
  var img=new Image();
  img.onload=function(){
    URL.revokeObjectURL(url);
    var scales=[1];
    if(img.naturalWidth<=500)scales=[1,2,3];
    else if(img.naturalWidth>2000)scales=[1,0.5];
    for(var a=0;a<scales.length;a++){
      var w=Math.round(img.naturalWidth*scales[a]),h=Math.round(img.naturalHeight*scales[a]);
      if(w<50||h<50)continue;
      var cv=document.createElement('canvas');cv.width=w;cv.height=h;
      var cx=cv.getContext('2d',{willReadFrequently:true});
      cx.drawImage(img,0,0,w,h);
      var d;try{d=cx.getImageData(0,0,w,h);}catch(e){continue;}
      var r=null;
      try{r=jsQR(d.data,w,h,{inversionAttempts:'attemptBoth'});}catch(e){}
      if(r&&r.data){cb(r.data);return;}
    }
    cb(null);
  };
  img.onerror=function(){URL.revokeObjectURL(url);cb(null);};
  img.src=url;
}
function scanQRFromFile(ev){
  var f=ev.target.files&&ev.target.files[0];ev.target.value='';
  if(!f)return;
  scanImageFile(f,async function(txt){
    if(!txt){showToast('No se detectó un QR legible en esa imagen','e');return;}
    var r=await coreVerify(String(txt).trim().toUpperCase());
    feedback(r);
    var box=document.getElementById('scanner-result');box.style.display='block';box.innerHTML=resultHTML(r);
    pushScanLog(r);updateUI();
  });
}
function scanQRFromFileKiosk(ev){
  var f=ev.target.files&&ev.target.files[0];ev.target.value='';
  if(!f)return;
  scanImageFile(f,async function(txt){
    if(!txt){showToast('No se detectó un QR legible','e');return;}
    var r=await coreVerify(String(txt).trim().toUpperCase());
    feedback(r);
    kioskShow(r);updateUI();
  });
}
function openScanner(){
  if(!AUTH.role){showToast('Inicia sesión primero','e');return;}
  showView('scanner');
  document.getElementById('scanner-result').style.display='none';
  document.getElementById('scan-log-wrap').style.display='none';
  SCANLOG=[];
  setTimeout(function(){camStart('scanner-video','scanner-status',onScannerResult);},200);
}
function onScannerResult(r,txt){
  var box=document.getElementById('scanner-result');box.style.display='block';
  box.innerHTML=resultHTML(r);
  var st=document.getElementById('scanner-status');
  if(st)st.innerHTML=r.s==='ok'?'<span class="ok-t">LECTURA OK · SIGUE ESCANEANDO</span>':'<span class="warn-t">ÚLTIMO: '+esc(r.t)+'</span>';
  pushScanLog(r);
  updateUI();
}
function pushScanLog(r){
  SCANLOG.unshift({t:r.t,ok:r.s==='ok',when:new Date(),ref:r.tk?r.tk.s:(r.a?nD(r.a.D):'—')});
  if(SCANLOG.length>6)SCANLOG.pop();
  var w=document.getElementById('scan-log-wrap');
  if(w)w.style.display='';
  var el=document.getElementById('scan-log');if(!el)return;
  el.innerHTML=SCANLOG.map(function(x){
    return '<div class="log-row '+(x.ok?'ok':'bad')+'"><span class="mono">'+x.when.toLocaleTimeString()+'</span><span>'+esc(x.t)+'</span><span class="mono">'+esc(x.ref)+'</span></div>';
  }).join('');
}
function verifyFromScanner(){runManual('scanner-dni-input','scanner-result');}
function adminVerify(){runManual('admin-dni-input','admin-verify-result');}
async function runManual(inId,outId){
  var raw=document.getElementById(inId).value.trim();
  var box=document.getElementById(outId);box.style.display='block';
  if(!raw){box.innerHTML=resultHTML({s:'invalid',t:'ESCRIBE UN CÓDIGO',m:'Cédula o serial de la entrada.'});return;}
  var r=await coreVerify(raw);
  feedback(r);
  box.innerHTML=resultHTML(r);
  document.getElementById(inId).value='';
  pushScanLog(r);
  updateUI();
}

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

/* ================= PAGOS PENDIENTES ================= */
function renderPendingPayments(){
  var box=document.getElementById('pending-payments-list');if(!box)return;
  if(AUTH.role!=='admin'){box.innerHTML='<p class="empty">DISPONIBLE SOLO PARA EL ADMINISTRADOR</p>';return;}
  var list=pendingPayments.filter(function(p){return p&&(!p.status||p.status==='pendiente');});
  if(!list.length){box.innerHTML='<p class="empty">SIN PAGOS PENDIENTES DE REVISIÓN</p>';return;}
  var h='';
  list.forEach(function(p){
    h+='<div class="pay">'
      +'<div><div class="pay-name">'+esc(p.name||'—')+'</div>'
      +'<div class="pay-meta">CI '+esc(p.dni||'—')+' · '+esc(p.qty||1)+' × '+esc(p.stage||'')+' · REF '+esc(p.ref||'—')+'</div>'
      +(p.phone?'<div class="pay-meta">Telf '+esc(p.phone)+'</div>':'')
      +(p.ts?'<div class="pay-meta">'+new Date(p.ts).toLocaleString()+'</div>':'')+'</div>'
      +'<div class="pay-side"><div class="pay-total">$'+(p.total||0)+'</div>'
      +'<div class="pay-actions">'
      +'<button class="ibtn ok" title="Aprobar y emitir entradas" onclick="approvePayment(\''+esc(p.id)+'\')"><i class="fa-solid fa-check"></i></button>'
      +'<button class="ibtn bad" title="Rechazar" onclick="rejectPayment(\''+esc(p.id)+'\')"><i class="fa-solid fa-xmark"></i></button>'
      +'</div></div></div>';
  });
  box.innerHTML=h;
}
async function approvePayment(id){
  if(AUTH.role!=='admin'){showToast('Solo el admin puede aprobar','e');return;}
  var p=null;
  for(var i=0;i<pendingPayments.length;i++)if(pendingPayments[i]&&pendingPayments[i].id===id){p=pendingPayments[i];break;}
  if(!p)return;
  var result;
  try{result=await callBackend('approvePayment',{id:id});}
  catch(err){showToast(err.message||'No se pudo aprobar el pago.','e');return;}
  if(result.phone&&result.serials&&result.serials.length){
    try{
      var qrs=await encryptSerials(result.dni,result.phone,result.serials);
      if(qrs)await callBackend('setPublicIndex',{dni:result.dni,qrs:qrs});
      else showToast('Pago aprobado, pero no se pudo preparar la descarga de QR. Regenera el índice público.','e');
    }catch(indexError){showToast('Pago aprobado, pero el índice de descarga no se actualizó. Usa «Regenerar índice público».','e');}
  }
  showToast('Pago aprobado · '+(result.count||p.qty||1)+' entrada(s) emitidas','s');
  beepGood();
}
async function rejectPayment(id){
  if(AUTH.role!=='admin'){showToast('Solo el admin puede rechazar','e');return;}
  try{await callBackend('rejectPayment',{id:id});showToast('Solicitud rechazada','s');}
  catch(err){showToast(err.message||'No se pudo rechazar el pago.','e');}
}

/* ================= LISTA Y ESTADÍSTICAS ================= */
function updateUI(){
  var c=document.getElementById('admin-data-count');if(c)c.textContent=attendees.length+' REG';
  updateStats();renderList();renderPendingPayments();patchTicketCards();
}
function animNum(id,to){
  var el=document.getElementById(id);if(!el)return;
  var from=parseInt(el.dataset.v||'0',10);
  if(from===to){el.textContent=to;return;}
  el.dataset.v=to;
  var t0=performance.now();
  function step(t){var p=Math.min(1,(t-t0)/450);el.textContent=Math.round(from+(to-from)*p);if(p<1)requestAnimationFrame(step);}
  requestAnimationFrame(step);
}
function updateStats(){
  var tot=0,paid=0,pend=0,cort=0;
  attendees.forEach(function(a){
    if(!a)return;var c=a.C||1;tot+=c;
    if(isPaid(a.P))paid+=c;else pend+=c;
    if(normalizeStr(a.E||'').indexOf('cortes')>-1)cort+=c;
  });
  animNum('stat-total',tot);animNum('stat-paid',paid);animNum('stat-pending',pend);animNum('stat-cortesia',cort);
  setTicketSummary();
  var tArr=ticketsArr(),vEl=document.getElementById('verified-count'),tEl=document.getElementById('total-count');
  if(tArr.length){vEl.textContent=tArr.filter(function(t){return t.u;}).length;tEl.textContent=tArr.length;}
  else{vEl.textContent=0;tEl.textContent=tot;}
}
function setTicketSummary(){
  var el=document.getElementById('ticket-summary');if(!el)return;
  var arr=ticketsArr();
  if(!arr.length){el.textContent='SIN EMITIR';return;}
  var used=arr.filter(function(t){return t.u;}).length;
  el.innerHTML=arr.length+' EMITIDAS · <span style="color:var(--green)">'+(arr.length-used)+' DISPONIBLES</span> · <span style="color:var(--red)">'+used+' USADAS</span>';
}
function renderStageStats(){
  var box=document.getElementById('stage-stats');if(!box)return;
  var g={};
  attendees.forEach(function(a){if(!a)return;var k=a.E_D||a.E||'General';if(!g[k])g[k]={sold:0,in:0};g[k].sold+=(a.C||1);});
  Object.keys(tickets).forEach(function(s){var t=tickets[s];if(!t)return;var k=t.day||'General';if(!g[k])g[k]={sold:0,in:0};if(t.u)g[k].in++;});
  var h='';
  Object.keys(g).forEach(function(k){
    var o=g[k],pct=o.sold?Math.min(100,Math.round(100*o.in/o.sold)):0;
    h+='<div class="stg"><div class="stg-head"><span>'+esc(k)+'</span><span class="stg-nums">'+o.in+' / '+o.sold+' EN PUERTA</span></div><div class="bar"><i style="width:'+pct+'%"></i></div></div>';
  });
  box.innerHTML=h;
}
function renderList(){
  var tb=document.getElementById('attendee-tbody');if(!tb)return;
  var q=normalizeStr(document.getElementById('search-attendee').value||'');
  var dq=nD(q);
  var rows=attendees.map(function(a,i){return{i:i,a:a};}).filter(function(r){
    if(!r.a)return false;
    if(!q)return true;
    return normalizeStr(r.a.N).indexOf(q)>-1||(dq&&nD(r.a.D).indexOf(dq)>-1);
  });
  var h='';
  rows.forEach(function(r){
    var a=r.a,u=usedCountFor(a);
    h+='<tr>'
      +'<td><span class="chip">'+esc(a.E||'—')+'</span>'+(a.E_D&&a.E_D!=='General'?'<span class="td-sub">'+esc(a.E_D)+'</span>':'')+'</td>'
      +'<td class="td-name">'+esc(a.N||'—')+'</td>'
      +'<td class="td-mono">'+esc(a.D)+'</td>'
      +'<td><span class="u-count '+(u>=(a.C||1)?'full':(u>0?'part':''))+'">'+u+'/'+(a.C||1)+'</span>'+(isPaid(a.P)?'':' <span class="chip chip-warn">por pagar</span>')+'</td>'
      +'<td class="td-actions"><button class="ibtn ok" title="Check-in" onclick="quickCheckIn('+r.i+')"><i class="fa-solid fa-right-to-bracket"></i></button>'
      +'<button class="ibtn" title="Editar" onclick="openEditModal('+r.i+')"><i class="fa-solid fa-pen"></i></button></td>'
      +'</tr>';
  });
  if(!rows.length)h='<tr><td colspan="5" class="empty">SIN RESULTADOS</td></tr>';
  tb.innerHTML=h;
  renderStageStats();
}
async function quickCheckIn(i){
  var a=attendees[i];if(!a)return;
  var r=await coreVerify(a.D);
  feedback(r);
  showToast(r.t,r.s==='ok'?'s':'e');
  updateUI();
}

/* ================= ENTRADAS VISUALES ================= */
async function generateAllVisualTickets(){
  if(AUTH.role!=='admin'){showToast('Solo el admin puede generar entradas','e');return;}
  var created=ensureAllTickets();
  renderTicketCards();
  var el=document.getElementById('pub-progress');
  el.textContent=created?('EMITIDAS '+created+' NUEVAS · ACTUALIZANDO ÍNDICE…'):'ACTUALIZANDO ÍNDICE…';
  await buildPubAll();
  var total=ticketsArr().length;
  showToast('Entradas al día · '+total+' en total','s');
}
function renderTicketCards(){
  var grid=document.getElementById('qr-grid');if(!grid)return;
  var arr=ticketsArr();
  arr.sort(function(a,b){
    var ka=(a.n||'')+'|'+(a.day||'')+'|'+(a.i||0),kb=(b.n||'')+'|'+(b.day||'')+'|'+(b.i||0);
    return ka<kb?-1:ka>kb?1:0;
  });
  setTicketSummary();
  if(!arr.length){grid.innerHTML='<p class="empty" style="grid-column:1/-1">AÚN NO HAY ENTRADAS EMITIDAS — APRUEBA PAGOS O PULSA «GENERAR / ACTUALIZAR»</p>';return;}
  var color=salesConfig.day_color||'#e0281a';
  var evName=(salesConfig.event_name||'BLEED IT LOUD').toUpperCase();
  var evDate=(salesConfig.event_date||'').toUpperCase();
  var img=salesConfig.event_logo||DEFAULT_TICKET_IMG;
  var h='';
  arr.forEach(function(t){
    h+='<div class="vt-wrap">'
      +'<div class="vt'+(t.u?' used':'')+'" id="vt-'+t.s+'">'
      +'<div class="vt-media"><img src="'+esc(img)+'" crossorigin="anonymous" alt="" onerror="this.remove()"><div class="vt-shade"></div>'
      +'<div class="vt-head"><span>'+esc(evName)+'</span><span>'+esc(evDate)+'</span></div></div>'
      +'<div class="vt-body">'
      +'<div class="vt-qr"><img id="q-'+t.s+'" alt="QR '+esc(t.s)+'"></div>'
      +'<div class="vt-name">'+esc(t.n||'ASISTENTE')+'</div>'
      +'<div class="vt-serial">'+dashSerial(t.s)+'</div>'
      +'<div class="vt-row"><span class="chip" style="color:'+color+'">'+esc(t.e||'GENERAL')+'</span>'+(t.day&&t.day!=='General'?'<span class="chip">'+esc(t.day)+'</span>':'')+'<span class="vt-code">Nº '+t.i+'</span></div>'
      +'</div>'
      +'<div class="perf"></div>'
      +'<div class="vt-stub"><span>Admit one</span><span class="mono">'+esc(t.s)+'</span></div>'
      +'</div>'
      +'<button class="bs vt-dl" onclick="downloadTicket(\''+t.s+'\')"><i class="fa-solid fa-download mr-2"></i>Descargar PNG</button>'
      +'</div>';
  });
  grid.innerHTML=h;
  arr.forEach(function(t){
    makeQR(t.s,640).then(function(url){
      var el=document.getElementById('q-'+t.s);
      if(el){if(url)el.src=url;else el.parentNode.innerHTML='<span class="mono" style="font-size:11px;color:#111">'+esc(t.s)+'</span>';}
    });
  });
}
function patchTicketCards(){
  ticketsArr().forEach(function(t){
    var el=document.getElementById('vt-'+t.s);
    if(el)el.classList.toggle('used',!!t.u);
  });
}
function downloadTicket(s){
  var el=document.getElementById('vt-'+s);if(!el)return;
  if(!window.html2canvas){showToast('No se pudo cargar el exportador','e');return;}
  html2canvas(el,{scale:2,useCORS:true,backgroundColor:'#0c0a08',logging:false}).then(function(c){
    var a=document.createElement('a');a.download='entrada-'+s+'.png';a.href=c.toDataURL('image/png');a.click();
  }).catch(function(){showToast('No se pudo exportar la entrada','e');});
}
function downloadAllTickets(){
  var arr=ticketsArr();
  if(!arr.length){showToast('Primero genera las entradas','e');return;}
  showToast('Descargando '+arr.length+' entradas…','i');
  var i=0;
  (function next(){
    if(i>=arr.length){showToast('Descarga completa','s');return;}
    var s=arr[i++].s;
    var el=document.getElementById('vt-'+s);
    if(el&&window.html2canvas){
      html2canvas(el,{scale:2,useCORS:true,backgroundColor:'#0c0a08',logging:false}).then(function(c){
        var a=document.createElement('a');a.download='entrada-'+s+'.png';a.href=c.toDataURL('image/png');a.click();
        setTimeout(next,450);
      }).catch(function(){setTimeout(next,450);});
    }else setTimeout(next,60);
  })();
}

/* ================= EDICIÓN / MANUAL ================= */
function openEditModal(i){
  var a=attendees[i];if(!a)return;
  document.getElementById('edit-index').value=i;
  document.getElementById('edit-nombre').value=a.N||'';
  document.getElementById('edit-cedula').value=a.D||'';
  document.getElementById('edit-cantidad').value=a.C||1;
  document.getElementById('edit-etapa').value=a.E||'';
  document.getElementById('edit-phone').value=a.T||'';
  document.getElementById('edit-paid').checked=isPaid(a.P);
  openModal('edit-modal');
}
function closeEditModal(){closeModal('edit-modal');}
async function saveEditedAttendee(){
  if(AUTH.role!=='admin'){showToast('Solo el admin puede editar','e');return;}
  var i=parseInt(document.getElementById('edit-index').value,10);
  var a=attendees[i];if(!a)return;
  a.N=document.getElementById('edit-nombre').value.trim()||a.N;
  a.D=nD(document.getElementById('edit-cedula').value)||a.D;
  a.C=Math.max(1,parseInt(document.getElementById('edit-cantidad').value,10)||1);
  a.E=document.getElementById('edit-etapa').value.trim()||a.E;
  a.T=nD(document.getElementById('edit-phone').value);
  a.P=document.getElementById('edit-paid').checked;
  saveAttendees();
  syncTicketsForDni(a.D);
  await refreshPubFor(a.D);
  closeEditModal();showToast('Asistente actualizado','s');
}
async function syncTicketsForDni(dni){
  var rows=attendees.filter(function(a){return a&&nD(a.D)===nD(dni);});
  if(!rows.length)return;
  var total=0;rows.forEach(function(a){total+=(a.C||1);});
  var ts=ticketsOf(dni,null);
  var extra=ts.filter(function(t){return (t.i||0)>total;});
  extra.forEach(function(t){delete tickets[t.s];});
  ts.forEach(function(t){t.n=rows[0].N||t.n;});
  if(fbConnected&&AUTH.role==='admin'){
    extra.forEach(function(t){
      fbDB.ref('events/'+FB_EVENT_ID+'/tickets/'+t.s).remove().catch(function(){});
      fbDB.ref('events/'+FB_EVENT_ID+'/doorLog/'+t.s).remove().catch(function(){});
    });
  }
  ensureTicketsFor(dni,rows[0].E_D||'General');
  updateUI();
}
async function resetAttendeeEntries(){
  if(AUTH.role!=='admin'){showToast('Solo el admin puede reiniciar','e');return;}
  var i=parseInt(document.getElementById('edit-index').value,10);
  var a=attendees[i];if(!a)return;
  var ts=ticketsOf(a.D,null);
  ts.forEach(function(t){
    t.u=false;t.ua=null;
    if(fbConnected){
      fbDB.ref('events/'+FB_EVENT_ID+'/tickets/'+t.s).update({u:false,ua:null}).catch(function(){});
      fbDB.ref('events/'+FB_EVENT_ID+'/doorLog/'+t.s).remove().catch(function(){});
    }
  });
  var total=(a.C||1);
  var extra=ts.filter(function(t){return (t.i||0)>total;});
  extra.forEach(function(t){delete tickets[t.s];});
  if(fbConnected){
    extra.forEach(function(t){
      fbDB.ref('events/'+FB_EVENT_ID+'/tickets/'+t.s).remove().catch(function(){});
      fbDB.ref('events/'+FB_EVENT_ID+'/doorLog/'+t.s).remove().catch(function(){});
    });
  }
  await refreshPubFor(a.D);
  closeEditModal();updateUI();showToast('Ingresos reiniciados','s');
}
async function addManualAttendee(){
  if(AUTH.role!=='admin'){showToast('Solo el admin puede agregar','e');return;}
  var name=document.getElementById('manual-nombre').value.trim();
  var dni=nD(document.getElementById('manual-cedula').value);
  var phone=nD(document.getElementById('manual-phone').value);
  if(!name||!dni){showToast('Nombre y cédula son obligatorios','e');return;}
  attendees.push({
    N:name,D:dni,
    E:document.getElementById('manual-etapa').value.trim()||'Manual',
    E_D:salesConfig.active_day||'Manual',
    C:Math.max(1,parseInt(document.getElementById('manual-cantidad').value,10)||1),
    T:phone,P:true
  });
  saveAttendees();
  ensureTicketsFor(dni,salesConfig.active_day||'Manual');
  await refreshPubFor(dni);
  document.getElementById('manual-nombre').value='';
  document.getElementById('manual-cedula').value='';
  document.getElementById('manual-phone').value='';
  showToast('Asistente agregado · seriales emitidos'+(phone?'':' (sin teléfono: QR no consultable)'),phone?'s':'i');
}

/* ================= CARGA MASIVA ================= */
function parseLine(l){
  var out=[],cur='',q=false;
  for(var i=0;i<l.length;i++){
    var ch=l[i];
    if(ch==='"'){if(q&&l[i+1]==='"'){cur+='"';i++;}else q=!q;}
    else if(ch===','&&!q){out.push(cur);cur='';}
    else cur+=ch;
  }
  out.push(cur);return out;
}
function parseCSV(t,dayName){
  if(!t)return[];
  t=t.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  var ls=t.split('\n').filter(function(l){return l.trim();});
  if(ls.length<2)throw new Error('No hay suficientes filas de datos.');
  var headerIndex=-1;
  for(var i=0;i<ls.length;i++){
    var ln=normalizeStr(ls[i]);
    if(ln.indexOf('cedula')>-1||ln.indexOf('dni')>-1){headerIndex=i;break;}
  }
  if(headerIndex===-1)throw new Error('No se encontró la columna Cédula.');
  var hs=parseLine(ls[headerIndex]),hn=[];
  for(var h=0;h<hs.length;h++)hn.push(normalizeStr(hs[h]));
  var nI=-1,dI=-1,eI=-1,cI=-1,tI=-1,pI=-1;
  for(var k=0;k<hn.length;k++){
    if(nI===-1&&(hn[k].indexOf('nombre')>-1||hn[k].indexOf('name')>-1))nI=k;
    if(dI===-1&&(hn[k].indexOf('cedula')>-1||hn[k].indexOf('dni')>-1))dI=k;
    if(eI===-1&&(hn[k].indexOf('etapa')>-1||hn[k].indexOf('bloque')>-1||hn[k].indexOf('stage')>-1))eI=k;
    if(cI===-1&&(hn[k].indexOf('cantidad')>-1||hn[k].indexOf('cant')>-1))cI=k;
    if(tI===-1&&(hn[k].indexOf('tel')>-1||hn[k].indexOf('movil')>-1||hn[k].indexOf('phone')>-1))tI=k;
    if(pI===-1&&(hn[k].indexOf('pagado')>-1||hn[k].indexOf('pago')>-1||hn[k].indexOf('status')>-1||hn[k].indexOf('estado')>-1))pI=k;
  }
  if(dI===-1)throw new Error('Columna Cédula no legible.');
  var out=[];
  for(var r=headerIndex+1;r<ls.length;r++){
    var cs=parseLine(ls[r]);
    var dni=nD(cs[dI]);
    if(!dni)continue;
    out.push({
      N:(nI>-1&&cs[nI])?String(cs[nI]).trim():'',
      D:dni,
      E:(eI>-1&&cs[eI])?String(cs[eI]).trim():(salesConfig.active_day||'General'),
      E_D:dayName,
      C:Math.max(1,parseInt(nD(cs[cI]),10)||1),
      T:(tI>-1&&cs[tI])?nD(cs[tI]):'',
      P:(pI>-1&&cs[pI]!==undefined)?isPaid(cs[pI]):true
    });
  }
  return out;
}
async function mergeAndUpload(parsed){
  if(!Array.isArray(attendees))attendees=[];
  for(var i=0;i<parsed.length;i++){
    var exists=false;
    for(var j=0;j<attendees.length;j++){
      if(attendees[j]&&nD(attendees[j].D)===nD(parsed[i].D)&&attendees[j].E_D===parsed[i].E_D){
        attendees[j].C+=parsed[i].C;exists=true;break;
      }
    }
    if(!exists)attendees.push(parsed[i]);
  }
  if(fbConnected){
    showToast('Subiendo a la nube…','i');
    try{
      await fbDB.ref('events/'+FB_EVENT_ID+'/attendees').set(attendees);
      showToast(parsed.length+' registros cargados en la nube','s');
    }catch(err){
      if(err&&err.code==='PERMISSION_DENIED')showToast('Sin permiso (inicia sesión como admin)','e');
      else showToast('Error: '+err.message,'e');
    }
  }else showToast('Sin conexión con la nube','e');
  ensureAllTickets();
  updateUI();
  await buildPubAll();   /* indexa y cifra los QR de los pagados */
}
function handleFileUpload(){
  var fi=document.getElementById('file-input');
  if(!fi||!fi.files||!fi.files.length){showToast('Selecciona un archivo','e');return;}
  var dayName=document.getElementById('upload-day-name').value.trim()||salesConfig.active_day||'General';
  var file=fi.files[0],reader=new FileReader();
  reader.onload=function(e){
    try{
      var data=new Uint8Array(e.target.result);
      var wb=XLSX.read(data,{type:'array'});
      if(!wb||!wb.SheetNames||!wb.SheetNames.length)throw new Error('Archivo Excel vacío');
      var csv=XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
      var parsed=parseCSV(csv,dayName);
      if(!parsed.length)throw new Error('No se encontraron datos válidos en el Excel');
      mergeAndUpload(parsed);fi.value='';
    }catch(err){showToast('Error: '+err.message,'e');}
  };
  reader.readAsArrayBuffer(file);
}
function handlePasteUpload(){
  var txt=document.getElementById('paste-list-input').value.trim();
  if(!txt){showToast('Pega los datos primero','e');return;}
  var dayName=document.getElementById('upload-day-name').value.trim()||salesConfig.active_day||'General';
  try{
    var parsed=parseCSV(txt,dayName);
    if(!parsed.length)throw new Error('No se encontraron datos válidos en el texto pegado.');
    mergeAndUpload(parsed);
    document.getElementById('paste-list-input').value='';
  }catch(err){showToast('Error: '+err.message,'e');}
}

/* ================= DATOS ================= */
function exportAudit(){
  if(!window.XLSX){showToast('No se pudo cargar la librería Excel','e');return;}
  var wb=XLSX.utils.book_new();
  var rows=[['Nombre','Cédula','Etapa','Día','Cantidad','Usadas','Pagado','Teléfono']];
  attendees.forEach(function(a){
    if(a)rows.push([a.N||'',a.D||'',a.E||'',a.E_D||'',a.C||1,usedCountFor(a),isPaid(a.P)?'SÍ':'NO',a.T||'']);
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Asistentes');
  var tk=[['Serial','Nombre','Cédula','Día','Etapa','Nº','Estado','Usada el','Marcada por']];
  ticketsArr().forEach(function(t){
    var lg=doorLog[t.s];
    tk.push([t.s,t.n||'',t.d||'',t.day||'',t.e||'',t.i||1,t.u?'USADA':'VIGENTE',(t.ua||(lg&&lg.ts))?fmtDT(t.ua||(lg&&lg.ts)):'',lg?(lg.by||''):'']);
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(tk),'Entradas');
  var pend=[['Nombre','Cédula','Teléfono','Cantidad','Etapa','Referencia','Total','Fecha']];
  pendingPayments.forEach(function(p){
    if(p)pend.push([p.name||'',p.dni||'',p.phone||'',p.qty||'',p.stage||'',p.ref||'',p.total||'',p.ts?new Date(p.ts).toLocaleString():'']);
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(pend),'Pendientes');
  XLSX.writeFile(wb,'live-cafe-rock-datos.xlsx');
}
function askConfirm(t,m,cb){
  document.getElementById('confirm-title').textContent=t;
  document.getElementById('confirm-msg').textContent=m;
  confirmCb=cb;openModal('confirm-modal');
}
function runConfirm(){if(confirmCb)confirmCb();confirmCb=null;closeModal('confirm-modal');}
function clearAllDataForNewEvent(){
  askConfirm('BORRAR TODO','Se eliminarán asistentes, entradas, índice público y configuración en la nube. Esta acción no tiene vuelta atrás.',function(){
    if(fbConnected&&AUTH.role==='admin'){
      ['config','attendees','pub','tickets','doorLog','pending','used'].forEach(function(k){
        fbDB.ref('events/'+FB_EVENT_ID+'/'+k).remove().catch(function(){});
      });
    }
    localStorage.removeItem('bleedit_theme2');
    setTimeout(function(){location.reload();},900);
  });
}
