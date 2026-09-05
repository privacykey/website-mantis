// A deliberately small simulation. No network, storage, real credentials, or commands.
export function createDemo() {
  let keys = [], serial = 0, watching = false;
  function last() { return keys.at(-1); }
  function create(memo, notify = false) {
    if (keys.length >= 100) throw new Error('Demo limit reached. Replay the demo to start over.');
    const id = 'demo-' + String(++serial).padStart(2,'0');
    const key = {id,memo,url:`https://demo.mantis.invalid/c/${id}`,files:[],hits:[],notify};
    keys.push(key); return key;
  }
  function trigger() {
    const key=last();
    if (!key) return ['Create a key first: mantis new "My demo key"'];
    const hit={ip:'198.51.100.24',number:key.hits.length+1};
    key.hits.push(hit);
    return [`[simulation] Fetched ${key.url}`,`[hit] ${key.id} · ${hit.ip} · ${key.hits.length} total`, key.notify ? '[simulation] Webhook alert delivered.' : 'No notification destination. Create a key with -w to simulate delivery.'];
  }
  function execute(line) {
    // Quote-aware tokenization for the supported examples, never an eval or shell.
    const tokens = line.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g)?.map(x=>x.replace(/^(["'])(.*)\1$/,'$2')) || [];
    if (!tokens.length) return [];
    if (tokens[0]==='help') return ['Demo commands: mantis new "memo" [-w URL], mantis list, mantis download last --docx filename, mantis hits, mantis watch, stop, clear.', 'Use “Simulate a fetch” to record a sample hit. No real commands are run.'];
    if (tokens[0]==='stop') { watching=false; return ['Demo watch stopped.']; }
    if (tokens[0]!=='mantis') return ['This simulation supports a few mantis commands. Type help for examples.'];
    switch (tokens[1]) {
      case 'new': {
        if (!tokens[2] || tokens[2].startsWith('-')) return ['Provide a label, for example: mantis new "My demo key"'];
        const unsupported = tokens.slice(3).some((t,i,a)=>t.startsWith('-') && !['-w','--notify-webhook'].includes(t) && !['-w','--notify-webhook'].includes(a[i-1]));
        if (unsupported) return ['This demo supports only a memo and optional -w URL. See the CLI documentation for other options.'];
        const wi=tokens.findIndex(t=>['-w','--notify-webhook'].includes(t));
        if (wi>=0 && !/^https?:\/\//.test(tokens[wi+1] || '')) return ['Give -w a webhook URL; it will not be contacted by this demo.'];
        const key=create(tokens[2],wi>=0);
        return [`→ created ${key.id}: ${key.memo}`,`→ URL: ${key.url}`, 'No hit yet. Place the URL, then simulate a fetch.'];
      }
      case 'list': return keys.length ? ['key · memo · hits', ...keys.map(k=>`${k.id} · ${k.memo} · ${k.hits.length}`)] : ['No demo keys yet. Use mantis new "My demo key".'];
      case 'download': {
        const key = tokens[2]==='last' ? last() : keys.find(k=>k.id===tokens[2]);
        if (!key) return ['Key not found. Use mantis list to find a demo key.'];
        if (tokens[3]!=='--docx' || !tokens[4]) return ['Try: mantis download last --docx sample.docx'];
        key.files.push(tokens[4]);
        return [`[simulation] Generated ${tokens[4]} for ${key.id}.`, 'The reader must fetch the embedded URL to record a hit.'];
      }
      case 'hits': return keys.flatMap(k=>k.hits.map(h=>`${k.id} · hit ${h.number} · ${h.ip}`)).length ? keys.flatMap(k=>k.hits.map(h=>`${k.id} · hit ${h.number} · ${h.ip}`)) : ['No demo hits yet. Use “Simulate a fetch”.'];
      case 'watch': watching=true; return ['Demo watch ready. Use “Simulate a fetch” to add a hit; type stop to end.'];
      default: return ['That command is not implemented in this simulation. Type help for supported examples.'];
    }
  }
  return {create,trigger,execute,reset(){keys=[];serial=0;watching=false;},snapshot(){return {keys:structuredClone(keys),watching};}};
}
