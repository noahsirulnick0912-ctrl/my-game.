/* ==========================================================================
   ROTATIONAL — GAME LOGIC ENGINE
   ==========================================================================
   This file owns ALL game state and rules. It has zero DOM dependencies —
   it never touches document, window.innerHTML, or any rendering code.

   Front-end code (see app.js) talks to this file only through the
   GameEngine object at the bottom. That's the entire contract:

     GameEngine.getState()          -> current variable values
     GameEngine.getPlayer()         -> static player info
     GameEngine.getWeek()           -> current week number
     GameEngine.getSeasonLength()   -> total weeks
     GameEngine.getCurrentDecision()-> the decision to show right now (or null if match/report/end)
     GameEngine.getStepLabel()      -> label for current step, e.g. "Training Decision"
     GameEngine.choose(optionIndex) -> apply a decision option, advances the step
     GameEngine.getPendingReport()  -> weekly report data (only after the match sim runs)
     GameEngine.advanceWeek()       -> dismiss the report and move to next week / end
     GameEngine.getLog()            -> array of {tag, text, match} log entries, newest first
     GameEngine.getSeasonStats()    -> cumulative season stats
     GameEngine.isSeasonOver()      -> boolean
     GameEngine.tier(value)         -> {label, colorKey} for a 0-100 stat, per the design doc's
                                        Excellent/Good/Okay/Poor/Critical thresholds
     GameEngine.reset()             -> start a brand new season

   Noah (or anyone building a front end) can build ANY UI on top of this —
   swap the HTML/CSS entirely, build a React version, whatever — without
   touching this file. If you need to change how the game plays (new
   decisions, new formulas, rebalancing), this is the only file to edit.
   ========================================================================== */

(function (global) {
  "use strict";

  const CLAMP = (v) => Math.max(0, Math.min(100, Math.round(v)));

  const EFFECT_SCALE = {
    veryS: 2,     // very small effect, 1-3 pts
    small: 5,     // small effect, 4-7 pts
    moderate: 10, // moderate effect, 8-12 pts
    large: 15,    // large effect, 13-18 pts
    major: 22     // major effect, 19-25 pts
  };

  const PLAYER = {
    name: "Alex Rowe",
    age: 17,
    position: "CM",
    role: "Rotational player fighting for a starting spot",
    strength: "Passing, playmaking",
    weakness: "Endurance",
    goal: "Become a consistent starter while staying healthy"
  };

  const SEASON_LENGTH = 12;

  /* ------------------------------------------------------------------------
     DECISION CONTENT
     Each option's "evidence" field is a short, plain-language paraphrase of
     the sports-science reasoning behind its effect size — not a citation,
     just enough for a player (or Noah) to see the effect isn't arbitrary.
     Sourcing behind these, for your reference when expanding content:
       - Sleep <8 hrs/night in adolescent athletes: ~1.7x injury risk
         (Milewski et al., J Pediatr Orthop 2014)
       - Fluid loss of ~2% body mass: endurance capacity drops meaningfully,
         even before thirst is noticeable (Sports Nutrition, Jeukendrup & Gleeson)
       - Young athlete protein target: roughly 1.2-2.0 g/kg/day for
         recovery and growth (ACSM / Academy of Nutrition & Dietetics ranges)
       - Week-to-week training load jumps >~15%: injury risk rises sharply
         (acute:chronic workload ratio research, Gabbett/Hulin et al.)
     ------------------------------------------------------------------------ */

  const trainingDecisions = [
    {
      title: "Extra endurance work after practice",
      desc: "Coach opens the field for optional running drills — endurance is your weak spot.",
      options: [
        { label: "Push through a full session", detail: "Big fitness gain, big fatigue cost.",
          evidence: "A full extra session is a meaningful week-over-week load jump — useful, but stacks fatigue fast.",
          effects: { trainingLoad: EFFECT_SCALE.large, energy: -EFFECT_SCALE.moderate, morale: EFFECT_SCALE.small } },
        { label: "Do a moderate, controlled set", detail: "Solid gain without wrecking your legs.",
          evidence: "Small, controlled load increases (rather than spikes) are linked to fewer injuries over a season.",
          effects: { trainingLoad: EFFECT_SCALE.moderate, energy: -EFFECT_SCALE.small, morale: EFFECT_SCALE.veryS } },
        { label: "Skip it, focus on technical work instead", detail: "Protects energy, endurance stays weak.",
          evidence: "No load added, but the underlying weakness (endurance) isn't addressed.",
          effects: { trainingLoad: EFFECT_SCALE.veryS, energy: EFFECT_SCALE.veryS, morale: -EFFECT_SCALE.veryS } }
      ]
    },
    {
      title: "Free block before curfew",
      desc: "You have one open slot in the evening — gym, film, or nothing.",
      options: [
        { label: "Gym: strength & conditioning", detail: "Raises training load, taxes energy.",
          evidence: "Added session load without added recovery time — fine occasionally, risky if repeated.",
          effects: { trainingLoad: EFFECT_SCALE.moderate, energy: -EFFECT_SCALE.small } },
        { label: "Video review of your last match", detail: "No physical load, small morale/performance edge.",
          evidence: "No physical cost — mental preparation slightly reduces perceived stress before matches.",
          effects: { morale: EFFECT_SCALE.small, stress: -EFFECT_SCALE.veryS } },
        { label: "Rest completely", detail: "Recovery-first choice.",
          evidence: "Unscheduled rest lets accumulated fatigue clear, which is when most physical adaptation actually happens.",
          effects: { energy: EFFECT_SCALE.small, trainingLoad: -EFFECT_SCALE.veryS } }
      ]
    },
    {
      title: "Overtraining temptation",
      desc: "You feel behind the starting CM and want to close the gap fast.",
      options: [
        { label: "Add a second session against advice", detail: "Risky — spikes training load and injury risk.",
          evidence: "A sudden jump in weekly load (an acute:chronic workload spike) is one of the more consistent injury-risk factors in the research.",
          effects: { trainingLoad: EFFECT_SCALE.major, energy: -EFFECT_SCALE.large, morale: EFFECT_SCALE.veryS }, risky: true },
        { label: "Stick to the planned load", detail: "Disciplined, sustainable.",
          evidence: "Steady, planned progression avoids the load spikes associated with higher injury rates.",
          effects: { trainingLoad: EFFECT_SCALE.small, morale: EFFECT_SCALE.veryS } },
        { label: "Ask the fitness coach for a tailored plan", detail: "Slower, but well-managed.",
          evidence: "Individualized load management is the approach sports-science staff actually use to balance fitness gains against injury risk.",
          effects: { trainingLoad: EFFECT_SCALE.small, stress: -EFFECT_SCALE.veryS, morale: EFFECT_SCALE.small } }
      ]
    },
    {
      title: "Planning next week's training block",
      desc: "The staff ask how hard you want to push next week.",
      options: [
        { label: "Increase load gradually (~10%)", detail: "Builds fitness at a manageable pace.",
          evidence: "Keeping week-to-week load increases modest is associated with meaningfully lower injury rates than larger jumps.",
          effects: { trainingLoad: EFFECT_SCALE.small, energy: -EFFECT_SCALE.veryS } },
        { label: "Hold load steady", detail: "Maintains fitness, avoids new risk.",
          evidence: "No change in load means no new spike risk, but also limited fitness gain.",
          effects: {} },
        { label: "Big jump to catch up on fitness", detail: "Fast gains, real injury-risk cost.",
          evidence: "Large week-over-week load increases are one of the strongest predictors of injury in team-sport athletes.",
          effects: { trainingLoad: EFFECT_SCALE.large, injuryRiskFlag: 1 }, risky: true }
      ]
    },
    {
      title: "Technical drills vs. full-intensity scrimmage",
      desc: "Training plan gives you a choice of emphasis today.",
      options: [
        { label: "Full-intensity scrimmage", detail: "Match-realistic, higher physical cost.",
          evidence: "Match-intensity training carries a similar physical cost to matches themselves.",
          effects: { trainingLoad: EFFECT_SCALE.moderate, energy: -EFFECT_SCALE.moderate, morale: EFFECT_SCALE.veryS } },
        { label: "Technical/passing drills", detail: "Sharpens your strength, low physical cost.",
          evidence: "Lower-intensity technical work builds skill without adding much cumulative load.",
          effects: { trainingLoad: EFFECT_SCALE.veryS, morale: EFFECT_SCALE.small } },
        { label: "Mixed session", detail: "Balanced.",
          effects: { trainingLoad: EFFECT_SCALE.small, morale: EFFECT_SCALE.veryS } }
      ]
    },
    {
      title: "A rare full rest day",
      desc: "No training, no school commitments — how do you spend it?",
      options: [
        { label: "Complete rest and recovery", detail: "Maximizes the recovery window.",
          evidence: "Full rest days are when most of the adaptation from a training block actually consolidates.",
          effects: { trainingLoad: -EFFECT_SCALE.moderate, energy: EFFECT_SCALE.moderate, stress: -EFFECT_SCALE.small } },
        { label: "Light active recovery (walk, stretch)", detail: "Gentle movement, still restful.",
          effects: { trainingLoad: -EFFECT_SCALE.small, energy: EFFECT_SCALE.small } },
        { label: "Fill it with errands and screens", detail: "Wastes the recovery window.",
          effects: { stress: EFFECT_SCALE.veryS } }
      ]
    }
  ];

  const nutritionDecisions = [
    {
      title: "Post-training meal",
      desc: "You're hungry and tired after the session.",
      options: [
        { label: "High-protein, balanced plate (~35-40g protein)", detail: "Best for recovery.",
          evidence: "Falls within the ~1.2-2.0 g/kg/day range recommended for young athletes' recovery and growth.",
          effects: { nutrition: EFFECT_SCALE.large, hydration: EFFECT_SCALE.veryS } },
        { label: "Quick carbs, low protein (<20g)", detail: "Refuels energy, weaker recovery support.",
          evidence: "Refuels glycogen but falls short of the protein needed to maximize muscle repair.",
          effects: { nutrition: EFFECT_SCALE.small, energy: EFFECT_SCALE.veryS } },
        { label: "Fast food on the way home", detail: "Convenient, poor fuel.",
          effects: { nutrition: -EFFECT_SCALE.moderate, energy: EFFECT_SCALE.veryS } }
      ]
    },
    {
      title: "Hydration through the week",
      desc: "Training ramps up and the weather's warm.",
      options: [
        { label: "Track intake, hit fluid targets daily", detail: "Keeps hydration high.",
          evidence: "Staying under a ~2% body-mass fluid deficit avoids the endurance and strength losses seen with dehydration.",
          effects: { hydration: EFFECT_SCALE.large } },
        { label: "Drink when thirsty, no real tracking", detail: "Middling hydration.",
          evidence: "Thirst lags behind actual fluid loss, so this often still leaves you mildly dehydrated during hard sessions.",
          effects: { hydration: EFFECT_SCALE.veryS } },
        { label: "Mostly soda and coffee", detail: "Hydration slips.",
          effects: { hydration: -EFFECT_SCALE.moderate, sleep: -EFFECT_SCALE.veryS } }
      ]
    },
    {
      title: "Late-night snack before bed",
      desc: "You're up doing homework and getting hungry.",
      options: [
        { label: "Light snack, water, wind down", detail: "Supports sleep and next-day energy.",
          effects: { nutrition: EFFECT_SCALE.veryS, sleep: EFFECT_SCALE.small } },
        { label: "Skip food, just push through", detail: "No harm, no benefit.",
          effects: {} },
        { label: "Heavy snack + energy drink to stay up later", detail: "Hurts sleep quality.",
          evidence: "Caffeine and a heavy meal close to bedtime are both associated with reduced sleep quality.",
          effects: { sleep: -EFFECT_SCALE.moderate, hydration: -EFFECT_SCALE.veryS } }
      ]
    },
    {
      title: "Pre-match fueling",
      desc: "Match day is tomorrow — how do you eat today?",
      options: [
        { label: "Carb-focused meals, moderate protein", detail: "Tops off glycogen stores.",
          evidence: "Higher-carbohydrate intake in the day before a match is the standard approach to maximize glycogen stores for a 90-minute effort.",
          effects: { nutrition: EFFECT_SCALE.moderate, energy: EFFECT_SCALE.small } },
        { label: "Normal eating, no adjustment", detail: "Neutral.",
          effects: {} },
        { label: "Try a new/heavy meal you haven't eaten before matchday", detail: "Risky — GI discomfort can hurt performance.",
          effects: { nutrition: -EFFECT_SCALE.small, stress: EFFECT_SCALE.veryS }, risky: true }
      ]
    },
    {
      title: "Matchday morning breakfast",
      desc: "Kickoff is this afternoon.",
      options: [
        { label: "Balanced breakfast 3+ hours before kickoff", detail: "Standard, well-tested approach.",
          effects: { nutrition: EFFECT_SCALE.small, energy: EFFECT_SCALE.small } },
        { label: "Skip breakfast, nervous stomach", detail: "Under-fueled going into the match.",
          effects: { nutrition: -EFFECT_SCALE.small, energy: -EFFECT_SCALE.veryS } },
        { label: "Large heavy meal right before travel", detail: "Too close to kickoff, can cause sluggishness.",
          effects: { energy: -EFFECT_SCALE.veryS } }
      ]
    },
    {
      title: "Weekend out with friends",
      desc: "The group's getting food after a movie.",
      options: [
        { label: "Order something reasonably balanced", detail: "Social time without derailing nutrition.",
          effects: { nutrition: EFFECT_SCALE.veryS, morale: EFFECT_SCALE.small } },
        { label: "Go all-in on whatever, it's one night", detail: "Fun now, minor nutrition dip.",
          effects: { nutrition: -EFFECT_SCALE.small, morale: EFFECT_SCALE.small } },
        { label: "Skip it to stay strict on diet", detail: "Protects nutrition, costs a social moment.",
          effects: { nutrition: EFFECT_SCALE.veryS, morale: -EFFECT_SCALE.veryS } }
      ]
    }
  ];

  const sleepDecisions = [
    {
      title: "Bedtime the night before a hard session",
      desc: "Friends are texting about a group hangout.",
      options: [
        { label: "Lights out on schedule", detail: "Protects sleep quality.",
          evidence: "Adolescent athletes averaging 8+ hours a night carry meaningfully lower injury risk than those under 8.",
          effects: { sleep: EFFECT_SCALE.large, stress: -EFFECT_SCALE.veryS } },
        { label: "Stay up a bit late texting", detail: "Minor sleep debt.",
          effects: { sleep: -EFFECT_SCALE.small } },
        { label: "Go to the hangout, sleep late", detail: "Morale up, sleep takes a hit.",
          evidence: "Dropping meaningfully under 8 hours of sleep is linked to a substantially higher injury rate in youth athletes.",
          effects: { sleep: -EFFECT_SCALE.large, morale: EFFECT_SCALE.moderate } }
      ]
    },
    {
      title: "Recovery day plan",
      desc: "You have a rare day without training or school commitments.",
      options: [
        { label: "Full rest: sleep in, stretch, hydrate", detail: "Strong recovery boost.",
          effects: { sleep: EFFECT_SCALE.moderate, energy: EFFECT_SCALE.moderate, stress: -EFFECT_SCALE.small } },
        { label: "Light activity, normal routine", detail: "Neutral.",
          effects: { energy: EFFECT_SCALE.veryS } },
        { label: "Fill it with errands and screens", detail: "Wastes the recovery window.",
          effects: { stress: EFFECT_SCALE.veryS } }
      ]
    },
    {
      title: "Playing through nagging soreness",
      desc: "Your legs feel heavy but nothing feels seriously wrong — yet.",
      options: [
        { label: "Tell the trainer, dial back load", detail: "Cautious — lowers injury risk.",
          effects: { trainingLoad: -EFFECT_SCALE.moderate, injuryRiskFlag: -1 } },
        { label: "Ice it yourself, say nothing", detail: "Middle ground.",
          effects: { energy: EFFECT_SCALE.veryS } },
        { label: "Ignore it and train at full intensity", detail: "Risky — compounds injury risk.",
          evidence: "Training through pain on top of an existing load spike is exactly the pattern most associated with soft-tissue injuries.",
          effects: { trainingLoad: EFFECT_SCALE.small, injuryRiskFlag: 1 }, risky: true }
      ]
    },
    {
      title: "Screens before bed",
      desc: "You've got homework apps and messages open right up until lights out.",
      options: [
        { label: "Screens off 30+ min before bed", detail: "Better wind-down.",
          effects: { sleep: EFFECT_SCALE.small } },
        { label: "Scroll until you're tired", detail: "Slightly delays and lightens sleep.",
          effects: { sleep: -EFFECT_SCALE.veryS } },
        { label: "Fall asleep with the phone in hand", detail: "Disrupted, lower-quality sleep.",
          effects: { sleep: -EFFECT_SCALE.small, stress: EFFECT_SCALE.veryS } }
      ]
    },
    {
      title: "Napping on a heavy training day",
      desc: "You're wiped after a double session, with hours before homework.",
      options: [
        { label: "20-30 min nap", detail: "Short naps restore energy without hurting night sleep.",
          effects: { energy: EFFECT_SCALE.moderate } },
        { label: "Long 2+ hour nap", detail: "Feels good now, can disrupt tonight's sleep.",
          effects: { energy: EFFECT_SCALE.large, sleep: -EFFECT_SCALE.veryS } },
        { label: "Push through without napping", detail: "No recovery boost.",
          effects: {} }
      ]
    },
    {
      title: "Away match travel",
      desc: "A long bus ride disrupts your normal routine the night before.",
      options: [
        { label: "Stick to your usual sleep routine as best you can", detail: "Minimizes disruption.",
          effects: { sleep: -EFFECT_SCALE.veryS } },
        { label: "Let the schedule slide, catch up later", detail: "Sleep takes a real hit this week.",
          effects: { sleep: -EFFECT_SCALE.moderate } },
        { label: "Use the travel time itself to nap", detail: "Recovers some of the lost sleep.",
          effects: { sleep: -EFFECT_SCALE.veryS, energy: EFFECT_SCALE.veryS } }
      ]
    }
  ];

  const personalDecisions = [
    {
      title: "Coach benches you for a match",
      desc: "You expected to start. It stings.",
      options: [
        { label: "Ask the coach directly for feedback", detail: "Constructive, lowers stress over time.",
          effects: { stress: -EFFECT_SCALE.small, morale: EFFECT_SCALE.veryS } },
        { label: "Vent to teammates", detail: "Some relief, no real resolution.",
          effects: { stress: -EFFECT_SCALE.veryS } },
        { label: "Bottle it up", detail: "Stress lingers.",
          effects: { stress: EFFECT_SCALE.small, morale: -EFFECT_SCALE.veryS } }
      ]
    },
    {
      title: "School exam week collides with training",
      desc: "Two exams and a full training schedule in the same week.",
      options: [
        { label: "Plan study blocks around training", detail: "Manageable, small stress bump.",
          effects: { stress: EFFECT_SCALE.veryS } },
        { label: "Cram late at night", detail: "Sleep and stress both suffer.",
          effects: { sleep: -EFFECT_SCALE.moderate, stress: EFFECT_SCALE.moderate } },
        { label: "Ask for a lighter training day", detail: "Protects the week.",
          effects: { stress: -EFFECT_SCALE.veryS, trainingLoad: -EFFECT_SCALE.small } }
      ]
    },
    {
      title: "Team conflict in the group chat",
      desc: "Two teammates are arguing about playing time, and it's spilling into practice.",
      options: [
        { label: "Try to mediate", detail: "Costs a little energy, helps morale.",
          effects: { morale: EFFECT_SCALE.veryS, energy: -EFFECT_SCALE.veryS } },
        { label: "Stay out of it entirely", detail: "Neutral for you.",
          effects: {} },
        { label: "Take a side publicly", detail: "Raises your own stress.",
          effects: { stress: EFFECT_SCALE.small } }
      ]
    },
    {
      title: "Family event vs. extra training",
      desc: "A family gathering falls on a day you'd planned to train.",
      options: [
        { label: "Go to the family event", detail: "Recharges you socially.",
          effects: { morale: EFFECT_SCALE.moderate, trainingLoad: -EFFECT_SCALE.veryS } },
        { label: "Skip it, stick to training", detail: "Keeps the plan, costs a personal moment.",
          effects: { trainingLoad: EFFECT_SCALE.veryS, morale: -EFFECT_SCALE.veryS } },
        { label: "Go briefly, then train later", detail: "Compromise, tighter schedule.",
          effects: { stress: EFFECT_SCALE.veryS, morale: EFFECT_SCALE.veryS } }
      ]
    },
    {
      title: "Criticism after a bad match",
      desc: "Comments are piling up online after a poor performance.",
      options: [
        { label: "Log off, talk to a coach or trusted person instead", detail: "Protects mental state.",
          effects: { stress: -EFFECT_SCALE.small, morale: EFFECT_SCALE.veryS } },
        { label: "Read it all, try to shrug it off", detail: "Stress creeps up despite trying to ignore it.",
          effects: { stress: EFFECT_SCALE.small } },
        { label: "Engage and argue back", detail: "Amplifies stress with no benefit.",
          effects: { stress: EFFECT_SCALE.moderate, morale: -EFFECT_SCALE.veryS } }
      ]
    },
    {
      title: "Approaching a senior player for advice",
      desc: "A veteran teammate has been through exactly what you're facing.",
      options: [
        { label: "Ask for mentorship directly", detail: "Builds confidence and perspective.",
          effects: { morale: EFFECT_SCALE.moderate, stress: -EFFECT_SCALE.veryS } },
        { label: "Watch and learn quietly instead", detail: "Slower, still some benefit.",
          effects: { morale: EFFECT_SCALE.veryS } },
        { label: "Don't bother, figure it out alone", detail: "No support tapped.",
          effects: {} }
      ]
    }
  ];

  const DECISION_STEPS = [
    { key: "training", pool: trainingDecisions, label: "Training Decision" },
    { key: "nutrition", pool: nutritionDecisions, label: "Nutrition / Hydration Decision" },
    { key: "sleep", pool: sleepDecisions, label: "Sleep / Recovery Decision" },
    { key: "personal", pool: personalDecisions, label: "Personal / Social Decision" }
  ];

  /* ------------------------------------------------------------------------
     GAME STATE
     ------------------------------------------------------------------------ */

  function freshState() {
    return {
      energy: 75, hydration: 75, nutrition: 65, sleep: 70,
      morale: 68, stress: 30, trainingLoad: 40,
      recovery: 70, injuryRisk: 15, performance: 70
    };
  }

  let state = freshState();
  let hidden = { fatigueStreak: 0, healthyStreak: 0, riskStreak: 0 };
  let week = 1;
  let stepInWeek = 0; // 0-3 = decisions, 4 = match sim
  let log = [];
  let seasonStats = { starts: 0, avgRatingSum: 0, matchesPlayed: 0, injuries: 0 };
  let weekStartTrainingLoad = state.trainingLoad;
  let lastWeekSnapshot = { ...state };
  let pendingReport = null;
  let currentDecision = null;

  /* ------------------------------------------------------------------------
     DERIVED VARIABLE CALCULATIONS (per design doc's rules)
     ------------------------------------------------------------------------ */

  function recalcDerived() {
    const { sleep, nutrition, hydration, energy, trainingLoad, morale, stress } = state;

    // Recovery: sleep/nutrition/hydration/energy help, training load hurts
    let recovery = (sleep * 0.30) + (nutrition * 0.20) + (hydration * 0.20) + (energy * 0.20)
                   - (trainingLoad * 0.15) + 15;
    state.recovery = CLAMP(recovery);

    // Injury risk: low recovery/sleep/energy + high training load + risky streak raise it.
    // A week-over-week training load jump >15 points mirrors the ACWR-spike research finding.
    const loadJump = trainingLoad - weekStartTrainingLoad;
    const spikePenalty = loadJump > 15 ? (loadJump - 15) * 0.8 : 0;
    let injuryRisk = (100 - state.recovery) * 0.30 + (100 - sleep) * 0.15 + (100 - energy) * 0.15
                      + Math.max(0, trainingLoad - 60) * 0.6 + hidden.riskStreak * 3 + spikePenalty;
    state.injuryRisk = CLAMP(injuryRisk);

    // Performance: energy/recovery/hydration/nutrition/sleep/morale help; stress/injuryRisk hurt.
    let moraleMultiplier = 0.85 + (morale / 100) * 0.3; // 0.85 - 1.15
    let basePerf = (energy * 0.20) + (state.recovery * 0.20) + (hydration * 0.10) + (nutrition * 0.10)
                   + (sleep * 0.15) + (morale * 0.10) - (stress * 0.15) - (state.injuryRisk * 0.15) + 25;
    state.performance = CLAMP(basePerf * moraleMultiplier);
  }

  function applyThresholdEffects() {
    // Cross-variable threshold rules from the design doc
    if (state.energy < 50) state.performance = CLAMP(state.performance - 3);
    if (state.hydration < 50) state.energy = CLAMP(state.energy - 2);
    if (state.sleep < 50) { state.energy = CLAMP(state.energy - 2); state.recovery = CLAMP(state.recovery - 2); }
    if (state.stress > 65) { state.morale = CLAMP(state.morale - 3); state.sleep = CLAMP(state.sleep - 2); }
  }

  function tier(v) {
    if (v >= 80) return { label: "Excellent", colorKey: "good" };
    if (v >= 65) return { label: "Good", colorKey: "good" };
    if (v >= 50) return { label: "Okay", colorKey: "ok" };
    if (v >= 35) return { label: "Poor", colorKey: "poor" };
    return { label: "Critical", colorKey: "critical" };
  }

  /* ------------------------------------------------------------------------
     GAME FLOW
     ------------------------------------------------------------------------ */

  function applyEffects(effects) {
    let riskDelta = 0;
    for (const key in effects) {
      if (key === "injuryRiskFlag") { riskDelta = effects[key]; continue; }
      if (key in state) state[key] = CLAMP(state[key] + effects[key]);
    }
    if (riskDelta > 0) hidden.riskStreak++;
    else if (riskDelta < 0) hidden.riskStreak = Math.max(0, hidden.riskStreak - 1);

    hidden.fatigueStreak = state.energy < 50 ? hidden.fatigueStreak + 1 : 0;
    const healthy = state.sleep >= 65 && state.nutrition >= 65 && state.hydration >= 65;
    hidden.healthyStreak = healthy ? hidden.healthyStreak + 1 : 0;

    recalcDerived();
    applyThresholdEffects();
    recalcDerived();
  }

  function pickDecision(pool) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function startWeek() {
    stepInWeek = 0;
    lastWeekSnapshot = { ...state };
    weekStartTrainingLoad = state.trainingLoad;
    advanceStep();
  }

  function advanceStep() {
    if (stepInWeek < 4) {
      currentDecision = pickDecision(DECISION_STEPS[stepInWeek].pool);
    } else {
      currentDecision = null;
      simulateMatch();
    }
  }

  function choose(optionIndex) {
    if (!currentDecision) return;
    const opt = currentDecision.options[optionIndex];
    if (!opt) return;
    applyEffects(opt.effects);
    log.unshift({ tag: DECISION_STEPS[stepInWeek].label, text: `${currentDecision.title} → ${opt.label}` });
    stepInWeek++;
    advanceStep();
  }

  function simulateMatch() {
    recalcDerived();
    const perf = state.performance;
    const moraleFactor = (state.morale - 50) / 100;
    let rating = 5.0 + (perf - 50) / 14 + moraleFactor * 0.6 + (Math.random() * 1.2 - 0.6);
    rating = Math.max(3.0, Math.min(9.5, rating));

    const startsChance = 0.35 + Math.max(0, perf - 50) / 130;
    const started = Math.random() < startsChance;
    const minutes = started
      ? Math.round(65 + Math.random() * 25)
      : (Math.random() < 0.5 ? Math.round(10 + Math.random() * 25) : 0);

    let injuryEvent = false;
    const injuryChance = state.injuryRisk > 70 ? 0.18 : state.injuryRisk > 55 ? 0.06 : 0.015;
    if (Math.random() < injuryChance && minutes > 0) injuryEvent = true;

    seasonStats.matchesPlayed++;
    if (started) seasonStats.starts++;
    seasonStats.avgRatingSum += rating;
    if (injuryEvent) seasonStats.injuries++;

    const matchLoad = minutes > 0 ? Math.round((minutes / 90) * 18) : 3;
    state.energy = CLAMP(state.energy - matchLoad);
    state.trainingLoad = CLAMP(state.trainingLoad + Math.round(matchLoad * 0.7) - 8);
    state.hydration = CLAMP(state.hydration - Math.round(matchLoad * 0.4));
    if (started) state.morale = CLAMP(state.morale + (rating >= 6.8 ? 6 : rating <= 5.2 ? -5 : 0));
    else state.morale = CLAMP(state.morale - 3);

    if (injuryEvent) {
      state.injuryRisk = CLAMP(state.injuryRisk + 10);
      state.energy = CLAMP(state.energy - 15);
    }

    recalcDerived();
    applyThresholdEffects();
    recalcDerived();

    pendingReport = {
      started, minutes, rating: rating.toFixed(1), injuryEvent,
      snapshot: { ...lastWeekSnapshot }, after: { ...state }
    };

    log.unshift({
      tag: `Week ${week} Match`,
      text: injuryEvent
        ? `${minutes}' played, rated ${rating.toFixed(1)} — picked up a knock.`
        : minutes > 0
          ? `${started ? "Started" : "Came on"}, ${minutes}' played, rated ${rating.toFixed(1)}.`
          : `Didn't feature. Watched from the bench.`,
      match: true
    });
  }

  function advanceWeek() {
    pendingReport = null;
    week++;
    if (week <= SEASON_LENGTH) startWeek();
  }

  function isSeasonOver() {
    return week > SEASON_LENGTH;
  }

  function reset() {
    state = freshState();
    hidden = { fatigueStreak: 0, healthyStreak: 0, riskStreak: 0 };
    week = 1;
    stepInWeek = 0;
    log = [];
    seasonStats = { starts: 0, avgRatingSum: 0, matchesPlayed: 0, injuries: 0 };
    weekStartTrainingLoad = state.trainingLoad;
    lastWeekSnapshot = { ...state };
    pendingReport = null;
    currentDecision = null;
    recalcDerived();
    startWeek();
  }

  /* ------------------------------------------------------------------------
     PUBLIC API
     ------------------------------------------------------------------------ */

  const GameEngine = {
    getState: () => ({ ...state }),
    getPlayer: () => ({ ...PLAYER }),
    getWeek: () => week,
    getSeasonLength: () => SEASON_LENGTH,
    getCurrentDecision: () => currentDecision,
    getStepLabel: () => (stepInWeek < 4 ? DECISION_STEPS[stepInWeek].label : null),
    choose: choose,
    getPendingReport: () => pendingReport,
    advanceWeek: advanceWeek,
    getLog: () => log.slice(),
    getSeasonStats: () => ({ ...seasonStats }),
    isSeasonOver: isSeasonOver,
    tier: tier,
    reset: reset
  };

  // init
  recalcDerived();
  startWeek();

  global.GameEngine = GameEngine;
})(typeof window !== "undefined" ? window : globalThis);
