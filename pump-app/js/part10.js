
var R2Outbox=(function(){'use strict';
  var DB_NAME='arencon_r2_outbox';
  var DB_VERSION=1;
  var STORE='outbox';
  var _ready=null;
  var _driving=false;
  var _onVerified=null;

  function _open(){
    if(_ready)return _ready;
    _ready=new Promise(function(resolve,reject){
      if(typeof indexedDB==='undefined'){reject(new Error('no indexedDB'));return;}
      var req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=function(e){
        var db=e.target.result;
        if(!db.objectStoreNames.contains(STORE)){
          var os=db.createObjectStore(STORE,{keyPath:'key'});
          os.createIndex('status','status',{unique:false});
        }
      };
      req.onsuccess=function(e){resolve(e.target.result);};
      req.onerror=function(e){reject(e.target.error);};
    });
    return _ready;
  }
  // IDB-safe: create tx and issue the request in the SAME tick (no microtask gap),
  // resolve on tx.oncomplete so the write is durably committed. Splitting these
  // across .then() lets the tx auto-commit and the request fail — strict on iOS.
  function _withStore(mode,fn){
    return _open().then(function(db){
      return new Promise(function(resolve,reject){
        var tx=db.transaction(STORE,mode);
        var os=tx.objectStore(STORE);
        var req=fn(os);
        tx.oncomplete=function(){ resolve(req?req.result:undefined); };
        tx.onerror=function(){ reject(tx.error); };
        tx.onabort=function(){ reject(tx.error); };
      });
    });
  }
  function put(entry){return _withStore('readwrite',function(os){return os.put(entry);});}
  function del(key){return _withStore('readwrite',function(os){return os['delete'](key);});}
  function getAll(){return _withStore('readonly',function(os){return os.getAll();}).then(function(r){return r||[];}).catch(function(){return[];});}
  function count(){return getAll().then(function(a){return a.length;});}

  // Confirm the object is actually retrievable on R2. HEAD first; fall back to
  // GET if the Worker doesn't support HEAD. 200 = present, 404 = absent.
  function _verify(url){
    // This R2 Worker does not implement HEAD (returns 404 for HEAD even when the
    // object exists), and every HEAD attempt floods the console with 404s. Use a
    // direct GET — unauthenticated on the Worker and authoritative: 200 = present.
    return fetch(url,{method:'GET'}).then(function(g){return g.ok;}).catch(function(){return false;});
  }

  // Upload + verify every pending entry. One bad entry never stalls the rest.
  function drive(){
    if(_driving)return Promise.resolve();
    if(typeof navigator!=='undefined' && !navigator.onLine)return Promise.resolve();
    if(typeof R2Photos==='undefined')return Promise.resolve();
    _driving=true;
    return getAll().then(function(entries){
      var chain=Promise.resolve();
      entries.forEach(function(e){
        chain=chain.then(function(){
          if(typeof navigator!=='undefined' && !navigator.onLine)return;
          if(!e || !e.blob)return del(e&&e.key);
          return R2Photos.upload(e.projectId,e.tool,e.type,e.filename,e.blob).then(function(){
            var url=R2Photos.getUrl(e.projectId,e.tool,e.type,e.filename);
            return _verify(url);
          }).then(function(ok){
            if(ok){
              return del(e.key).then(function(){ if(typeof _onVerified==='function'){try{_onVerified(e.key);}catch(_){}} });
            }
            e.attempts=(e.attempts||0)+1;e.lastTry=Date.now();e.status='pending';
            return put(e);
          }).catch(function(err){
            e.attempts=(e.attempts||0)+1;e.lastTry=Date.now();e.status='pending';e.lastError=String(err&&err.message||err);
            return put(e).catch(function(){});
          });
        });
      });
      return chain;
    }).then(function(){_driving=false;}).catch(function(){_driving=false;});
  }

  function setOnVerified(fn){_onVerified=fn;}
  function init(){
    if(typeof window==='undefined')return;
    window.addEventListener('online',function(){setTimeout(drive,1200);});
    if(navigator.connection && navigator.connection.addEventListener){
      navigator.connection.addEventListener('change',function(){setTimeout(drive,1200);});
    }
  }

  return {put:put,del:del,getAll:getAll,count:count,drive:drive,init:init,setOnVerified:setOnVerified};
})();
