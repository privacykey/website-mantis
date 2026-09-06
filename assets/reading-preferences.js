/* Reading preferences apply before the page is painted; no network requests. */
(function () {
  'use strict';
  var key='mantis-reading-v1', root=document.documentElement;
  function normalize(value) {
    value=value && typeof value==='object'?value:{};
    var validColors=/^#[0-9a-f]{6}$/i.test(value.foreground||'') && /^#[0-9a-f]{6}$/i.test(value.background||'');
    return {size:['100','125','150','200'].includes(String(value.size))?String(value.size):'100',reading:value.reading===true,foreground:validColors?value.foreground:'',background:validColors?value.background:''};
  }
  var saved;
  try { saved=JSON.parse(localStorage.getItem(key)||'null'); } catch(e) {}
  var settings=normalize(saved);
  var previous=saved && saved.previous?normalize(saved.previous):null;
  function apply() {
    root.style.fontSize=settings.size+'%';
    root.dataset.readingView=String(settings.reading);
    root.dataset.customColors=String(!!settings.foreground);
    root.style.setProperty('--reading-fg',settings.foreground || '#ffffff');
    root.style.setProperty('--reading-bg',settings.background || '#000000');
    var meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.content=getComputedStyle(root).getPropertyValue('--bg').trim();
  }
  function store() { try { localStorage.setItem(key,JSON.stringify(Object.assign({},settings,{previous:previous})));return true; }catch(e){return false;} }
  apply();
  document.addEventListener('DOMContentLoaded',function() {
    var form=document.querySelector('[data-reading-settings]');
    var status=document.querySelector('[data-reading-status]');
    function fill() {
      if(!form)return;
      form.elements.size.value=settings.size;form.elements.reading.checked=settings.reading;
      form.elements.foreground.value=settings.foreground;form.elements.background.value=settings.background;
      form.querySelector('[data-reading-undo]').disabled=!previous;
    }
    fill();
    if(form) {
      form.addEventListener('submit',function(e) {
        e.preventDefault();
        var fg=form.elements.foreground, bg=form.elements.background;
        var text=fg.value.trim(), background=bg.value.trim();
        var valid=(!text && !background) || (/^#[0-9a-f]{6}$/i.test(text) && /^#[0-9a-f]{6}$/i.test(background));
        var error=document.getElementById('reading-colors-error');
        fg.setAttribute('aria-invalid',String(!valid && !/^#[0-9a-f]{6}$/i.test(text)));
        bg.setAttribute('aria-invalid',String(!valid && !/^#[0-9a-f]{6}$/i.test(background)));
        if(!valid) {
          error.textContent='Enter both colors as # followed by six letters or numbers from 0–9 and A–F, or leave both blank. For example: #ffffff and #000000.';
          (!/^#[0-9a-f]{6}$/i.test(text)?fg:bg).focus();return;
        }
        error.textContent='';
        previous=settings;
        settings=normalize({size:form.elements.size.value,reading:form.elements.reading.checked,foreground:text,background:background});
        apply();fill();
        status.textContent=store()?'Reading settings saved on this browser.':'Reading settings applied for this page. This browser could not save them.';
        form.querySelector('button[type="submit"]').scrollIntoView({block:'center'});
      });
      form.querySelector('[data-reading-reset]').addEventListener('click',function() {
        previous=settings;settings=normalize(null);apply();fill();store();
        document.getElementById('reading-colors-error').textContent='';
        form.elements.foreground.removeAttribute('aria-invalid');form.elements.background.removeAttribute('aria-invalid');
        status.textContent='Reading settings reset. The selected theme is unchanged.';
        form.querySelector('[data-reading-reset]').scrollIntoView({block:'center'});
      });
      form.querySelector('[data-reading-undo]').addEventListener('click',function() {
        if(!previous)return;
        var current=settings;settings=previous;previous=current;apply();fill();store();
        document.getElementById('reading-colors-error').textContent='';
        form.elements.foreground.removeAttribute('aria-invalid');form.elements.background.removeAttribute('aria-invalid');
        status.textContent='Previous reading settings restored. You can use this button again to switch back.';
        form.querySelector('[data-reading-undo]').scrollIntoView({block:'center'});
      });
    }
    window.addEventListener('mantis:theme-change',function() {
      previous=normalize(settings);settings.foreground='';settings.background='';apply();store();fill();
    });
  });
})();
