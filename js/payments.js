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
