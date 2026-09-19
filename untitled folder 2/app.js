/* ==========================================================================
   ROTATIONAL — UI LAYER
   ==========================================================================
   Screens/presentation only. Reads GameEngine state and CharacterModule
   customization/portrait and renders them; calls GameEngine.choose() /
   .advanceWeek() / .reset() on interaction. Game rules live in
   game-logic.js; character appearance lives in character.js. This file
   just wires them together and adds game-feel (progress tracker, matchday
   sequence, transitions).
   ========================================================================== */

const COLOR_MAP = {
  good: "var(--green-good)",
  ok: "var(--yellow-ok)",
  poor: "var(--amber)",
  critical: "var(--red)"
};

const STAT_LABELS = {
  energy: "Energy", hydration: "Hydration", nutrition: "Nutrition", sleep: "Sleep",
  morale: "Morale", stress: "Stress", trainingLoad: "Training Load",
  recovery: "Recovery", injuryRisk: "Injury Risk", performance: "Performance"
};

const STEP_ORDER = ["Training Decision", "Nutrition / Hydration Decision", "Sleep / Recovery Decision", "Personal / Social Decision"];
const STEP_SHORT = ["Train", "Fuel", "Rest", "Life"];

// UI-only routing state
let screen = "customize"; // customize -> start -> decision loop -> end
let lastInjuryEvent = false; // tracks whether the most recent match hurt the player, for portrait mood

/* ------------------------------------------------------------------------
   MOOD — translate live game state into simple booleans the portrait
   reacts to. Purely a presentation concern; doesn't touch game rules.
   ------------------------------------------------------------------------ */

function currentMood() {
  const s = GameEngine.getState();
  return {
    tired: s.energy < 40,
    stressed: s.stress > 60,
    happy: s.morale > 75 && s.stress <= 60,
    hurt: lastInjuryEvent || s.injuryRisk > 70
  };
}

/* ------------------------------------------------------------------------
   SHARED PIECES
   ------------------------------------------------------------------------ */

function statBar(label, value) {
  const t = GameEngine.tier(value);
  return `
    <div class="stat-row">
      <div class="label-line"><span>${label}</span><span class="val">${value}</span></div>
      <div class="meter"><div style="width:${value}%; background:${COLOR_MAP[t.colorKey]};"></div></div>
    </div>`;
}

function deltaSpan(before, after) {
  const d = after - before;
  if (d === 0) return `<span class="delta-flat">±0</span>`;
  return d > 0 ? `<span class="delta-up">+${d}</span>` : `<span class="delta-down">${d}</span>`;
}

function sidebar() {
  const s = GameEngine.getState();
  const p = GameEngine.getPlayer();
  const c = CharacterModule.getCustomization();
  const log = GameEngine.getLog();

  return `
    <div class="card player-block">
      <div class="portrait-frame portrait-small">${CharacterModule.renderPortraitSVG(currentMood())}</div>
      <h2>${c.name}</h2>
      <div class="role">${p.position} · ${p.role}</div>
      <div class="facts">
        Age ${p.age}<br>
        Strength: ${p.strength}<br>
        Weakness: ${p.weakness}<br>
        Goal: ${p.goal}
      </div>
      <hr class="divider">
      ${statBar("Energy", s.energy)}
      ${statBar("Recovery", s.recovery)}
      ${statBar("Hydration", s.hydration)}
      ${statBar("Nutrition", s.nutrition)}
      ${statBar("Sleep", s.sleep)}
      ${statBar("Morale", s.morale)}
      ${statBar("Stress", s.stress)}
      ${statBar("Training Load", s.trainingLoad)}
      <hr class="divider">
      ${statBar("Injury Risk", s.injuryRisk)}
      ${statBar("Performance", s.performance)}
    </div>
    <div class="card">
      <h3 style="margin:0 0 10px;font-size:15px;">Season Log</h3>
      <div class="log">
        ${log.slice(0, 12).map(l => `
          <div class="log-entry ${l.match ? "match" : ""}">
            <span class="tag">${l.tag}</span>${l.text}
          </div>`).join("")}
      </div>
    </div>
  `;
}

function masthead(subtitle) {
  const p = GameEngine.getPlayer();
  return `
    <div class="masthead">
      <h1>Rotational</h1>
      <div class="sub">${subtitle || `A career-sim prototype · ${p.position}, ${p.age}`}</div>
    </div>`;
}

function seasonProgress() {
  const week = GameEngine.getWeek();
  const seasonLength = GameEngine.getSeasonLength();
  const step = GameEngine.getStepLabel();
  const stepIndex = step ? STEP_ORDER.indexOf(step) : 4;

  const pct = Math.round(((week - 1) / seasonLength) * 100);

  const dots = STEP_SHORT.map((label, i) => {
    const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "";
    return `<div class="beat-dot ${state}"><span class="beat-dot-mark"></span><span class="beat-dot-label">${label}</span></div>`;
  }).join("");
  const matchState = stepIndex >= 4 ? (stepIndex > 4 ? "done" : "active") : "";
  const matchDot = `<div class="beat-dot ${matchState}"><span class="beat-dot-mark"></span><span class="beat-dot-label">Match</span></div>`;

  return `
    <div class="season-track">
      <div class="season-track-bar"><div class="season-track-fill" style="width:${pct}%;"></div></div>
      <div class="season-track-label">Week ${week} of ${seasonLength}</div>
    </div>
    <div class="beat-track">${dots}${matchDot}</div>
  `;
}

function mount(html) {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="screen-enter">${html}</div>`;
}

/* ------------------------------------------------------------------------
   ANIMATED MATCHDAY PITCH SCENE
   ------------------------------------------------------------------------ */

function pitchScene() {
  // A handful of small circles ("players") on a simple pitch, each with a
  // randomized CSS animation so they drift independently. Purely visual.
  const home = [1, 2, 3].map(i => {
    const top = 20 + Math.random() * 60;
    const dur = (2.4 + Math.random() * 1.6).toFixed(2);
    const delay = (Math.random() * 1.2).toFixed(2);
    return `<div class="pitch-player home" style="top:${top}%; animation-duration:${dur}s; animation-delay:${delay}s;"></div>`;
  }).join("");
  const away = [1, 2, 3].map(i => {
    const top = 15 + Math.random() * 65;
    const dur = (2.6 + Math.random() * 1.6).toFixed(2);
    const delay = (Math.random() * 1.2).toFixed(2);
    return `<div class="pitch-player away" style="top:${top}%; animation-duration:${dur}s; animation-delay:${delay}s;"></div>`;
  }).join("");

  return `
    <div class="pitch-scene">
      <div class="pitch-stripes"></div>
      <div class="pitch-halfline"></div>
      ${home}${away}
      <div class="pitch-ball">⚽</div>
    </div>`;
}

/* ------------------------------------------------------------------------
   SCREENS
   ------------------------------------------------------------------------ */

function renderCustomize() {
  mount(`
    ${masthead("Create your player")}
    <div class="card">
      ${CharacterModule.renderCustomizeHTML()}
      <button class="btn-primary btn-large customize-continue" id="customize-continue">Looks good</button>
    </div>
  `);

  CharacterModule.wireCustomizeControls(() => {
    CharacterModule.refreshPortraitPreview({});
  });

  document.getElementById("customize-continue").addEventListener("click", () => {
    screen = "start";
    render();
  });
}

function renderStart() {
  const p = GameEngine.getPlayer();
  const c = CharacterModule.getCustomization();
  mount(`
    ${masthead("A career-sim prototype")}
    <div class="card start-card">
      <div class="portrait-frame portrait-medium" style="margin:0 auto 14px;">${CharacterModule.renderPortraitSVG({})}</div>
      <div class="start-kicker">Season Preview</div>
      <h2 class="start-name">${c.name}</h2>
      <div class="role" style="margin-bottom:18px;">${p.position} · ${p.age} years old</div>
      <div class="start-facts">
        <div><span class="rname">Role</span>${p.role}</div>
        <div><span class="rname">Strength</span>${p.strength}</div>
        <div><span class="rname">Weakness</span>${p.weakness}</div>
        <div><span class="rname">Season goal</span>${p.goal}</div>
      </div>
      <p class="start-blurb">Twelve matches. Four decisions a week. Every choice moves real variables —
        energy, sleep, stress, training load — and those variables decide whether you start, sit,
        or end up on the physio's table.</p>
      <button class="btn-primary btn-large" id="begin-btn">Begin Season</button>
    </div>
  `);
  document.getElementById("begin-btn").addEventListener("click", () => {
    screen = "loop";
    render();
  });
}

function renderDecision() {
  const decision = GameEngine.getCurrentDecision();
  const step = GameEngine.getStepLabel();

  mount(`
    ${masthead()}
    ${seasonProgress()}
    <div class="layout">
      <div>${sidebar()}</div>
      <div>
        <div class="card prompt">
          <span class="week-tag">${step}</span>
          <h3>${decision.title}</h3>
          <div class="desc">${decision.desc}</div>
          ${decision.options.map((opt, i) => `
            <button class="option" data-index="${i}">
              <div class="opt-title">${opt.label}</div>
              <div class="opt-desc">${opt.detail}</div>
              ${opt.evidence ? `<div class="opt-evidence">${opt.evidence}</div>` : ""}
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `);

  document.querySelectorAll(".option").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.add("option-chosen");
      const hadNoReport = !GameEngine.getPendingReport();
      GameEngine.choose(parseInt(btn.dataset.index, 10));
      const nowHasReport = !!GameEngine.getPendingReport();

      setTimeout(() => {
        if (hadNoReport && nowHasReport) {
          renderMatchday();
        } else {
          render();
        }
      }, 220);
    });
  });
}

function renderMatchday() {
  const week = GameEngine.getWeek();
  mount(`
    ${masthead("Matchday")}
    <div class="card matchday-card">
      <div class="matchday-week">Week ${week}</div>
      ${pitchScene()}
      <div class="matchday-status" id="matchday-status">Warming up…</div>
    </div>
  `);

  const beats = ["Warming up…", "Kickoff…", "Second half…", "Full time."];
  let i = 0;
  const statusEl = document.getElementById("matchday-status");
  const interval = setInterval(() => {
    i++;
    if (i < beats.length) {
      statusEl.textContent = beats[i];
      statusEl.classList.remove("pulse");
      void statusEl.offsetWidth;
      statusEl.classList.add("pulse");
    } else {
      clearInterval(interval);
      const r = GameEngine.getPendingReport();
      lastInjuryEvent = !!(r && r.injuryEvent);
      setTimeout(renderReport, 350);
    }
  }, 500);
}

function renderReport() {
  const r = GameEngine.getPendingReport();
  const week = GameEngine.getWeek();
  const seasonLength = GameEngine.getSeasonLength();
  const rows = Object.keys(STAT_LABELS);

  mount(`
    ${masthead()}
    ${seasonProgress()}
    <div class="layout">
      <div>${sidebar()}</div>
      <div>
        <div class="card">
          <span class="week-tag">Week ${week} Report</span>
          <h3 class="reveal-row" style="animation-delay:.05s;margin:6px 0;">
            ${r.injuryEvent ? "Picked up a knock" : r.minutes > 0 ? (r.started ? "Started the match" : "Came off the bench") : "Didn't make the squad"}
          </h3>
          <div class="desc reveal-row" style="animation-delay:.1s;">
            ${r.minutes > 0 ? `${r.minutes} minutes played, match rating <strong class="mono">${r.rating}</strong>.` : "No minutes this week."}
            ${r.injuryEvent ? " The physio flagged it for monitoring next week." : ""}
          </div>
          <div class="report-grid">
            ${rows.map((k, idx) => `
              <div class="rname reveal-row" style="animation-delay:${0.15 + idx * 0.035}s;">${STAT_LABELS[k]}</div>
              <div class="mono reveal-row" style="animation-delay:${0.15 + idx * 0.035}s;">${r.after[k]} ${deltaSpan(r.snapshot[k], r.after[k])}</div>
            `).join("")}
          </div>
          <button class="btn-primary" id="continue-btn">${week < seasonLength ? "Continue to Week " + (week + 1) : "See Season Summary"}</button>
        </div>
      </div>
    </div>
  `);

  document.getElementById("continue-btn").addEventListener("click", () => {
    const goingToEnd = week >= seasonLength;
    GameEngine.advanceWeek();
    if (goingToEnd) {
      screen = "end";
      render();
    } else {
      renderWeekTransition();
    }
  });
}

function renderWeekTransition() {
  const week = GameEngine.getWeek();
  mount(`
    <div class="week-transition">
      <div class="week-transition-eyebrow">Season progresses</div>
      <div class="week-transition-num">Week ${week}</div>
    </div>
  `);
  setTimeout(render, 900);
}

function renderEnd() {
  const stats = GameEngine.getSeasonStats();
  const s = GameEngine.getState();
  const c = CharacterModule.getCustomization();
  const seasonLength = GameEngine.getSeasonLength();
  const avgRating = (stats.avgRatingSum / stats.matchesPlayed).toFixed(2);

  mount(`
    ${masthead("Season complete")}
    <div class="card end-screen">
      <div class="portrait-frame portrait-medium" style="margin:0 auto 14px;">${CharacterModule.renderPortraitSVG(currentMood())}</div>
      <div class="bignum">${stats.starts}/${seasonLength}</div>
      <div style="color:var(--chalk-dim);margin-bottom:20px;">matches started as ${c.name}</div>
      <div class="report-grid" style="text-align:left;max-width:340px;margin:0 auto 22px;">
        <div class="rname">Average rating</div><div class="mono">${avgRating}</div>
        <div class="rname">Injuries picked up</div><div class="mono">${stats.injuries}</div>
        <div class="rname">Final Performance</div><div class="mono">${s.performance}</div>
        <div class="rname">Final Injury Risk</div><div class="mono">${s.injuryRisk}</div>
      </div>
      <button class="btn-primary" id="replay-btn">Play Again</button>
    </div>
  `);

  document.getElementById("replay-btn").addEventListener("click", () => {
    GameEngine.reset();
    lastInjuryEvent = false;
    screen = "start";
    render();
  });
}

/* ------------------------------------------------------------------------
   ROUTER
   ------------------------------------------------------------------------ */

function render() {
  if (screen === "customize") {
    renderCustomize();
  } else if (screen === "start") {
    renderStart();
  } else if (screen === "end" || GameEngine.isSeasonOver()) {
    renderEnd();
  } else if (GameEngine.getPendingReport()) {
    renderReport();
  } else {
    renderDecision();
  }
}

render();
