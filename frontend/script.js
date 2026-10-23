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

    if (!select) return;
    
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
  if (window.innerWidth <= 1024) {
    document.body.classList.toggle('sidebar-open');
  } else {
    const layout = document.getElementById('appLayout') || document.querySelector('.app-layout');
    const edgeBtn = document.getElementById('sidebarEdgeToggleBtn');
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
}

window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;

if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);
if (sidebarEdgeToggleBtn) sidebarEdgeToggleBtn.addEventListener('click', toggleSidebar);
if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

window.switchActiveTab = function(tabName) {
  if (!tabName) return;
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

  const TOPIC_ICONS = {
    Math: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 19h16M4 5h16M7 5l5 14M17 5l-5 14"/></svg>`,
    Physics: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)"/></svg>`,
    Chemistry: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10 2v7.31L4.1 19.34A2 2 0 0 0 5.76 22h12.48a2 2 0 0 0 1.66-2.66L14 9.31V2h-4z"/><line x1="8.5" y1="2" x2="15.5" y2="2"/></svg>`,
    Biology: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/><path d="M17 6l3-3"/><path d="M4 21l3-3"/></svg>`
  };
  const defaultIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;

  const TOPIC_NAMES = {
    Math: "Mathematics",
    Physics: "Physics",
    Chemistry: "Chemistry",
    Biology: "Biology"
  };

  el.innerHTML = TOPICS.map(t => {
    const pct = Math.round((w[t] / maxW) * 100);
    const isWeak = t === weakest && weaknessTracker[t] && weaknessTracker[t].total > 0;
    const color = TOPIC_COLOR[t] || "var(--ink)";
    const icon = TOPIC_ICONS[t] || defaultIcon;
    const name = TOPIC_NAMES[t] || t;
    
    let priorityBadge = '';
    if (isWeak) {
      priorityBadge = `<span class="fm-priority-chip chip-weakest">🔥 Focus Area</span>`;
    } else if (pct >= 80) {
      priorityBadge = `<span class="fm-priority-chip chip-active">⚡ Active Weight</span>`;
    } else {
      priorityBadge = `<span class="fm-priority-chip chip-balanced">⚖️ Balanced</span>`;
    }

    return `
      <div class="focus-meter-row-item ${isWeak ? 'weakest-topic' : ''}">
        <div class="fm-item-top">
          <div class="fm-subject-wrap">
            <span class="fm-subject-icon-box" style="color:${color}; background:${color}18; border-color:${color}33;">
              ${icon}
            </span>
            <span class="fm-subject-label" style="color:var(--ink);">${name}</span>
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
  badge.style.color = TOPIC_COLOR[q.topic] || "#000";
  
  const subBadge = document.getElementById('qSubtopicBadge');
  if(q.subtopic) {
    subBadge.style.display = 'inline-block';
    subBadge.textContent = q.subtopic;
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
    <div class="before-after">
      <div><div class="ba-label">Before this quiz</div>${renderMiniBars(beforeAfterSnapshot.before)}</div>
      <div class="arrow">➜</div>
      <div><div class="ba-label">After this quiz</div>${renderMiniBars(beforeAfterSnapshot.after)}</div>
    </div>
    <div style="margin-top:18px; padding:12px 14px; background:var(--paper-2); border-radius:8px; font-size:13px;">
      <b>Coach's read:</b> your next quiz will lean toward <b style="color:var(--red-soft)">${weak[0].topic}</b>${weak[1]?`, then ${weak[1].topic}`:''} — that's where practice will help most.
    </div>
    <div class="quiz-actions" style="justify-content:center; margin-top:18px;">
      <button class="btn secondary" id="viewDashBtn">View Dashboard →</button>
      <button class="btn" id="quizAgainBtn">Start Another Quiz</button>
    </div>
  `;
  document.getElementById('quizAgainBtn').addEventListener('click', ()=> startQuiz(getQuizConfig(),false));
  document.getElementById('viewDashBtn').addEventListener('click', ()=> document.querySelector('nav.tabs button[data-tab=dashboard]').click());
  updateStats();
  renderFocusMeter();
}

function renderMiniBars(weights){
  const maxW = Math.max(...Object.values(weights));
  return `<div style="display:flex; gap:8px; align-items:flex-end; height:90px; justify-content:center;">
    ${TOPICS.map(t=>{
      const h = Math.max(8, Math.round((weights[t]/maxW)*80));
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
        <div style="width:26px;height:${h}px;background:${TOPIC_COLOR[t]};border-radius:4px 4px 0 0;"></div>
        <span style="font-size:10px;font-weight:700;color:var(--ink-soft);">${t.slice(0,4)}</span>
      </div>`;
    }).join('')}
  </div>`;
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

window.setCoachLockState = function(locked) {
  isQuizActive = locked;
  const floatBtn = document.getElementById('coachFloatingBtn');
  const headerBtn = document.getElementById('coachHeaderBtn');
  const sidebarCoachBtn = document.getElementById('sidebarCoachBtn');
  const drawer = document.getElementById('coachDrawer');
  const helperBanner = document.querySelector('.quiz-coach-helper-banner');

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
if (sidebarCoachBtn) sidebarCoachBtn.addEventListener('click', window.toggleCoachDrawer);

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
  const accs = TOPICS.map(t=> ({t, acc: accuracy(t)}));
  const weakestTopic = getTop3Weakest()[0]?.topic;
  bc.innerHTML = accs.map(({t,acc})=>{
    const pct = acc===null? 0 : Math.round(acc*100);
    const cls = acc===null? '' : (acc>=0.7?'strong': acc<0.5?'weak':'');
    return `<div class="bar-col">
      <span class="bar-val">${acc===null?'—':pct+'%'}</span>
      <div class="bar" style="height:${acc===null?4:Math.max(6,pct*1.5)}px; background:${cls==='strong'?'var(--green)':cls==='weak'?'var(--red-soft)':'var(--ink-soft)'}"></div>
      <span class="bar-name" style="color:${TOPIC_COLOR[t]}">${t}${t===weakestTopic && weaknessTracker[t].total>0 ? ' ⚑':''}</span>
    </div>`;
  }).join('');

  const oa = overallAccuracy();
  const svg = document.getElementById('donutChart');
  const r=55,cx=70,cy=70,circ=2*Math.PI*r;
  if(oa===null){
    svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--card-border)" stroke-width="16"/>
      <text x="${cx}" y="${cy+5}" text-anchor="middle" font-size="13" fill="var(--ink-soft)" font-family="IBM Plex Mono">no data</text>`;
  } else {
    const correctLen = circ*oa;
    svg.innerHTML = `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--paper-2)" stroke-width="16"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--green)" stroke-width="16"
        stroke-dasharray="${correctLen} ${circ-correctLen}" stroke-linecap="round"
        transform="rotate(-90 ${cx} ${cy})"/>
      <text x="${cx}" y="${cy-2}" text-anchor="middle" font-size="22" font-weight="700" fill="var(--ink)" font-family="IBM Plex Mono">${Math.round(oa*100)}%</text>
      <text x="${cx}" y="${cy+16}" text-anchor="middle" font-size="10" fill="var(--ink-soft)" font-family="IBM Plex Sans">accuracy</text>
    `;
  }
  document.getElementById('donutLegend').innerHTML = `
    <div><span class="dot" style="background:var(--green)"></span>Correct: <b>${TOPICS.reduce((s,t)=>s+weaknessTracker[t].correct,0)}</b></div>
    <div><span class="dot" style="background:var(--paper-2); border:1px solid var(--card-border)"></span>Incorrect: <b>${TOPICS.reduce((s,t)=>s+(weaknessTracker[t].total-weaknessTracker[t].correct),0)}</b></div>
    <div><span class="dot" style="background:var(--ink-soft)"></span>Total answered: <b>${totalAnswered()}</b></div>
  `;

  const baWrap = document.getElementById('beforeAfterChart');
  if(!beforeAfterSnapshot){
    baWrap.innerHTML = `<div class="empty"><div class="big">📈</div>Complete a quiz to see the focus shift visualised here.</div>`;
  } else {
    baWrap.innerHTML = `<div class="before-after">
      <div><div class="ba-label">Before</div>${renderMiniBars(beforeAfterSnapshot.before)}</div>
      <div class="arrow">➜</div>
      <div><div class="ba-label">After</div>${renderMiniBars(beforeAfterSnapshot.after)}</div>
    </div>`;
  }

  const weak = getTop3Weakest();
  document.getElementById('weakList').innerHTML = weak.map((w,i)=>`
    <li><span><span class="rank">#${i+1}</span>${w.topic}</span>
    <span>${w.total>0? fmt(w.acc)+' accuracy · '+w.total+' answered' : 'no data yet'}</span></li>`).join('');

  updateStats();
}

function updateStats(){
  document.getElementById('statQuizzes').textContent = quizHistory.length;
  const oa = overallAccuracy();
  document.getElementById('statAccuracy').textContent = oa===null ? '—' : fmt(oa);
  document.getElementById('statAnswered').textContent = totalAnswered();
  const weak = getTop3Weakest();
  document.getElementById('statWeakest').textContent = weak[0] && weak[0].total>0 ? weak[0].topic : '—';
}

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
    const isExplicitLogin = urlParams.get('login') === 'true' || urlParams.get('auth') === 'login';

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

// ================= MULTIPLAYER ARENA LOGIC =================
const socket = io(BACKEND_URL);
let currentArenaRoom = null;
let arenaQuestions = [];
let currentArenaQ = 0;

document.getElementById('arenaCreateBtn').addEventListener('click', () => {
    socket.emit('create-room');
});

document.getElementById('arenaJoinBtn').addEventListener('click', () => {
    const code = document.getElementById('arenaRoomCode').value.trim();
    if (code.length === 4) {
        socket.emit('join-room', code);
    }
});

socket.on('room-created', (roomId) => {
    currentArenaRoom = roomId;
    document.getElementById('arenaSetup').style.display = 'none';
    document.getElementById('arenaGame').style.display = 'block';
    document.getElementById('arenaCurrentRoom').textContent = roomId;
});

socket.on('player-joined', (count) => {
    if (!currentArenaRoom) {
        currentArenaRoom = document.getElementById('arenaRoomCode').value.trim();
        document.getElementById('arenaSetup').style.display = 'none';
        document.getElementById('arenaGame').style.display = 'block';
        document.getElementById('arenaCurrentRoom').textContent = currentArenaRoom;
    }
});

socket.on('game-generating', () => {
    document.getElementById('arenaWaiting').innerHTML = "⚙️ AI is generating battle questions... Get ready!";
});

socket.on('game-start', (questions) => {
    setCoachLockState(true);
    arenaQuestions = questions;
    currentArenaQ = 0;
    
    document.getElementById('arenaWaiting').style.display = 'none';
    document.getElementById('arenaQuiz').style.display = 'block';
    
    renderArenaQuestion();
});

socket.on('score-update', (data) => {
    const myPlayer = data.players.find(p => p.id === socket.id);
    const oppPlayer = data.players.find(p => p.id !== socket.id);
    
    if (myPlayer) {
        document.getElementById('arenaMyScore').textContent = myPlayer.score;
        document.getElementById('arenaMyProgress').style.width = (myPlayer.progress / 5 * 100) + '%';
    }
    if (oppPlayer) {
        document.getElementById('arenaOppScore').textContent = oppPlayer.score;
        document.getElementById('arenaOppProgress').style.width = (oppPlayer.progress / 5 * 100) + '%';
    }
});

socket.on('opponent-disconnected', () => {
    alert("Opponent disconnected. You win!");
    addXP(100);
    resetArena();
});

socket.on('room-error', (msg) => {
    const st = document.getElementById('arenaStatus');
    st.textContent = msg;
    st.style.display = 'block';
});

function renderArenaQuestion() {
    if (currentArenaQ >= arenaQuestions.length) {
        document.getElementById('arenaQuiz').innerHTML = `<div style="text-align:center; padding:20px; font-size:24px; color:var(--gold);">Battle Complete!</div>`;
        addXP(50);
        setTimeout(resetArena, 4000);
        return;
    }
    
    const q = arenaQuestions[currentArenaQ];
    document.getElementById('aqProgress').textContent = `Question ${currentArenaQ + 1} / 5`;
    document.getElementById('aqText').innerHTML = marked.parse(q.q || q.question || "");
    
    // Shuffle options
    let opts = q.o ? [...q.o] : [];
    opts.sort(() => Math.random() - 0.5);
    
    const optsHtml = opts.map((opt, i) => `<button class="opt" id="aqOpt${i}" onclick="submitArenaAnswer('${opt}', ${i}, '${q.a}')">${marked.parse(opt || '').replace(/<p>|<\/p>/g,'')}</button>`).join('');
    document.getElementById('aqOptions').innerHTML = optsHtml;
    document.getElementById('aqExplain').style.display = 'none';
    if(window.MathJax) MathJax.typesetPromise();
}

window.submitArenaAnswer = function(selected, idx, correct) {
    const isCorrect = (selected === correct);
    socket.emit('submit-answer', { roomId: currentArenaRoom, qIndex: currentArenaQ, isCorrect });
    
    const btns = document.getElementById('aqOptions').querySelectorAll('.opt');
    btns.forEach(b => b.disabled = true);
    
    document.getElementById(`aqOpt${idx}`).classList.add(isCorrect ? 'correct' : 'wrong');
    
    if(isCorrect) addXP(20);
    
    setTimeout(() => {
        currentArenaQ++;
        renderArenaQuestion();
    }, 1500);
};

function resetArena() {
    setCoachLockState(false);
    currentArenaRoom = null;
    arenaQuestions = [];
    document.getElementById('arenaSetup').style.display = 'block';
    document.getElementById('arenaGame').style.display = 'none';
    document.getElementById('arenaQuiz').style.display = 'none';
    document.getElementById('arenaQuiz').innerHTML = `
        <div id="aqProgress" class="q-progress">Question 1 / 5</div>
        <div id="aqText" class="q-text" style="font-size:18px;"></div>
        <div id="aqOptions" class="options"></div>
        <div id="aqExplain" class="explain-box"></div>
    `;
    document.getElementById('arenaWaiting').style.display = 'block';
    document.getElementById('arenaWaiting').innerHTML = "⏳ Waiting for opponent to join...";
    document.getElementById('arenaMyScore').textContent = '0';
    document.getElementById('arenaOppScore').textContent = '0';
    document.getElementById('arenaMyProgress').style.width = '0%';
    document.getElementById('arenaOppProgress').style.width = '0%';
}

// Auth UI Events
document.getElementById('showRegister').onclick = (e) => { e.preventDefault(); document.getElementById('loginForm').style.display = 'none'; document.getElementById('registerForm').style.display = 'block'; document.getElementById('authError').style.display = 'none'; };
document.getElementById('showLogin').onclick = (e) => { e.preventDefault(); document.getElementById('registerForm').style.display = 'none'; document.getElementById('loginForm').style.display = 'block'; document.getElementById('authError').style.display = 'none'; };

function showError(msg) {
    const err = document.getElementById('authError');
    err.textContent = msg;
    err.style.display = 'block';
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
    document.getElementById('profileDisplayUsername').textContent = currentUser;
    document.getElementById('profileDisplayEmail').textContent = userEmail || 'No email provided';
    document.getElementById('profileDisplayGradeText').textContent = userGrade;
    document.getElementById('profileDisplayExamText').textContent = targetExam;
    document.getElementById('profileDisplaySyllabusText').textContent = customSyllabusName || 'None';
    document.getElementById('profileViewMode').style.display = 'block';
    document.getElementById('editProfileBtn').style.display = 'block';
    document.getElementById('profileEditMode').style.display = 'none';
    document.getElementById('profileOverlay').style.display = 'flex';
}
const welcomeUserBtn = document.getElementById('welcomeUserBtn');
if (welcomeUserBtn) welcomeUserBtn.onclick = openCandidateProfileModal;
const sidebarProfileCard = document.getElementById('sidebarProfileCard');
if (sidebarProfileCard) sidebarProfileCard.onclick = openCandidateProfileModal;

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
        }
    } catch (e) {
        statusDiv.textContent = 'Failed to upload syllabus.';
        statusDiv.style.color = 'var(--accent-red)';
    }
};