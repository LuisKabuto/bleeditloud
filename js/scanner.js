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
