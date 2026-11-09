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
