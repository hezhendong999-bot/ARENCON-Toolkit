
var R2Photos=(function(){'use strict';
var WORKER_URL='https://arencon-r2-worker.hezhendong999.workers.dev';
var _queue=[];var _uploading=false;var _onProgress=null;

function _authHeaders(){
  var h={};
  var token=localStorage.getItem('sb-access-token');
  if(token)h['Authorization']='Bearer '+token;
  return h;
}

// Refresh the Supabase access token using the stored refresh token.
// Returns the new access token, or null if refresh isn't possible.
async function _refreshAccessToken(){
  var rt=localStorage.getItem('sb-refresh-token');
  if(!rt) return null;
  var SB_URL='https://xsemvinxsyphjiaqgywv.supabase.co';
  var SB_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzZW12aW54c3lwaGppYXFneXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzkxNzMsImV4cCI6MjA4ODg1NTE3M30.1WhVv3kPeO0igzcZswbNT-u1tUvEKNP6lk1DivKoDHU';
  try{
    var res=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SB_ANON,'Authorization':'Bearer '+SB_ANON},
      body:JSON.stringify({refresh_token:rt})
    });
    if(!res.ok) return null;
    var data=await res.json();
    if(data && data.access_token){
      localStorage.setItem('sb-access-token',data.access_token);
      if(data.refresh_token) localStorage.setItem('sb-refresh-token',data.refresh_token);
      return data.access_token;
    }
  }catch(e){}
  return null;
}

/* ── Core API calls ── */
async function upload(projectId,tool,type,filename,blob){
  var path='/photos/'+encodeURIComponent(projectId)+'/'+encodeURIComponent(tool)+'/'+encodeURIComponent(type)+'/'+encodeURIComponent(filename);
  var headers=_authHeaders();
  headers['Content-Type']=blob.type||'image/jpeg';
  var res=await fetch(WORKER_URL+path,{method:'PUT',headers:headers,body:blob});
  if(res.status===401 || res.status===403){
    // Token missing/expired — refresh once and retry.
    var nt=await _refreshAccessToken();
    if(nt){
      headers['Authorization']='Bearer '+nt;
      res=await fetch(WORKER_URL+path,{method:'PUT',headers:headers,body:blob});
    }
  }
  if(!res.ok){var err;try{err=await res.json();}catch(e){err={error:res.statusText};}throw new Error(err.error||res.statusText);}
  return await res.json();
}

function getUrl(projectId,tool,type,filename){
  return WORKER_URL+'/photos/'+encodeURIComponent(projectId)+'/'+encodeURIComponent(tool)+'/'+encodeURIComponent(type)+'/'+encodeURIComponent(filename);
}

async function remove(projectId,tool,type,filename){
  var path='/photos/'+encodeURIComponent(projectId)+'/'+encodeURIComponent(tool)+'/'+encodeURIComponent(type)+'/'+encodeURIComponent(filename);
  var res=await fetch(WORKER_URL+path,{method:'DELETE',headers:_authHeaders()});
  if(!res.ok&&res.status!==404){throw new Error('Delete failed: '+res.statusText);}
  return true;
}

async function list(projectId,tool,type){
  var path='/list/'+encodeURIComponent(projectId)+'/'+encodeURIComponent(tool)+'/'+encodeURIComponent(type);
  // S343 SECURITY: send auth so the Worker can REQUIRE auth on /list/ (was anon).
  var res=await fetch(WORKER_URL+path,{method:'GET',headers:_authHeaders()});
  if(!res.ok){throw new Error('List failed: '+res.statusText);}
  return await res.json();
}

/* ── Upload Queue ── */
function enqueue(item){
  _queue.push(item);
  _fireProgress();
  _processQueue();
}

function _fireProgress(){
  if(_onProgress)_onProgress({queued:_queue.length,uploading:_uploading});
}

async function _processQueue(){
  if(_uploading||!_queue.length)return;
  if(!navigator.onLine){_fireProgress();return;}
  _uploading=true;
  while(_queue.length>0){
    if(!navigator.onLine)break;
    var item=_queue[0];
    try{
      await upload(item.projectId,item.tool,item.type,item.filename,item.blob);
      _queue.shift();
      if(item.onComplete)item.onComplete(null);
    }catch(e){
      console.warn('[R2Photos] Upload failed:',e.message,', will retry');
      break;
    }
    _fireProgress();
  }
  _uploading=false;
  _fireProgress();
}

/* ── Helpers ── */
function dataUrlToBlob(dataUrl){
  if(!dataUrl||typeof dataUrl!=='string'||!dataUrl.startsWith('data:'))return null;
  try{
    var parts=dataUrl.split(',');var mime=parts[0].match(/:(.*?);/)[1];
    var raw=atob(parts[1]);var arr=new Uint8Array(raw.length);
    for(var i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
    return new Blob([arr],{type:mime});
  }catch(e){return null;}
}

function generateFilename(prefix){
  return (prefix||'photo')+'_'+Date.now()+'_'+Math.random().toString(36).substr(2,6)+'.jpg';
}

/* ── Lifecycle ── */
function init(opts){
  opts=opts||{};
  _onProgress=opts.onProgress||null;
  window.addEventListener('online',function(){setTimeout(_processQueue,1000);});
  if(navigator.connection){
    navigator.connection.addEventListener('change',function(){setTimeout(_processQueue,1000);});
  }
}

function getQueueLength(){return _queue.length;}
function isUploading(){return _uploading;}

return{
  init:init,upload:upload,getUrl:getUrl,remove:remove,list:list,
  enqueue:enqueue,dataUrlToBlob:dataUrlToBlob,generateFilename:generateFilename,
  getQueueLength:getQueueLength,isUploading:isUploading,
  get WORKER_URL(){return WORKER_URL;}
};
})();
