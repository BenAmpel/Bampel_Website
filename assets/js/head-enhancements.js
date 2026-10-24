// Run enhancements once, when the DOM is ready. (It used to run four times, on DOMContentLoaded and 100, 500 and 1000 ms
// after load, which stacked observers and click handlers; the parts that look for late content keep their own timers.)
let enhancementsRan = false;
function runEnhancements() {
  if (enhancementsRan) return;
  enhancementsRan = true;
  const prefersReducedMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
  
  // ===== THEME TOGGLE BUTTON CUSTOMIZATION =====
  // Rename the day/night toggle to "render_pdf()" / "view_source"
  function initThemeToggle() {
    // Find the theme toggler button (Wowchemy uses different selectors)
    const themeButton = document.querySelector('.js-theme-toggle') ||
                        document.querySelector('[data-toggle="theme"]') ||
                        document.querySelector('.nav-link[onclick*="theme"]') ||
                        document.querySelector('button[onclick*="theme"]') ||
                        document.querySelector('.theme-toggle');
    
    if (!themeButton || themeButton.dataset.customized) return;
    themeButton.dataset.customized = 'true';
    
    // Hide the default icon
    const icon = themeButton.querySelector('i') || 
                 themeButton.querySelector('svg') ||
                 themeButton.querySelector('.fa, .fas, .far, .fab');
    if (icon) {
      icon.style.display = 'none';
    }
    
    // Create our custom text label
    const label = document.createElement('span');
    label.className = 'theme-toggle-label';
    themeButton.appendChild(label);
    
    // Function to update label based on current theme
    function updateLabel() {
      const isDark = document.body.classList.contains('dark');
      if (isDark) {
        // In Terminal mode, offer to "Render PDF" (switch to manuscript/light)
        label.innerText = 'render_pdf()';
        label.title = 'Switch to Manuscript view';
      } else {
        // In Manuscript mode, offer to "View Source" (switch to terminal/dark)
        label.innerText = 'view_source';
        label.title = 'Switch to Terminal view';
      }
    }
    
    // Initial update
    updateLabel();
    
    // Listen for clicks to update the label
    themeButton.addEventListener('click', function() {
      // Small timeout to allow the body class to change
      setTimeout(updateLabel, 50);
      setTimeout(updateLabel, 200);
    });
    
    // Also observe body class changes
    const bodyObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          updateLabel();
        }
      });
    });
    bodyObserver.observe(document.body, { attributes: true });
  }
  
  // Initialize theme toggle customization
  initThemeToggle();
  setTimeout(initThemeToggle, 500);
  setTimeout(initThemeToggle, 1000);
  
  // ===== APPLY GLITCH DATA-TEXT TO ALL HEADERS =====
  // This sets the data-text attribute needed for the CSS glitch effect
  function applyGlitchToHeaders() {
    const headerSelectors = [
      'section h1',
      'section h2', 
      'section h3',
      '.home-section h1',
      '.home-section h2',
      '.article-title',
      '.page-title',
      'h1',
      'h2',
      'h3'
    ];
    
    headerSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(header => {
        if (!header.dataset.text) {
          header.dataset.text = header.textContent.trim();
        }
      });
    });
  }
  
  // Apply glitch data-text immediately
  applyGlitchToHeaders();
  
  // Re-apply after a delay, and once more after load, to catch headings that other scripts add
  setTimeout(applyGlitchToHeaders, 500);
  setTimeout(applyGlitchToHeaders, 1500);
  window.addEventListener('load', () => setTimeout(applyGlitchToHeaders, 500), { once: true });
  
  // ===== GLITCH EFFECT FOR NAME =====
  function initGlitchEffect() {
    // Find the main name/title heading
    const nameSelectors = [
      'section#about h1',
      '.profile-header h1',
      '.hb-about h1',
      '.wg-about h1',
      '.article-title'
    ];
    
    let nameElement = null;
    for (const selector of nameSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.includes('Benjamin')) {
        nameElement = el;
        break;
      }
    }
    
    if (!nameElement || nameElement.classList.contains('glitch-text')) return;
    
    // Store original text
    const originalText = nameElement.textContent.trim();
    
    // Add glitch class and data attribute
    nameElement.classList.add('glitch-text');
    nameElement.setAttribute('data-text', originalText);
    
    // Also apply to any h1 in the header/nav that contains the name
    const headerName = document.querySelector('.navbar-brand, header h1, .site-title');
    if (headerName && headerName.textContent.includes('Benjamin')) {
      headerName.classList.add('glitch-text');
      headerName.setAttribute('data-text', headerName.textContent.trim());
    }

    const supportHref = 'https://buymeacoffee.com/BAmpel';
    const attachSupportButton = (brand, mobile = false) => {
      if (!brand || brand.parentElement?.querySelector('.navbar-support-link')) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'navbar-brand-group';
      brand.parentNode.insertBefore(wrapper, brand);
      wrapper.appendChild(brand);

      const button = document.createElement('a');
      button.className = `navbar-support-link${mobile ? ' navbar-support-link--mobile' : ''}`;
      button.href = supportHref;
      button.target = '_blank';
      button.rel = 'noopener';
      button.textContent = 'Support';
      button.setAttribute('aria-label', 'Support Benjamin Ampel on Buy Me a Coffee');
      wrapper.appendChild(button);
    };

    attachSupportButton(document.querySelector('.d-none.d-lg-inline-flex .navbar-brand'));
    attachSupportButton(document.querySelector('.navbar-brand-mobile-wrapper .navbar-brand'), true);
  }
  
  // Initialize glitch effect
  setTimeout(initGlitchEffect, 100);
  
  // ===== ADVERSARIAL NOISE OVERLAY FOR AVATAR =====
  // Inject overlay elements for the adversarial perturbation effect
  function initAdversarialEffect() {
    const avatarContainers = document.querySelectorAll(
      'section#about .avatar, .hb-about-avatar, .wg-about-avatar, section#about [class*="avatar"]'
    );
    
    avatarContainers.forEach(container => {
      // Skip if already initialized
      if (container.querySelector('.adversarial-noise-overlay')) return;
      
      // Ensure container has relative positioning
      container.style.position = 'relative';
      container.style.overflow = 'hidden';
      
      // Create noise overlay
      const noiseOverlay = document.createElement('div');
      noiseOverlay.className = 'adversarial-noise-overlay';
      container.appendChild(noiseOverlay);
      
      // Create color shift overlay
      const colorOverlay = document.createElement('div');
      colorOverlay.className = 'adversarial-color-overlay';
      container.appendChild(colorOverlay);
    });
  }
  
  // Initialize adversarial effect
  initAdversarialEffect();
  setTimeout(initAdversarialEffect, 500);
  setTimeout(initAdversarialEffect, 1500);
  
  // ===== SCROLL PROGRESS BAR =====
  if (!document.querySelector('.scroll-progress')) {
    const scrollProgress = document.createElement('div');
    scrollProgress.className = 'scroll-progress';
    document.body.prepend(scrollProgress);
    
    function updateScrollProgress() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = (scrollTop / docHeight) * 100;
      scrollProgress.style.width = scrollPercent + '%';
    }
    
    window.addEventListener('scroll', updateScrollProgress);
    updateScrollProgress();
  }

  // ===== DYNAMIC SECTION NAV HIGHLIGHT (SCROLL SPY) =====
  function initScrollSpy() {
    if (document.body.dataset.scrollSpyInit === 'true') return;
    document.body.dataset.scrollSpyInit = 'true';

    const navLinks = Array.from(document.querySelectorAll('.navbar-nav a[href^="#"], .navbar-nav a[href^="/#"]'));
    if (!navLinks.length) return;

    const linkMap = new Map();
    const sections = [];

    navLinks.forEach(link => {
      let href = link.getAttribute('href');
      if (!href) return;
      if (href.startsWith('/')) href = href.slice(1);
      if (!href.startsWith('#')) return;
      const id = href.slice(1);
      if (!id) return;
      const section = document.getElementById(id);
      if (!section) return;
      linkMap.set(id, link);
      sections.push(section);
    });

    if (!sections.length) return;

    function setActive(id) {
      navLinks.forEach(l => l.classList.remove('active'));
      const link = linkMap.get(id);
      if (link) link.classList.add('active');
    }

    if ('IntersectionObserver' in window) {
      const visibility = new Map();
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          visibility.set(entry.target.id, entry.intersectionRatio);
        });
        let bestId = null;
        let bestRatio = 0;
        visibility.forEach((ratio, id) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        });
        if (bestId) setActive(bestId);
      }, { rootMargin: '-25% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] });

      sections.forEach(section => observer.observe(section));
      setTimeout(() => {
        const firstVisible = sections.find(sec => sec.getBoundingClientRect().top >= 0);
        setActive((firstVisible && firstVisible.id) || sections[0].id);
      }, 50);
    } else {
      function onScroll() {
        let currentId = sections[0].id;
        sections.forEach(sec => {
          const rect = sec.getBoundingClientRect();
          if (rect.top <= 120 && rect.bottom > 120) {
            currentId = sec.id;
          }
        });
        setActive(currentId);
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  initScrollSpy();
  setTimeout(initScrollSpy, 500);
  
  // ===== RESEARCH VISUALIZATIONS INJECTION (into Research Impact section) =====
  // Find by searching all headings for "Research Impact"
  if (!document.querySelector('.viz-wrapper')) {
    let targetElement = null;
    
    // Find heading containing "Research Impact"
    const allHeadings = document.querySelectorAll('h1, h2, h3');
    allHeadings.forEach(heading => {
      if (heading.textContent.includes('Research Impact') && !targetElement) {
        // Found the heading, get its parent section or container
        targetElement = heading.closest('section') || 
                        heading.closest('.home-section') ||
                        heading.closest('[class*="block"]') ||
                        heading.parentElement;
      }
    });
    
    if (targetElement) {
      // WebP versions of the map (layouts/partials/impact/impact_stats.html); the PNG stays as the fallback src.
      const mapSets = document.getElementById('research-map-srcsets');
      const mapSrcset = mapSets ? mapSets.getAttribute(document.body.classList.contains('dark') ? 'data-dark' : 'data-light') : '';
      const mapSrcsetAttr = mapSrcset ? ` srcset="${mapSrcset}" sizes="(max-width: 1400px) 100vw, 1324px"` : '';
      const vizHTML = `
        <div class="viz-grid" style="margin-top: 30px; grid-template-columns: 1fr;">
          <div class="viz-column">
            <details class="viz-details" id="home-footprint-details">
              <summary>Research Footprint</summary>
              <div class="viz-content">
                <div id="home-footprint-map" style="display:none; height:440px; border-radius:8px; overflow:hidden;"></div>
                <img src="/images/research-map.png"${mapSrcsetAttr} alt="World map marking the cities of conferences where Benjamin Ampel presented and the institutions of his collaborators" class="viz-image" id="map-img" width="2291" height="1438" loading="lazy" decoding="async">
                <p class="viz-caption">Conference presentations and collaborator institutions worldwide &mdash; derived automatically from the publication record</p>
              </div>
            </details>
          </div>
        </div>
      `;
      
      const vizWrapper = document.createElement('div');
      vizWrapper.className = 'viz-wrapper';
      vizWrapper.innerHTML = vizHTML;
      
      // Append to the section
      targetElement.appendChild(vizWrapper);

      // Upgrade the static footprint PNG to an interactive Leaflet map on
      // first open. Data comes from dashboard_payload.json, which is
      // auto-derived from publications.json at build time, so the map stays
      // current as new papers are added. The PNG remains the no-JS fallback.
      const fpDetails = vizWrapper.querySelector('#home-footprint-details');
      if (fpDetails) fpDetails.addEventListener('toggle', function () {
        if (!fpDetails.open || fpDetails.dataset.mapReady) return;
        fpDetails.dataset.mapReady = '1';
        const css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = '/vendor/leaflet/leaflet.css';
        document.head.appendChild(css);
        const s = document.createElement('script');
        s.src = '/vendor/leaflet/leaflet.js';
        s.onload = function () {
          // A small build-time extract of the footprint (data-footprint-url, about 10 KB) instead of the 463 KB dashboard payload.
          const fpSrc = document.querySelector('[data-footprint-url]');
          const fpUrl = fpSrc ? fpSrc.getAttribute('data-footprint-url') : '';
          (fpUrl ? fetch(fpUrl).then(r => r.json()).then(footprint => ({ footprint })) : fetch('/data/dashboard_payload.json').then(r => r.json())).then(payload => {
            const el = document.getElementById('home-footprint-map');
            if (!el || !window.L) return;
            el.style.display = 'block';
            const map = L.map(el, { scrollWheelZoom: false, worldCopyJump: true }).setView([30, -20], 2);
            const dark = document.body.classList.contains('dark');
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_' + (dark ? 'Dark' : 'Light') + '_Gray_Base/MapServer/tile/{z}/{y}/{x}',
              { attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors', maxZoom: 16 }).addTo(map);
            const colors = { Conference: '#00ff41', Collaboration: '#00bfff', Institution: '#ff6b35' };
            ((payload.footprint || {}).points || []).forEach(pt => {
              if (pt.lat == null || pt.lng == null) return;
              const c = colors[pt.cat] || '#888';
              L.circleMarker([pt.lat, pt.lng], { radius: 7, color: c, weight: 2, fillColor: c, fillOpacity: 0.55 })
                .addTo(map)
                .bindPopup('<strong>' + pt.title + '</strong><br>' + (pt.location || '') +
                  (pt.desc ? '<br><span style="font-size:0.8em;opacity:0.8">' + pt.desc + '</span>' : ''));
            });
            const img = document.getElementById('map-img');
            if (img) img.style.display = 'none';
            setTimeout(() => map.invalidateSize(), 150);
          }).catch(() => {});
        };
        document.body.appendChild(s);
      });
      
      // Update images for dark mode
      setTimeout(() => {
        if (typeof updateImageThemes === 'function') {
          updateImageThemes();
        }
      }, 100);
    }
  }
  
  // ===== COLLAPSIBLE PUBLICATION SECTIONS =====
  const publicationTitles = [
    { text: 'Journal Publications' },
    { text: 'Conference Publications' },
    { text: 'Workshop Papers' }
  ];
  
  // Find headings and wrap their sections
  const allHeadings = document.querySelectorAll('h1, h2, h3');
  
  publicationTitles.forEach(({ text }) => {
    allHeadings.forEach(heading => {
      if (heading.textContent.trim() === text) {
        // Get the parent section
        const section = heading.closest('section') || 
                        heading.closest('.home-section') ||
                        heading.closest('[class*="block"]') ||
                        heading.parentElement.parentElement;
        
        if (!section || section.querySelector('.pub-details')) return;
        
        // Find publication items - look for links or list items
        const pubItems = section.querySelectorAll('a[href*="publication"], .citation, article, li');
        const count = pubItems.length;
        
        if (count === 0) return;
        
        // Get all content after the heading
        const contentElements = [];
        let sibling = heading.nextElementSibling;
        while (sibling) {
          contentElements.push(sibling.cloneNode(true));
          sibling = sibling.nextElementSibling;
        }
        
        // Also check parent's siblings if heading is in a wrapper
        if (contentElements.length === 0) {
          const headingParent = heading.parentElement;
          sibling = headingParent.nextElementSibling;
          while (sibling) {
            contentElements.push(sibling.cloneNode(true));
            sibling = sibling.nextElementSibling;
          }
        }
        
        if (contentElements.length === 0) return;
        
        // Create details/summary wrapper
        const details = document.createElement('details');
        details.className = 'pub-details';
        
        const summary = document.createElement('summary');
        summary.className = 'pub-summary';
        summary.innerHTML = `${text} <span class="pub-count">(${count})</span>`;
        
        details.appendChild(summary);
        
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'pub-content';
        contentElements.forEach(el => contentWrapper.appendChild(el));
        details.appendChild(contentWrapper);
        
        // Remove original content and add the collapsible
        let sibling2 = heading.nextElementSibling;
        while (sibling2) {
          const next = sibling2.nextElementSibling;
          sibling2.remove();
          sibling2 = next;
        }
        
        // Also try removing from heading parent
        const headingParent = heading.parentElement;
        if (headingParent !== section) {
          sibling2 = headingParent.nextElementSibling;
          while (sibling2) {
            const next = sibling2.nextElementSibling;
            sibling2.remove();
            sibling2 = next;
          }
        }
        
        // Insert the details after heading/heading parent
        if (headingParent !== section) {
          headingParent.after(details);
        } else {
          heading.after(details);
        }
      }
    });
  });
  
  // ===== PUBLICATIONS TIMELINE CHART =====
  function animatePublicationBars() {
    const bars = document.querySelectorAll('.pub-chart-bar');
    bars.forEach((bar, index) => {
      const targetWidth = bar.getAttribute('data-width');
      if (targetWidth && !bar.classList.contains('animated')) {
        bar.classList.add('animated');
        if (prefersReducedMotion) {
          bar.style.width = targetWidth;
        } else {
          setTimeout(() => {
            bar.style.width = targetWidth;
          }, index * 100);
        }
      }
    });
  }
  
  // ===== ANIMATED COUNTERS =====
  function animateCounter(element, target, suffix = '') {
    if (prefersReducedMotion) {
      element.textContent = target;
      return;
    }
    const duration = 2000;
    const start = 0;
    const startTime = performance.now();
    
    // Handle numbers with + or other suffixes
    const numericTarget = parseFloat(target.replace(/[^0-9.]/g, ''));
    const hasPlus = target.includes('+');
    const hasM = target.includes('M');
    const hasK = target.includes('K');
    
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(easeOut * numericTarget);
      
      let display = current.toString();
      if (hasM) display = current + 'M';
      if (hasK) display = current + 'K';
      if (hasPlus) display += '+';
      
      element.textContent = display;
      
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.textContent = target; // Ensure final value is exact
      }
    }
    
    requestAnimationFrame(update);
  }
  
  // ===== SKILL BARS ANIMATION =====
  function animateSkillBars() {
    const skillBars = document.querySelectorAll('.skill-progress');
    skillBars.forEach(bar => {
      const width = bar.getAttribute('data-width') || bar.style.width;
      if (width) {
        if (prefersReducedMotion) {
          bar.style.width = width;
        } else {
          bar.style.width = '0';
          setTimeout(() => {
            bar.style.width = width;
          }, 100);
        }
      }
    });
  }
  
  // ===== TIMELINE ANIMATION =====
  function animateTimeline() {
    const items = document.querySelectorAll('.timeline-item');
    items.forEach((item, index) => {
      if (prefersReducedMotion) {
        item.classList.add('visible');
      } else {
        setTimeout(() => {
          item.classList.add('visible');
        }, index * 150);
      }
    });
  }
  
  // ===== INTERSECTION OBSERVER =====
  const observerOptions = {
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.dataset.animated) {
        entry.target.dataset.animated = 'true';
        
        // Animate stat counters
        if (entry.target.classList.contains('stat-card')) {
          const numberEl = entry.target.querySelector('.stat-number');
          if (numberEl) {
            const target = numberEl.textContent;
            animateCounter(numberEl, target);
          }
        }
        
        // Animate skill bars in view
        if (entry.target.classList.contains('skill-bar')) {
          const progress = entry.target.querySelector('.skill-progress');
          if (progress) {
            const width = progress.getAttribute('data-width') || progress.style.width;
            progress.style.width = '0';
            setTimeout(() => {
              progress.style.width = width;
            }, 100);
          }
        }
        
        // Animate timeline items
        if (entry.target.classList.contains('timeline-item')) {
          entry.target.classList.add('visible');
        }
      }
    });
  }, observerOptions);
  
  // Observe all animated elements
  document.querySelectorAll('.stat-card').forEach(el => observer.observe(el));
  document.querySelectorAll('.skill-bar').forEach(el => observer.observe(el));
  document.querySelectorAll('.timeline-item').forEach(el => observer.observe(el));
  
  // Store original widths for skill bars
  document.querySelectorAll('.skill-progress').forEach(bar => {
    const width = bar.style.width;
    if (width) {
      bar.setAttribute('data-width', width);
      bar.style.width = '0';
    }
  });
  
  // ===== PUBLICATIONS CHART OBSERVER =====
  const pubChartObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animatePublicationBars();
        pubChartObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  
  const pubChart = document.querySelector('.pub-chart-container');
  if (pubChart) {
    pubChartObserver.observe(pubChart);
  }
  
  // ===== IMAGE THEME SWITCHING =====
  function updateImageThemes() {
    const isDark = document.body.classList.contains('dark');
    
    // Define images that have dark/light variants
    const themeImages = [
      { selector: 'img[src*="impact-dashboard"]', light: '/images/impact-dashboard.png', dark: '/images/impact-dashboard-dark.png' },
      { selector: 'img[src*="research-map"], #map-img', light: '/images/research-map.png', dark: '/images/research-map-dark.png', srcsets: 'research-map-srcsets' }
    ];
    
    themeImages.forEach(({ selector, light, dark, srcsets }) => {
      const sets = srcsets && document.getElementById(srcsets);
      const newSrcset = sets ? sets.getAttribute(isDark ? 'data-dark' : 'data-light') : '';
      const imgs = document.querySelectorAll(selector);
      imgs.forEach(img => {
        if (img) {
          const newSrc = isDark ? dark : light;
          if (!img.src.endsWith(newSrc)) {
            img.src = newSrc;
          }
          if (newSrcset && img.getAttribute('srcset') !== newSrcset) img.setAttribute('srcset', newSrcset);
        }
      });
    });
  }
  
  // Update on page load
  updateImageThemes();
  
  // Listen for theme changes
  const themeObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        updateImageThemes();
      }
    });
  });
  
  themeObserver.observe(document.body, { attributes: true });
  
  // ===== PARTICLE BACKGROUND =====
  const aboutSection = document.getElementById('about');
  const startParticles = () => {
    if (typeof tsParticles === 'undefined' || document.getElementById('tsparticles')) return;
    // Create particle container
    const particleContainer = document.createElement('div');
    particleContainer.id = 'tsparticles';
    aboutSection.insertBefore(particleContainer, aboutSection.firstChild);
    
    const isDarkMode = document.body.classList.contains('dark');
    
    tsParticles.load('tsparticles', {
      particles: {
        number: {
          value: 50,
          density: {
            enable: true,
            value_area: 800
          }
        },
        color: {
          value: isDarkMode ? '#64b5f6' : '#1565c0'
        },
        opacity: {
          value: 0.3,
          random: true,
          animation: {
            enable: true,
            speed: 0.5,
            minimumValue: 0.1
          }
        },
        size: {
          value: 3,
          random: true
        },
        move: {
          enable: true,
          speed: 0.8,
          direction: 'none',
          random: true,
          straight: false,
          outModes: {
            default: 'out'
          }
        },
        links: {
          enable: true,
          distance: 150,
          color: isDarkMode ? '#64b5f6' : '#1565c0',
          opacity: 0.2,
          width: 1
        }
      },
      detectRetina: true
    });
  };
  // The moving background is decoration that plays on its own, so it never starts under prefers-reduced-motion (WCAG 2.2.2),
  // and its script is fetched only on the page that uses it.
  if (aboutSection && !prefersReducedMotion) {
    const particleScript = document.createElement('script');
    particleScript.src = '/vendor/tsparticles/2.12.0/tsparticles.bundle.min.js';
    particleScript.integrity = 'sha512-W/UhCgUnBrqWd6HtR1wS+twNkVYvwxB1Hqtm9d/0HOWynEcr7t1BOQn1x55ziHQJtn+tU0Fzih1SAawRr6YFmA==';
    particleScript.onload = startParticles;
    document.head.appendChild(particleScript);
  }
  
  // Map and dashboard are now static PNG images with theme switching
  
  // ===== CITATION COPY HELPERS =====
  const decodeCopyText = (raw) => {
    if (!raw) return '';
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
  };

  const fallbackCopy = (text) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(textarea);
  };

  const copyTextToClipboard = (text, button) => {
    if (!text) return;
    const applyFeedback = () => {
      if (!button) return;
      const original = button.dataset.copyOriginalHtml || button.innerHTML;
      if (!button.dataset.copyOriginalHtml) button.dataset.copyOriginalHtml = original;
      button.classList.add('copied');
      button.innerHTML = 'Copied';
      setTimeout(() => {
        button.classList.remove('copied');
        button.innerHTML = original;
      }, 1500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(applyFeedback).catch(() => {
        fallbackCopy(text);
        applyFeedback();
      });
    } else {
      fallbackCopy(text);
      applyFeedback();
    }
  };

  window.copyBibtex = function(button) {
    const raw = button ? (button.dataset.bibtex || button.dataset.copyText) : '';
    copyTextToClipboard(decodeCopyText(raw), button);
  };

  window.buildCitationFormats = function(meta) {
    const info = meta || {};
    const title = (info.title || '').toString().trim() || 'Untitled';
    const year = info.year || new Date().getFullYear();
    const venue = (info.venue || '').toString().trim();
    const doi = (info.doi || '').toString().trim();
    const type = (info.type || '').toString().trim();

    const normalizeAuthors = (authors) => {
      if (!authors) return [];
      if (Array.isArray(authors)) return authors.filter(Boolean);
      if (typeof authors === 'string') {
        return authors.split(',').map(a => a.trim()).filter(Boolean);
      }
      return [];
    };

    const joinAuthors = (list, conj) => {
      if (!list.length) return '';
      if (list.length === 1) return list[0];
      if (list.length === 2) return `${list[0]} ${conj} ${list[1]}`;
      return `${list.slice(0, -1).join(', ')}, ${conj} ${list[list.length - 1]}`;
    };

    const authors = normalizeAuthors(info.authors);
    const apaAuthors = joinAuthors(authors, '&') || 'Unknown';
    const chicagoAuthors = joinAuthors(authors, 'and') || 'Unknown';

    const apa = `${apaAuthors} (${year}). ${title}.${venue ? ' ' + venue : ''}${doi ? ' https://doi.org/' + doi : ''}`;
    const chicago = `${chicagoAuthors}. ${year}. "${title}."${venue ? ' ' + venue : ''}${doi ? ' https://doi.org/' + doi : ''}`;

    const bibType = type === 'journal' ? 'article' : (type === 'conference' || type === 'workshop') ? 'inproceedings' : 'misc';
    const venueField = bibType === 'article' ? 'journal' : 'booktitle';
    const authorKeyBase = (authors[0] || 'ampel').split(' ').slice(-1)[0].replace(/[^a-zA-Z]/g, '').toLowerCase() || 'cite';
    const firstWord = title.split(/\s+/)[0] || '';
    const titleKey = firstWord.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'work';
    const citationKey = `${authorKeyBase}${year}${titleKey}`;
    const venueLine = venue ? `  ${venueField}={${venue}},\n` : '';
    const doiLine = doi ? `,\n  doi={${doi}}` : '';
    const bibtex = `@${bibType}{${citationKey},\n  title={${title}},\n  author={${authors.join(' and ')}},\n${venueLine}  year={${year}}${doiLine}\n}`;

    return { apa, chicago, bibtex };
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-copy-text]');
    if (!button) return;
    event.preventDefault();
    const text = decodeCopyText(button.dataset.copyText || '');
    copyTextToClipboard(text, button);
  });
  
  // Add cite buttons to publication pages
  function addCiteButtons() {
    // Check if we're on a publication page
    const isPublicationPage = window.location.pathname.includes('/publication/') ||
                               window.location.pathname.includes('/journal_publication/') ||
                               window.location.pathname.includes('/conference_publication/') ||
                               window.location.pathname.includes('/workshop_publication/');
    
    if (!isPublicationPage) return;
    if (document.querySelector('.pub-extras')) return;
    
    // Find the publication title
    const titleEl = document.querySelector('article h1') || document.querySelector('.article-title');
    if (!titleEl) return;
    
    const title = titleEl.textContent.trim();
    
    // Find authors (look for author links or text)
    const authorEls = document.querySelectorAll('.author-card a, .author-notes a, [rel="author"]');
    let authors = [];
    authorEls.forEach(el => {
      const name = el.textContent.trim();
      if (name && !authors.includes(name)) authors.push(name);
    });
    if (authors.length === 0) authors = ['Ampel, Benjamin M.'];
    
    // Get year from URL or page content
    const yearMatch = window.location.pathname.match(/20\d{2}/) || 
                      document.body.textContent.match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[0] : new Date().getFullYear();
    
    // Find DOI if present
    const doiLink = document.querySelector('a[href*="doi.org"]');
    const doi = doiLink ? doiLink.href.replace('https://doi.org/', '') : '';
    
    // Find venue
    const venueEl = document.querySelector('.pub-publication, .article-metadata');
    const venue = venueEl ? venueEl.textContent.trim().split(',')[0] : '';
    
    const citations = window.buildCitationFormats({
      title,
      authors,
      year,
      venue,
      doi
    });
    
    // Find the button area (near PDF/links)
    const buttonArea = document.querySelector('.btn-links') || 
                       document.querySelector('.article-header-caption') ||
                       document.querySelector('.article-container');
    
    if (buttonArea) {
      if (buttonArea.querySelector('.cite-actions')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'cite-actions';
      const makeBtn = (label, text) => {
        const btn = document.createElement('button');
        btn.className = 'cite-button';
        btn.type = 'button';
        btn.dataset.copyText = encodeURIComponent(text || '');
        btn.dataset.copyLabel = label;
        btn.textContent = `Copy ${label}`;
        return btn;
      };
      wrapper.appendChild(makeBtn('APA', citations.apa));
      wrapper.appendChild(makeBtn('Chicago', citations.chicago));
      wrapper.appendChild(makeBtn('BibTeX', citations.bibtex));

      if (buttonArea.classList.contains('btn-links')) {
        buttonArea.insertBefore(wrapper, buttonArea.firstChild);
      } else {
        buttonArea.appendChild(wrapper);
      }
    }
  }
  
  addCiteButtons();
  
  // Altmetric badges come only from the altmetric shortcode (layouts/shortcodes/altmetric.html), which loads embed.js on
  // its own page. A copy injected here on the other publication pages showed an empty "?" donut.
  
}

// The script is deferred, so the DOM is parsed when it runs; DOMContentLoaded has not fired yet.
document.addEventListener('DOMContentLoaded', runEnhancements);

// =============================================================================
// ===== FOOTER TERMINAL (static build info, no visitor data, no network) =====
// =============================================================================

function initVisitorTerminal() {
  // Don't inject twice
  if (document.querySelector('.visitor-terminal')) return;

  const meta = document.querySelector('meta[name="build-date"]');
  const built = meta ? meta.content : '';

  const terminal = document.createElement('div');
  terminal.className = 'visitor-terminal';
  terminal.innerHTML = `
      <div style="margin-bottom: 10px; border-bottom: 1px dashed #333; padding-bottom: 5px;">
        <strong>/// BAMPEL.COM ///</strong>
      </div>
      <div class="terminal-row">
        <span class="terminal-label">> SITE:</span>
        <span class="terminal-value">Benjamin Ampel, Georgia State University</span>
      </div>
      ${built ? `<div class="terminal-row" style="margin-top: 10px; border: none;">
        <span class="terminal-label">> BUILD:</span>
        <span class="terminal-value">${built} <span class="terminal-cursor"></span></span>
      </div>` : ''}
  `;

  // Inject at the top of the footer, trying selectors for different Hugo themes
  const footer = document.querySelector('footer') ||
                 document.querySelector('.site-footer') ||
                 document.querySelector('.page-footer') ||
                 document.querySelector('[class*="footer"]');
  if (footer) footer.insertBefore(terminal, footer.firstChild);
}

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(initVisitorTerminal, 500);
});
window.addEventListener('load', function() {
  setTimeout(initVisitorTerminal, 1000);
});

