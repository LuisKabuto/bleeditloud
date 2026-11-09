/* ================= MIS ENTRADAS (PÚBLICO, con cifrado) ================= */
var PV={ced:null,pub:null};
function verifyDNI(){
  var box=document.getElementById('verify-result');box.style.display='block';
  var dni=nD(document.getElementById('verify-dni').value);
  if(!/^[0-9]{5,12}$/.test(dni)){box.innerHTML=resultHTML({s:'invalid',t:'CÉDULA NO VÁLIDA',m:'Escribe la cédula con la que compraste.'});return;}
  PV={ced:dni,pub:{}};
  renderPhoneStep(box);
}
function renderPhoneStep(box){
  box.innerHTML='<div class="res res-ok">'
    +'<div class="res-head"><i class="fa-solid fa-ticket"></i><span>CONSULTAR MIS ENTRADAS</span></div>'
    +'<p class="res-msg">Introduce el teléfono registrado al comprar. La consulta valida la cédula y el teléfono juntos.</p>'
    +'<div class="flex gap-3 mt-4">'
    +'<input type="text" id="pv-phone" class="di" placeholder="Teléfono registrado" inputmode="numeric">'
    +'<button class="bp px-6" onclick="revealPublicQRs()"><i class="fa-solid fa-unlock"></i></button>'
    +'</div>'
    +'<div id="pv-error" style="color:var(--red);font-size:14px;margin-top:10px;display:none"></div>'
    +'</div>';
  document.getElementById('pv-phone').addEventListener('keydown',function(e){if(e.key==='Enter')revealPublicQRs();});
}
async function revealPublicQRs(){
  var box=document.getElementById('verify-result');
  var err=document.getElementById('pv-error');
  var phone=nD(document.getElementById('pv-phone').value);
  if(phone.length<7){err.textContent='Escribe el teléfono completo';err.style.display='block';return;}
  err.style.display='none';
  box.innerHTML='<p class="empty">VALIDANDO DATOS…</p>';
  try{
    var result=await callBackend('getPublicOrderIndex',{dni:PV.ced,phone:phone});
    if(!result.found){
      box.innerHTML=resultHTML({s:'invalid',t:'NO ENCONTRADA',m:'No se encontraron entradas con esa cédula y teléfono. Comprueba los datos e inténtalo de nuevo.'});
      return;
    }
    if(result.status==='pending'||!result.p){
      box.innerHTML=resultHTML({s:'warn',t:'PAGO EN REVISIÓN',m:'Hola'+(result.n?' '+result.n:'')+'. El pago sigue pendiente de aprobación.'});
      return;
    }
    var arr=result.serials||[];
    if(!arr.length){box.innerHTML=resultHTML({s:'warn',t:'ENTRADAS NO DISPONIBLES',m:'Contacta al organizador para revisar tu compra.'});return;}
    var h='<div class="res res-ok">'
      +'<div class="res-head"><i class="fa-solid fa-circle-check"></i><span>TUS ENTRADAS</span></div>'
      +'<p class="res-msg">'+esc(result.n||'Comprador')+' · '+arr.length+' entrada(s)</p>'
      +'<p class="res-share">Cada serial es una entrada independiente · comparte cada QR con quien la vaya a usar</p>'
      +'<div class="tk-list">';
    for(var i=0;i<arr.length;i++){
      var serial=String(arr[i]);
      if(!/^[A-Z2-9]{8}$/.test(serial))continue;
      h+='<div class="tk-chip" id="tkc-'+serial+'"><div id="public-ticket-'+serial+'" style="background:#14110d;color:#f3eee3;padding:14px;border-radius:8px">'
        +'<div style="font-family:Anton,sans-serif;font-size:16px;text-align:center;letter-spacing:.06em">BLEED IT LOUD</div>'
        +'<div class="tk-qr-box" style="display:block;margin:12px auto;width:max-content"><img id="pvq-'+serial+'" alt="QR '+esc(serial)+'" style="width:180px;height:180px;max-width:100%"></div>'
        +'<div class="tk-srl" style="text-align:center">'+dashSerial(serial)+'</div><div class="tk-meta" id="tkm-'+serial+'" style="text-align:center">Cargando datos…</div></div>'
        +'<button type="button" class="bs w-full mt-3" onclick="downloadPublicTicket(\''+serial+'\')"><i class="fa-solid fa-download"></i> Descargar entrada</button></div>';
    }
    h+='</div></div>';box.innerHTML=h;
    arr.forEach(function(serial){
      makeQR(serial,320).then(function(url){var el=document.getElementById('pvq-'+serial);if(el&&url)el.src=url;});
      callBackend('getPublicTicketInfo',{serial:serial}).then(function(t){
        var meta=document.getElementById('tkm-'+serial),chip=document.getElementById('tkc-'+serial);
        if(!t.exists){if(chip)chip.remove();return;}
        if(meta)meta.innerHTML=esc(t.e||'')+(t.day&&t.day!=='General'?' · '+esc(t.day):'')+' · Nº '+t.i+(t.u?' · <b>USADA</b>':'');
        if(t.u&&chip)chip.classList.add('off');
      }).catch(function(){var meta=document.getElementById('tkm-'+serial);if(meta)meta.textContent='No se pudieron cargar los datos';});
    });
  }catch(error){
    box.innerHTML=resultHTML({s:'invalid',t:'ERROR DE CONSULTA',m:error.message||'No se pudo consultar. Inténtalo de nuevo.'});
  }
}


async function downloadPublicTicket(serial){
  var el=document.getElementById('public-ticket-'+serial);
  if(!el){showToast('No se encontró la entrada','e');return;}
  if(!window.html2canvas){showToast('No se pudo cargar el exportador de imágenes','e');return;}
  try{
    var canvas=await html2canvas(el,{scale:3,useCORS:true,backgroundColor:'#14110d',logging:false});
    var blob=await new Promise(function(resolve){canvas.toBlob(resolve,'image/png');});
    if(!blob)throw new Error('No se pudo generar la imagen');
    var file=new File([blob],'entrada-'+serial+'.png',{type:'image/png'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:'Entrada BLEED IT LOUD',text:'Guarda esta entrada para presentarla en la puerta.'});
    }else{
      var url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='entrada-'+serial+'.png';a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
      setTimeout(function(){URL.revokeObjectURL(url);},30000);
      showToast('Entrada preparada para descargar','s');
    }
  }catch(e){showToast('No se pudo compartir/descargar. Mantén visible el QR o toma una captura de pantalla.','e');}
}
