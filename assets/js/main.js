/* =========================================================================
   main.js — chrome: theme, nav, scroll-spy, reveal.
   The film itself lives in scene.js.
   ========================================================================= */
(function () {
  'use strict';

  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- theme (paper by default; .dark = inverted plate) ---------- */
  const THEME_KEY = 'ng-theme';

  function readStored() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }
  function store(v) {
    try { localStorage.setItem(THEME_KEY, v); } catch (e) { /* private mode */ }
  }

  const stored = readStored();
  if (stored === 'dark') {
    root.classList.add('dark');
  } else if (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    root.classList.add('dark');
  }

  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      const isDark = root.classList.toggle('dark');
      store(isDark ? 'dark' : 'paper');
      // the film reads its colours from CSS vars — tell it to repaint
      window.dispatchEvent(new CustomEvent('ng:theme'));
    });
  }

  /* ---------- mobile nav ---------- */
  const burger = document.getElementById('burger');
  const links = document.getElementById('navLinks');

  if (burger && links) {
    burger.addEventListener('click', function () {
      const open = links.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
    });
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        links.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- nav border on scroll ---------- */
  const nav = document.getElementById('nav');
  let ticking = false;

  function onScroll() {
    if (nav) nav.classList.toggle('is-stuck', window.scrollY > 12);
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  /* ---------- scroll spy ---------- */
  const navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__link'));
  const sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    const spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ---------- reveal on enter ---------- */
  const revealables = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window) || reduced) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    const io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        obs.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ---------- footer year ---------- */
  const yr = document.getElementById('yr');
  if (yr) yr.textContent = String(new Date().getFullYear());

})();
