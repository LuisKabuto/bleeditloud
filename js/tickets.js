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
