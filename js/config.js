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
var DEFAULT_TICKET_IMG="./assets/icon.svg";
