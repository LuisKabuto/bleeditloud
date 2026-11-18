(function(){
  if(!("serviceWorker" in navigator))return;
  window.addEventListener("load",function(){
    navigator.serviceWorker.register("./sw.js",{scope:"./"})
      .catch(function(error){console.warn("No se pudo registrar la PWA:",error);});
  });
})();
