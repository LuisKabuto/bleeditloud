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
