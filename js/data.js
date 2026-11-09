/* ================= DATOS ================= */
function exportAudit(){
  if(!window.XLSX){showToast('No se pudo cargar la librería Excel','e');return;}
  var wb=XLSX.utils.book_new();
  var rows=[['Nombre','Cédula','Etapa','Día','Cantidad','Usadas','Pagado','Teléfono']];
  attendees.forEach(function(a){
    if(a)rows.push([a.N||'',a.D||'',a.E||'',a.E_D||'',a.C||1,usedCountFor(a),isPaid(a.P)?'SÍ':'NO',a.T||'']);
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Asistentes');
  var tk=[['Serial','Nombre','Cédula','Día','Etapa','Nº','Estado','Usada el','Marcada por']];
  ticketsArr().forEach(function(t){
    var lg=doorLog[t.s];
    tk.push([t.s,t.n||'',t.d||'',t.day||'',t.e||'',t.i||1,t.u?'USADA':'VIGENTE',(t.ua||(lg&&lg.ts))?fmtDT(t.ua||(lg&&lg.ts)):'',lg?(lg.by||''):'']);
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(tk),'Entradas');
  var pend=[['Nombre','Cédula','Teléfono','Cantidad','Etapa','Referencia','Total','Fecha']];
  pendingPayments.forEach(function(p){
    if(p)pend.push([p.name||'',p.dni||'',p.phone||'',p.qty||'',p.stage||'',p.ref||'',p.total||'',p.ts?new Date(p.ts).toLocaleString():'']);
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(pend),'Pendientes');
  XLSX.writeFile(wb,'live-cafe-rock-datos.xlsx');
}
function askConfirm(t,m,cb){
  document.getElementById('confirm-title').textContent=t;
  document.getElementById('confirm-msg').textContent=m;
  confirmCb=cb;openModal('confirm-modal');
}
function runConfirm(){if(confirmCb)confirmCb();confirmCb=null;closeModal('confirm-modal');}
function clearAllDataForNewEvent(){
  askConfirm('BORRAR TODO','Se eliminarán asistentes, entradas, índice público y configuración en la nube. Esta acción no tiene vuelta atrás.',function(){
    if(fbConnected&&AUTH.role==='admin'){
      ['config','attendees','pub','tickets','doorLog','pending','used'].forEach(function(k){
        fbDB.ref('events/'+FB_EVENT_ID+'/'+k).remove().catch(function(){});
      });
    }
    localStorage.removeItem('bleedit_theme2');
    setTimeout(function(){location.reload();},900);
  });
}
