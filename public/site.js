(() => {
  const menu = document.querySelector('.ds-menu');
  const nav = document.querySelector('.ds-navlinks');
  const desktopNav = window.matchMedia('(min-width: 1101px)');
  const groups = [...document.querySelectorAll('.ds-navgroup')];
  const hoverTimers = new Map();
  function setDropdown(group, open) {
    clearTimeout(hoverTimers.get(group));
    if(open) groups.filter(g=>g!==group).forEach(g=>setDropdown(g,false));
    group.querySelector('.ds-submenu-toggle').setAttribute('aria-expanded',String(open));
    group.querySelector('.ds-submenu').hidden=!open;
    group.classList.toggle('is-expanded',open);
  }
  function closeDropdowns(){groups.forEach(g=>setDropdown(g,false));}
  function closeMenu() {
    closeDropdowns();
    nav?.classList.remove('is-open');
    menu?.setAttribute('aria-expanded', 'false');
    menu?.setAttribute('aria-label', 'Open navigation');
    if (menu) menu.textContent = '☰';
  }
  menu?.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    nav.classList.toggle('is-open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    menu.textContent = open ? '×' : '☰';
    if(!open) closeDropdowns();
  });
  groups.forEach(group=>{
    const toggle=group.querySelector('.ds-submenu-toggle');
    const panel=group.querySelector('.ds-submenu');
    toggle.addEventListener('click',()=>setDropdown(group,toggle.getAttribute('aria-expanded')!=='true'));
    group.addEventListener('pointerenter',e=>{
      if(desktopNav.matches&&e.pointerType!=='touch')hoverTimers.set(group,setTimeout(()=>setDropdown(group,true),120));
    });
    group.addEventListener('pointerleave',()=>{
      clearTimeout(hoverTimers.get(group));
      if(desktopNav.matches&&!panel.contains(document.activeElement))setDropdown(group,false);
    });
    group.addEventListener('focusout',e=>{
      if(!group.contains(e.relatedTarget))setDropdown(group,false);
    });
    group.addEventListener('keydown',e=>{
      const items=[...panel.querySelectorAll('a')];
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();
        const wasOpen=!panel.hidden;
        setDropdown(group,true);
        const current=items.indexOf(document.activeElement);
        const next=wasOpen&&current>=0?(current+(e.key==='ArrowDown'?1:-1)+items.length)%items.length:(e.key==='ArrowDown'?0:items.length-1);
        items[next].focus();
      }
      if(e.key==='Escape'&&!panel.hidden){
        e.preventDefault();e.stopPropagation();setDropdown(group,false);toggle.focus();
      }
    });
  });
  document.addEventListener('keydown', e => {
    if(e.key==='Escape'){
      const expanded=groups.find(g=>g.classList.contains('is-expanded'));
      if(expanded){setDropdown(expanded,false);expanded.querySelector('.ds-submenu-toggle').focus();e.preventDefault();return;}
    }
    if (e.key === 'Escape' && nav?.classList.contains('is-open')) { closeMenu(); menu.focus(); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.ds-header')) closeMenu(); });
  desktopNav.addEventListener('change', closeMenu);
  document.querySelectorAll('.ds-navlinks a').forEach(a => a.addEventListener('click', closeMenu));

  // Compatibility with links used by the original one-page site.
  if (document.body.dataset.home === 'true') {
    const oldLinks = {services:'services',training:'how-we-work',impact:'about',story:'about',about:'about',business:'contact',careers:'careers',contact:'contact'};
    const target = oldLinks[location.hash.slice(1)];
    if (target) location.replace(`./${target}/index.html`);
  }

  const form = document.querySelector('[data-inquiry-form]');
  if (form) {
    const selected = new URLSearchParams(location.search).get('service');
    if (selected && form.elements.service) {
      const option = [...form.elements.service.options].find(o => o.value === selected);
      if (option) form.elements.service.value = selected;
    }
    const status = form.querySelector('[role=status]');
    const submit = form.querySelector('[type=submit]');
    let busy = false;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (busy || !form.reportValidity()) return;
      if (form.elements.botcheck.value) return;
      status.className = 'ds-formstatus';
      if (document.body.dataset.preview === 'true') {
        status.textContent = 'Preview only: nothing was sent. The live site will use Dhiti’s existing enquiry delivery service.';
        return;
      }
      busy = true;
      submit.disabled = true;
      submit.textContent = 'Sending…';
      status.textContent = 'Sending your enquiry securely.';
      const fields = Object.fromEntries(new FormData(form));
      const career = form.dataset.inquiryForm === 'career';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const payload = {
        access_key: 'c15fe376-906a-46c2-baab-8662c6a6dfde',
        subject: `${career ? 'Training application' : 'New work inquiry'} - ${fields.name}`,
        from_name: 'Dhiti Services website',
        name: fields.name, email: fields.email, phone: fields.phone || '',
        [career ? 'village_or_location' : 'company']: fields.org,
        [career ? 'why_join' : 'what_work']: fields.message,
        service: fields.service || 'Training',
        enquiry_type: career ? 'Apply for training' : 'Bring your work to us'
      };
      try {
        const response = await fetch('https://api.web3forms.com/submit', {
          method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
          body:JSON.stringify(payload),signal:controller.signal
        });
        const data = await response.json();
        if (!response.ok || data.success !== true) throw new Error('Delivery not confirmed');
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({event:career?'training_application_submit':'generate_lead',form_name:career?'training_application':'business_inquiry',lead_type:career?'career_application':'business_inquiry'});
        form.querySelector('.ds-formbody').hidden = true;
        form.querySelector('.ds-formsuccess').hidden = false;
        status.classList.add('success');
        status.textContent = 'Your request was submitted successfully.';
        form.querySelector('.ds-formsuccess h3').focus();
      } catch {
        status.classList.add('error');
        status.textContent = 'We could not confirm delivery. Please try again, or email info@dhitiservices.com directly.';
      } finally {
        clearTimeout(timeout);
        busy = false;
        submit.disabled = false;
        submit.textContent = career ? 'Send training enquiry ↗' : 'Send enquiry ↗';
      }
    });
    form.querySelector('[data-form-reset]')?.addEventListener('click', () => {
      form.reset();
      form.querySelector('.ds-formbody').hidden = false;
      form.querySelector('.ds-formsuccess').hidden = true;
      status.textContent = '';
      form.elements.name.focus();
    });
  }
})();
