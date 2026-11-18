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
