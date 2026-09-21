(() => {
  const root = document.body;
  const themeButton = document.querySelector('.db-theme');
  const darkPreference = window.matchMedia('(prefers-color-scheme: dark)');
  function setTheme(dark) {
    root.dataset.theme = dark ? 'dark' : 'light';
    themeButton?.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
  }
  setTheme(darkPreference.matches);
  themeButton?.addEventListener('click', () => setTheme(root.dataset.theme !== 'dark'));
  const search = document.querySelector('.db-search input');
  const filters = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('.db-library .db-card')];
  let category = 'All';
  function filter() {
    const query = (search?.value || '').trim().toLowerCase();
    let count = 0;
    for (const card of cards) {
      const visible = (category === 'All' || card.dataset.category === category) && card.dataset.search.includes(query);
      card.hidden = !visible;
      if (visible) count++;
    }
    filters.forEach(button => {
      const selected = button.dataset.filter === category;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const empty = document.querySelector('.db-empty');
    if (empty) empty.hidden = count > 0;
    const status = document.querySelector('.db-result-count');
    if (status) status.textContent = `${count} article${count === 1 ? '' : 's'} found`;
  }
  filters.forEach(button => button.addEventListener('click', () => { category = button.dataset.filter; filter(); }));
  search?.addEventListener('input', filter);
  document.querySelector('.db-reset')?.addEventListener('click', () => { category='All'; search.value=''; filter(); search.focus(); });
  document.querySelector('.db-share')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const url = window.location.href.split('#')[0];
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard not available');
      await navigator.clipboard.writeText(url);
      button.textContent = 'Link copied';
      document.querySelector('.db-share-status').textContent = 'Article link copied to clipboard.';
    } catch {
      // Preview iframes may deny clipboard access; offer a selectable URL.
      let input = document.querySelector('.db-share-fallback');
      if (!input) {
        input = document.createElement('input');
        input.className = 'db-share-fallback';
        input.readOnly = true;
        input.setAttribute('aria-label','Article link to copy');
        button.after(input);
      }
      input.value = url;
      input.focus();
      input.select();
      button.textContent = 'Select and copy link';
      document.querySelector('.db-share-status').textContent = 'Use your device copy command to copy the selected article link.';
    }
  });
  const progress = document.querySelector('.db-reading-progress');
  const article = document.querySelector('.db-prose');
  if (progress && article) {
    const update = () => {
      const top = article.getBoundingClientRect().top + window.scrollY;
      const span = article.offsetHeight - window.innerHeight + 160;
      progress.style.width = `${Math.min(100,Math.max(0,(window.scrollY-top+160)/Math.max(1,span)*100))}%`;
    };
    window.addEventListener('scroll',update,{passive:true});
    window.addEventListener('resize',update);
    update();
    const links=[...document.querySelectorAll('.db-toc nav a')];
    const observer = new IntersectionObserver(entries => {
      for(const entry of entries) if(entry.isIntersecting) links.forEach(a=>{
        const active=a.hash===`#${entry.target.id}`;
        a.classList.toggle('active',active);
        if(active) a.setAttribute('aria-current','location'); else a.removeAttribute('aria-current');
      });
    },{rootMargin:'-15% 0px -65% 0px'});
    article.querySelectorAll('h2').forEach(h=>observer.observe(h));
  }
})();
