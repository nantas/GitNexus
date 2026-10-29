// I/O observer preloaded into measured analyze runs (--require).
// Counts per-extension file reads under the target repo; in code-only mode
// (BENCH_CODE_ONLY=1) resource reads throw to catch scope leaks.
// Root is parameterized via GITNEXUS_IO_GUARD_ROOT.
const fs=require('node:fs'),p=require('node:path'),{syncBuiltinESMExports}=require('node:module'),{threadId}=require('node:worker_threads');
const counts={},blocked=[];const root=process.env.GITNEXUS_IO_GUARD_ROOT||process.cwd(),realRoot=fs.realpathSync(root);
function observe(file,operation){if(typeof file!=='string'&&!(file instanceof URL))return;const s=file instanceof URL?file.pathname:p.resolve(file);if(!s.startsWith(root+'/')&&!s.startsWith(realRoot+'/'))return;const ext=p.extname(s);counts[ext]=(counts[ext]||0)+1;if(process.env.BENCH_CODE_ONLY==='1'&&/\.(meta|prefab|unity|asset)$/.test(s)){blocked.push({file:s,operation});throw Error('CODE_ONLY_RESOURCE_READ '+s)}}
for(const name of ['readFile','readFileSync','createReadStream','open','openSync']){const old=fs[name];fs[name]=function(file,...args){observe(file,name);return old.call(this,file,...args)}}
for(const name of ['readFile','open']){const old=fs.promises[name];fs.promises[name]=function(file,...args){observe(file,'promises.'+name);return old.call(this,file,...args)}}
syncBuiltinESMExports();process.on('exit',()=>{if(process.env.BENCH_IO_REPORT)fs.writeFileSync(process.env.BENCH_IO_REPORT+'-'+process.pid+'-'+threadId+'.json',JSON.stringify({counts,blocked}));});
