// ================= ENVIRONMENT & API CONFIGURATION =================
// When running locally, uses localhost:3000. When deployed on Vercel, uses your Render backend URL.
const RAW_RENDER_URL = window.RENDER_BACKEND_URL || localStorage.getItem('aec_backend_url') || "https://adaptive-exam-coach.onrender.com";
const RENDER_BACKEND_URL = RAW_RENDER_URL.replace(/\/+$/, '');

const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? "http://localhost:3000"
    : RENDER_BACKEND_URL;

const API_BASE = `${BACKEND_URL}/api`;
let authToken = localStorage.getItem('aec_token');
let currentUser = localStorage.getItem('aec_user');

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
    };
}

let xp = 0;
let streak = 0;
let lastActive = null;
let badges = [];
let userGrade = 'General';
let targetExam = 'None';
let userEmail = '';
let customSyllabusName = '';
let customSyllabusData = {};
let quizHistory = [];
let quiz = null;
let beforeAfterSnapshot = null;

Object.defineProperty(window, 'TOPICS', {
    get: function() {
        if (typeof customSyllabusData !== 'undefined' && customSyllabusData && Object.keys(customSyllabusData).length > 0) {
            return Object.keys(customSyllabusData);
        }
        return ["Math","Physics","Chemistry","Biology"];
    }
});
const TOPIC_COLOR = { Math:"#B4801F", Physics:"#1F2A44", Chemistry:"#3F7A4E", Biology:"#B5382C" };
const TOPIC_ICONS = {
  Math: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16M4 5h16M7 5l5 14M17 5l-5 14"/></svg>`,
  Physics: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)"/></svg>`,
  Chemistry: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31L4.1 19.34A2 2 0 0 0 5.76 22h12.48a2 2 0 0 0 1.66-2.66L14 9.31V2h-4z"/><line x1="8.5" y1="2" x2="15.5" y2="2"/></svg>`,
  Biology: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/><path d="M17 6l3-3"/><path d="M4 21l3-3"/></svg>`
};
const SYLLABUS_PALETTE = [
  "#B4801F", // gold
  "#1F2A44", // deep navy
  "#2E7D32", // forest green
  "#8E24AA", // deep violet/purple
  "#C2185B", // crimson rose
  "#00838F", // cyan teal
  "#D84315", // rust orange
  "#3949AB", // royal indigo
  "#4E342E", // rich mocha
  "#00796B"  // pine teal
];

function getTopicColor(t, idx = 0) {
  if (TOPIC_COLOR[t]) return TOPIC_COLOR[t];
  const lower = String(t || '').toLowerCase();
  if (lower.includes('math') || lower.includes('algebra') || lower.includes('arith')) return "#B4801F";
  if (lower.includes('geom')) return "#1F2A44";
  if (lower.includes('physic') || lower.includes('mechanic')) return "#1E40AF";
  if (lower.includes('chem')) return "#2E7D32";
  if (lower.includes('bio') || lower.includes('botan') || lower.includes('zool') || lower.includes('environ')) return "#C0392B";
  if (lower.includes('hist') || lower.includes('politic') || lower.includes('civic') || lower.includes('social')) return "#7B1FA2";
  if (lower.includes('lang') || lower.includes('english') || lower.includes('hindi') || lower.includes('marathi') || lower.includes('french') || lower.includes('literat')) return "#C26D1A";
  if (lower.includes('comput') || lower.includes('code') || lower.includes('technol')) return "#00838F";
  return SYLLABUS_PALETTE[idx % SYLLABUS_PALETTE.length];
}

const DEFAULT_TOPIC_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;

function getTopicIcon(t) {
  if (TOPIC_ICONS[t]) return TOPIC_ICONS[t];
  const lower = String(t || '').toLowerCase();
  
  if (lower.includes('math') || lower.includes('algebra') || lower.includes('geometr') || lower.includes('calcul') || lower.includes('arith')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16M4 5h16M7 5l5 14M17 5l-5 14"/></svg>`;
  }
  if (lower.includes('physic') || lower.includes('mechanic') || lower.includes('quantum') || lower.includes('optic')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)"/></svg>`;
  }
  if (lower.includes('chem') || lower.includes('organic') || lower.includes('inorganic') || lower.includes('reaction')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31L4.1 19.34A2 2 0 0 0 5.76 22h12.48a2 2 0 0 0 1.66-2.66L14 9.31V2h-4z"/><line x1="8.5" y1="2" x2="15.5" y2="2"/></svg>`;
  }
  if (lower.includes('bio') || lower.includes('botany') || lower.includes('zoolog') || lower.includes('environment') || lower.includes('ecolog')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/><path d="M17 6l3-3"/><path d="M4 21l3-3"/></svg>`;
  }
  if (lower.includes('science') || lower.includes('technol')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h12M12 2v4M5 6l2 2M19 6l-2 2M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"/></svg>`;
  }
  if (lower.includes('hist') || lower.includes('politic') || lower.includes('civic') || lower.includes('social') || lower.includes('geograph')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
  }
  if (lower.includes('lang') || lower.includes('english') || lower.includes('hindi') || lower.includes('literat') || lower.includes('gramm') || lower.includes('sanskrit') || lower.includes('french') || lower.includes('marathi')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/></svg>`;
  }
  if (lower.includes('data') || lower.includes('dbms') || lower.includes('sql') || lower.includes('storage')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`;
  }
  if (lower.includes('operat') || lower.includes('os') || lower.includes('system') || lower.includes('architect')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>`;
  }
  if (lower.includes('comput') || lower.includes('theor') || lower.includes('algo') || lower.includes('logic') || lower.includes('code') || lower.includes('program')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline><line x1="14" y1="4" x2="10" y2="20"></line></svg>`;
  }
  if (lower.includes('net') || lower.includes('web') || lower.includes('cloud') || lower.includes('secur') || lower.includes('crypto')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
  }
  if (lower.includes('multi') || lower.includes('inter') || lower.includes('minor') || lower.includes('layer') || lower.includes('core')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`;
  }
  if (lower.includes('elect') || lower.includes('open') || lower.includes('opt') || lower.includes('art') || lower.includes('human')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>`;
  }
  if (lower.includes('ai') || lower.includes('intel') || lower.includes('learn') || lower.includes('neural')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"></path><circle cx="9" cy="14" r="1"></circle><circle cx="15" cy="14" r="1"></circle><line x1="9" y1="18" x2="15" y2="18"></line></svg>`;
  }
  return DEFAULT_TOPIC_ICON;
}

function animateCount(el, start, end, duration = 850, suffix = '') {
  if (!el) return;
  if (typeof end !== 'number' || isNaN(end)) {
    el.textContent = end + (suffix || '');
    return;
  }
  const range = end - start;
  const startTime = performance.now();
  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + range * ease);
    el.textContent = current + suffix;
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = end + suffix;
    }
  }
  requestAnimationFrame(update);
}
const TOPIC_NAMES = {
  Math: "Mathematics",
  Physics: "Physics",
  Chemistry: "Chemistry",
  Biology: "Biology"
};

let weaknessTracker = {};
TOPICS.forEach(t => weaknessTracker[t] = {correct:0, total:0});

const MICRO_TOPICS = {
  Math: ["Algebra", "Calculus", "Geometry", "Trigonometry", "Probability"],
  Physics: ["Kinematics", "Thermodynamics", "Electromagnetism", "Optics", "Modern Physics"],
  Chemistry: ["Organic Chemistry", "Inorganic Chemistry", "Physical Chemistry", "Biochemistry", "Analytical Chemistry"],
  Biology: ["Cell Biology", "Genetics", "Evolution", "Human Anatomy", "Ecology"]
};
let microTracker = {};
function initMicroTracker() {
  TOPICS.forEach(t => {
    let subs = MICRO_TOPICS[t];
    if (!subs && typeof customSyllabusData !== 'undefined' && customSyllabusData[t]) {
      subs = customSyllabusData[t];
    }
    if (subs) {
      subs.forEach(sub => {
        if(!microTracker[sub]) microTracker[sub] = {correct:0, total:0};
      });
    }
  });
}
initMicroTracker();



function updateCustomSubjectDropdown() {
    const select = document.getElementById('customSubjectSelect');
    
    // Ensure TOPIC_COLOR has entries for new topics
    TOPICS.forEach((t, idx) => {
        if (!TOPIC_COLOR[t]) {
            const colors = ['#B4801F', '#1F2A44', '#3F7A4E', '#B5382C', '#6A2C70', '#D38C2B', '#2C6170'];
            TOPIC_COLOR[t] = colors[idx % colors.length];
        }
    });
    
    // Initialize weaknessTracker for any new topics
    TOPICS.forEach(t => {
        if (!weaknessTracker[t]) weaknessTracker[t] = { correct: 0, total: 0 };
    });
    initMicroTracker();

    if (select) {
        if (customSyllabusData && Object.keys(customSyllabusData).length > 0) {
            select.innerHTML = '';
            Object.keys(customSyllabusData).forEach(subject => {
                const option = document.createElement('option');
                option.value = subject;
                option.textContent = subject;
                select.appendChild(option);
            });
            
            // Trigger change event to populate topic dropdown for the first subject
            select.dispatchEvent(new Event('change'));
        }
    }

    if (typeof populateArenaSubjectsAndTopics === 'function') {
        populateArenaSubjectsAndTopics();
    }

    if (typeof renderFocusMeter === 'function') {
        renderFocusMeter();
    }
}

// Elementsification UI
function updateXPUI() {
    document.getElementById('xpCount').textContent = xp;
    document.getElementById('streakCount').textContent = streak;
}

function addXP(amount) {
    xp += amount;
    updateXPUI();
    checkBadges();
}

async function saveProgress() {
    if (!authToken) return; // Don't save if not logged in
    try {
        await fetch(`${API_BASE}/data`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ weaknessTracker, quizHistory, microTracker, xp, streak, lastActive, badges })
        });
    } catch (err) {
        console.error("Failed to save progress", err);
    }
}


// Helpers
function accuracy(topic){ const t = weaknessTracker[topic]; if(!t || t.total === 0) return null; return t.correct / t.total; }
function overallAccuracy(){ let c=0,tot=0; TOPICS.forEach(t=>{ c+=weaknessTracker[t].correct; tot+=weaknessTracker[t].total; }); return tot===0 ? null : c/tot; }
function totalAnswered(){ let tot=0; TOPICS.forEach(t=>tot+=weaknessTracker[t].total); return tot; }
function weakness_tracker(topic, correct, total){
  if(!weaknessTracker[topic]) weaknessTracker[topic] = {correct:0,total:0};
  weaknessTracker[topic].correct += correct;
  weaknessTracker[topic].total += total;
  return getTop3Weakest();
}
function getTop3Weakest(){
  return TOPICS.map(t => ({topic:t, acc: weaknessTracker[t].total>0 ? weaknessTracker[t].correct/weaknessTracker[t].total : 0.5, total: weaknessTracker[t].total}))
    .sort((a,b)=> a.acc - b.acc).slice(0,3);
}
function currentWeights(){
  const w = {};
  TOPICS.forEach(t=>{
    const acc = accuracy(t);
    const effAcc = acc === null ? 0.6 : acc;
    w[t] = Math.max(0.12, 1 - effAcc) + 0.15;
  });
  return w;
}
function fmt(n){ return (n*100).toFixed(0)+"%"; }
function todayStr(){ const d = new Date(); return d.toLocaleDateString(undefined,{month:'short',day:'numeric'}) + " " + d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); }

// ================= SIDEBAR MENU & UNIFIED TABS CONTROLS =================
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const sidebarEdgeToggleBtn = document.getElementById('sidebarEdgeToggleBtn');
const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');

function toggleSidebar() {
  const edgeBtn = document.getElementById('sidebarEdgeToggleBtn');
  if (window.innerWidth <= 1024) {
    const isNowOpen = document.body.classList.toggle('sidebar-open');
    if (edgeBtn) {
      edgeBtn.title = isNowOpen ? "Hide Sidebar Menu" : "Show Sidebar Menu";
      edgeBtn.setAttribute('aria-expanded', String(isNowOpen));
    }
  } else {
    const layout = document.getElementById('appLayout') || document.querySelector('.app-layout');
    if (layout) {
      const isCollapsed = layout.classList.toggle('sidebar-collapsed');
      if (edgeBtn) {
        edgeBtn.title = isCollapsed ? "Show Sidebar Menu (Bring from Left)" : "Hide Sidebar Menu (Scroll to Left)";
        edgeBtn.setAttribute('aria-expanded', String(!isCollapsed));
      }
    }
  }
}

function closeSidebar() {
  document.body.classList.remove('sidebar-open');
  const edgeBtn = document.getElementById('sidebarEdgeToggleBtn');
  if (edgeBtn && window.innerWidth <= 1024) {
    edgeBtn.title = "Show Sidebar Menu";
    edgeBtn.setAttribute('aria-expanded', 'false');
  }
}

window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;

if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);
if (sidebarEdgeToggleBtn) sidebarEdgeToggleBtn.addEventListener('click', toggleSidebar);
if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener('click', closeSidebar);
  sidebarBackdrop.addEventListener('touchstart', (e) => {
    e.preventDefault();
    closeSidebar();
  }, { passive: false });
}

window.switchActiveTab = function(tabName) {
  if (!tabName) return;
  document.body.dataset.activeTab = tabName;
  const layout = document.getElementById('appLayout') || document.querySelector('.app-layout');
  if (layout) layout.dataset.activeTab = tabName;
  // Update visible sidebar navigation
  document.querySelectorAll('#sidebarTabs .sidebar-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  // Update legacy tabs for backward compatibility
  document.querySelectorAll('nav.tabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  // Update panels
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const targetPanel = document.getElementById('panel-' + tabName);
  if (targetPanel) targetPanel.classList.add('active');

  // Lazy render modules
  if (tabName === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
  if (tabName === 'plan' && typeof renderPlan === 'function') renderPlan();
  if (tabName === 'history' && typeof renderHistory === 'function') renderHistory();
  if (tabName === 'resources' && typeof renderResources === 'function') renderResources();
  if (tabName === 'arena' && typeof initArena === 'function') initArena();

  // On small viewports, auto close off-canvas sidebar
  if (window.innerWidth <= 1024) {
    closeSidebar();
  }
};

const tabsEl = document.getElementById('tabs');
if (tabsEl) {
  tabsEl.addEventListener('click', e => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    window.switchActiveTab(btn.dataset.tab);
  });
}

const sidebarTabsEl = document.getElementById('sidebarTabs');
if (sidebarTabsEl) {
  sidebarTabsEl.addEventListener('click', e => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    window.switchActiveTab(btn.dataset.tab);
  });
}

function updateThemeToggleUI() {
  const dark = document.documentElement.classList.contains('dark');
  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) return;
  themeToggle.classList.toggle('active', dark);
  
  const iconWrap = document.getElementById('themeIconWrap');
  const label = document.getElementById('themeLabel');
  
  const moonSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const sunSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  
  if (iconWrap) iconWrap.innerHTML = dark ? sunSvg : moonSvg;
  if (label) label.textContent = dark ? 'Light' : 'Dark';
}

const themeToggleBtn = document.getElementById('themeToggle');
if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', ()=>{
    document.documentElement.classList.toggle('dark');
    updateThemeToggleUI();
  });
  updateThemeToggleUI();
}

const focusToggleBtn = document.getElementById('focusToggle');
if (focusToggleBtn) {
  focusToggleBtn.addEventListener('click', ()=>{
    document.body.classList.toggle('focus-mode');
    const on = document.body.classList.contains('focus-mode');
    focusToggleBtn.classList.toggle('active', on);
    document.querySelectorAll('nav.tabs, header .brand p').forEach(el=> el.style.opacity = on? '0.35':'1');
  });
}

function renderFocusMeter(){
  const w = currentWeights();
  const maxW = Math.max(...Object.values(w)) || 1;
  const weakest = getTop3Weakest()[0]?.topic;
  const el = document.getElementById('focusMeter');
  if (!el) return;

  const TOPIC_NAMES = {
    Math: "Mathematics",
    Physics: "Physics",
    Chemistry: "Chemistry",
    Biology: "Biology"
  };

  const hasCustom = typeof customSyllabusData === 'object' && customSyllabusData !== null && Object.keys(customSyllabusData).length > 0;
  
  // Dynamically update radar badge and subtitle for syllabus
  const radarBadge = document.getElementById('focusMeterLiveBadge');
  if (radarBadge) {
    if (hasCustom) {
      radarBadge.innerHTML = `<span class="radar-dot"></span> 📜 ${TOPICS.length} Syllabus Subjects`;
      radarBadge.title = `Loaded from ${customSyllabusName || 'custom syllabus'}. Scroll inside to view all subjects.`;
    } else {
      radarBadge.innerHTML = `<span class="radar-dot"></span> Live Weighting`;
      radarBadge.title = 'Real-time adaptive weighting';
    }
  }
  const subTitle = document.getElementById('focusMeterSubTitle');
  if (subTitle) {
    if (hasCustom && TOPICS.length > 4) {
      subTitle.textContent = `Syllabus weights (${TOPICS.length} subjects • scroll to view)`;
    } else {
      subTitle.textContent = 'Real-time adaptive weight per topic';
    }
  }

  el.innerHTML = TOPICS.map((t, idx) => {
    const weightVal = (w[t] !== undefined) ? w[t] : 1;
    const pct = Math.round((weightVal / maxW) * 100);
    const isWeak = t === weakest && weaknessTracker[t] && weaknessTracker[t].total > 0;
    const color = getTopicColor(t, idx);
    const icon = getTopicIcon(t);
    const name = TOPIC_NAMES[t] || t;
    
    let priorityBadge = '';
    if (isWeak) {
      priorityBadge = `<span class="fm-priority-chip chip-weakest" title="Targeted weakness priority">🔥 Focus Area</span>`;
    } else if (pct >= 80) {
      priorityBadge = `<span class="fm-priority-chip chip-active" title="Active quiz weighting">⚡ Active Weight</span>`;
    } else {
      priorityBadge = `<span class="fm-priority-chip chip-balanced" title="Balanced curriculum weight">⚖️ Balanced</span>`;
    }

    return `
      <div class="focus-meter-row-item ${isWeak ? 'weakest-topic' : ''}" title="${name}: ${pct}% adaptive weighting" style="border-left: 3px solid ${color};">
        <div class="fm-item-top">
          <div class="fm-subject-wrap" title="${name}">
            <span class="fm-subject-icon-box" style="color:${color}; background:${color}18; border-color:${color}33;">
              ${icon}
            </span>
            <span class="fm-subject-label" style="color:var(--ink);" title="${name}">${name}</span>
          </div>
          <div class="fm-meta-wrap">
            ${priorityBadge}
            <span class="fm-pct-badge" style="color:${isWeak ? 'var(--red-soft)' : color};">${pct}%</span>
          </div>
        </div>
        <div class="fm-track">
          <div class="fm-fill ${isWeak ? 'weakest' : ''}" style="width:${pct}%; background:${isWeak ? 'var(--red-soft)' : color};"></div>
        </div>
      </div>
    `;
  }).join('');
}

// Quiz Engine via AI
async function startQuiz(config, isDemo){
  setCoachLockState(true);
  document.getElementById('quizEmpty').style.display='none';
  document.getElementById('quizResult').style.display='none';
  const active = document.getElementById('quizActive');
  active.style.display='block';
  
  quiz = {
    n: config.n || 5, index: 0, correctCount: 0,
    topicsAsked: [], answers: [], isDemo: !!isDemo,
    weightsBefore: currentWeights(),
    questions: [],
    currentDifficulty: 'medium',
    mode: config.mode || 'adaptive',
    subject: config.subject || 'All',
    subtopic: config.subtopic || 'All',
    format: config.format || 'mix',
    timerSeconds: config.timerSeconds || 0
  };
  
  active.innerHTML = `
    <div class="q-header">
      <div class="q-header-meta">
        <span class="q-progress" id="qProgress"></span>
        <span class="badge" id="qTopicBadge"></span>
        <span class="badge" id="qSubtopicBadge" style="background:var(--paper-2); border:1px solid var(--card-border); display:none;"></span>
        <span class="badge" id="qDiffBadge"></span>
      </div>
      <span class="badge timer-badge" id="qTimerText" style="margin-left:auto; font-family:'IBM Plex Mono',monospace; background:var(--gold); display:none;"></span>
    </div>
    <div class="q-text" id="qText"></div>
    <div class="options" id="qOptions"></div>
    <div id="qHintBox" style="display:none; margin: 12px 0; padding: 14px 16px; background: var(--paper-2); border-left: 3px solid var(--gold); font-size: 14px; border-radius: 6px;"></div>
    <div class="explain-box" id="qExplain"></div>
    <div class="quiz-actions">
      <button class="btn secondary" id="qHintBtn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:text-bottom; margin-right:4px;"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 6h8c1.5-1.5 3-3.5 3-6a7 7 0 0 0-7-7z"/></svg>
        <span>Get Hint</span>
      </button>
      <button class="btn secondary" id="quitQuizBtn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:text-bottom; margin-right:4px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        <span>End Quiz</span>
      </button>
      <button class="btn" id="nextQBtn" disabled>
        <span>Next Question</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="vertical-align:text-bottom; margin-left:4px;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </button>
    </div>`;
    
  if (quiz.timerSeconds > 0) {
    const timerSpan = document.getElementById('qTimerText');
    timerSpan.style.display = 'inline-block';
    quiz.timeLeft = quiz.timerSeconds;
    
    quiz.timerInterval = setInterval(() => {
      quiz.timeLeft--;
      const min = Math.floor(quiz.timeLeft / 60);
      const sec = quiz.timeLeft % 60;
      timerSpan.textContent = `⏳ ${min}:${sec.toString().padStart(2, '0')}`;
      
      if (quiz.timeLeft <= 0) {
        clearInterval(quiz.timerInterval);
        quiz.timerInterval = null;
        endQuiz(true, true); // (early, timeout)
      }
    }, 1000);
  }
    
  document.getElementById('nextQBtn').onclick = ()=>{
    quiz.index++;
    if(quiz.index >= quiz.n){ endQuiz(); } else { fetchNextQuestion(); }
  };
  document.getElementById('quitQuizBtn').onclick = ()=>{
    if(quiz && quiz.index>0) endQuiz(true);
    else resetQuizUI();
  };

  await fetchNextQuestion();
}

async function fetchNextQuestion() {
  document.getElementById('nextQBtn').disabled = true;
  const qText = document.getElementById('qText');
  qText.innerHTML = `<span style="color:var(--ink-soft)">⏳ Generating next question...</span>`;
  document.getElementById('qOptions').innerHTML = '';
  document.getElementById('qExplain').classList.remove('show');

  let targetTopic, weakestSub;
  
  if (quiz.mode === 'custom' && (quiz.subject !== 'All' || quiz.subtopic !== 'All')) {
    if (quiz.subject === 'All') {
      targetTopic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
      const subs = MICRO_TOPICS[targetTopic];
      weakestSub = subs ? subs[Math.floor(Math.random() * subs.length)] : targetTopic;
    } else {
      targetTopic = quiz.subject;
      if (quiz.subtopic === 'All') {
        const subs = MICRO_TOPICS[targetTopic];
        weakestSub = subs ? subs[Math.floor(Math.random() * subs.length)] : targetTopic;
      } else {
        weakestSub = quiz.subtopic;
      }
    }
  } else {
    // Adaptive logic
    const weak = getTop3Weakest();
    targetTopic = weak[0].topic; 
    
    weakestSub = MICRO_TOPICS[targetTopic][0];
    let lowestAcc = 1.1;
    MICRO_TOPICS[targetTopic].forEach(sub => {
      const t = microTracker[sub];
      const acc = (t && t.total > 0) ? t.correct / t.total : 0.5;
      if (acc < lowestAcc) {
         lowestAcc = acc;
         weakestSub = sub;
      }
    });
  }

  try {
    const res = await fetch(`${API_BASE}/quiz/single`, {
      method: "POST", headers: getAuthHeaders(),
      body: JSON.stringify({ topic: targetTopic, subtopic: weakestSub, difficulty: quiz.currentDifficulty, format: quiz.format })
    });
    const q = await res.json();
    
    if (q.error) throw new Error(q.error);
    
    quiz.questions[quiz.index] = q;
    renderQuestion();
  } catch (err) {
    console.error(err);
    qText.innerHTML = `<span style="color:var(--red-soft)">❌ Failed to generate question. Please try again.</span>`;
    document.getElementById('nextQBtn').disabled = false;
    document.getElementById('nextQBtn').textContent = 'Retry';
    document.getElementById('nextQBtn').onclick = fetchNextQuestion;
  }
}

function renderQuestion(){
  const q = quiz.questions[quiz.index];
  quiz.topicsAsked.push(q.topic);
  document.getElementById('qProgress').textContent = `Question ${quiz.index+1} / ${quiz.n}`;
  const badge = document.getElementById('qTopicBadge');
  badge.textContent = q.topic || "General";
  badge.title = q.topic || "General";
  badge.style.color = getTopicColor(q.topic) || "var(--ink)";
  
  const subBadge = document.getElementById('qSubtopicBadge');
  if(q.subtopic) {
    subBadge.style.display = 'inline-block';
    subBadge.textContent = q.subtopic;
    subBadge.title = q.subtopic;
  } else {
    subBadge.style.display = 'none';
  }

  const db = document.getElementById('qDiffBadge');
  db.className = 'badge diff-'+ (q.d || 'medium');
  db.textContent = q.d || "medium";
  document.getElementById('qText').innerHTML = window.marked ? marked.parse(q.q || '') : (q.q || '');
  if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
      window.MathJax.typesetPromise([document.getElementById('quizActive')]).catch(err => console.log(err));
  }
  const optWrap = document.getElementById('qOptions');
  
  if (q.type === 'short') {
    optWrap.innerHTML = `
      <input type="text" id="shortAnswerInput" class="input" placeholder="Type your answer here..." style="width:100%; margin-bottom:10px;">
      <button class="btn" id="submitShortAnswerBtn">Submit Answer</button>
    `;
    document.getElementById('submitShortAnswerBtn').addEventListener('click', async () => {
      const val = document.getElementById('shortAnswerInput').value.trim();
      if (!val) return;
      document.getElementById('submitShortAnswerBtn').disabled = true;
      document.getElementById('submitShortAnswerBtn').textContent = "Evaluating...";
      
      try {
        const res = await fetch(`${API_BASE}/quiz/evaluate`, {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ question: q.q, answer: val, idealAnswer: q.a })
        });
        const evalData = await res.json();
        q.e = evalData.explanation; // override explanation with custom feedback
        processAnswerResult(evalData.correct);
      } catch (e) {
        console.error(e);
        document.getElementById('submitShortAnswerBtn').disabled = false;
        document.getElementById('submitShortAnswerBtn').textContent = "Retry Submit";
      }
    });
  } else if (q.type === 'sata') {
    optWrap.innerHTML = q.o.map((opt,i)=>
      `<label class="opt sata-opt" style="display:flex; align-items:center; gap:10px;">
         <input type="checkbox" value="${opt}">
         <span>${opt}</span>
       </label>`
    ).join('') + `<button class="btn" id="submitSataBtn" style="margin-top:10px;">Submit Answer</button>`;
    
    document.getElementById('submitSataBtn').addEventListener('click', () => {
      const selected = Array.from(optWrap.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
      const correctOptions = q.a || [];
      const isCorrect = selected.length === correctOptions.length && selected.every(val => correctOptions.includes(val));
      
      optWrap.querySelectorAll('.sata-opt').forEach(lbl => {
        const cb = lbl.querySelector('input');
        cb.disabled = true;
        if (correctOptions.includes(cb.value)) {
            lbl.classList.add('correct');
        } else if (cb.checked && !correctOptions.includes(cb.value)) {
            lbl.classList.add('incorrect');
        }
      });
      document.getElementById('submitSataBtn').style.display = 'none';
      processAnswerResult(isCorrect);
    });
  } else {
    // MCQ / TF
    optWrap.innerHTML = q.o.map((opt,i)=>
      `<button class="opt" data-i="${i}"><span class="letter">${String.fromCharCode(65+i)}</span>${opt}</button>`
    ).join('');
    optWrap.querySelectorAll('.opt').forEach(btn=>{
      btn.addEventListener('click', ()=> {
        const choice = q.o[btn.dataset.i];
        const isCorrect = String(choice).toLowerCase().trim() === String(q.a).toLowerCase().trim();
        optWrap.querySelectorAll('.opt').forEach(b => {
          b.classList.add('disabled');
          const bChoice = q.o[b.dataset.i];
          if (String(bChoice).toLowerCase().trim() === String(q.a).toLowerCase().trim()) b.classList.add('correct');
          if (bChoice === choice && !isCorrect) b.classList.add('incorrect');
        });

        if (isCorrect) {
            addXP(10);
        }
        processAnswerResult(isCorrect);
      });
    });
  }

  document.getElementById('qExplain').classList.remove('show');
  document.getElementById('qExplain').innerHTML='';
  
  const hintBtn = document.getElementById('qHintBtn');
  hintBtn.style.display = 'inline-block';
  hintBtn.disabled = false;
  
  if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
      window.MathJax.typesetPromise([document.getElementById('quizActive')]).catch(err => console.log(err));
  }
  hintBtn.onclick = () => {
    document.getElementById('qHintBox').style.display = 'block';
    document.getElementById('qHintBox').innerHTML = `<b>Hint:</b> ${q.h || 'No hint available.'}`;
    hintBtn.disabled = true;
  };
  document.getElementById('qHintBox').style.display = 'none';
  document.getElementById('qHintBox').innerHTML = '';

  document.getElementById('nextQBtn').disabled = true;
  document.getElementById('nextQBtn').innerHTML = quiz.index+1 >= quiz.n 
    ? `<span>Finish Quiz</span> <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="vertical-align:text-bottom; margin-left:4px;"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<span>Next Question</span> <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="vertical-align:text-bottom; margin-left:4px;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
  document.getElementById('nextQBtn').onclick = ()=>{
    quiz.index++;
    if(quiz.index >= quiz.n){ endQuiz(); } else { fetchNextQuestion(); }
  };
  renderFocusMeter();
}

function processAnswerResult(correct){
  const q = quiz.questions[quiz.index];
  
  if (q.topic && weaknessTracker[q.topic]) {
      weakness_tracker(q.topic, correct?1:0, 1);
  }
  if (q.subtopic && microTracker[q.subtopic]) {
      microTracker[q.subtopic].correct += correct?1:0;
      microTracker[q.subtopic].total += 1;
  }
  
  quiz.answers.push({topic:q.topic, correct, diff:q.d});
  if(correct) {
     quiz.correctCount++;
     if(quiz.currentDifficulty === 'easy') quiz.currentDifficulty = 'medium';
     else if(quiz.currentDifficulty === 'medium') quiz.currentDifficulty = 'hard';
  } else {
     if(quiz.currentDifficulty === 'hard') quiz.currentDifficulty = 'medium';
     else if(quiz.currentDifficulty === 'medium') quiz.currentDifficulty = 'easy';
  }

  const exp = document.getElementById('qExplain');
  exp.classList.add('show');
  exp.innerHTML = `<b>${correct? '✅ Correct!' : '❌ Not quite.'}</b> ${window.marked ? marked.parse(q.e || '') : (q.e || '')}`;
  
  if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
      window.MathJax.typesetPromise([exp]).catch(err => console.log(err));
  }

  document.getElementById('qHintBtn').disabled = true;
  document.getElementById('nextQBtn').disabled = false;
  updateStats();
  renderFocusMeter();
}

function resetQuizUI(){
  setCoachLockState(false);
  if (quiz && quiz.timerInterval) clearInterval(quiz.timerInterval);
  quiz=null;
  document.getElementById('quizActive').style.display='none';
  document.getElementById('quizResult').style.display='none';
  document.getElementById('quizEmpty').style.display='block';
}

function endQuiz(early, timeout = false){
  setCoachLockState(false);
  if (quiz && quiz.timerInterval) clearInterval(quiz.timerInterval);
  const weightsAfter = currentWeights();
  beforeAfterSnapshot = { before: quiz.weightsBefore, after: weightsAfter, topicsAsked: quiz.topicsAsked };
  quizHistory.push({
    date: todayStr(),
    score: quiz.correctCount,
    total: quiz.answers.length,
    topics: [...new Set(quiz.topicsAsked)],
    accuracyAtEnd: overallAccuracy(),
    demo: quiz.isDemo
  });
  saveProgress();
  document.getElementById('quizActive').style.display='none';
  const res = document.getElementById('quizResult');
  res.style.display='block';
  const pct = quiz.answers.length? Math.round(quiz.correctCount/quiz.answers.length*100) : 0;
  const weak = getTop3Weakest();
  res.innerHTML = `
    <div style="text-align:center; padding:10px 0 4px;">
      <div style="font-family:'Kalam',cursive; font-size:26px;">${timeout ? "⏳ Time's Up!" : (early ? 'Quiz Ended Early' : 'Quiz Complete!')}</div>
      <div style="font-size:44px; font-weight:700; font-family:'IBM Plex Mono',monospace; color:${pct>=70?'var(--green)':pct>=40?'var(--gold)':'var(--red-soft)'}; margin:8px 0;">${quiz.correctCount}/${quiz.answers.length}</div>
      <div style="color:var(--ink-soft); font-size:13.5px; margin-bottom:18px;">${pct}% correct — the coach has already re-weighted your next quiz.</div>
    </div>
    <div class="before-after-grid" style="margin: 16px 0;">
      <div class="ba-card-box">
        <div class="ba-box-header">
          <span class="ba-dot dot-before"></span>
          <span class="ba-box-title">Before Quiz</span>
          <span class="ba-box-chip">Baseline</span>
        </div>
        ${renderMiniBars(beforeAfterSnapshot.before)}
      </div>
      <div class="ba-arrow-column">
        <div class="ba-arrow-circle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>
        <span class="ba-arrow-label">Shift</span>
      </div>
      <div class="ba-card-box">
        <div class="ba-box-header">
          <span class="ba-dot dot-after"></span>
          <span class="ba-box-title">After Quiz</span>
          <span class="ba-box-chip active">Adaptive Weights</span>
        </div>
        ${renderMiniBars(beforeAfterSnapshot.after)}
      </div>
    </div>
    <div style="margin-top:16px; padding:12px 14px; background:var(--paper-2); border-radius:8px; font-size:13px; border:1px solid var(--card-border);">
      <b>Coach's read:</b> your next quiz will lean toward <b style="color:var(--red-soft)">${weak[0].topic}</b>${weak[1]?`, then ${weak[1].topic}`:''} — that's where practice will help most.
    </div>
    <div class="quiz-actions" style="justify-content:center; margin-top:18px;">
      <button class="btn secondary" id="viewDashBtn">View Dashboard →</button>
      <button class="btn" id="quizAgainBtn">Start Another Quiz</button>
    </div>
  `;
  document.getElementById('quizAgainBtn').addEventListener('click', ()=> startQuiz(getQuizConfig(),false));
  document.getElementById('viewDashBtn').addEventListener('click', ()=> window.switchActiveTab('dashboard'));
  updateStats();
  renderFocusMeter();
}

function renderMiniBars(weights){
  const maxW = Math.max(...Object.values(weights)) || 1;
  return `
    <div class="ba-bars-wrap">
      ${TOPICS.map((t, idx)=>{
        const w = weights[t] || 0;
        const pct = Math.round((w / maxW) * 100);
        const color = TOPIC_COLOR[t] || "var(--ink)";
        const icon = getTopicIcon(t);
        const h = Math.max(8, Math.round((w / maxW) * 65));
        const shortName = t.length > 5 ? t.slice(0, 4) + '…' : t;
        const delay = (idx * 0.08).toFixed(2);
        return `
          <div class="ba-mini-col" title="${t}: ${pct}% weight" style="animation: dashBarFadeIn 0.4s ease backwards ${delay}s;">
            <span class="ba-mini-pct">${pct}%</span>
            <div class="ba-mini-track">
              <div class="ba-mini-fill" style="height:${h}px; background:${color}; animation: miniBarRise 0.75s cubic-bezier(0.34, 1.45, 0.64, 1) backwards ${delay}s;"></div>
            </div>
            <span class="ba-mini-icon-box" style="color:${color};">
              ${icon}
            </span>
            <span class="ba-mini-label">${shortName}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// --- Quiz UI Setup Logic ---
document.getElementById('quizModeSelect').addEventListener('change', (e) => {
  const isCustom = e.target.value === 'custom';
  document.getElementById('customQuizSettings').style.display = isCustom ? 'block' : 'none';
});

document.getElementById('customSubjectSelect').addEventListener('change', (e) => {
  const subj = e.target.value;
  const topicSelect = document.getElementById('customTopicSelect');
  if (subj === 'All') {
    topicSelect.innerHTML = '<option value="All">All Topics</option>';
    topicSelect.disabled = true;
  } else {
    topicSelect.disabled = false;
    let subtopics = MICRO_TOPICS[subj];
    if (!subtopics && customSyllabusData && customSyllabusData[subj]) {
        subtopics = customSyllabusData[subj];
    }
    subtopics = subtopics || [];
    
    topicSelect.innerHTML = '<option value="All">All Topics</option>' + 
      subtopics.map(t => `<option value="${t}">${t}</option>`).join('');
  }
});

function getQuizConfig() {
  return {
    n: parseInt(document.getElementById('quizCountInput').value) || 5,
    mode: document.getElementById('quizModeSelect').value,
    format: document.getElementById('customFormatSelect') ? document.getElementById('customFormatSelect').value : 'mix',
    subject: document.getElementById('customSubjectSelect').value,
    subtopic: document.getElementById('customTopicSelect').value,
    timerSeconds: parseInt(document.getElementById('quizTimerSelect') ? document.getElementById('quizTimerSelect').value : 0)
  };
}

document.getElementById('startQuizBtn').addEventListener('click', ()=> startQuiz(getQuizConfig(), false));
document.getElementById('startDemoBtn').addEventListener('click', ()=> startQuiz(getQuizConfig(), true));

// AI Chat
let chatMessages = [];
if (window.mermaid) {
    mermaid.initialize({ startOnLoad: false, theme: 'base' });
}

async function addChatMsg(text, cls){
  const log = document.getElementById('chatLog');
  const div = document.createElement('div');
  div.className = 'chat-msg '+cls;
  if (cls === 'coach' && window.marked) {
      const wikiMatch = text.match(/\[WIKI_IMAGE:\s*(.*?)\]/);
      if (wikiMatch) {
          const query = wikiMatch[1];
          try {
              const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&prop=pageimages&format=json&pithumbsize=500&origin=*`);
              const data = await res.json();
              const pages = data.query.pages;
              const pageId = Object.keys(pages)[0];
              if (pageId !== "-1" && pages[pageId].thumbnail) {
                  const imgUrl = pages[pageId].thumbnail.source;
                  text = text.replace(wikiMatch[0], `![${query}](${imgUrl})`);
              } else {
                  text = text.replace(wikiMatch[0], `*[No scientific image found for "${query}" on Wikipedia]*`);
              }
          } catch (e) {
              console.error("Wiki fetch error", e);
              text = text.replace(wikiMatch[0], `*[Error fetching image]*`);
          }
      }
      div.innerHTML = marked.parse(text);
      if (window.mermaid) {
          const mermaidBlocks = div.querySelectorAll('code.language-mermaid');
          for (let i = 0; i < mermaidBlocks.length; i++) {
              const block = mermaidBlocks[i];
              const id = 'mermaid-' + Date.now() + '-' + i;
              
              // Bulletproof cleaner for the stubborn |> hallucination
              let cleanCode = block.textContent.replace(/\|>/g, '|').trim();
              if (!/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|requirementDiagram|gitGraph|C4Context|mindmap|timeline|xychart)/i.test(cleanCode)) {
                  cleanCode = 'graph TD\n' + cleanCode;
              }
              
              try {
                  const { svg } = await mermaid.render(id, cleanCode);
                  const graphDiv = document.createElement('div');
                  graphDiv.innerHTML = svg;
                  block.parentElement.replaceWith(graphDiv);
              } catch(e) { 
                  console.error('Mermaid render error', e); 
                  const errDiv = document.createElement('div');
                  errDiv.style.color = 'var(--red-soft)';
                  errDiv.style.fontSize = '12px';
                  errDiv.textContent = '[Diagram generation failed]';
                  block.parentElement.replaceWith(errDiv);
              }
          }
      }
  } else {
      div.innerHTML = text; // allow HTML for image tags in user bubble
  }
  log.appendChild(div);
  if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
      window.MathJax.typesetPromise([div]).catch(err => console.log(err));
  }
  log.scrollTop = log.scrollHeight;

  if (cls === 'coach' && isVoiceMode) {
      isVoiceMode = false;
      if (window.speechSynthesis) {
          let cleanText = text.replace(/```[\s\S]*?```/g, ' [Diagram] '); 
          cleanText = cleanText.replace(/\[WIKI_IMAGE:.*?\]/g, ' [Image] ');
          cleanText = cleanText.replace(/[*_#`]/g, '');
          const utterance = new SpeechSynthesisUtterance(cleanText);
          
          utterance.onstart = () => {
              document.getElementById('chatVoiceBtn').style.display = 'none';
              document.getElementById('chatStopVoiceBtn').style.display = 'inline-block';
          };
          const resetBtns = () => {
              document.getElementById('chatStopVoiceBtn').style.display = 'none';
              document.getElementById('chatVoiceBtn').style.display = 'inline-block';
          };
          utterance.onend = resetBtns;
          utterance.onerror = resetBtns;
          
          window.speechSynthesis.speak(utterance);
      }
  }
}

let currentChatImage = null;
let isVoiceMode = false;

document.getElementById('chatImageInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    currentChatImage = ev.target.result;
    document.getElementById('chatPreviewImg').src = currentChatImage;
    document.getElementById('chatImagePreview').style.display = 'block';
  };
  reader.readAsDataURL(file);
});

document.getElementById('chatClearImgBtn').addEventListener('click', () => {
  currentChatImage = null;
  document.getElementById('chatImagePreview').style.display = 'none';
  document.getElementById('chatImageInput').value = '';
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if(SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  
  recognition.onresult = event => {
    const transcript = event.results[0][0].transcript;
    document.getElementById('chatInput').value = transcript;
    isVoiceMode = true; 
    sendChat();
  };
  recognition.onend = () => {
    document.getElementById('chatVoiceBtn').classList.remove('listening');
  };
  recognition.onerror = event => {
    document.getElementById('chatVoiceBtn').classList.remove('listening');
    let msg = "Speech recognition error: " + event.error;
    if (event.error === 'not-allowed') msg = "Microphone access blocked! Please click the camera/mic icon in your browser's address bar to allow microphone permissions for this site.";
    if (event.error === 'no-speech') msg = "No speech detected. Please check your microphone connection and try again.";
    console.error(msg);
    alert(msg);
  };
}

document.getElementById('chatVoiceBtn').addEventListener('click', () => {
  if(!recognition) {
    alert("Speech recognition is not supported in this browser.");
    return;
  }
  document.getElementById('chatVoiceBtn').classList.add('listening');
  recognition.start();
});

document.getElementById('chatStopVoiceBtn').addEventListener('click', () => {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
});

document.getElementById('chatSendBtn').addEventListener('click', sendChat);
document.getElementById('chatInput').addEventListener('keydown', e=>{ if(e.key==='Enter') sendChat(); });

// ================= FLOATING AI COACH CONTROLS & ANTI-CHEATING LOCK =================
let isQuizActive = false;
let isArenaBattleActive = false;

window.setArenaBattleCoachLock = function(locked) {
  isArenaBattleActive = Boolean(locked);
  const floatBtn = document.getElementById('coachFloatingBtn');
  const headerBtn = document.getElementById('coachHeaderBtn');
  const sidebarCoachBtn = document.getElementById('sidebarCoachBtn');
  const drawer = document.getElementById('coachDrawer');

  if (locked) {
    if (drawer) drawer.style.display = 'none';

    if (sidebarCoachBtn) {
      sidebarCoachBtn.classList.add('coach-locked');
      sidebarCoachBtn.title = "AI Coach is disabled during multiplayer arena battle.";
      const sub = document.getElementById('sidebarCoachSub');
      if (sub) {
        sub.textContent = "⚔️ Battle Active";
        sub.style.color = "var(--red-soft)";
      }
      const beacon = document.getElementById('sidebarCoachBeacon');
      if (beacon) {
        beacon.style.background = "var(--red-soft)";
        beacon.style.boxShadow = "0 0 0 3px rgba(181, 56, 44, 0.25)";
      }
    }

    if (floatBtn) {
      floatBtn.classList.add('coach-locked');
      floatBtn.title = "AI Coach is disabled during multiplayer arena battle.";
      floatBtn.innerHTML = `
        <div class="coach-float-icon">⚔️</div>
        <div class="coach-float-content">
          <span class="coach-float-title">Coach Disabled</span>
          <span class="coach-float-sub" style="color:var(--red-soft);">Arena Battle</span>
        </div>
      `;
    }

    if (headerBtn) {
      headerBtn.classList.add('coach-locked');
      headerBtn.title = "AI Coach is disabled during multiplayer arena battle.";
      headerBtn.innerHTML = `⚔️ <span class="btn-text">Locked</span>`;
    }
  } else {
    if (isQuizActive) {
      setCoachLockState(true);
    } else {
      setCoachLockState(false);
    }
  }
};

window.setCoachLockState = function(locked) {
  isQuizActive = locked;
  const floatBtn = document.getElementById('coachFloatingBtn');
  const headerBtn = document.getElementById('coachHeaderBtn');
  const sidebarCoachBtn = document.getElementById('sidebarCoachBtn');
  const drawer = document.getElementById('coachDrawer');
  const helperBanner = document.querySelector('.quiz-coach-helper-banner');

  if (isArenaBattleActive) {
    // Arena battle has highest priority lock
    return;
  }

  if (locked) {
    if (drawer) drawer.style.display = 'none';

    if (sidebarCoachBtn) {
      sidebarCoachBtn.classList.add('coach-locked');
      sidebarCoachBtn.title = "AI Coach is disabled during active quiz to prevent cheating.";
      const sub = document.getElementById('sidebarCoachSub');
      if (sub) {
        sub.textContent = "🔒 Exam Locked";
        sub.style.color = "var(--red-soft)";
      }
      const beacon = document.getElementById('sidebarCoachBeacon');
      if (beacon) {
        beacon.style.background = "var(--red-soft)";
        beacon.style.boxShadow = "0 0 0 3px rgba(181, 56, 44, 0.25)";
      }
    }

    if (floatBtn) {
      floatBtn.classList.add('coach-locked');
      floatBtn.title = "AI Coach is disabled during active quiz to prevent cheating.";
      floatBtn.innerHTML = `
        <div class="coach-float-icon">🔒</div>
        <div class="coach-float-content">
          <span class="coach-float-title">Coach Locked</span>
          <span class="coach-float-sub" style="color:var(--red-soft);">Exam Mode</span>
        </div>
      `;
    }

    if (headerBtn) {
      headerBtn.classList.add('coach-locked');
      headerBtn.title = "AI Coach is disabled during active quiz.";
      headerBtn.innerHTML = `🔒 <span class="btn-text">Locked</span>`;
    }

    if (helperBanner) {
      helperBanner.innerHTML = `
        <div class="helper-content">
          <span class="helper-badge" style="color:var(--red-soft);">🔒 Anti-Cheating Lock Active</span>
          <span class="helper-text">The AI Coach is disabled during active quizzes to ensure honest self-assessment. Complete your quiz to unlock coaching!</span>
        </div>
        <button type="button" class="btn secondary helper-ask-btn" disabled style="opacity:0.5; cursor:not-allowed;">
          🔒 Coach Locked
        </button>
      `;
    }
  } else {
    if (sidebarCoachBtn) {
      sidebarCoachBtn.classList.remove('coach-locked');
      sidebarCoachBtn.title = "Open Socratic AI Coach";
      const sub = document.getElementById('sidebarCoachSub');
      if (sub) {
        sub.textContent = "Hints & Concepts";
        sub.style.color = "var(--ink-soft)";
      }
      const beacon = document.getElementById('sidebarCoachBeacon');
      if (beacon) {
        beacon.style.background = "var(--green)";
        beacon.style.boxShadow = "0 0 0 3px rgba(63, 122, 78, 0.2)";
      }
    }

    if (floatBtn) {
      floatBtn.classList.remove('coach-locked');
      floatBtn.title = "Ask AI Coach";
      floatBtn.innerHTML = `
        <div class="coach-float-icon">🎓</div>
        <div class="coach-float-content">
          <span class="coach-float-title">Ask Coach</span>
          <span class="coach-float-sub">AI Online</span>
        </div>
        <span class="coach-pulse-dot"></span>
      `;
    }

    if (headerBtn) {
      headerBtn.classList.remove('coach-locked');
      headerBtn.title = "Open AI Coach";
      headerBtn.innerHTML = `🎓 <span class="btn-text">Coach</span>`;
    }

    if (helperBanner) {
      helperBanner.innerHTML = `
        <div class="helper-content">
          <span class="helper-badge">💡 Socratic AI Guidance</span>
          <span class="helper-text">Stuck on a tricky concept? The AI Coach provides conceptual guidance and diagrams without spoiling test answers.</span>
        </div>
        <button type="button" class="btn secondary helper-ask-btn" onclick="toggleCoachDrawer()">
          🎓 Ask Socratic Coach
        </button>
      `;
    }
  }
};

window.toggleCoachDrawer = function() {
  if (isArenaBattleActive) {
    alert("⚔️ Arena Battle in Progress!\n\nThe AI Coach is strictly disabled during multiplayer arena battles to uphold fair play and competitive integrity.");
    return;
  }
  if (isQuizActive) {
    alert("🛡️ Anti-Cheating Lock Active!\n\nThe AI Coach is disabled during an active quiz to uphold academic integrity. Complete or end the quiz to ask questions and review concepts.");
    return;
  }
  const drawer = document.getElementById('coachDrawer');
  if (!drawer) return;
  const isHidden = drawer.style.display === 'none' || !drawer.style.display;
  drawer.style.display = isHidden ? 'flex' : 'none';
  if (isHidden) {
    setTimeout(() => {
      document.getElementById('chatInput')?.focus();
      const log = document.getElementById('chatLog');
      if (log) log.scrollTop = log.scrollHeight;
    }, 60);
  }
};

const coachFloatingBtn = document.getElementById('coachFloatingBtn');
if (coachFloatingBtn) coachFloatingBtn.addEventListener('click', window.toggleCoachDrawer);

const coachHeaderBtn = document.getElementById('coachHeaderBtn');
if (coachHeaderBtn) coachHeaderBtn.addEventListener('click', window.toggleCoachDrawer);

const sidebarCoachBtn = document.getElementById('sidebarCoachBtn');
if (sidebarCoachBtn) sidebarCoachBtn.addEventListener('click', () => {
  if (typeof closeSidebar === 'function') closeSidebar();
  if (typeof window.toggleCoachDrawer === 'function') window.toggleCoachDrawer();
});

const coachCloseBtn = document.getElementById('coachCloseBtn');
if (coachCloseBtn) coachCloseBtn.addEventListener('click', () => {
  const drawer = document.getElementById('coachDrawer');
  if (drawer) drawer.style.display = 'none';
});

const coachMinimizeBtn = document.getElementById('coachMinimizeBtn');
if (coachMinimizeBtn) coachMinimizeBtn.addEventListener('click', () => {
  const drawer = document.getElementById('coachDrawer');
  if (drawer) drawer.style.display = 'none';
});

async function sendChat(){
  if (isQuizActive) {
    addChatMsg("🛡️ <b>Anti-Cheating Protection:</b> The AI Coach is disabled during an active quiz to prevent cheating. Please complete your test first!", "refuse");
    return;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  const inp = document.getElementById('chatInput');
  const val = inp.value.trim();
  if(!val && !currentChatImage) return;
  
  if (currentChatImage) {
      addChatMsg((val ? val + '<br>' : '') + `<img src="${currentChatImage}" style="max-height:100px; border-radius:6px; margin-top:6px;">`, 'user');
  } else {
      addChatMsg(val, 'user');
  }

  const payloadImage = currentChatImage;
  inp.value='';
  currentChatImage = null;
  document.getElementById('chatImagePreview').style.display = 'none';
  document.getElementById('chatImageInput').value = '';
  
  chatMessages.push({ role: 'user', content: val });
  if (chatMessages.length > 10) chatMessages.shift(); // Keep last 10 messages

  const quizActive = !!quiz && quiz.index < quiz.n && document.getElementById('quizActive').style.display!=='none';
  let currentQuestionContext = null;
  if (quizActive && quiz.questions && quiz.questions[quiz.index]) {
      currentQuestionContext = quiz.questions[quiz.index];
  }
  
  try {
      const res = await fetch(`${API_BASE}/chat`, {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ 
              chatMessages, 
              image: payloadImage,
              weaknessTracker, 
              microTracker,
              quizHistory,
              isQuizActive: quizActive,
              currentQuestion: currentQuestionContext
          })
      });
      const data = await res.json();
      if (!res.ok || !data.reply) {
          throw new Error(data.error || "Server error");
      }
      chatMessages.push({ role: 'assistant', content: data.reply });
      addChatMsg(data.reply, 'coach');
  } catch(e) {
      addChatMsg("Sorry, the coaching AI is offline right now.", "refuse");
  }
}
addChatMsg("Hi! Ask me about any concept, or just start a quiz — I'll adapt as we go.", 'coach');

// Dashboard
function renderDashboard(){
  const bc = document.getElementById('dashBarChart');
  if (bc) {
    const accs = TOPICS.map(t=> ({t, acc: accuracy(t)}));
    const weakestTopic = getTop3Weakest()[0]?.topic;
    bc.innerHTML = accs.map(({t,acc}, idx)=>{
      const isUntested = acc === null;
      const pct = isUntested ? 0 : Math.round(acc * 100);
      const isWeak = t === weakestTopic && weaknessTracker[t] && weaknessTracker[t].total > 0;
      const cls = isUntested ? 'untested' : (acc >= 0.7 ? 'strong' : acc < 0.5 ? 'weak' : 'neutral');
      const color = TOPIC_COLOR[t] || "var(--ink)";
      const icon = getTopicIcon(t);
      const barHeight = isUntested ? 6 : Math.max(8, Math.round((pct / 100) * 112));
      const statusBadge = isUntested ? 'Untested' : (acc >= 0.7 ? 'Mastered' : acc < 0.5 ? 'Needs Review' : 'Developing');
      const delay = (idx * 0.09).toFixed(2);
      
      return `
        <div class="dash-bar-col ${cls}" style="animation: dashBarFadeIn 0.5s ease backwards ${delay}s;">
          <div class="dash-bar-val-bubble">
            ${isUntested ? '—' : pct+'%'}
          </div>
          <div class="dash-bar-track-slot">
            <div class="track-tick tick-75" title="70% Benchmark"></div>
            <div class="track-tick tick-50"></div>
            <div class="track-tick tick-25"></div>
            <div class="dash-bar-fill ${cls}" style="height:${barHeight}px; animation: barGrowUp 0.9s cubic-bezier(0.16, 1, 0.3, 1) backwards ${delay}s;">
              <span class="bar-cap-glow"></span>
              <span class="bar-shine"></span>
            </div>
          </div>
          <div class="dash-bar-topic-info" title="${t}">
            <span class="dash-bar-icon-box" style="color:${color}; background:${color}18; border:1.5px solid ${color}35;">
              ${icon}
            </span>
            <span class="dash-bar-topic-name">${t}${isWeak ? ' <span class="flag-icon" title="Weakest Topic">🔥</span>' : ''}</span>
            <span class="dash-bar-topic-sub ${cls}">${statusBadge}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  const oa = overallAccuracy();
  const svg = document.getElementById('donutChart');
  const r=55,cx=70,cy=70,circ=2*Math.PI*r;
  if (svg) {
    if(oa===null){
      svg.innerHTML = `
        <circle cx="${cx}" cy="${cy}" r="64" fill="none" stroke="var(--card-border)" stroke-width="1.2" stroke-dasharray="3 5" opacity="0.6"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--paper-2)" stroke-width="14"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--card-border)" stroke-width="14" stroke-dasharray="6 6"/>
        <circle cx="${cx}" cy="${cy}" r="43" fill="var(--card)"/>
        <text x="${cx}" y="${cy-2}" text-anchor="middle" font-size="20" font-weight="700" fill="var(--ink-soft)" font-family="IBM Plex Mono">—</text>
        <text x="${cx}" y="${cy+15}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--ink-soft)" font-family="IBM Plex Sans">Untested</text>
      `;
    } else {
      const correctLen = circ*oa;
      const pct = Math.round(oa*100);
      const isHigh = pct >= 70;
      const isLow = pct < 50;
      const strokeColor = isHigh ? 'var(--green)' : (isLow ? 'var(--red-soft)' : 'var(--gold)');
      
      svg.innerHTML = `
        <circle cx="${cx}" cy="${cy}" r="64" fill="none" stroke="var(--card-border)" stroke-width="1.2" stroke-dasharray="3 5" opacity="0.6"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--paper-2)" stroke-width="14"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${strokeColor}" stroke-width="14"
          stroke-dasharray="0 ${circ}" stroke-linecap="round"
          transform="rotate(-90 ${cx} ${cy})" style="filter: drop-shadow(0 0 10px ${strokeColor}66); transition: stroke-dasharray 1.2s cubic-bezier(0.16, 1, 0.3, 1);" id="donutRingArc"/>
        <circle cx="${cx}" cy="${cy}" r="43" fill="var(--card)"/>
        <text x="${cx}" y="${cy-3}" text-anchor="middle" font-size="22" font-weight="700" fill="var(--ink)" font-family="IBM Plex Mono" id="donutDialVal">0%</text>
        <text x="${cx}" y="${cy+14}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${strokeColor}" font-family="IBM Plex Sans">${isHigh ? 'Proficient' : isLow ? 'Needs Work' : 'Developing'}</text>
      `;
      // Trigger smooth SVG drawing & number count-up
      requestAnimationFrame(() => {
        const arc = document.getElementById('donutRingArc');
        if (arc) arc.style.strokeDasharray = `${correctLen} ${circ - correctLen}`;
        const dialText = document.getElementById('donutDialVal');
        if (dialText) animateCount(dialText, 0, pct, 950, '%');
      });
    }
  }

  const legendEl = document.getElementById('donutLegend');
  if (legendEl) {
    const totalAns = totalAnswered();
    const correctCount = TOPICS.reduce((s,t)=>s+(weaknessTracker[t]?.correct||0),0);
    const incorrectCount = totalAns - correctCount;
    const correctPct = totalAns > 0 ? Math.round((correctCount/totalAns)*100) : 0;
    const incorrectPct = totalAns > 0 ? Math.round((incorrectCount/totalAns)*100) : 0;

    legendEl.innerHTML = `
      <div class="dash-metric-group">
        <div class="dash-metric-row metric-correct">
          <div class="metric-row-left">
            <span class="metric-indicator-dot" style="background:var(--green); box-shadow:0 0 6px rgba(63,122,78,0.5);"></span>
            <span class="metric-row-label">Correct Answers</span>
          </div>
          <div class="metric-row-right">
            <span class="metric-row-val" id="valMetricCorrect">0</span>
            <span class="metric-row-pct">${correctPct}%</span>
          </div>
        </div>
        <div class="metric-mini-track">
          <div class="metric-mini-fill" id="trackMetricCorrect" style="width:0%; background:var(--green);"></div>
        </div>
      </div>

      <div class="dash-metric-group">
        <div class="dash-metric-row metric-incorrect">
          <div class="metric-row-left">
            <span class="metric-indicator-dot" style="background:var(--red-soft); box-shadow:0 0 6px rgba(181,56,44,0.5);"></span>
            <span class="metric-row-label">Incorrect Answers</span>
          </div>
          <div class="metric-row-right">
            <span class="metric-row-val" id="valMetricIncorrect">0</span>
            <span class="metric-row-pct">${incorrectPct}%</span>
          </div>
        </div>
        <div class="metric-mini-track">
          <div class="metric-mini-fill" id="trackMetricIncorrect" style="width:0%; background:var(--red-soft);"></div>
        </div>
      </div>

      <div class="dash-metric-group">
        <div class="dash-metric-row metric-total">
          <div class="metric-row-left">
            <span class="metric-indicator-dot" style="background:var(--ink-soft); box-shadow:0 0 6px rgba(74,85,120,0.4);"></span>
            <span class="metric-row-label">Total Answered</span>
          </div>
          <div class="metric-row-right">
            <span class="metric-row-val" id="valMetricTotal">0</span>
            <span class="metric-row-pct">${totalAns > 0 ? '100%' : '0%'}</span>
          </div>
        </div>
        <div class="metric-mini-track">
          <div class="metric-mini-fill" id="trackMetricTotal" style="width:0%; background:var(--ink-soft);"></div>
        </div>
      </div>
    `;

    // Smoothly animate the values and track progress fills
    requestAnimationFrame(() => {
      const vCor = document.getElementById('valMetricCorrect');
      if (vCor) animateCount(vCor, 0, correctCount, 850);
      const vInc = document.getElementById('valMetricIncorrect');
      if (vInc) animateCount(vInc, 0, incorrectCount, 850);
      const vTot = document.getElementById('valMetricTotal');
      if (vTot) animateCount(vTot, 0, totalAns, 850);

      setTimeout(() => {
        const tCor = document.getElementById('trackMetricCorrect');
        if (tCor) tCor.style.width = `${correctPct}%`;
        const tInc = document.getElementById('trackMetricIncorrect');
        if (tInc) tInc.style.width = `${incorrectPct}%`;
        const tTot = document.getElementById('trackMetricTotal');
        if (tTot) tTot.style.width = `${totalAns > 0 ? 100 : 0}%`;
      }, 50);
    });
  }

  const baWrap = document.getElementById('beforeAfterChart');
  if (baWrap) {
    if(!beforeAfterSnapshot){
      baWrap.innerHTML = `
        <div class="dash-empty-state">
          <div class="dash-empty-icon-wrap">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
              <polyline points="17 6 23 6 23 12"></polyline>
            </svg>
          </div>
          <div class="dash-empty-title">No Focus Shift Recorded Yet</div>
          <p class="dash-empty-desc">Complete an adaptive quiz to see how question weighting shifts toward your weaknesses in real time.</p>
          <button type="button" class="btn secondary dash-empty-btn" onclick="window.switchActiveTab('quiz')">
            🎯 Start Diagnostic Quiz
          </button>
        </div>
      `;
    } else {
      baWrap.innerHTML = `
        <div class="before-after-grid">
          <div class="ba-card-box">
            <div class="ba-box-header">
              <span class="ba-dot dot-before"></span>
              <span class="ba-box-title">Before Quiz</span>
              <span class="ba-box-chip">Baseline</span>
            </div>
            ${renderMiniBars(beforeAfterSnapshot.before)}
          </div>

          <div class="ba-arrow-column">
            <div class="ba-arrow-circle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </div>
            <span class="ba-arrow-label">Shift</span>
          </div>

          <div class="ba-card-box">
            <div class="ba-box-header">
              <span class="ba-dot dot-after"></span>
              <span class="ba-box-title">After Quiz</span>
              <span class="ba-box-chip active">Adaptive Weights</span>
            </div>
            ${renderMiniBars(beforeAfterSnapshot.after)}
          </div>
        </div>
      `;
    }
  }

  const weakListEl = document.getElementById('weakList');
  if (weakListEl) {
    const weak = getTop3Weakest();
    if (weak.length === 0 || weak.every(w => w.total === 0)) {
      weakListEl.innerHTML = `
        <div class="dash-empty-state" style="padding:24px 16px;">
          <div class="dash-empty-icon-wrap" style="width:42px; height:42px;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <polyline points="9 12 11 14 15 10"></polyline>
            </svg>
          </div>
          <div class="dash-empty-title" style="font-size:14px;">No Weaknesses Identified Yet</div>
          <p class="dash-empty-desc" style="font-size:11.5px; margin-bottom:12px;">Take a practice quiz so the Socratic engine can map your error patterns and pinpoint weak topics.</p>
          <button type="button" class="btn secondary dash-empty-btn" onclick="window.switchActiveTab('quiz')">
            🎯 Begin Evaluation
          </button>
        </div>
      `;
    } else {
      const rankClasses = ['rank-1', 'rank-2', 'rank-3'];
      weakListEl.innerHTML = weak.map((w,i)=>{
        const color = TOPIC_COLOR[w.topic] || "var(--red-soft)";
        const icon = getTopicIcon(w.topic);
        const name = TOPIC_NAMES[w.topic] || w.topic;
        const hasData = w.total > 0;
        const accPct = hasData ? Math.round(w.acc * 100) : 0;
        const rankClass = rankClasses[i] || 'rank-3';

        return `
          <li class="dash-weak-item" style="animation: weakItemSlideIn 0.4s ease backwards ${(i * 0.1).toFixed(2)}s;">
            <div class="weak-item-left">
              <span class="weak-rank-badge ${rankClass}">#${i+1}</span>
              <span class="weak-icon-circle" style="color:${color}; background:${color}18; border:1px solid ${color}33;">
                ${icon}
              </span>
              <div class="weak-info">
                <div class="weak-topic-title" title="${name}">${name}</div>
                <div class="weak-topic-sub">
                  ${hasData ? `${fmt(w.acc)} accuracy &bull; ${w.total} questions` : 'No attempts logged'}
                </div>
              </div>
            </div>
            <div class="weak-item-right">
              <div class="weak-progress-box">
                <div class="weak-progress-label">${hasData ? `${accPct}% Mastery` : 'Untested'}</div>
                <div class="weak-progress-track">
                  <div class="weak-progress-fill" style="width:${accPct}%; background:${hasData && accPct < 50 ? 'var(--red-soft)' : 'var(--gold)'};"></div>
                </div>
              </div>
              <button type="button" class="btn secondary weak-target-btn" onclick="document.getElementById('quizModeSelect').value='custom'; window.switchActiveTab('quiz');" title="Drill into ${name}">
                Target 🎯
              </button>
            </div>
          </li>
        `;
      }).join('');
    }
  }

  updateStats();
}

function updateStats(){
  const sq = document.getElementById('statQuizzes');
  if (sq) animateCount(sq, 0, quizHistory.length, 650);
  const oa = overallAccuracy();
  const sa = document.getElementById('statAccuracy');
  if (sa) sa.textContent = oa===null ? '—' : fmt(oa);
  const sans = document.getElementById('statAnswered');
  if (sans) animateCount(sans, 0, totalAnswered(), 650);
  const weak = getTop3Weakest();
  const weakestName = weak[0] && weak[0].total>0 ? (TOPIC_NAMES[weak[0].topic] || weak[0].topic) : '—';
  const sw = document.getElementById('statWeakest');
  if (sw) sw.textContent = weakestName;

  // Sync Dashboard KPI cards with animated count-up
  const kpiAcc = document.getElementById('dashKpiAccuracy');
  if (kpiAcc) {
    if (oa === null) {
      kpiAcc.textContent = '—';
    } else {
      animateCount(kpiAcc, 0, Math.round(oa * 100), 800, '%');
    }
  }
  const kpiAns = document.getElementById('dashKpiAnswered');
  if (kpiAns) animateCount(kpiAns, 0, totalAnswered(), 800);
  const kpiQuiz = document.getElementById('dashKpiQuizzes');
  if (kpiQuiz) animateCount(kpiQuiz, 0, quizHistory.length, 800);
  const kpiWeak = document.getElementById('dashKpiWeakest');
  if (kpiWeak) kpiWeak.textContent = weakestName;
}
window.renderDashboard = renderDashboard;
window.weakness_tracker = weakness_tracker;

// AI Study Plan
async function renderPlan(){
  const card = document.getElementById('planCard');
  if(totalAnswered()===0){
    card.innerHTML = `<div class="empty"><div class="big">📋</div>Take a quiz first — your AI coach needs data to build a plan.</div>`;
    return;
  }
  
  card.innerHTML = `<div class="empty"><div class="big">🧠</div>Generating your personalised AI study plan...</div>`;
  
  try {
      const res = await fetch(`${API_BASE}/analyze`, {
          method: "POST", headers: getAuthHeaders(),
          body: JSON.stringify({ weaknessTracker, quizHistory: quizHistory.slice(-5) })
      });
      const analysisHtml = await res.text();
      card.innerHTML = `<div style="padding:10px 0;">${analysisHtml}</div>`;
  } catch (err) {
      card.innerHTML = `<div class="empty"><div class="big">❌</div>Failed to connect to AI Coach.</div>`;
  }
}



// History
function renderHistory(){
  const wrap = document.getElementById('historyTableWrap');
  const statsWrap = document.getElementById('historyStats');
  const totalQ = totalAnswered();
  const streak = quizHistory.length;
  statsWrap.innerHTML = `
    <div class="stat-box"><div class="n">${quizHistory.length}</div><div class="l">Quizzes</div></div>
    <div class="stat-box"><div class="n">${totalQ}</div><div class="l">Questions Answered</div></div>
    <div class="stat-box"><div class="n">${overallAccuracy()===null?'—':fmt(overallAccuracy())}</div><div class="l">Accuracy</div></div>
    <div class="stat-box"><div class="n">${streak}🔥</div><div class="l">Session Streak</div></div>
  `;
  if(quizHistory.length===0){
    wrap.innerHTML = `<div class="empty"><div class="big">🕐</div>No quizzes yet — your history will build up here.</div>`;
    return;
  }
  wrap.innerHTML = `<table class="hist"><thead><tr><th>When</th><th>Score</th><th>Topics Covered</th><th>Accuracy So Far</th><th>Type</th></tr></thead><tbody>
    ${quizHistory.slice().reverse().map(h=>`<tr>
      <td>${h.date}</td>
      <td><b>${h.score}/${h.total}</b></td>
      <td>${h.topics.join(', ')}</td>
      <td>${h.accuracyAtEnd===null?'—':fmt(h.accuracyAtEnd)}</td>
      <td>${h.demo? '<span class="badge weak">Demo</span>' : '<span class="badge">Standard</span>'}</td>
    </tr>`).join('')}
  </tbody></table>`;
}

document.getElementById('exportJsonBtn').addEventListener('click', ()=>{
  const data = { weaknessTracker, quizHistory, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'weakness_tracker.json'; a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('importJsonBtn').addEventListener('click', ()=> document.getElementById('importFileInput').click());
document.getElementById('importFileInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    try{
      const data = JSON.parse(ev.target.result);
      if(data.weaknessTracker) weaknessTracker = data.weaknessTracker;
      if(data.quizHistory) quizHistory = data.quizHistory;
      renderDashboard(); renderHistory(); renderFocusMeter();
      addChatMsg("Tracker imported — picking up right where you left off.", 'coach');
    }catch(err){ alert('Could not read that file — make sure it is a tracker.json export.'); }
  };
  reader.readAsText(file);
});
document.getElementById('resetBtn').addEventListener('click', async ()=>{
  if(!confirm('Reset all progress? This clears the weakness tracker and quiz history for this session.')) return;
  TOPICS.forEach(t => weaknessTracker[t] = {correct:0,total:0});
  microTracker = {};
  initMicroTracker();
  quizHistory = [];
  beforeAfterSnapshot = null;
  quiz = null;
  addXP(50); // Quiz completion bonus
  await saveProgress();
  resetQuizUI();
  renderDashboard(); renderHistory(); renderPlan(); renderFocusMeter(); updateStats();
});

// Gamification Badges
const BADGE_DEFS = [
  { id: 'first_quiz', icon: '🐣', title: 'First Steps', desc: 'Complete your first quiz.' },
  { id: 'xp_100', icon: '🌟', title: 'Rising Star', desc: 'Earn 100 XP.' },
  { id: 'xp_1000', icon: '👑', title: '1000 XP Club', desc: 'Earn 1000 XP.' },
  { id: 'streak_3', icon: '🔥', title: 'On Fire', desc: 'Maintain a 3-day streak.' }
];

function checkBadges() {
    let unlocked = false;
    
    if (quizHistory.length > 0 && !badges.includes('first_quiz')) { badges.push('first_quiz'); unlocked = true; }
    if (xp >= 100 && !badges.includes('xp_100')) { badges.push('xp_100'); unlocked = true; }
    if (xp >= 1000 && !badges.includes('xp_1000')) { badges.push('xp_1000'); unlocked = true; }
    if (streak >= 3 && !badges.includes('streak_3')) { badges.push('streak_3'); unlocked = true; }
    
    if (unlocked) {
        renderBadges();
        saveProgress();
    }
}

function renderBadges() {
    const container = document.getElementById('badgesContainer');
    if (!container) return;
    
    container.innerHTML = BADGE_DEFS.map(b => {
        const isUnlocked = badges.includes(b.id);
        return `
        <div class="badge-item ${isUnlocked ? 'unlocked' : 'locked'}" title="${b.desc}">
            <div class="badge-icon">${b.icon}</div>
            <div class="badge-title">${b.title}</div>
            <div class="badge-desc">${b.desc}</div>
        </div>`;
    }).join('');
}

// Resources
function renderResources(){
  const grid = document.getElementById('resGrid');
  grid.innerHTML = TOPICS.map(t=>`
    <div class="res-card">
      <h4 style="color:${TOPIC_COLOR[t] || 'var(--ink)'}">${t}</h4>
      <p>AI-generated study materials and notes for ${t}, dynamically aligned with your uploaded syllabus.</p>
      <button class="btn secondary" style="margin-top:10px" onclick="askCoachForMaterial('${t}')">Ask Coach for Notes ↗</button>
    </div>`).join('') + `
    <div class="res-card">
      <h4>🧠 AI Connected</h4>
      <p>This session is connected to Groq AI for dynamic quiz generation and coaching based on your syllabus.</p>
    </div>
  `;
}

window.askCoachForMaterial = function(topic) {
  const quizTabBtn = document.querySelector('button[data-tab="quiz"]');
  if(quizTabBtn) quizTabBtn.click();
  const chatInput = document.getElementById('chatInput');
  if(chatInput) {
    chatInput.value = "Please provide comprehensive study notes for " + topic + " based on my syllabus.";
    chatInput.focus();
  }
};

async function initializeApp() {
    const urlParams = new URLSearchParams(window.location.search);
    const isExplicitRegister = urlParams.get('register') === 'true' || urlParams.get('auth') === 'register';
    const isExplicitLogin = urlParams.get('login') === 'true' || urlParams.get('auth') === 'login' || isExplicitRegister;

    if (isExplicitLogin) {
        authToken = null;
        currentUser = null;
        localStorage.removeItem('aec_token');
        localStorage.removeItem('aec_user');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (!authToken) {
        // If user accessed the application directly without logging in and not via explicit login, start at the landing page
        if (!isExplicitLogin) {
            window.location.replace('landing.html');
            return;
        }
        if (typeof setAuthMode === 'function') {
            setAuthMode(isExplicitRegister ? 'register' : 'login');
        }
        document.getElementById('authOverlay').style.display = 'flex';
        return;
    }
    
    document.getElementById('authOverlay').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'inline-block';
    document.getElementById('welcomeUser').textContent = `Hi, ${currentUser}`;
    const sideProf = document.getElementById('sidebarProfileName');
    if (sideProf) sideProf.textContent = currentUser ? `Hi, ${currentUser}` : 'Hi, Student';

    try {
        const res = await fetch(`${API_BASE}/data`, {
            headers: getAuthHeaders()
        });
        
        if (res.status === 401 || res.status === 403) {
            handleLogout();
            return;
        }

        const data = await res.json();
        if (data.weaknessTracker && data.quizHistory) {
            weaknessTracker = data.weaknessTracker;
            quizHistory = data.quizHistory;
            if (data.microTracker) microTracker = data.microTracker;
            
            xp = data.xp || 0;
            streak = data.streak || 0;
            badges = data.badges || [];
            lastActive = data.lastActive || null;
            userGrade = data.grade || 'General';
            targetExam = data.targetExam || 'None';
            userEmail = data.email || '';
            customSyllabusName = data.customSyllabusName || '';
            customSyllabusData = data.customSyllabusData || {};
            updateCustomSubjectDropdown();
            
            document.getElementById('profileDisplayUsername').textContent = currentUser;
            document.getElementById('profileDisplayEmail').textContent = userEmail;
            document.getElementById('profileDisplayGradeText').textContent = userGrade;
            document.getElementById('profileDisplayExamText').textContent = targetExam;
            
            document.getElementById('profileGrade').value = userGrade;
            document.getElementById('profileExam').value = targetExam;
            
            // Streak Logic
            const today = new Date().toDateString();
            if (lastActive) {
                const last = new Date(lastActive);
                const current = new Date();
                const diffTime = Math.abs(current - last);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (lastActive !== today) {
                    if (diffDays === 1) streak++;
                    else streak = 1;
                }
            } else {
                streak = 1;
            }
            lastActive = today;
            saveProgress();
        }
    } catch (err) {
        console.error("Failed to load progress from server", err);
    }
    
    updateXPUI();
    renderBadges();
    renderFocusMeter();
    updateStats();
    renderDashboard();
}

initializeApp();

// ================= MULTIPLAYER ARENA 2.0 =================
// Full real-time socket architecture implemented at bottom of script.js

// Auth UI Events & Mode Switcher
function setAuthMode(mode) {
    const isLogin = mode === 'login';
    const isRegister = mode === 'register';
    const isForgot = mode === 'forgot';

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const tabLoginBtn = document.getElementById('tabLoginBtn');
    const tabRegisterBtn = document.getElementById('tabRegisterBtn');
    const authError = document.getElementById('authError');
    const authSuccess = document.getElementById('authSuccess');

    if (loginForm) loginForm.style.display = isLogin ? 'flex' : 'none';
    if (registerForm) registerForm.style.display = isRegister ? 'flex' : 'none';
    if (forgotPasswordForm) forgotPasswordForm.style.display = isForgot ? 'flex' : 'none';

    if (tabLoginBtn) tabLoginBtn.classList.toggle('active', isLogin);
    if (tabRegisterBtn) tabRegisterBtn.classList.toggle('active', isRegister);
    if (authError) authError.style.display = 'none';
    if (authSuccess && !isLogin) authSuccess.style.display = 'none';

    if (isForgot) {
        const loginEmail = document.getElementById('loginEmail');
        const forgotEmail = document.getElementById('forgotEmail');
        if (loginEmail && forgotEmail && loginEmail.value.trim() && !forgotEmail.value.trim()) {
            forgotEmail.value = loginEmail.value.trim();
        }
    }
}

const showRegister = document.getElementById('showRegister');
if (showRegister) showRegister.onclick = (e) => { e.preventDefault(); setAuthMode('register'); };
const showLogin = document.getElementById('showLogin');
if (showLogin) showLogin.onclick = (e) => { e.preventDefault(); setAuthMode('login'); };
const tabLoginBtn = document.getElementById('tabLoginBtn');
if (tabLoginBtn) tabLoginBtn.onclick = () => setAuthMode('login');
const tabRegisterBtn = document.getElementById('tabRegisterBtn');
if (tabRegisterBtn) tabRegisterBtn.onclick = () => setAuthMode('register');

// Forgot Password Navigation
const showForgotPassword = document.getElementById('showForgotPassword');
if (showForgotPassword) {
    showForgotPassword.onclick = (e) => {
        e.preventDefault();
        setAuthMode('forgot');
    };
}
const backToLoginFromForgot = document.getElementById('backToLoginFromForgot');
if (backToLoginFromForgot) {
    backToLoginFromForgot.onclick = (e) => {
        e.preventDefault();
        setAuthMode('login');
    };
}

// Password Visibility Toggles
document.querySelectorAll('.password-toggle-btn').forEach(btn => {
    btn.onclick = () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        const eyeShow = btn.querySelector('.eye-show');
        const eyeHide = btn.querySelector('.eye-hide');
        if (eyeShow && eyeHide) {
            eyeShow.style.display = isPassword ? 'none' : 'block';
            eyeHide.style.display = isPassword ? 'block' : 'none';
        }
    };
});

function showError(msg) {
    const err = document.getElementById('authError');
    if (err) {
        err.textContent = msg;
        err.style.display = 'block';
    }
    const succ = document.getElementById('authSuccess');
    if (succ) succ.style.display = 'none';
}

function showAuthSuccess(msg) {
    const succ = document.getElementById('authSuccess');
    if (succ) {
        succ.textContent = msg;
        succ.style.display = 'flex';
    }
    const err = document.getElementById('authError');
    if (err) err.style.display = 'none';
}

// Reset / Change Password Action
const resetPasswordBtn = document.getElementById('resetPasswordBtn');
if (resetPasswordBtn) {
    resetPasswordBtn.onclick = async () => {
        const email = (document.getElementById('forgotEmail')?.value || '').trim();
        const newPassword = document.getElementById('forgotNewPassword')?.value || '';
        const confirmPassword = document.getElementById('forgotConfirmPassword')?.value || '';

        if (!email || !newPassword || !confirmPassword) {
            return showError('Please fill in all fields.');
        }
        if (newPassword.length < 6) {
            return showError('New password must be at least 6 characters long.');
        }
        if (newPassword !== confirmPassword) {
            return showError('New password and confirm password do not match.');
        }

        resetPasswordBtn.disabled = true;
        const originalText = resetPasswordBtn.innerHTML;
        resetPasswordBtn.innerHTML = '<span>Updating Password...</span>';

        try {
            const res = await fetch(`${API_BASE}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, newPassword, confirmPassword })
            });
            const data = await res.json();
            if (data.error) {
                showError(data.error);
                return;
            }

            // Success!
            setAuthMode('login');
            showAuthSuccess('✓ Password updated successfully! Please sign in with your new password.');
            const loginEmail = document.getElementById('loginEmail');
            if (loginEmail) loginEmail.value = email;
            const loginPassword = document.getElementById('loginPassword');
            if (loginPassword) {
                loginPassword.value = '';
                loginPassword.focus();
            }
            if (document.getElementById('forgotNewPassword')) document.getElementById('forgotNewPassword').value = '';
            if (document.getElementById('forgotConfirmPassword')) document.getElementById('forgotConfirmPassword').value = '';
        } catch (e) {
            showError('Unable to connect to server. Please try again.');
        } finally {
            resetPasswordBtn.disabled = false;
            resetPasswordBtn.innerHTML = originalText;
        }
    };
}

document.getElementById('loginBtn').onclick = async () => {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) return showError('Please fill all fields');
    
    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.error) return showError(data.error);
        
        authToken = data.token;
        currentUser = data.username;
        customSyllabusName = data.customSyllabusName || '';
        customSyllabusData = data.customSyllabusData || {};
        updateCustomSubjectDropdown();
        localStorage.setItem('aec_token', authToken);
        localStorage.setItem('aec_user', currentUser);
        initializeApp();
    } catch (e) { showError('Failed to login'); }
};

document.getElementById('registerBtn').onclick = async () => {
    const username = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    if (!username || !email || !password) return showError('Please fill all fields');
    
    try {
        const res = await fetch(`${API_BASE}/register`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();
        if (data.error) return showError(data.error);
        
        authToken = data.token;
        currentUser = data.username;
        customSyllabusName = data.customSyllabusName || '';
        customSyllabusData = data.customSyllabusData || {};
        updateCustomSubjectDropdown();
        localStorage.setItem('aec_token', authToken);
        localStorage.setItem('aec_user', currentUser);
        
        // Setup initial default progress for new user
        xp = data.xp || 0;
        streak = data.streak || 0;
        badges = data.badges || [];
        saveProgress();
        
        initializeApp();
    } catch (e) { showError('Failed to register'); }
};

function handleLogout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('aec_token');
    localStorage.removeItem('aec_user');
    window.location.href = 'landing.html';
}
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.onclick = handleLogout;
const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
if (sidebarLogoutBtn) sidebarLogoutBtn.onclick = handleLogout;

function openCandidateProfileModal() {
    document.getElementById('profileDisplayUsername').textContent = currentUser || 'Student';
    document.getElementById('profileDisplayEmail').textContent = userEmail || 'No email provided';
    document.getElementById('profileDisplayGradeText').textContent = userGrade || 'General';
    document.getElementById('profileDisplayExamText').textContent = targetExam || 'None';
    document.getElementById('profileDisplaySyllabusText').textContent = customSyllabusName || 'No custom syllabus attached';
    
    // Update syllabus status pill
    const statusPill = document.getElementById('syllabusStatusPill');
    if (statusPill) {
        if (customSyllabusName) {
            statusPill.textContent = 'Active Dossier';
            statusPill.style.background = 'rgba(34, 197, 94, 0.12)';
            statusPill.style.color = '#16A34A';
        } else {
            statusPill.textContent = 'Standard Mode';
            statusPill.style.background = 'rgba(180, 128, 31, 0.12)';
            statusPill.style.color = 'var(--gold)';
        }
    }
    
    // Set avatar initial
    const avatarBadge = document.getElementById('profileAvatarBadge');
    if (avatarBadge && currentUser) {
        avatarBadge.textContent = currentUser.charAt(0).toUpperCase();
    }
    
    document.getElementById('profileViewMode').style.display = 'block';
    document.getElementById('editProfileBtn').style.display = 'flex';
    document.getElementById('profileEditMode').style.display = 'none';
    document.getElementById('profileOverlay').style.display = 'flex';
}
const welcomeUserBtn = document.getElementById('welcomeUserBtn');
if (welcomeUserBtn) welcomeUserBtn.onclick = openCandidateProfileModal;
const sidebarProfileCard = document.getElementById('sidebarProfileCard');
if (sidebarProfileCard) sidebarProfileCard.onclick = () => {
  if (typeof closeSidebar === 'function') closeSidebar();
  openCandidateProfileModal();
};

document.getElementById('editProfileBtn').onclick = () => {
    document.getElementById('profileViewMode').style.display = 'none';
    document.getElementById('editProfileBtn').style.display = 'none';
    document.getElementById('profileEditMode').style.display = 'block';
};

document.getElementById('cancelEditProfileBtn').onclick = () => {
    document.getElementById('profileGrade').value = userGrade;
    document.getElementById('profileExam').value = targetExam;
    document.getElementById('profileViewMode').style.display = 'block';
    document.getElementById('editProfileBtn').style.display = 'block';
    document.getElementById('profileEditMode').style.display = 'none';
};

document.getElementById('closeProfileBtn').onclick = () => {
    document.getElementById('profileOverlay').style.display = 'none';
};

document.getElementById('saveProfileBtn').onclick = async () => {
    const grade = document.getElementById('profileGrade').value;
    const exam = document.getElementById('profileExam').value;
    
    try {
        const res = await fetch(`${API_BASE}/profile`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ grade, targetExam: exam })
        });
        
        if (res.ok) {
            userGrade = grade;
            targetExam = exam;
            
            document.getElementById('profileDisplayGradeText').textContent = grade;
            document.getElementById('profileDisplayExamText').textContent = exam;
            
            const msg = document.getElementById('profileSaveMsg');
            msg.style.display = 'block';
            
            setTimeout(() => {
                msg.style.display = 'none';
                document.getElementById('profileViewMode').style.display = 'block';
                document.getElementById('editProfileBtn').style.display = 'block';
                document.getElementById('profileEditMode').style.display = 'none';
            }, 1000);
        }
    } catch (err) {
        console.error("Failed to save profile", err);
    }
};

document.getElementById('uploadSyllabusBtn').onclick = async () => {
    const fileInput = document.getElementById('profileSyllabusInput');
    const statusDiv = document.getElementById('syllabusUploadStatus');
    
    if (fileInput.files.length === 0) {
        statusDiv.style.display = 'block';
        statusDiv.textContent = 'Please select a file first.';
        statusDiv.style.color = 'var(--accent-red)';
        return;
    }
    
    const file = fileInput.files[0];
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
        statusDiv.style.display = 'block';
        statusDiv.textContent = 'File exceeds 10MB limit.';
        statusDiv.style.color = 'var(--accent-red)';
        return;
    }
    
    statusDiv.style.display = 'block';
    statusDiv.textContent = 'Uploading and parsing syllabus... ⏳';
    statusDiv.style.color = 'var(--ink-soft)';
    
    const formData = new FormData();
    formData.append('syllabus', file);
    
    try {
        const res = await fetch(`${API_BASE}/profile/syllabus`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        const data = await res.json();
        
        if (data.error) {
            statusDiv.textContent = `Error: ${data.error}`;
            statusDiv.style.color = 'var(--accent-red)';
        } else {
            statusDiv.textContent = 'Syllabus uploaded successfully! ✓';
            statusDiv.style.color = 'var(--accent-teal)';
            customSyllabusName = data.syllabusName;
            customSyllabusData = data.customSyllabusData || {};
            updateCustomSubjectDropdown();
            document.getElementById('profileDisplaySyllabusText').textContent = customSyllabusName;
            const statusPill = document.getElementById('syllabusStatusPill');
            if (statusPill) {
                statusPill.textContent = 'Active Dossier';
                statusPill.style.background = 'rgba(34, 197, 94, 0.12)';
                statusPill.style.color = '#16A34A';
            }
        }
    } catch (e) {
        statusDiv.textContent = 'Failed to upload syllabus.';
        statusDiv.style.color = 'var(--accent-red)';
    }
};

const syllabusInput = document.getElementById('profileSyllabusInput');
if (syllabusInput) {
    syllabusInput.addEventListener('change', () => {
        const chosenFileName = document.getElementById('chosenFileName');
        if (chosenFileName && syllabusInput.files.length > 0) {
            const f = syllabusInput.files[0];
            const sizeMb = (f.size / (1024 * 1024)).toFixed(1);
            chosenFileName.textContent = `${f.name} (${sizeMb} MB)`;
            chosenFileName.style.color = 'var(--ink)';
            chosenFileName.style.fontWeight = '700';
        }
    });
}

/* ==========================================================================
   MULTIPLAYER ARENA 2.0 - REAL-TIME BATTLE CLIENT ENGINE
   ========================================================================== */

let arenaSocket = null;
let currentArenaRoom = null;
let currentArenaQuestions = [];
let currentArenaQIndex = 0;
let arenaTimerInterval = null;
let arenaQStartTime = null;

function getScholarPlayerTag() {
  let tag = localStorage.getItem('scholar_player_tag');
  if (!tag) {
    tag = `#SP-${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem('scholar_player_tag', tag);
  }
  return tag;
}

function getScholarAvatar() {
  const avatars = ['🎓', '⚡', '🦉', '🚀', '🧠', '🌟', '🎯', '🔥'];
  const name = currentUser || 'Scholar';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return avatars[hash % avatars.length];
}

function initArenaIdentity() {
  const nameEl = document.getElementById('arenaUserName');
  const tagEl = document.getElementById('arenaUserTag');
  const avatarEl = document.getElementById('arenaUserAvatar');
  const copyBtn = document.getElementById('copyPlayerTagBtn');

  const tag = getScholarPlayerTag();
  const avatar = getScholarAvatar();
  const name = currentUser || 'Scholar';

  if (nameEl) nameEl.textContent = name;
  if (tagEl) tagEl.textContent = tag;
  if (avatarEl) avatarEl.textContent = avatar;

  if (copyBtn && !copyBtn.dataset.bound) {
    copyBtn.dataset.bound = 'true';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(tag).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓ Copied!';
        copyBtn.style.color = 'var(--green)';
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.color = '';
        }, 1800);
      }).catch(() => {
        prompt('Copy your Scholar Tag:', tag);
      });
    });
  }
}

function setupArenaTabs() {
  const tabBtns = document.querySelectorAll('.arena-tab-btn');
  tabBtns.forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.arenaTab;
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tabs = {
        public: document.getElementById('arenaTabPublic'),
        create: document.getElementById('arenaTabCreate'),
        private: document.getElementById('arenaTabPrivate')
      };

      Object.entries(tabs).forEach(([k, el]) => {
        if (!el) return;
        el.style.display = (k === targetTab) ? 'block' : 'none';
      });

      if (targetTab === 'public') {
        fetchPublicLobbies();
      } else if (targetTab === 'create') {
        populateArenaSubjectsAndTopics();
      }
    });
  });

  const emptyCreateBtn = document.getElementById('emptyCreateBtn');
  if (emptyCreateBtn && !emptyCreateBtn.dataset.bound) {
    emptyCreateBtn.dataset.bound = 'true';
    emptyCreateBtn.addEventListener('click', () => {
      const createTabBtn = document.querySelector('button[data-arena-tab="create"]');
      if (createTabBtn) createTabBtn.click();
    });
  }
}

function populateArenaSubjectsAndTopics() {
  const subjectSelect = document.getElementById('arenaSubjectSelect');
  const topicSelect = document.getElementById('arenaTopicSelect');
  const syllabusTag = document.getElementById('arenaSyllabusTag');
  const filterSubjSelect = document.getElementById('arenaFilterSubject');

  if (!subjectSelect || !topicSelect) return;

  const hasCustom = typeof customSyllabusData === 'object' && customSyllabusData !== null && Object.keys(customSyllabusData).length > 0;

  if (syllabusTag) {
    if (hasCustom) {
      syllabusTag.textContent = `📜 ${customSyllabusName || 'Custom Profile Syllabus'}`;
      syllabusTag.style.display = 'inline-flex';
      syllabusTag.title = 'Subjects and topics are loaded from your profile syllabus';
    } else {
      syllabusTag.style.display = 'none';
      syllabusTag.textContent = '';
    }
  }

  // Determine subjects: use custom syllabus if available, else defaults
  let subjects = [];
  if (hasCustom) {
    subjects = Object.keys(customSyllabusData);
  } else if (Array.isArray(TOPICS) && TOPICS.length > 0) {
    subjects = TOPICS;
  } else {
    subjects = ['Math', 'Physics', 'Chemistry', 'Biology'];
  }

  // Populate #arenaSubjectSelect
  const prevSubject = subjectSelect.value || 'All';
  subjectSelect.innerHTML = '<option value="All">All Subjects (Mixed)</option>';
  subjects.forEach(subj => {
    const opt = document.createElement('option');
    opt.value = subj;
    opt.textContent = subj;
    subjectSelect.appendChild(opt);
  });

  if (subjects.includes(prevSubject)) {
    subjectSelect.value = prevSubject;
  } else {
    subjectSelect.value = 'All';
  }

  // Populate #arenaFilterSubject (in public lobbies toolbar)
  if (filterSubjSelect) {
    const prevFilterSubj = filterSubjSelect.value || 'All';
    filterSubjSelect.innerHTML = '<option value="All">All Subjects</option>';
    subjects.forEach(subj => {
      const opt = document.createElement('option');
      opt.value = subj;
      opt.textContent = subj;
      filterSubjSelect.appendChild(opt);
    });

    if (subjects.includes(prevFilterSubj)) {
      filterSubjSelect.value = prevFilterSubj;
    } else {
      filterSubjSelect.value = 'All';
    }
  }

  // Function to refresh subtopics whenever subject changes
  function updateArenaTopics() {
    const selected = subjectSelect.value;
    const prevTopic = topicSelect.value || 'All';

    topicSelect.innerHTML = '<option value="All">All Subtopics</option>';

    let subs = [];
    if (selected === 'All') {
      if (hasCustom) {
        Object.keys(customSyllabusData).forEach(s => {
          if (Array.isArray(customSyllabusData[s])) {
            subs = subs.concat(customSyllabusData[s]);
          }
        });
      } else {
        subjects.forEach(t => {
          if (MICRO_TOPICS && MICRO_TOPICS[t]) subs = subs.concat(MICRO_TOPICS[t]);
        });
      }
    } else {
      if (hasCustom && Array.isArray(customSyllabusData[selected])) {
        subs = customSyllabusData[selected];
      } else if (MICRO_TOPICS && MICRO_TOPICS[selected]) {
        subs = MICRO_TOPICS[selected];
      }
    }

    const uniqueSubs = Array.from(new Set(subs)).filter(Boolean);
    uniqueSubs.forEach(sub => {
      const opt = document.createElement('option');
      opt.value = sub;
      opt.textContent = sub;
      topicSelect.appendChild(opt);
    });

    if (uniqueSubs.includes(prevTopic)) {
      topicSelect.value = prevTopic;
    } else {
      topicSelect.value = 'All';
    }
  }

  if (!subjectSelect.dataset.boundTopicListener) {
    subjectSelect.dataset.boundTopicListener = 'true';
    subjectSelect.addEventListener('change', updateArenaTopics);
  }

  updateArenaTopics();
}

function setupArenaVisibilityPicker() {
  const publicOpt = document.getElementById('visOptionPublic');
  const privateOpt = document.getElementById('visOptionPrivate');
  if (!publicOpt || !privateOpt) return;

  publicOpt.addEventListener('click', () => {
    publicOpt.classList.add('active');
    privateOpt.classList.remove('active');
    const radio = publicOpt.querySelector('input');
    if (radio) radio.checked = true;
  });

  privateOpt.addEventListener('click', () => {
    privateOpt.classList.add('active');
    publicOpt.classList.remove('active');
    const radio = privateOpt.querySelector('input');
    if (radio) radio.checked = true;
  });
}

function ensureArenaSocket() {
  if (arenaSocket && arenaSocket.connected) return arenaSocket;

  if (typeof io !== 'function') {
    console.error('Socket.io client library not loaded.');
    return null;
  }

  arenaSocket = io(BACKEND_URL, {
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5
  });

  // Socket Event Listeners
  arenaSocket.on('connect', () => {
    console.log('⚡ Connected to Arena Socket:', arenaSocket.id);
    fetchPublicLobbies();
  });

  arenaSocket.on('public-rooms-list', (rooms) => {
    renderPublicLobbies(rooms);
  });

  arenaSocket.on('room-created', (data) => {
    handleRoomEntered(data, true);
  });

  arenaSocket.on('room-joined', (data) => {
    handleRoomEntered(data, false);
  });

  arenaSocket.on('room-roster-update', ({ players, state, hostId }) => {
    if (!currentArenaRoom) return;
    currentArenaRoom.players = players;
    currentArenaRoom.hostId = hostId;
    currentArenaRoom.isHost = (hostId === arenaSocket.id);
    renderWaitingRoster(players, hostId);
  });

  arenaSocket.on('game-generating', ({ message }) => {
    const statusMsg = document.getElementById('arenaStatusMsg');
    if (statusMsg) {
      statusMsg.textContent = `⚙️ ${message}`;
      statusMsg.style.color = 'var(--gold)';
    }
    const startBtn = document.getElementById('arenaStartBattleBtn');
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = '⏳ Preparing Arena...';
    }
  });

  arenaSocket.on('game-start', ({ questions, config, players }) => {
    currentArenaQuestions = questions || [];
    currentArenaQIndex = 0;
    if (currentArenaRoom) {
      currentArenaRoom.config = config;
      currentArenaRoom.players = players;
    }
    startBattlePhase();
  });

  arenaSocket.on('score-update', ({ players }) => {
    if (!currentArenaRoom) return;
    currentArenaRoom.players = players;
    renderScoreboardTrack(players);
  });

  arenaSocket.on('battle-over', ({ rankings, roomConfig }) => {
    endBattlePhase(rankings, roomConfig);
  });

  arenaSocket.on('rematch-started', ({ config, players, hostId }) => {
    if (!currentArenaRoom) return;
    currentArenaRoom.config = config;
    currentArenaRoom.players = players;
    currentArenaRoom.hostId = hostId;
    currentArenaRoom.isHost = (hostId === arenaSocket.id);
    resetToWaitingRoom();
  });

  arenaSocket.on('room-error', (msg) => {
    const errorBox = document.getElementById('arenaPrivateError');
    if (errorBox) {
      errorBox.textContent = `⚠️ ${msg}`;
      errorBox.style.display = 'block';
    } else {
      alert(`Arena Notice: ${msg}`);
    }
    const startBtn = document.getElementById('arenaStartBattleBtn');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = '🚀 Start Battle Now';
    }
  });

  return arenaSocket;
}

let allPublicRoomsCache = [];

function fetchPublicLobbies() {
  if (arenaSocket && arenaSocket.connected) {
    arenaSocket.emit('get-public-rooms');
  }
}

function handlePublicRoomsList(rooms) {
  allPublicRoomsCache = Array.isArray(rooms) ? rooms : [];
  applyLobbyFilters();
}

function setupPublicLobbiesSearchAndFilters() {
  const searchInput = document.getElementById('arenaLobbySearch');
  const clearBtn = document.getElementById('arenaClearSearchBtn');
  const subjectSelect = document.getElementById('arenaFilterSubject');
  const formatSelect = document.getElementById('arenaFilterFormat');
  const availSelect = document.getElementById('arenaFilterAvailability');

  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = 'true';
    searchInput.addEventListener('input', () => {
      applyLobbyFilters();
    });
  }

  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = 'true';
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      applyLobbyFilters();
      searchInput.focus();
    });
  }

  if (subjectSelect && !subjectSelect.dataset.bound) {
    subjectSelect.dataset.bound = 'true';
    subjectSelect.addEventListener('change', () => {
      applyLobbyFilters();
    });
  }

  if (formatSelect && !formatSelect.dataset.bound) {
    formatSelect.dataset.bound = 'true';
    formatSelect.addEventListener('change', () => {
      applyLobbyFilters();
    });
  }

  if (availSelect && !availSelect.dataset.bound) {
    availSelect.dataset.bound = 'true';
    availSelect.addEventListener('change', () => {
      applyLobbyFilters();
    });
  }
}

function resetAllLobbyFilters() {
  const searchInput = document.getElementById('arenaLobbySearch');
  const clearBtn = document.getElementById('arenaClearSearchBtn');
  const subjectSelect = document.getElementById('arenaFilterSubject');
  const formatSelect = document.getElementById('arenaFilterFormat');
  const availSelect = document.getElementById('arenaFilterAvailability');

  if (searchInput) searchInput.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  if (subjectSelect) subjectSelect.value = 'All';
  if (formatSelect) formatSelect.value = 'All';
  if (availSelect) availSelect.value = 'all';

  applyLobbyFilters();
}

function applyLobbyFilters() {
  const searchInput = document.getElementById('arenaLobbySearch');
  const clearBtn = document.getElementById('arenaClearSearchBtn');
  const subjectSelect = document.getElementById('arenaFilterSubject');
  const formatSelect = document.getElementById('arenaFilterFormat');
  const availSelect = document.getElementById('arenaFilterAvailability');
  const summaryBox = document.getElementById('arenaFilterSummary');

  const query = (searchInput?.value || '').trim().toLowerCase();
  const selectedSubj = subjectSelect?.value || 'All';
  const selectedFormat = formatSelect?.value || 'All';
  const selectedAvail = availSelect?.value || 'open';

  if (clearBtn) {
    clearBtn.style.display = query ? 'block' : 'none';
  }

  const filtered = allPublicRoomsCache.filter(r => {
    // 1. Text search (matches room code, room name, host scholar name, subject, subtopic)
    if (query) {
      const idMatch = String(r.id || '').toLowerCase().includes(query) || (`#${r.id}`).toLowerCase().includes(query);
      const nameMatch = String(r.name || '').toLowerCase().includes(query);
      const hostMatch = String(r.hostName || '').toLowerCase().includes(query);
      const subjMatch = String(r.subject || '').toLowerCase().includes(query);
      const subtopicMatch = String(r.subtopic || '').toLowerCase().includes(query);
      if (!idMatch && !nameMatch && !hostMatch && !subjMatch && !subtopicMatch) {
        return false;
      }
    }

    // 2. Subject filter
    if (selectedSubj !== 'All') {
      const roomSubj = String(r.subject || '').trim().toLowerCase();
      const targetSubj = selectedSubj.trim().toLowerCase();
      if (roomSubj !== targetSubj && roomSubj !== 'all' && roomSubj !== 'all subjects') {
        return false;
      }
    }

    // 3. Format filter
    if (selectedFormat !== 'All') {
      if (r.format !== selectedFormat) {
        return false;
      }
    }

    // 4. Availability filter
    if (selectedAvail === 'open') {
      if (r.playerCount >= r.maxPlayers) {
        return false;
      }
    }

    return true;
  });

  const hasActiveFilters = Boolean(query || selectedSubj !== 'All' || selectedFormat !== 'All' || selectedAvail !== 'open');

  if (summaryBox) {
    if (hasActiveFilters && allPublicRoomsCache.length > 0) {
      summaryBox.style.display = 'flex';
      summaryBox.innerHTML = `
        <span>Showing <b>${filtered.length}</b> of <b>${allPublicRoomsCache.length}</b> active lobbies</span>
        <button type="button" class="btn-clear-filters" id="arenaResetFiltersBtn">Reset Filters ✕</button>
      `;
      const resetBtn = document.getElementById('arenaResetFiltersBtn');
      if (resetBtn) resetBtn.addEventListener('click', resetAllLobbyFilters);
    } else {
      summaryBox.style.display = 'none';
      summaryBox.innerHTML = '';
    }
  }

  renderFilteredPublicLobbies(filtered);
}

function renderFilteredPublicLobbies(rooms) {
  const container = document.getElementById('publicLobbiesList');
  if (!container) return;

  if (allPublicRoomsCache.length === 0) {
    container.innerHTML = `
      <div class="arena-empty-state">
        <div class="arena-empty-icon">⏳</div>
        <div class="arena-empty-title">Scanning for Battle Lobbies...</div>
        <p class="arena-empty-desc">No public rooms found right now. Create one and host the first challenge!</p>
        <button type="button" class="btn secondary" id="emptyCreateBtn">
          ➕ Create Arena
        </button>
      </div>
    `;
    const btn = container.querySelector('#emptyCreateBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        const createTab = document.querySelector('button[data-arena-tab="create"]');
        if (createTab) createTab.click();
      });
    }
    return;
  }

  if (rooms.length === 0) {
    container.innerHTML = `
      <div class="arena-no-matches-box">
        <div class="no-matches-icon">🔍</div>
        <div class="no-matches-title">No matching battle lobbies found</div>
        <p class="no-matches-desc">We couldn't find any public lobbies matching your current search or topic filter criteria. Try searching a different keyword or resetting filters.</p>
        <div class="no-matches-actions">
          <button type="button" class="btn secondary" id="noMatchesResetBtn">✕ Clear Filters</button>
          <button type="button" class="btn" id="noMatchesCreateBtn">➕ Create Arena with this Topic</button>
        </div>
      </div>
    `;
    const resetBtn = container.querySelector('#noMatchesResetBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetAllLobbyFilters);
    const createBtn = container.querySelector('#noMatchesCreateBtn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        const createTab = document.querySelector('button[data-arena-tab="create"]');
        if (createTab) createTab.click();
      });
    }
    return;
  }

  container.innerHTML = rooms.map(r => {
    const isFull = r.playerCount >= r.maxPlayers;
    const formatLabel = {
      mix: 'Mixed Formats',
      mcq: 'MCQ',
      tf: 'True/False',
      sata: 'SATA',
      short: 'Short Answer'
    }[r.format] || r.format;

    return `
      <div class="arena-lobby-item">
        <div class="arena-lobby-main">
          <div class="arena-lobby-title-row">
            <span class="arena-lobby-code">ROOM #${r.id}</span>
            <span class="arena-lobby-name">${r.name}</span>
            <span class="arena-lobby-host">Host: <b>${r.hostName || 'Scholar'}</b></span>
          </div>
          <div class="arena-lobby-specs-row">
            <span class="arena-lobby-chip">📚 ${r.subject}</span>
            ${r.subtopic && r.subtopic !== 'All' ? `<span class="arena-lobby-chip">🎯 ${r.subtopic}</span>` : ''}
            <span class="arena-lobby-chip">📋 ${formatLabel}</span>
            <span class="arena-lobby-chip">🔢 ${r.count} Questions</span>
            <span class="arena-lobby-chip">⏱️ ${r.timer > 0 ? (r.timer / 60) + ' min' : 'Untimed'}</span>
          </div>
        </div>
        <div class="arena-lobby-right">
          <div class="arena-lobby-capacity ${isFull ? 'full' : ''}">
            👥 ${r.playerCount}/${r.maxPlayers} ${isFull ? '(Full)' : 'Slots'}
          </div>
          <button type="button" class="btn ${isFull ? 'secondary' : ''}" data-join-room="${r.id}" ${isFull ? 'disabled' : ''}>
            ${isFull ? 'Full' : '⚔️ Join Match'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('button[data-join-room]').forEach(btn => {
    btn.addEventListener('click', () => {
      const roomId = btn.dataset.joinRoom;
      joinArenaRoom(roomId, null);
    });
  });
}

function renderPublicLobbies(rooms) {
  handlePublicRoomsList(rooms);
}

function handleRoomEntered(data, isHost) {
  currentArenaRoom = {
    roomId: data.roomId,
    isPrivate: data.isPrivate,
    passcode: data.passcode,
    maxPlayers: data.maxPlayers,
    config: data.config,
    players: data.players,
    hostId: isHost ? arenaSocket.id : null,
    isHost: isHost
  };

  // Switch Views
  const mainLobby = document.getElementById('arenaMainLobby');
  const activeRoom = document.getElementById('arenaRoomActive');
  const waitingRoom = document.getElementById('arenaWaitingRoom');
  const battleView = document.getElementById('arenaBattleView');
  const resultsView = document.getElementById('arenaResultsView');

  if (mainLobby) mainLobby.style.display = 'none';
  if (activeRoom) activeRoom.style.display = 'block';
  if (waitingRoom) waitingRoom.style.display = 'block';
  if (battleView) battleView.style.display = 'none';
  if (resultsView) resultsView.style.display = 'none';

  // Badges
  const codePill = document.getElementById('arRoomCode');
  const visBadge = document.getElementById('arVisBadge');
  const passBox = document.getElementById('arPasscodeBox');
  const passVal = document.getElementById('arPasscodeVal');

  if (codePill) codePill.textContent = `ROOM #${data.roomId}`;
  if (visBadge) {
    visBadge.textContent = data.isPrivate ? '🔒 Private' : '🌐 Public';
    visBadge.style.color = data.isPrivate ? 'var(--gold)' : 'var(--green)';
  }
  if (passBox && passVal) {
    if (data.isPrivate && data.passcode) {
      passBox.style.display = 'inline-flex';
      passVal.textContent = data.passcode;
    } else {
      passBox.style.display = 'none';
    }
  }

  // Room Specs Chips
  const specsRow = document.getElementById('arenaSpecsRow');
  if (specsRow && data.config) {
    const fLabel = { mix: 'Mix Formats', mcq: 'MCQ Only', tf: 'True/False', sata: 'SATA', short: 'Short Answer' }[data.config.format] || data.config.format;
    specsRow.innerHTML = `
      <span class="arena-spec-chip">📚 ${data.config.subject}${data.config.subtopic && data.config.subtopic !== 'All' ? ' · ' + data.config.subtopic : ''}</span>
      <span class="arena-spec-chip">📋 ${fLabel}</span>
      <span class="arena-spec-chip">🔢 ${data.config.count} Questions</span>
      <span class="arena-spec-chip">⏱️ ${data.config.timer > 0 ? (data.config.timer / 60) + ' Min Match' : 'Untimed'}</span>
      <span class="arena-spec-chip">👥 Max ${data.maxPlayers} Contenders</span>
    `;
  }

  renderWaitingRoster(data.players, currentArenaRoom.hostId);
}

function renderWaitingRoster(players, hostId) {
  const grid = document.getElementById('arenaRosterGrid');
  const countEl = document.getElementById('arenaRosterCount');
  const maxEl = document.getElementById('arenaRosterMax');
  const statusMsg = document.getElementById('arenaStatusMsg');
  const startBtn = document.getElementById('arenaStartBattleBtn');
  const readyBtn = document.getElementById('arenaReadyToggleBtn');

  if (!grid) return;

  const myId = arenaSocket?.id;
  const isHost = (hostId === myId);
  const me = players.find(p => p.id === myId);

  if (countEl) countEl.textContent = players.length;
  if (maxEl && currentArenaRoom) maxEl.textContent = currentArenaRoom.maxPlayers;

  grid.innerHTML = players.map(p => {
    const isSelf = (p.id === myId);
    const pIsHost = (p.id === hostId || p.isHost);
    return `
      <div class="arena-roster-card ${isSelf ? 'is-self' : ''}">
        <div class="roster-avatar">${p.avatar || '🎓'}</div>
        <div class="roster-info">
          <div class="roster-name">${p.username} ${isSelf ? '(You)' : ''}</div>
          <div class="roster-tag">${p.playerTag || ''}</div>
          <div class="roster-badges">
            ${pIsHost ? '<span class="host-crown">👑 Host</span>' : ''}
            <span class="ready-pill ${p.isReady ? 'is-ready' : ''}">
              ${p.isReady ? 'Ready ✨' : 'Waiting...'}
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Action Buttons & Status message
  if (isHost) {
    if (readyBtn) readyBtn.style.display = 'none';
    if (startBtn) {
      startBtn.style.display = 'inline-block';
      startBtn.disabled = false;
      startBtn.textContent = '🚀 Start Battle Now';
    }
    const readyCount = players.filter(p => p.isReady || p.isHost).length;
    if (statusMsg) {
      statusMsg.textContent = `👑 You are the Arena Host. Contenders ready: ${readyCount}/${players.length}. Start when ready!`;
      statusMsg.style.color = 'var(--gold)';
    }
  } else {
    if (startBtn) startBtn.style.display = 'none';
    if (readyBtn) {
      readyBtn.style.display = 'inline-block';
      if (me && me.isReady) {
        readyBtn.textContent = 'Cancel Ready ⏳';
        readyBtn.classList.add('active');
      } else {
        readyBtn.textContent = 'Ready Up ✨';
        readyBtn.classList.remove('active');
      }
    }
    if (statusMsg) {
      statusMsg.textContent = '⏳ Waiting for host to initiate the battle...';
      statusMsg.style.color = 'var(--ink-soft)';
    }
  }
}

function startBattlePhase() {
  const waitingRoom = document.getElementById('arenaWaitingRoom');
  const battleView = document.getElementById('arenaBattleView');
  const resultsView = document.getElementById('arenaResultsView');

  if (waitingRoom) waitingRoom.style.display = 'none';
  if (resultsView) resultsView.style.display = 'none';
  if (battleView) battleView.style.display = 'block';

  // Disable AI Coach during multiplayer arena battle
  if (typeof window.setArenaBattleCoachLock === 'function') {
    window.setArenaBattleCoachLock(true);
  }

  renderScoreboardTrack(currentArenaRoom?.players || []);

  const timerVal = currentArenaRoom?.config?.timer || 180;
  if (timerVal > 0) {
    startArenaTimer(timerVal);
  } else {
    const timerBox = document.getElementById('arenaTimerBox');
    if (timerBox) timerBox.innerHTML = `<span>⏳ Relaxed Mode</span>`;
  }

  currentArenaQIndex = 0;
  renderCurrentArenaQuestion();
}

function startArenaTimer(totalSeconds) {
  clearInterval(arenaTimerInterval);
  let remaining = totalSeconds;
  const timeEl = document.getElementById('arenaTimeRemaining');
  const timerBox = document.getElementById('arenaTimerBox');

  function update() {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    if (timeEl) timeEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    if (timerBox) {
      if (remaining <= 30) {
        timerBox.classList.add('urgent');
      } else {
        timerBox.classList.remove('urgent');
      }
    }

    if (remaining <= 0) {
      clearInterval(arenaTimerInterval);
      // Auto submit current question as timeout and complete
      if (currentArenaRoom && arenaSocket) {
        arenaSocket.emit('submit-answer', {
          roomId: currentArenaRoom.roomId,
          qIndex: currentArenaQuestions.length - 1,
          isCorrect: false,
          answerTime: 999
        });
      }
    }
    remaining--;
  }

  update();
  arenaTimerInterval = setInterval(update, 1000);
}

function renderScoreboardTrack(players) {
  const track = document.getElementById('arenaScoreboardTrack');
  if (!track || !players || players.length === 0) return;

  const totalQuestions = currentArenaQuestions.length || currentArenaRoom?.config?.count || 5;
  const highestScore = Math.max(...players.map(p => p.score || 0));

  track.innerHTML = players.map(p => {
    const pct = Math.min(100, Math.round(((p.progress || 0) / totalQuestions) * 100));
    const isLead = (p.score === highestScore && highestScore > 0);
    return `
      <div class="race-track-row ${isLead ? 'is-lead' : ''}">
        <div class="race-player-info">
          <div class="race-avatar">${p.avatar || '🎓'}</div>
          <div class="race-name" title="${p.username}">${p.username} ${isLead ? '👑' : ''}</div>
        </div>
        <div class="race-bar-wrap">
          <div class="race-bar-fill" style="width: ${pct}%;"></div>
        </div>
        <div class="race-score-pill">${p.score || 0} pts</div>
      </div>
    `;
  }).join('');
}

function renderCurrentArenaQuestion() {
  if (!currentArenaQuestions || currentArenaQuestions.length === 0) return;

  if (currentArenaQIndex >= currentArenaQuestions.length) {
    const card = document.getElementById('arenaQuestionCard');
    if (card) {
      card.innerHTML = `
        <div style="text-align:center; padding:30px;">
          <div style="font-size:36px; margin-bottom:12px;">🏁</div>
          <h3 style="font-family:'Playfair Display', serif; font-size:20px; color:var(--ink);">All Questions Completed!</h3>
          <p style="color:var(--ink-soft); font-size:14px; margin-top:6px;">Waiting for other combatants to cross the finish line...</p>
        </div>
      `;
    }
    return;
  }

  const q = currentArenaQuestions[currentArenaQIndex];
  arenaQStartTime = Date.now();

  const counterEl = document.getElementById('arenaQCounter');
  const topicBadge = document.getElementById('arenaQTopicBadge');
  const qText = document.getElementById('arenaQText');
  const qOptions = document.getElementById('arenaQOptions');
  const qFeedback = document.getElementById('arenaQFeedback');

  if (counterEl) counterEl.textContent = `Question ${currentArenaQIndex + 1} / ${currentArenaQuestions.length}`;
  if (topicBadge) topicBadge.textContent = `${q.topic || 'General'}${q.sub ? ' · ' + q.sub : ''}`;
  if (qText) qText.innerHTML = q.q || '';
  if (qFeedback) {
    qFeedback.style.display = 'none';
    qFeedback.innerHTML = '';
    qFeedback.className = 'arena-q-feedback';
  }

  const format = q.type || 'mcq';
  const letters = ['A', 'B', 'C', 'D'];

  if (format === 'mcq' || format === 'tf') {
    const opts = q.o || (format === 'tf' ? ['True', 'False'] : []);
    qOptions.innerHTML = opts.map((opt, i) => `
      <button type="button" class="arena-opt-btn" data-opt-idx="${i}" data-opt-val="${encodeURIComponent(opt)}">
        <span class="arena-opt-key">${letters[i] || (i+1)}</span>
        <span>${opt}</span>
      </button>
    `).join('');

    qOptions.querySelectorAll('button[data-opt-val]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = decodeURIComponent(btn.dataset.optVal);
        handleArenaOptionSelected(val, btn);
      });
    });
  } else if (format === 'sata') {
    const opts = q.o || [];
    let sataHTML = opts.map((opt, i) => `
      <button type="button" class="arena-opt-btn arena-sata-btn" data-opt-val="${encodeURIComponent(opt)}">
        <span class="arena-opt-key">☐</span>
        <span>${opt}</span>
      </button>
    `).join('');
    sataHTML += `
      <div style="margin-top:10px; display:flex; justify-content:flex-end;">
        <button type="button" class="btn" id="arenaSataSubmitBtn">Submit Selection</button>
      </div>
    `;
    qOptions.innerHTML = sataHTML;

    const selectedSet = new Set();
    qOptions.querySelectorAll('.arena-sata-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = decodeURIComponent(btn.dataset.optVal);
        if (selectedSet.has(val)) {
          selectedSet.delete(val);
          btn.classList.remove('selected');
          btn.querySelector('.arena-opt-key').textContent = '☐';
        } else {
          selectedSet.add(val);
          btn.classList.add('selected');
          btn.querySelector('.arena-opt-key').textContent = '☑';
        }
      });
    });

    const submitBtn = document.getElementById('arenaSataSubmitBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        handleArenaSataSelected(Array.from(selectedSet));
      });
    }
  } else if (format === 'short') {
    qOptions.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <input type="text" id="arenaShortInput" placeholder="Type your answer here..." class="arena-big-input" style="font-size:16px; text-align:left; letter-spacing:normal;">
        <div style="display:flex; justify-content:flex-end;">
          <button type="button" class="btn" id="arenaShortSubmitBtn">Submit Answer</button>
        </div>
      </div>
    `;

    const input = document.getElementById('arenaShortInput');
    const submitBtn = document.getElementById('arenaShortSubmitBtn');
    function submitShort() {
      const val = (input?.value || '').trim();
      if (!val) return;
      handleArenaShortSelected(val);
    }
    if (submitBtn) submitBtn.addEventListener('click', submitShort);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitShort();
      });
      setTimeout(() => input.focus(), 100);
    }
  }

  // Typeset MathJax if available
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise([qText, qOptions]).catch(err => console.log(err));
  }
}

function handleArenaOptionSelected(selectedVal, clickedBtn) {
  const q = currentArenaQuestions[currentArenaQIndex];
  const allBtns = document.querySelectorAll('.arena-opt-btn');
  allBtns.forEach(b => b.disabled = true);

  const answerTime = Math.round((Date.now() - arenaQStartTime) / 1000);
  const correctVal = String(q.a || '').trim();
  const isCorrect = (String(selectedVal || '').trim().toLowerCase() === correctVal.toLowerCase());

  if (clickedBtn) {
    clickedBtn.classList.add(isCorrect ? 'correct' : 'wrong');
  }

  allBtns.forEach(b => {
    const val = decodeURIComponent(b.dataset.optVal || '');
    if (val.trim().toLowerCase() === correctVal.toLowerCase()) {
      b.classList.add('correct');
    }
  });

  showArenaFeedback(isCorrect, q.e);

  if (arenaSocket && currentArenaRoom) {
    arenaSocket.emit('submit-answer', {
      roomId: currentArenaRoom.roomId,
      qIndex: currentArenaQIndex,
      isCorrect,
      answerTime
    });
  }

  setTimeout(() => {
    currentArenaQIndex++;
    renderCurrentArenaQuestion();
  }, 1300);
}

function handleArenaSataSelected(selectedList) {
  const q = currentArenaQuestions[currentArenaQIndex];
  const submitBtn = document.getElementById('arenaSataSubmitBtn');
  if (submitBtn) submitBtn.disabled = true;

  const answerTime = Math.round((Date.now() - arenaQStartTime) / 1000);
  const correctSet = new Set(Array.isArray(q.a) ? q.a : [q.a]);
  const userSet = new Set(selectedList);

  let isCorrect = (userSet.size === correctSet.size);
  if (isCorrect) {
    for (const val of userSet) {
      if (!correctSet.has(val)) {
        isCorrect = false;
        break;
      }
    }
  }

  showArenaFeedback(isCorrect, q.e);

  if (arenaSocket && currentArenaRoom) {
    arenaSocket.emit('submit-answer', {
      roomId: currentArenaRoom.roomId,
      qIndex: currentArenaQIndex,
      isCorrect,
      answerTime
    });
  }

  setTimeout(() => {
    currentArenaQIndex++;
    renderCurrentArenaQuestion();
  }, 1400);
}

function handleArenaShortSelected(userText) {
  const q = currentArenaQuestions[currentArenaQIndex];
  const submitBtn = document.getElementById('arenaShortSubmitBtn');
  if (submitBtn) submitBtn.disabled = true;

  const answerTime = Math.round((Date.now() - arenaQStartTime) / 1000);
  const idealAnswer = String(q.a || '').toLowerCase().trim();
  const given = userText.toLowerCase().trim();

  const isCorrect = (given.includes(idealAnswer) || idealAnswer.includes(given));

  showArenaFeedback(isCorrect, `${q.e || ''} (Correct answer: ${q.a})`);

  if (arenaSocket && currentArenaRoom) {
    arenaSocket.emit('submit-answer', {
      roomId: currentArenaRoom.roomId,
      qIndex: currentArenaQIndex,
      isCorrect,
      answerTime
    });
  }

  setTimeout(() => {
    currentArenaQIndex++;
    renderCurrentArenaQuestion();
  }, 1400);
}

function showArenaFeedback(isCorrect, explanation) {
  const box = document.getElementById('arenaQFeedback');
  if (!box) return;

  box.style.display = 'block';
  box.className = `arena-q-feedback ${isCorrect ? 'correct' : 'wrong'}`;
  box.innerHTML = `
    <b>${isCorrect ? '✓ Correct! (+Points)' : '✗ Incorrect'}</b>
    ${explanation ? `<div style="margin-top:4px;">${explanation}</div>` : ''}
  `;
}

function endBattlePhase(rankings, roomConfig) {
  clearInterval(arenaTimerInterval);

  // Re-enable AI Coach when arena battle ends
  if (typeof window.setArenaBattleCoachLock === 'function') {
    window.setArenaBattleCoachLock(false);
  }

  const battleView = document.getElementById('arenaBattleView');
  const resultsView = document.getElementById('arenaResultsView');
  const waitingRoom = document.getElementById('arenaWaitingRoom');

  if (battleView) battleView.style.display = 'none';
  if (waitingRoom) waitingRoom.style.display = 'none';
  if (resultsView) {
    resultsView.style.display = 'block';
    setTimeout(() => {
      resultsView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  renderArenaPodium(rankings);
  renderArenaLeaderboard(rankings);

  // Award local XP
  const myId = arenaSocket?.id;
  const myRecord = rankings.find(r => r.id === myId);
  const award = myRecord ? (myRecord.xpAwarded || myRecord.xpBonus || 150) : 100;
  xp = (xp || 0) + award;
  const xpDisplay = document.getElementById('headerXpVal') || document.getElementById('xpVal');
  if (xpDisplay) xpDisplay.textContent = xp;
  if (typeof saveProgress === 'function') saveProgress();

  // Rematch button (Host only)
  const rematchBtn = document.getElementById('arenaRematchBtn');
  const isHost = currentArenaRoom?.isHost;
  if (rematchBtn) {
    rematchBtn.style.display = isHost ? 'inline-block' : 'none';
  }
}

function renderArenaPodium(rankings) {
  const container = document.getElementById('arenaPodium');
  if (!container) return;

  const first = rankings[0] || null;
  const second = rankings[1] || null;
  const third = rankings[2] || null;

  container.innerHTML = `
    <!-- 2nd Place Silver -->
    <div class="podium-place second">
      ${second ? `
        <div class="podium-avatar-wrap">
          <div class="podium-avatar">${second.avatar || '🥈'}</div>
          <div class="podium-user-name" title="${second.username}">${second.username}</div>
          <div class="podium-user-score">${second.score} pts</div>
        </div>
        <div class="podium-pillar">
          <span class="podium-medal">🥈</span>
          <span class="podium-rank-text">2</span>
        </div>
      ` : '<div style="height:130px; width:100%;"></div>'}
    </div>

    <!-- 1st Place Gold -->
    <div class="podium-place first">
      ${first ? `
        <div class="podium-avatar-wrap">
          <span class="podium-crown">👑</span>
          <div class="podium-avatar">${first.avatar || '🥇'}</div>
          <div class="podium-user-name" title="${first.username}">${first.username}</div>
          <div class="podium-user-score">${first.score} pts</div>
        </div>
        <div class="podium-pillar">
          <span class="podium-medal">🥇</span>
          <span class="podium-rank-text">1</span>
        </div>
      ` : '<div style="height:170px; width:100%;"></div>'}
    </div>

    <!-- 3rd Place Bronze -->
    <div class="podium-place third">
      ${third ? `
        <div class="podium-avatar-wrap">
          <div class="podium-avatar">${third.avatar || '🥉'}</div>
          <div class="podium-user-name" title="${third.username}">${third.username}</div>
          <div class="podium-user-score">${third.score} pts</div>
        </div>
        <div class="podium-pillar">
          <span class="podium-medal">🥉</span>
          <span class="podium-rank-text">3</span>
        </div>
      ` : '<div style="height:100px; width:100%;"></div>'}
    </div>
  `;
}

function renderArenaLeaderboard(rankings) {
  const tbody = document.getElementById('arenaLeaderboardBody');
  if (!tbody || !rankings) return;

  const myId = arenaSocket?.id;

  tbody.innerHTML = rankings.map(r => {
    const isSelf = (r.id === myId);
    const timeFormatted = r.finishTime ? `${(r.finishTime / 1000).toFixed(1)}s` : 'Timed Out';
    const rankClass = r.rank === 1 ? 'rank-1' : (r.rank === 2 ? 'rank-2' : (r.rank === 3 ? 'rank-3' : ''));

    return `
      <tr class="${isSelf ? 'is-self' : ''}">
        <td>
          <span class="rank-badge ${rankClass}">#${r.rank}</span>
        </td>
        <td>
          <b>${r.username}</b> <span style="font-family:'IBM Plex Mono', monospace; font-size:11px; color:var(--gold);">${r.playerTag}</span> ${isSelf ? '🌟' : ''}
        </td>
        <td style="font-family:'IBM Plex Mono', monospace; font-weight:700;">${r.score}</td>
        <td>${r.accuracy || 0}%</td>
        <td style="font-family:'IBM Plex Mono', monospace; font-size:12px;">${timeFormatted}</td>
        <td style="font-weight:700; color:var(--gold);">+${r.xpAwarded || r.xpBonus || (r.rank === 1 ? 150 : (r.rank === 2 ? 100 : (r.rank === 3 ? 75 : 50)))} XP</td>
      </tr>
    `;
  }).join('');
}

function resetToWaitingRoom() {
  if (typeof window.setArenaBattleCoachLock === 'function') {
    window.setArenaBattleCoachLock(false);
  }

  const waitingRoom = document.getElementById('arenaWaitingRoom');
  const battleView = document.getElementById('arenaBattleView');
  const resultsView = document.getElementById('arenaResultsView');

  if (waitingRoom) waitingRoom.style.display = 'block';
  if (battleView) battleView.style.display = 'none';
  if (resultsView) resultsView.style.display = 'none';

  if (currentArenaRoom) {
    renderWaitingRoster(currentArenaRoom.players, currentArenaRoom.hostId);
  }
}

function leaveArenaRoom() {
  if (typeof window.setArenaBattleCoachLock === 'function') {
    window.setArenaBattleCoachLock(false);
  }

  if (arenaSocket && currentArenaRoom) {
    arenaSocket.emit('leave-room', { roomId: currentArenaRoom.roomId });
  }
  currentArenaRoom = null;
  clearInterval(arenaTimerInterval);

  const mainLobby = document.getElementById('arenaMainLobby');
  const activeRoom = document.getElementById('arenaRoomActive');
  if (mainLobby) mainLobby.style.display = 'block';
  if (activeRoom) activeRoom.style.display = 'none';

  fetchPublicLobbies();
}

function joinArenaRoom(roomId, passcode) {
  ensureArenaSocket();
  if (!arenaSocket) return;

  const playerInfo = {
    username: currentUser || 'Scholar',
    playerTag: getScholarPlayerTag(),
    avatar: getScholarAvatar()
  };

  const errorBox = document.getElementById('arenaPrivateError');
  if (errorBox) errorBox.style.display = 'none';

  arenaSocket.emit('join-room', {
    roomId: roomId.toString().trim(),
    passcode: passcode ? passcode.toString().trim() : null,
    playerInfo
  });
}

function createArenaRoom() {
  ensureArenaSocket();
  if (!arenaSocket) return;

  const visRadio = document.querySelector('input[name="arenaVisibility"]:checked');
  const isPrivate = (visRadio?.value === 'private');

  const subject = document.getElementById('arenaSubjectSelect')?.value || 'All';
  const subtopic = document.getElementById('arenaTopicSelect')?.value || 'All';
  const format = document.getElementById('arenaFormatSelect')?.value || 'mix';
  const count = parseInt(document.getElementById('arenaCountSelect')?.value) || 5;
  const timer = parseInt(document.getElementById('arenaTimerSelect')?.value) || 180;
  const maxPlayers = parseInt(document.getElementById('arenaMaxPlayersSelect')?.value) || 4;

  const playerInfo = {
    username: currentUser || 'Scholar',
    playerTag: getScholarPlayerTag(),
    avatar: getScholarAvatar()
  };

  arenaSocket.emit('create-room', {
    isPrivate,
    maxPlayers,
    config: { subject, subtopic, format, count, timer },
    playerInfo
  });
}

function bindArenaActionButtons() {
  // Launch Room Button
  const launchBtn = document.getElementById('arenaLaunchBtn');
  if (launchBtn && !launchBtn.dataset.bound) {
    launchBtn.dataset.bound = 'true';
    launchBtn.addEventListener('click', createArenaRoom);
  }

  // Refresh Public Lobbies Button
  const refreshBtn = document.getElementById('refreshPublicRoomsBtn');
  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = 'true';
    refreshBtn.addEventListener('click', () => {
      fetchPublicLobbies();
    });
  }

  // Join Private Room Button
  const joinPrivateBtn = document.getElementById('arenaJoinPrivateBtn');
  if (joinPrivateBtn && !joinPrivateBtn.dataset.bound) {
    joinPrivateBtn.dataset.bound = 'true';
    joinPrivateBtn.addEventListener('click', () => {
      const code = document.getElementById('privateRoomCode')?.value;
      const passcode = document.getElementById('privateRoomPasscode')?.value;
      const errorBox = document.getElementById('arenaPrivateError');

      if (!code || !passcode) {
        if (errorBox) {
          errorBox.textContent = 'Please enter both the 4-digit Room Code and 6-digit PIN.';
          errorBox.style.display = 'block';
        }
        return;
      }
      joinArenaRoom(code, passcode);
    });
  }

  // Copy Passcode in Waiting Room
  const copyPassBtn = document.getElementById('copyPasscodeBtn');
  if (copyPassBtn && !copyPassBtn.dataset.bound) {
    copyPassBtn.dataset.bound = 'true';
    copyPassBtn.addEventListener('click', () => {
      const pass = currentArenaRoom?.passcode;
      if (!pass) return;
      navigator.clipboard.writeText(pass).then(() => {
        copyPassBtn.textContent = '✓';
        setTimeout(() => copyPassBtn.textContent = '📋', 1500);
      }).catch(() => {
        prompt('Secret Passcode:', pass);
      });
    });
  }

  // Leave Room Button
  const leaveBtn = document.getElementById('arenaLeaveRoomBtn');
  if (leaveBtn && !leaveBtn.dataset.bound) {
    leaveBtn.dataset.bound = 'true';
    leaveBtn.addEventListener('click', leaveArenaRoom);
  }

  // Ready Toggle Button
  const readyBtn = document.getElementById('arenaReadyToggleBtn');
  if (readyBtn && !readyBtn.dataset.bound) {
    readyBtn.dataset.bound = 'true';
    readyBtn.addEventListener('click', () => {
      if (arenaSocket && currentArenaRoom) {
        arenaSocket.emit('toggle-ready', { roomId: currentArenaRoom.roomId });
      }
    });
  }

  // Start Battle Button (Host)
  const startBtn = document.getElementById('arenaStartBattleBtn');
  if (startBtn && !startBtn.dataset.bound) {
    startBtn.dataset.bound = 'true';
    startBtn.addEventListener('click', () => {
      if (arenaSocket && currentArenaRoom) {
        startBtn.disabled = true;
        startBtn.textContent = '⏳ Preparing Arena...';
        arenaSocket.emit('start-battle', { roomId: currentArenaRoom.roomId });
      }
    });
  }

  // Return to Lobby Button
  const returnBtn = document.getElementById('arenaReturnLobbyBtn');
  if (returnBtn && !returnBtn.dataset.bound) {
    returnBtn.dataset.bound = 'true';
    returnBtn.addEventListener('click', leaveArenaRoom);
  }

  // Rematch Button
  const rematchBtn = document.getElementById('arenaRematchBtn');
  if (rematchBtn && !rematchBtn.dataset.bound) {
    rematchBtn.dataset.bound = 'true';
    rematchBtn.addEventListener('click', () => {
      if (arenaSocket && currentArenaRoom) {
        arenaSocket.emit('rematch-battle', { roomId: currentArenaRoom.roomId });
      }
    });
  }
}

function initArena() {
  initArenaIdentity();
  setupArenaTabs();
  populateArenaSubjectsAndTopics();
  setupPublicLobbiesSearchAndFilters();
  setupArenaVisibilityPicker();
  bindArenaActionButtons();
  ensureArenaSocket();
  fetchPublicLobbies();
}

window.initArena = initArena;