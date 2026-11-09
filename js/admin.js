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
