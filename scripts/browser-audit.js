/* Local preview only: serve with A11Y_AUDIT=1. Never included in a build. */
(function () {
  const panel=document.createElement('aside');
  panel.dataset.auditPanel=''; panel.setAttribute('aria-label','Development accessibility checks');
  panel.style.cssText='padding:24px;border-top:2px solid currentColor';
  const run=document.createElement('button');run.textContent='Run accessibility audit';run.type='button';
  const spacing=document.createElement('button');spacing.textContent='Toggle text-spacing test';spacing.type='button';
  const result=document.createElement('pre');result.hidden=true;result.dataset.auditResult='';
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Accessibility audit ready.';
  panel.append(run,spacing,status,result);document.body.append(panel);
  let style;
  spacing.addEventListener('click',()=>{
    if(style){style.remove();style=null;}else{style=document.createElement('style');style.textContent='*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}';document.head.append(style);}
    status.textContent=style?'Text-spacing test applied.':'Text-spacing test cleared.';
  });
  run.addEventListener('click',async()=>{
    status.textContent='Checking accessibility…';panel.dataset.state='running';
    try {
      const tags=[...new Set(axe.getRules().flatMap(rule=>rule.tags).filter(tag=>/^wcag(?:2|21|22)a{1,3}$/.test(tag)||tag==='best-practice'))];
      const report=await axe.run({exclude:[['[data-audit-panel]']]},{runOnly:{type:'tag',values:tags},rules:{'color-contrast-enhanced':{enabled:true}}});
      const compact={url:location.href,theme:document.documentElement.dataset.theme||'mono',version:axe.version,tags,violations:report.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,url:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:report.incomplete.map(v=>({id:v.id,help:v.help,nodes:v.nodes.map(n=>n.target)})),passes:report.passes.length};
      result.textContent=JSON.stringify(compact);status.textContent=`Audit complete: ${compact.violations.length} violations, ${compact.incomplete.length} checks need review.`;panel.dataset.state='complete';
    } catch(e){result.textContent=JSON.stringify({error:e.message});status.textContent='Audit failed.';panel.dataset.state='error';}
  });
})();
