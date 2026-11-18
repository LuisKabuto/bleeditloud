/* ================= CARGA MASIVA ================= */
function parseLine(l){
  var out=[],cur='',q=false;
  for(var i=0;i<l.length;i++){
    var ch=l[i];
    if(ch==='"'){if(q&&l[i+1]==='"'){cur+='"';i++;}else q=!q;}
    else if(ch===','&&!q){out.push(cur);cur='';}
    else cur+=ch;
  }
  out.push(cur);return out;
}
function parseCSV(t,dayName){
  if(!t)return[];
  t=t.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  var ls=t.split('\n').filter(function(l){return l.trim();});
  if(ls.length<2)throw new Error('No hay suficientes filas de datos.');
  var headerIndex=-1;
  for(var i=0;i<ls.length;i++){
    var ln=normalizeStr(ls[i]);
    if(ln.indexOf('cedula')>-1||ln.indexOf('dni')>-1){headerIndex=i;break;}
  }
  if(headerIndex===-1)throw new Error('No se encontró la columna Cédula.');
  var hs=parseLine(ls[headerIndex]),hn=[];
  for(var h=0;h<hs.length;h++)hn.push(normalizeStr(hs[h]));
  var nI=-1,dI=-1,eI=-1,cI=-1,tI=-1,pI=-1;
  for(var k=0;k<hn.length;k++){
    if(nI===-1&&(hn[k].indexOf('nombre')>-1||hn[k].indexOf('name')>-1))nI=k;
    if(dI===-1&&(hn[k].indexOf('cedula')>-1||hn[k].indexOf('dni')>-1))dI=k;
    if(eI===-1&&(hn[k].indexOf('etapa')>-1||hn[k].indexOf('bloque')>-1||hn[k].indexOf('stage')>-1))eI=k;
    if(cI===-1&&(hn[k].indexOf('cantidad')>-1||hn[k].indexOf('cant')>-1))cI=k;
    if(tI===-1&&(hn[k].indexOf('tel')>-1||hn[k].indexOf('movil')>-1||hn[k].indexOf('phone')>-1))tI=k;
    if(pI===-1&&(hn[k].indexOf('pagado')>-1||hn[k].indexOf('pago')>-1||hn[k].indexOf('status')>-1||hn[k].indexOf('estado')>-1))pI=k;
  }
  if(dI===-1)throw new Error('Columna Cédula no legible.');
  var out=[];
  for(var r=headerIndex+1;r<ls.length;r++){
    var cs=parseLine(ls[r]);
    var dni=nD(cs[dI]);
    if(!dni)continue;
    out.push({
      N:(nI>-1&&cs[nI])?String(cs[nI]).trim():'',
      D:dni,
      E:(eI>-1&&cs[eI])?String(cs[eI]).trim():(salesConfig.active_day||'General'),
      E_D:dayName,
      C:Math.max(1,parseInt(nD(cs[cI]),10)||1),
      T:(tI>-1&&cs[tI])?nD(cs[tI]):'',
      P:(pI>-1&&cs[pI]!==undefined)?isPaid(cs[pI]):true
    });
  }
  return out;
}
async function mergeAndUpload(parsed){
  if(!Array.isArray(attendees))attendees=[];
  for(var i=0;i<parsed.length;i++){
    var exists=false;
    for(var j=0;j<attendees.length;j++){
      if(attendees[j]&&nD(attendees[j].D)===nD(parsed[i].D)&&attendees[j].E_D===parsed[i].E_D){
        attendees[j].C+=parsed[i].C;exists=true;break;
      }
    }
    if(!exists)attendees.push(parsed[i]);
  }
  if(fbConnected){
    showToast('Subiendo a la nube…','i');
    try{
      await fbDB.ref('events/'+FB_EVENT_ID+'/attendees').set(attendees);
      showToast(parsed.length+' registros cargados en la nube','s');
    }catch(err){
      if(err&&err.code==='PERMISSION_DENIED')showToast('Sin permiso (inicia sesión como admin)','e');
      else showToast('Error: '+err.message,'e');
    }
  }else showToast('Sin conexión con la nube','e');
  ensureAllTickets();
  updateUI();
  await buildPubAll();   /* indexa y cifra los QR de los pagados */
}
function handleFileUpload(){
  var fi=document.getElementById('file-input');
  if(!fi||!fi.files||!fi.files.length){showToast('Selecciona un archivo','e');return;}
  var dayName=document.getElementById('upload-day-name').value.trim()||salesConfig.active_day||'General';
  var file=fi.files[0],reader=new FileReader();
  reader.onload=function(e){
    try{
      var data=new Uint8Array(e.target.result);
      var wb=XLSX.read(data,{type:'array'});
      if(!wb||!wb.SheetNames||!wb.SheetNames.length)throw new Error('Archivo Excel vacío');
      var csv=XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
      var parsed=parseCSV(csv,dayName);
      if(!parsed.length)throw new Error('No se encontraron datos válidos en el Excel');
      mergeAndUpload(parsed);fi.value='';
    }catch(err){showToast('Error: '+err.message,'e');}
  };
  reader.readAsArrayBuffer(file);
}
function handlePasteUpload(){
  var txt=document.getElementById('paste-list-input').value.trim();
  if(!txt){showToast('Pega los datos primero','e');return;}
  var dayName=document.getElementById('upload-day-name').value.trim()||salesConfig.active_day||'General';
  try{
    var parsed=parseCSV(txt,dayName);
    if(!parsed.length)throw new Error('No se encontraron datos válidos en el texto pegado.');
    mergeAndUpload(parsed);
    document.getElementById('paste-list-input').value='';
  }catch(err){showToast('Error: '+err.message,'e');}
}
