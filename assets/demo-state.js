// A browser-only model with fixed sample values for the replay and static transcript.
export const demoSequence = [
  'mantis new "Q4 forecast" -w https://hooks.example.invalid/q4',
  'mantis download last --docx Q4_forecast.docx',
  'mantis watch',
  null, // The sample reader fetches the tripwire.
  'mantis hits last'
];

export function demoStep(demo, command) {
  return command === null
    ? ['[simulation] A compatible reader fetched the embedded URL.', ...demo.trigger()]
    : ['$ ' + command, ...demo.execute(command)];
}

export function demoLineClass(line) {
  if (line.startsWith('$ ')) return 'term-line term-command';
  if (line.startsWith('✓') || line.startsWith('⚠')) return 'term-line term-result';
  if (/^(id {2,}memo|when {2,}ip)/.test(line)) return 'term-line term-columns';
  return 'term-line';
}

export function createDemo() {
  let keys = [], watching = false;
  const last = () => keys.at(-1);
  const find = ref => ref === 'last' ? last() : keys.find(key => key.id === ref);
  const heading = key => `${key.memo}  ${key.id}`;

  function trigger() {
    const key = last();
    if (!key) return ['Create a key first with mantis new "My demo key".'];
    const hit = {ip: '198.51.100.24'};
    key.hits.push(hit);
    return [
      ...(watching ? [`09:41  ${key.memo}  ${hit.ip}  Word`] : []),
      `[simulation] ${key.hits.length} ${key.hits.length === 1 ? 'hit' : 'hits'} recorded for ${key.id}.`,
      key.notify ? '[simulation] Webhook alert delivered.' : '[simulation] No notification destination. The hit was logged.'
    ];
  }

  function execute(line) {
    // Read the supported examples as text. No shell or eval.
    const [program, command, ...args] = (line.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g) || [])
      .map(token => token.replace(/^(["'])(.*)\1$/, '$2'));
    if (!program) return [];
    if (program === 'help' || (program === 'mantis' && command === '--help')) return [
      'Demo commands:',
      '  mantis new "memo" [-w URL]',
      '  mantis list',
      '  mantis show <id|last>',
      '  mantis download <id|last> --docx filename',
      '  mantis hits <id|last>',
      '  mantis watch',
      'Use “Simulate a fetch” to record a sample hit. Type stop to end the simulated watch or clear to clear the transcript.'
    ];
    if (program === 'stop') {
      watching = false;
      return ['Demo watch stopped.'];
    }
    if (program !== 'mantis') return ['Type mantis --help for demo commands.'];

    switch (command) {
      case 'new': {
        const [memo, flag, target] = args;
        if (!memo?.trim() || memo.startsWith('-')) return ['Provide a label, for example: mantis new "My demo key"'];
        if (args.length > 3 || (flag && !['-w', '--notify-webhook'].includes(flag))) {
          return ['This demo accepts a memo and an optional webhook URL (-w).'];
        }
        if (flag && !/^https?:\/\/[^\s/]+/i.test(target ?? '')) {
          return ['Give -w a webhook URL. The demo will not contact it.'];
        }
        if (keys.length >= 100) return ['Demo limit reached. Replay the demo to start over.'];
        const id = (0x8b27a41e + keys.length).toString(16);
        const key = {id, memo, url: `https://demo.mantis.invalid/c/${id}`, files: [], hits: [], notify: Boolean(flag)};
        keys.push(key);
        return [
          `✓ Created ${heading(key)}`,
          `  url:           ${key.url}`,
          key.notify ? '  destinations: ✓ webhook configured' : '  destinations: ⚠ none, so hits will only be logged'
        ];
      }
      case 'list': {
        if (!keys.length) return ['No keys yet.', '  → Create one with mantis new "My demo key".'];
        const memoWidth = Math.max(4, ...keys.map(key => Math.min(20, key.memo.length)));
        const rows = keys.slice().reverse().map(key => {
          const memo = key.memo.length > 20 ? key.memo.slice(0, 19) + '…' : key.memo;
          return `${key.id}  ${memo.padEnd(memoWidth)}  now  ${key.notify ? '     1' : '   ⚠ 0'}  ✓ active`;
        });
        return [`id        ${'memo'.padEnd(memoWidth)}  age  notify  status`, ...rows, '', `${keys.length} ${keys.length === 1 ? 'key' : 'keys'}. Use mantis hits last to see recent hits.`];
      }
      case 'show':
      case 'download':
      case 'hits': {
        const [ref, flag, filename] = args;
        if (!ref) return [`→ Try mantis ${command} last${command === 'download' ? ' --docx sample.docx' : ''}.`];
        const key = find(ref);
        if (!key) return ['Key not found. Use mantis list to find a demo key.'];
        if (command === 'show') return [
          heading(key), `  url:    ${key.url}`, '  status: ✓ active',
          key.notify ? '  notify: ✓ webhook configured' : '  notify: none, hits are logged only'
        ];
        if (command === 'download') {
          if (flag !== '--docx' || !filename || args.length !== 3) return ['→ Try mantis download last --docx sample.docx.'];
          key.files.push(filename);
          return [`✓ Simulated save to ${filename}`];
        }
        const count = key.hits.length;
        if (!count) return [`No hits yet · ${heading(key)}`, '  → Use “Simulate a fetch” to trigger the sample URL.'];
        return [
          `${count} ${count === 1 ? 'hit' : 'hits'} · ${heading(key)}`, '',
          'when  ip             who   delivery',
          ...key.hits.slice(-10).reverse().map(hit =>
            ` now  ${hit.ip}  Word  ${key.notify ? '✓1' : 'no destinations'}`
          ),
          ...(count > 10 ? ['Showing the latest 10 simulated hits.'] : [])
        ];
      }
      case 'watch':
        watching = true;
        return ['watching; type stop to stop the demo watch'];
      default:
        return ['That command is not implemented in this simulation. Try mantis --help.'];
    }
  }

  return {
    trigger, execute,
    reset() { keys = []; watching = false; },
    snapshot() { return {keys: structuredClone(keys), watching}; }
  };
}
