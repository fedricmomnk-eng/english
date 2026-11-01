/* ==========================================================================
   1) الإعدادات والمتغيرات الأساسية (كانت مفقودة وتسبب الشاشة البيضاء)
   ========================================================================== */
const $view = document.getElementById('view');
let cur = { view: 'home', unitIndex: null, tab: 'pron' };
let lessonState = null;
let testState = null;
let activeRec = null;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

// بيانات تجريبية للكورس (يجب استبدالها ببياناتك الحقيقية)
const COURSE = {
  passingScore: 70,
  lessonSeconds: 300, // 5 دقائق
  glossary: {
    "hello": "مرحباً",
    "world": "عالم",
    "learn": "يتعلم",
    "english": "الإنجليزية"
  },
  units: [
    {
      id: "u1",
      name: "الوحدة الأولى: الأساسيات",
      nameEn: "Unit 1: Basics",
      pronunciation: [
        { text: "Hello world", ar: "مرحباً بالعالم" },
        { text: "I learn English", ar: "أنا أتعلم الإنجليزية" }
      ],
      lesson: {
        title: "الدرس الأول",
        summary: ["تعلمنا التحيات", "تعلمنا الضمائر"],
        activities: [
          { type: "vocab", emoji: "👋", ar: "مرحباً", answer: "Hello", options: ["Hello", "Bye", "Good"] },
          { type: "order", words: ["I", "learn", "English"], answer: "I learn English" },
          { type: "mcq", question: "ماذا تعني كلمة World؟", answer: 1, options: ["شمس", "عالم", "قمر"] }
        ]
      },
      readings: [
        { 
          id: "r1", 
          title: "النص الأول", 
          level: "مبتدئ", 
          text: "Hello world. I learn English." 
        }
      ],
      voiceTest: ["Hello world", "I learn English"]
    }
  ]
};

// دوال مساعدة
function esc(str) { return String(str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function shuffle(arr) { return arr.sort(() => Math.random() - 0.5); }
function fmtTime(sec) { const m = Math.floor(sec/60); const s = sec%60; return `${m}:${s<10?'0':''}${s}`; }
function speak(text, rate = 1) {
  if (!window.speechSynthesis) return;
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-US'; utt.rate = rate;
  window.speechSynthesis.speak(utt);
}
function tipFor(score) {
  if (score >= 90) return "ممتاز! نطق رائع.";
  if (score >= 70) return "جيد جداً، استمر!";
  return "حاول مرة أخرى بصوت أوضح.";
}

// إدارة الحفظ والتقدم
function pget(id) {
  try {
    const data = localStorage.getItem('progress_' + id);
    if (data) return JSON.parse(data);
  } catch(e) {}
  return { pron: {}, readings: {}, lesson: false, passed: false, voiceTest: null };
}
function saveProgress() {
  if (cur.unitIndex === null) return;
  try {
    const id = COURSE.units[cur.unitIndex].id;
    localStorage.setItem('progress_' + id, JSON.stringify(pget(id)));
  } catch(e) {}
}

// مقارنة النطق
function compareText(targetText, spokenText) {
  const targetWords = targetText.toLowerCase().replace(/[.,!?]/g, '').split(/\s+/);
  const spokenWords = spokenText.toLowerCase().replace(/[.,!?]/g, '').split(/\s+/);
  let correct = 0;
  const flags = targetWords.map(tw => {
    const found = spokenWords.includes(tw);
    if (found) correct++;
    return found;
  });
  return { percent: Math.round((correct/targetWords.length)*100), correct, total: targetWords.length, flags };
}

/* ==========================================================================
   2) الراوتر الأساسي (موجه الصفحات)
   ========================================================================== */
function renderApp() {
  if (!cur.view) cur.view = 'home';
  if (cur.view === 'home') {
    renderHome();
  } else if (cur.view === 'unit') {
    renderUnitView();
  }
}
window.goHome = function() { cur.view = 'home'; renderApp(); };

/* ==========================================================================
   3) الشاشة الرئيسية (تكملة renderHome)
   ========================================================================== */
function renderHome() {
  let html = `<h2 style="text-align:center; margin-bottom: 20px;">اختر الوحدة للبدء</h2><div style="display: grid; gap: 15px;">`;
  
  COURSE.units.forEach((u, i) => {
    const p = pget(u.id);
    const passedIcon = p.passed ? '✅' : '⏳';
    html += `
      <div class="card" style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; background: white;">
        <h3 style="margin-top: 0;">${esc(u.name)} ${passedIcon}</h3>
        <p style="color: #666; font-size: 14px;" class="ltr">${esc(u.nameEn)}</p>
        <button class="btn primary" data-unit="${i}" style="background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">دخول الوحدة</button>
      </div>
    `;
  });
  
  html += `</div>`;
  $view.innerHTML = html;
  
  $view.querySelectorAll('[data-unit]').forEach(b => {
    b.onclick = () => {
      cur.view = "unit";
      cur.unitIndex = +b.dataset.unit;
      cur.tab = "pron";
      renderApp();
    };
  });
}

/* ==========================================================================
   4) شاشة الوحدة (تبويبات)
   ========================================================================== */
function resetLesson() {
  if (lessonState && lessonState.timerId) clearInterval(lessonState.timerId);
  lessonState = null;
}

function renderUnitView() {
  const u = COURSE.units[cur.unitIndex];
  const p = pget(u.id);

  const tabs = [
    { id: "pron", label: "🗣️ النطق" },
    { id: "lesson", label: "📘 الدرس" },
    { id: "reading", label: "📖 القراءة" },
    { id: "test", label: "🎤 الاختبار" },
    { id: "cert", label: "🏆 الشهادة" }
  ];

  $view.innerHTML = `
    <div class="unit-head" style="margin-bottom: 20px; text-align: center;">
      <h1 style="margin-bottom: 5px;">${esc(u.name)}</h1>
      <span class="muted ltr" style="color: #666;">${esc(u.nameEn)}</span>
    </div>
    <div class="tabs" style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
      ${tabs.map(t => `<button class="tab ${cur.tab === t.id ? 'active' : ''}" data-tab="${t.id}" style="padding: 8px 15px; border: 1px solid #ddd; border-radius: 5px; cursor: pointer; background: ${cur.tab === t.id ? '#2563eb' : '#f8fafc'}; color: ${cur.tab === t.id ? 'white' : '#333'};">${t.label}</button>`).join('')}
    </div>
    <div id="tabBody"></div>`;

  $view.querySelectorAll('[data-tab]').forEach(b => {
    b.onclick = () => {
      if (b.dataset.tab === cur.tab) return;
      resetLesson();
      testState = null;
      cur.tab = b.dataset.tab;
      renderApp();
    };
  });

  const body = document.getElementById('tabBody');
  if (cur.tab === 'pron') renderPron(body, u, p);
  else if (cur.tab === 'lesson') renderLesson(body, u, p);
  else if (cur.tab === 'reading') renderReading(body, u, p);
  else if (cur.tab === 'test') renderTest(body, u, p);
  else if (cur.tab === 'cert') renderCert(body, u, p);
}

/* ==========================================================================
   5) تدريب النطق
   ========================================================================== */
function renderPron(body, u, p) {
  body.innerHTML = `
    <div class="card" style="border: 1px solid #ddd; padding: 15px; border-radius: 8px;">
      <h2 style="margin-top:0">🗣️ تدريب النطق</h2>
      <p class="muted" style="color: #666; font-size: 14px;">اضغط 🔊 للاستماع، ثم 🎤 لتسجيل نطقك. النتيجة تُحفظ تلقائيًا.</p>
      <div id="pronList"></div>
    </div>`;

  const list = document.getElementById('pronList');
  u.pronunciation.forEach((item, idx) => {
    const saved = p.pron[idx];
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'border: 1px solid #eee; padding: 10px; margin-bottom: 10px; border-radius: 5px;';
    card.innerHTML = `
      <div class="pron-text ltr" style="font-weight: bold; font-size: 18px;">${esc(item.text)}</div>
      <div class="pron-ar" style="color: #666; margin-bottom: 10px;">${esc(item.ar)}</div>
      <div class="row" style="display: flex; gap: 10px; align-items: center;">
        <button class="btn small" data-act="speak" style="cursor:pointer;">🔊 استمع</button>
        <button class="btn small primary" data-act="rec" style="background:#2563eb; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">🎤 تدرّب</button>
        <span class="small" data-score style="font-weight:800;color:${saved>=70?'green':'#666'}">
          ${saved != null ? 'آخر نتيجة: ' + saved + '%' : ''}
        </span>
      </div>
      <div class="fb" data-fb style="margin-top: 10px;"></div>`;
    list.appendChild(card);

    card.querySelector('[data-act="speak"]').onclick = () => speak(item.text);
    card.querySelector('[data-act="rec"]').onclick = (e) => {
      const btn = e.currentTarget;
      const fbEl = card.querySelector('[data-fb]');
      startRecognition(item.text, fbEl, btn, (score) => {
        p.pron[idx] = score;
        saveProgress();
        const scoreEl = card.querySelector('[data-score]');
        if (scoreEl) {
          scoreEl.textContent = 'آخر نتيجة: ' + score + '%';
          scoreEl.style.color = score >= 70 ? 'green' : '#666';
        }
      });
    };
  });
}

function startRecognition(targetText, fbEl, btn, onScore) {
  if (!SR) {
    fbEl.innerHTML = `<div class="tip" style="color:red">التعرّف على الصوت غير مدعوم. استخدم Google Chrome.</div>`;
    return;
  }
  if (activeRec) { try { activeRec.abort(); } catch(e){} activeRec = null; }

  const rec = new SR();
  activeRec = rec;
  rec.lang = 'en-US';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.continuous = false;

  const origLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '● جاري التسجيل...';
  fbEl.innerHTML = '';

  rec.onresult = (e) => {
    const spoken = (e.results[0][0].transcript || '').trim();
    if (!spoken) {
      fbEl.innerHTML = '<div class="tip">لم يُسمع شيء واضح. حاول بصوت أعلى.</div>';
      return;
    }
    const res = compareText(targetText, spoken);
    const score = res.percent;
    const words = targetText.split(/\s+/);
    fbEl.innerHTML = `
      <div class="said">قلت: <span class="ltr" style="color:blue">${esc(spoken)}</span></div>
      <div class="scored">${words.map((w,i) => `<span style="color:${res.flags[i] ? 'green' : 'red'}">${esc(w)}</span>`).join(' ')}</div>
      <div class="score-bar" style="background:#eee; height:10px; border-radius:5px; margin:5px 0;"><div class="score-fill" style="width:${score}%; background:${score>=70?'green':'red'}; height:100%; border-radius:5px;"></div></div>
      <div class="b"><span style="color:${score>=70?'green':'red'}">${score}%</span> — ${res.correct}/${res.total} كلمة صحيحة</div>
      <div class="tip" style="font-size:12px; color:#666;">${tipFor(score)}</div>`;
    if (typeof onScore === 'function') onScore(score);
  };
  rec.onerror = (e) => {
    if (e.error === 'aborted') return;
    fbEl.innerHTML = `<div class="tip" style="color:red">تعذّر التسجيل (${esc(e.error)}). تأكد من السماح بالميكروفون.</div>`;
  };
  rec.onend = () => {
    btn.disabled = false;
    btn.innerHTML = origLabel;
    if (activeRec === rec) activeRec = null;
  };
  try { rec.start(); } catch(e) {
    btn.disabled = false;
    btn.innerHTML = origLabel;
    fbEl.innerHTML = `<div class="tip" style="color:red">تعذّر بدء التسجيل.</div>`;
  }
}

/* ==========================================================================
   6) الدرس التفاعلي
   ========================================================================== */
function renderLesson(body, u, p) {
  if (p.lesson && !lessonState) {
    body.innerHTML = `
      <div class="card summary" style="border: 1px solid #ddd; padding: 15px; border-radius: 8px;">
        <h2 style="margin-top:0; color: green;">✅ الدرس مكتمل</h2>
        <p class="muted" style="color:#666;">يمكنك مراجعة الملخص أو إعادة الدرس.</p>
        <ul class="bullets">${u.lesson.summary.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        <div class="row" style="display:flex; gap:10px; margin-top:15px;">
          <button class="btn" id="retryLesson" style="cursor:pointer;">🔄 إعادة الدرس</button>
          <button class="btn primary" id="goReading" style="background:#2563eb; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;">التالي: القراءة ←</button>
        </div>
      </div>`;
    document.getElementById('retryLesson').onclick = () => {
      p.lesson = false; saveProgress(); lessonState = null; renderApp();
    };
    document.getElementById('goReading').onclick = () => {
      resetLesson(); cur.tab = 'reading'; renderApp();
    };
    return;
  }

  if (!lessonState) {
    lessonState = { step: 0, remaining: COURSE.lessonSeconds, timerId: null, done: false, matches: null };
    const state = lessonState;
    const capU = u, capP = p;
    state.timerId = setInterval(() => {
      if (lessonState !== state) { clearInterval(state.timerId); return; }
      state.remaining--;
      const el = document.getElementById('lessonTimer');
      if (el) el.textContent = fmtTime(state.remaining);
      if (state.remaining <= 0) {
        state.done = true;
        clearInterval(state.timerId);
        finishLesson(capU, capP);
      }
    }, 1000);
  }

  if (lessonState.done) { renderLessonSummary(body, u, p); return; }
  renderLessonStep(body, u, p);
}

function renderLessonStep(body, u, p) {
  const acts = u.lesson.activities;
  if (lessonState.step >= acts.length) { finishLesson(u, p); return; }
  const act = acts[lessonState.step];
  const pct = Math.round((lessonState.step / acts.length) * 100);

  body.innerHTML = `
    <div class="card" style="border: 1px solid #ddd; padding: 15px; border-radius: 8px;">
      <div class="lesson-top" style="display:flex; justify-content:space-between; margin-bottom:10px;">
        <span>${esc(u.lesson.title)} — ${lessonState.step + 1}/${acts.length}</span>
        <span class="timer" id="lessonTimer" style="color:red; font-weight:bold;">${fmtTime(lessonState.remaining)}</span>
      </div>
      <div class="progress" style="background:#eee; height:8px; border-radius:4px; margin-bottom:20px;"><div class="progress-fill" style="width:${pct}%; background:green; height:100%; border-radius:4px;"></div></div>
      <div id="actWrap"></div>
    </div>`;

  const wrap = document.getElementById('actWrap');
  if (act.type === 'vocab') renderVocabAct(wrap, act, u, p);
  else if (act.type === 'order') renderOrderAct(wrap, act, u, p);
  else if (act.type === 'mcq') renderMcqAct(wrap, act, u, p);
  else if (act.type === 'match') renderMatchAct(wrap, act, u, p);
}

function advanceLesson(u, p) {
  if (!lessonState) return;
  lessonState.step++;
  lessonState.matches = null;
  if (lessonState.step >= u.lesson.activities.length) finishLesson(u, p);
  else renderApp();
}

function finishLesson(u, p) {
  if (lessonState && lessonState.timerId) clearInterval(lessonState.timerId);
  if (lessonState) lessonState.done = true;
  p.lesson = true;
  saveProgress();
  renderApp();
}

function renderLessonSummary(body, u, p) {
  body.innerHTML = `
    <div class="card summary" style="border: 1px solid #ddd; padding: 15px; border-radius: 8px;">
      <h2 style="margin-top:0; color:green;">🎉 أحسنت! أكملت الدرس</h2>
      <ul class="bullets">${u.lesson.summary.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
      <button class="btn primary" id="nextToReading" style="background:#2563eb; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;">التالي: القراءة ←</button>
    </div>`;
  document.getElementById('nextToReading').onclick = () => {
    resetLesson(); cur.tab = 'reading'; renderApp();
  };
}

/* -------- أنواع الأنشطة -------- */
function renderVocabAct(wrap, act, u, p) {
  wrap.innerHTML = `
    <div class="emoji" style="font-size:50px; text-align:center;">${act.emoji}</div>
    <p class="q" style="text-align:center; font-weight:bold;">${esc(act.ar)}</p>
    <div class="options" id="opts" style="display:flex; flex-direction:column; gap:10px;"></div>`;
  const opts = document.getElementById('opts');
  act.options.forEach(opt => {
    const b = document.createElement('button');
    b.className = 'btn option';
    b.style.cssText = 'padding:10px; border:1px solid #ddd; border-radius:5px; cursor:pointer;';
    b.textContent = opt;
    b.onclick = () => {
      if (b.disabled) return;
      if (opt === act.answer) {
        b.style.background = '#dcfce7'; b.style.color = 'green'; b.style.borderColor = 'green';
        opts.querySelectorAll('button').forEach(x => x.disabled = true);
        setTimeout(() => advanceLesson(u, p), 500);
      } else {
        b.style.background = '#fee2e2'; b.style.color = 'red'; b.style.borderColor = 'red';
        b.disabled = true;
      }
    };
    opts.appendChild(b);
  });
}

function renderOrderAct(wrap, act, u, p) {
  const shuffled = shuffle([...act.words]);
  const answer = [];
  wrap.innerHTML = `
    <p class="q" style="font-weight:bold;">رتّب الكلمات لتكوين جملة صحيحة:</p>
    <div class="answer-area ltr" id="ansArea" style="min-height:40px; border:2px dashed #ccc; padding:10px; border-radius:5px; margin-bottom:10px; display:flex; gap:5px; flex-wrap:wrap;"></div>
    <div class="pool ltr" id="pool" style="display:flex; gap:5px; flex-wrap:wrap; margin-bottom:15px;"></div>
    <button class="btn primary block" id="submitOrder" disabled style="width:100%; padding:10px; background:#2563eb; color:white; border:none; border-radius:5px; cursor:pointer;">تحقق ✓</button>
    <div class="fb" id="orderFb" style="margin-top:10px;"></div>`;

  const ansArea = document.getElementById('ansArea');
  const pool = document.getElementById('pool');
  const submitBtn = document.getElementById('submitOrder');

  function render() {
    ansArea.innerHTML = '';
    if (!answer.length) ansArea.innerHTML = '<span style="color:#999;">اضغط الكلمات بالأسفل لإضافتها</span>';
    else {
      answer.forEach((w, i) => {
        const c = document.createElement('button');
        c.style.cssText = 'padding:5px 10px; background:#e2e8f0; border:1px solid #cbd5e1; border-radius:5px; cursor:pointer;';
        c.textContent = w;
        c.onclick = () => { answer.splice(i, 1); render(); };
        ansArea.appendChild(c);
      });
    }
    pool.innerHTML = '';
    shuffled.forEach(w => {
      const used = answer.filter(x => x === w).length;
      const total = act.words.filter(x => x === w).length;
      if (used >= total) return;
      const c = document.createElement('button');
      c.style.cssText = 'padding:5px 10px; background:#e2e8f0; border:1px solid #cbd5e1; border-radius:5px; cursor:pointer;';
      c.textContent = w;
      c.onclick = () => { answer.push(w); render(); };
      pool.appendChild(c);
    });
    submitBtn.disabled = answer.length !== act.words.length;
    submitBtn.style.opacity = submitBtn.disabled ? '0.5' : '1';
  }

  submitBtn.onclick = () => {
    const built = answer.join(' ').replace(/\s+/g, ' ').trim().replace(/\.$/, '').toLowerCase();
    const target = act.answer.replace(/\s+/g, ' ').trim().replace(/\.$/, '').toLowerCase();
    const fb = document.getElementById('orderFb');
    if (built === target) {
      fb.innerHTML = `<div class="tip" style="background:#dcfce7; color:green; padding:10px; border-radius:5px;">✅ صحيح! ${esc(act.answer)}</div>`;
      submitBtn.disabled = true;
      setTimeout(() => advanceLesson(u, p), 800);
    } else {
      fb.innerHTML = `<div class="tip" style="background:#fee2e2; color:red; padding:10px; border-radius:5px;">❌ ليس تمامًا. جرّب ترتيبًا آخر.</div>`;
    }
  };
  render();
}

function renderMcqAct(wrap, act, u, p) {
  wrap.innerHTML = `
    <p class="q" style="font-weight:bold;">${esc(act.question)}</p>
    <div class="options" id="opts" style="display:flex; flex-direction:column; gap:10px;"></div>`;
  const opts = document.getElementById('opts');
  act.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.className = 'btn option';
    b.style.cssText = 'padding:10px; border:1px solid #ddd; border-radius:5px; cursor:pointer;';
    b.textContent = opt;
    b.onclick = () => {
      if (b.disabled) return;
      if (i === act.answer) {
        b.style.background = '#dcfce7'; b.style.color = 'green'; b.style.borderColor = 'green';
        opts.querySelectorAll('button').forEach(x => x.disabled = true);
        setTimeout(() => advanceLesson(u, p), 500);
      } else {
        b.style.background = '#fee2e2'; b.style.color = 'red'; b.style.borderColor = 'red';
        b.disabled = true;
      }
    };
    opts.appendChild(b);
  });
}

function renderMatchAct(wrap, act, u, p) {
  if (!lessonState.matches || lessonState.matches.length !== act.pairs.length) {
    lessonState.matches = act.pairs.map(() => false);
  }
  const leftItems = act.pairs.map((pr, i) => ({ i, text: pr[0] }));
  const rightItems = shuffle(act.pairs.map((pr, i) => ({ i, text: pr[1] })));
  let selectedLeft = null;

  wrap.innerHTML = `
    <p class="q" style="font-weight:bold;">وصّل الكلمة الإنجليزية بمعناها:</p>
    <div class="match-wrap" style="display:flex; gap:20px; justify-content:space-between;">
      <div class="match-col" id="leftCol" style="display:flex; flex-direction:column; gap:10px; width:45%;"></div>
      <div class="match-col" id="rightCol" style="display:flex; flex-direction:column; gap:10px; width:45%;"></div>
    </div>
    <div class="fb" id="matchFb" style="margin-top:10px;"></div>`;

  const leftCol = document.getElementById('leftCol');
  const rightCol = document.getElementById('rightCol');

  function render() {
    leftCol.innerHTML = '';
    rightCol.innerHTML = '';

    leftItems.forEach(item => {
      const b = document.createElement('button');
      b.style.cssText = `padding:10px; border:1px solid #ddd; border-radius:5px; cursor:pointer; background: ${lessonState.matches[item.i] ? '#dcfce7' : (selectedLeft === item.i ? '#bfdbfe' : 'white')};`;
      b.textContent = item.text;
      b.disabled = lessonState.matches[item.i];
      b.onclick = () => {
        if (lessonState.matches[item.i]) return;
        selectedLeft = (selectedLeft === item.i) ? null : item.i;
        render();
      };
      leftCol.appendChild(b);
    });

    rightItems.forEach(item => {
      const b = document.createElement('button');
      b.style.cssText = `padding:10px; border:1px solid #ddd; border-radius:5px; cursor:pointer; background: ${lessonState.matches[item.i] ? '#dcfce7' : 'white'};`;
      b.textContent = item.text;
      b.disabled = lessonState.matches[item.i];
      b.onclick = () => {
        if (lessonState.matches[item.i] || selectedLeft === null) return;
        if (selectedLeft === item.i) {
          lessonState.matches[item.i] = true;
          selectedLeft = null;
          render();
          if (lessonState.matches.every(x => x)) setTimeout(() => advanceLesson(u, p), 500);
        } else {
          selectedLeft = null;
          render();
          const fb = document.getElementById('matchFb');
          if (fb) {
            fb.innerHTML = '<div class="tip" style="color:red;">❌ غير صحيح، حاول مرة أخرى.</div>';
            setTimeout(() => { const e = document.getElementById('matchFb'); if (e) e.innerHTML = ''; }, 1200);
          }
        }
      };
      rightCol.appendChild(b);
    });
  }
  render();
}

/* ==========================================================================
   7) القراءة التفاعلية
   ========================================================================== */
function renderReading(body, u, p) {
  body.innerHTML = `
    <div class="card" style="border: 1px solid #ddd; padding: 15px; border-radius: 8px;">
      <h2 style="margin-top:0">📖 القراءة</h2>
      <p class="muted" style="color:#666; font-size:14px;">اختر نصًا، اضغط على أي كلمة لرؤية معناها، ثم اقرأ النص بصوتك.</p>
      <div class="tabs" id="readTabs" style="display:flex; gap:10px; margin-bottom:15px;">
        ${u.readings.map((r, i) =>
          `<button class="tab ${i === 0 ? 'active' : ''}" data-ridx="${i}" style="padding:5px 10px; border:1px solid #ddd; border-radius:5px; cursor:pointer; background:${i===0?'#2563eb':'white'}; color:${i===0?'white':'black'};">
             ${esc(r.title)} <span style="font-size:12px; opacity:0.8;">(${esc(r.level)})</span>
           </button>`
        ).join('')}
      </div>
      <div id="readContent"></div>
    </div>`;

  const tabs = document.querySelectorAll('[data-ridx]');
  tabs.forEach(t => {
    t.onclick = () => {
      tabs.forEach(x => { x.style.background = 'white'; x.style.color = 'black'; });
      t.style.background = '#2563eb'; t.style.color = 'white';
      renderReadPassage(document.getElementById('readContent'), u, p, +t.dataset.ridx);
    };
  });
  renderReadPassage(document.getElementById('readContent'), u, p, 0);
}

function renderReadPassage(wrap, u, p, idx) {
  const r = u.readings[idx];
  const tokens = r.text.split(/(\s+)/);
  let wordIdx = 0;
  const html = tokens.map(w => {
    if (/^\s+$/.test(w)) return w;
    const clean = w.replace(/[^a-zA-Z']/g, '').toLowerCase();
    const punct = (w.match(/[.,!?;:]+$/) || [''])[0];
    const core = w.replace(/[.,!?;:]+$/, '');
    return `<span class="pw ltr" data-word="${esc(clean)}" data-idx="${wordIdx++}" style="cursor:pointer; border-bottom:1px dashed #999;">${esc(core)}</span>${esc(punct)}`;
  }).join('');

  const matched = p.readings[r.id] || {};

  wrap.innerHTML = `
    <div class="trans-box" id="transBox" style="background:#f1f5f9; padding:10px; border-radius:5px; margin-bottom:10px; font-weight:bold;">👆 اضغط على أي كلمة لرؤية معناها</div>
    <div class="passage ltr" style="line-height:2; font-size:18px; margin-bottom:15px;">${html}</div>
    <div class="row" style="display:flex; gap:10px;">
      <button class="btn small" id="readAloud" style="cursor:pointer;">🔊 اسمع النص</button>
      <button class="btn small primary" id="readPractice" style="background:#2563eb; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">🎤 اقرأ بصوتك</button>
    </div>
    <div class="fb" id="readFb" style="margin-top:10px;"></div>`;

  wrap.querySelectorAll('.pw').forEach(el => {
    if (matched[el.dataset.idx]) el.style.background = '#fef08a';
    el.onclick = () => {
      const w = el.dataset.word;
      const meaning = COURSE.glossary[w] || '—';
      const box = document.getElementById('transBox');
      box.innerHTML = `<span class="ltr"><b>${esc(w)}</b></span> ← <span>${esc(meaning)}</span>`;
      matched[el.dataset.idx] = true;
      p.readings[r.id] = matched;
      saveProgress();
      el.style.background = '#fef08a';
    };
  });

  document.getElementById('readAloud').onclick = () => speak(r.text, 0.9);
  document.getElementById('readPractice').onclick = () => {
    startRecognition(r.text, document.getElementById('readFb'), document.getElementById('readPractice'), () => {});
  };
}

/* ==========================================================================
   8) الاختبار الصوتي
   ========================================================================== */
function renderTest(body, u, p) {
  if (!testState) testState = { idx: 0, scores: [] };

  if (p.passed && !testState.scores.length && testState.idx === 0) {
    body.innerHTML = `
      <div class="card" style="border: 1px solid #ddd; padding: 15px; border-radius: 8px;">
        <h2 style="margin-top:0">🎤 الاختبار الصوتي</h2>
        <p>لقد اجتزت هذا الاختبار بنتيجة <b style="color:green;">${p.voiceTest}%</b>.</p>
        <div class="row" style="display:flex; gap:10px; margin-top:15px;">
          <button class="btn primary" id="retest" style="background:#2563eb; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;">🔄 إعادة الاختبار</button>
          <button class="btn accent" id="toCert" style="background:#f59e0b; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;">🏆 الذهاب للشهادة ←</button>
        </div>
      </div>`;
    document.getElementById('retest').onclick = () => {
      p.passed = false; p.voiceTest = null; saveProgress();
      testState = null; renderApp();
    };
    document.getElementById('toCert').onclick = () => {
      testState = null; cur.tab = 'cert'; renderApp();
    };
    return;
  }

  const sentences = u.voiceTest;

  if (testState.idx >= sentences.length) {
    const avg = Math.round(testState.scores.reduce((a, b) => a + b, 0) / sentences.length) || 0;
    p.voiceTest = avg;
    p.passed = avg >= COURSE.passingScore;
    saveProgress();

    body.innerHTML = `
      <div class="card" style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; text-align:center;">
        <h2 style="margin-top:0">📊 نتيجة الاختبار</h2>
        <div class="result-big" style="font-size:40px; font-weight:bold; color:${p.passed ? 'green' : 'red'}; margin:20px 0;">${avg}%</div>
        <div class="progress" style="background:#eee; height:10px; border-radius:5px; margin:16px 0;">
          <div class="progress-fill" style="width:${avg}%;background:${p.passed ? 'green' : 'red'}; height:100%; border-radius:5px;"></div>
        </div>
        <p style="font-weight:800;font-size:16px">
          ${p.passed
            ? '🎉 مبروك! لقد اجتزت الاختبار بنجاح.'
            : '😔 لم تجتز الاختبار. تحتاج ' + COURSE.passingScore + '% على الأقل للنجاح.'}
        </p>
        <div class="row" style="display:flex; justify-content:center; gap:10px; margin-top:20px;">
          <button class="btn" id="retestBtn" style="cursor:pointer;">🔄 إعادة الاختبار</button>
          ${p.passed ? '<button class="btn primary" id="toCertBtn" style="background:#2563eb; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;">🏆 الذهاب للشهادة ←</button>' : ''}
        </div>
      </div>`;

    document.getElementById('retestBtn').onclick = () => {
      p.passed = false; p.voiceTest = null; saveProgress();
      testState = null; renderApp();
    };
    const certBtn = document.getElementById('toCertBtn');
    if (certBtn) certBtn.onclick = () => {
      testState = null; cur.tab = 'cert'; renderApp();
    };
    return;
  }

  const sentence = sentences[testState.idx];
  const pct = Math.round((testState.idx / sentences.length) * 100);

  body.innerHTML = `
    <div class="card" style="border: 1px solid #ddd; padding: 15px; border-radius: 8px;">
      <div class="lesson-top" style="display:flex; justify-content:space-between; margin-bottom:10px;">
        <span>🎤 الاختبار الصوتي — ${testState.idx + 1} / ${sentences.length}</span>
        <span style="font-size:12px; color:#666;">حد النجاح: ${COURSE.passingScore}%</span>
      </div>
      <div class="progress" style="background:#eee; height:8px; border-radius:4px; margin-bottom:20px;"><div class="progress-fill" style="width:${pct}%; background:#2563eb; height:100%; border-radius:4px;"></div></div>
      <p class="q ltr" style="text-align:center;margin:24px 0;font-size:22px;line-height:1.6; font-weight:bold;">
        ${esc(sentence)}
      </p>
      <div class="row" style="display:flex; justify-content:center; gap:10px;">
        <button class="btn small" id="speakTest" style="cursor:pointer;">🔊 استمع</button>
        <button class="btn primary" id="recTest" style="background:#2563eb; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;">🎤 سجّل نطقك</button>
      </div>
      <div class="fb" id="testFb" style="margin-top:15px;"></div>
    </div>`;

  document.getElementById('speakTest').onclick = () => speak(sentence);
  document.getElementById('recTest').onclick = (e) => {
    const btn = e.currentTarget;
    startRecognition(sentence, document.getElementById('testFb'), btn, (score) => {
      testState.scores.push(score);
      testState.idx++;
      setTimeout(() => renderApp(), 1400);
    });
  };
}

/* ==========================================================================
   9) الشهادة
   ========================================================================== */
function renderCert(body, u, p) {
  if (!p.passed) {
    body.innerHTML = `
      <div class="card" style="border: 1px solid #ddd; padding: 15px; border-radius: 8px;">
        <h2 style="margin-top:0">🏆 الشهادة</h2>
        <p style="color:#666;">للحصول على الشهادة، يجب اجتياز الاختبار الصوتي أولاً.</p>
        <div class="tip" style="background:#fef3c7; padding:10px; border-radius:5px;">الحد الأدنى للنجاح: <b>${COURSE.passingScore}%</b></div>
        <button class="btn primary block" id="gotoTestBtn" style="margin-top:12px; width:100%; padding:10px; background:#2563eb; color:white; border:none; border-radius:5px; cursor:pointer;">
          🎤 الذهاب إلى الاختبار ←
        </button>
      </div>`;
    document.getElementById('gotoTestBtn').onclick = () => {
      testState = null; cur.tab = 'test'; renderApp();
    };
    return;
  }

  const studentName = (function(){
    try {
      const n = localStorage.getItem('studentName');
      return (n && n.trim()) ? n.trim() : 'الطالب المتميز';
    } catch(e) { return 'الطالب المتميز'; }
  })();

  const dateStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

  body.innerHTML = `
    <div class="cert-card" style="border: 10px solid #f59e0b; padding: 30px; border-radius: 10px; text-align: center; background: #fffbeb; position: relative;">
      <div class="cert-head" style="margin-bottom: 20px;">
        <div class="cert-logo" style="font-size: 50px;">🏆</div>
        <h1 class="cert-title" style="color: #b45309; margin: 10px 0;">شهادة إتمام</h1>
        <div class="cert-sub ltr" style="color: #d97706; font-style: italic;">Certificate of Completion</div>
      </div>
      <div class="cert-body" style="font-size: 18px; line-height: 2;">
        <p>تشهد هذه الشهادة بأن</p>
        <div class="cert-name" style="font-size: 28px; font-weight: bold; color: #1e293b; border-bottom: 2px solid #f59e0b; display: inline-block; padding: 0 20px; margin: 10px 0;">${esc(studentName)}</div>
        <p>قد أتمّ بنجاح وحدة</p>
        <div class="cert-unit" style="font-size: 22px; font-weight: bold; color: #2563eb;">${esc(u.name)}</div>
        <div class="cert-unit-en ltr" style="color: #666; margin-bottom: 10px;">${esc(u.nameEn)}</div>
        <p>بنتيجة <b style="color: green;">${p.voiceTest}%</b> في الاختبار الصوتي</p>
        <div class="cert-date" style="margin-top: 20px; color: #666; font-size: 14px;">${esc(dateStr)}</div>
      </div>
      <div class="cert-foot" style="margin-top: 30px; font-weight: bold; color: #b45309;">🎓 منصة تعلّم الإنجليزية</div>
    </div>
    <div class="row" style="display:flex; justify-content:center; gap:10px; margin-top:16px;">
      <button class="btn primary" id="printCertBtn" style="background:#2563eb; color:white; border:none; padding:10px 20px; border-radius:5px; cursor:pointer;">🖨️ طباعة / حفظ PDF</button>
      <button class="btn" id="backToHomeBtn" style="cursor:pointer;">← العودة للوحدات</button>
    </div>`;

  document.getElementById('printCertBtn').onclick = () => window.print();
  document.getElementById('backToHomeBtn').onclick = () => {
    resetLesson(); testState = null;
    cur.view = 'home'; cur.unitIndex = null; cur.tab = 'pron';
    renderApp();
  };
}

/* ==========================================================================
   10) التهيئة والإقلاع (تشغيل التطبيق)
   ========================================================================== */
(function boot() {
  if (!document.getElementById('printStyle')) {
    const st = document.createElement('style');
    st.id = 'printStyle';
    st.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        .cert-card, .cert-card * { visibility: visible !important; }
        .cert-card { position: absolute !important; left: 0; top: 0; width: 100%; margin: 0 !important; box-shadow: none !important; }
        .row, .tabs, .btn, header { display: none !important; }
      }`;
    document.head.appendChild(st);
  }

  // تشغيل التطبيق لأول مرة
  renderApp();
})();
