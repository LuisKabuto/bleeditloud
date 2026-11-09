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
  if(AUTH.role==='portero')enterKioskMode();
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
