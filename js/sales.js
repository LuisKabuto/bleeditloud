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
