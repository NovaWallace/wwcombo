import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { strFromU8, unzipSync } from 'fflate';

async function loadModule(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}

const { alignOkwwChartToOrder, analyzeOkwwProject, createOkwwProject, generateOkwwPackage, okwwCharacterForName } = await loadModule('../src/okwwExport.ts');
const { buildOkwwReplayPlan } = await loadModule('../src/okwwReplay.ts');
const { buildSimulatedInputEvents } = await loadModule('../src/simulatedInput.ts');

function step(id, moveId, characterSlot, startMin, durationMax = 50) {
  return {
    id, moveId, characterSlot, startMin, startMax: startMin,
    durationMin: durationMax, durationMax, label: moveId,
    lane: 'main', independent: false, color: '#ffffff', advancesStep: true, samples: []
  };
}

function chart() {
  return {
    id: 'timed-augusta-iuno-shorekeeper', title: 'Timed rotation', version: 3,
    createdAt: 1, updatedAt: 1, tags: [], startTriggerMoveId: 'start_challenge',
    periods: [
      { id: 'start', kind: 'startup_axis', label: 'Start', startMs: 0, endMs: 1000 },
      { id: 'loop', kind: 'loop_axis', label: 'Loop', startMs: 1000, endMs: 3000 }
    ],
    steps: [
      step('first-r', 'liberation', 1, 518, 150),
      step('switch-two', 'switch_2', 2, 617, 48),
      step('iuno-skill', 'skill', 2, 727, 48),
      step('iuno-dodge', 'dodge', 2, 750, 45),
      step('iuno-switch', 'switch_3', 3, 1100, 50),
      step('shore-echo', 'echo', 3, 1300, 40),
      step('shore-switch', 'switch_1', 1, 1800, 50),
      step('augusta-basic', 'basic_attack', 1, 2000, 230)
    ]
  };
}

function project() { return createOkwwProject(chart(), { 1: '奥古斯塔', 2: '尤诺', 3: '守岸人' }); }

test('maps the pilot team without changing the source and preserves time ranges on reorder', () => {
  const source = chart();
  const p = createOkwwProject(source, { 1: '奥古斯塔', 2: '尤诺', 3: '守岸人' });
  assert.deepEqual(p.classes, { 1: 'Augusta', 2: 'Iuno', 3: 'ShoreKeeper' });
  assert.equal(okwwCharacterForName('洛瑟拉')?.className, 'Lucilla');
  p.chart.steps[2].startMax += 120;
  const order = [...p.sequenceIds];
  [order[2], order[3]] = [order[3], order[2]];
  const changed = alignOkwwChartToOrder(p.chart, order);
  assert.equal(changed.steps[2].startMax - changed.steps[2].startMin, 120);
  assert.equal(source.steps[2].startMax - source.steps[2].startMin, 0);
});

test('uses simulated-input ordering and recorded switch duration without changing DLC defaults', () => {
  const p = project();
  const replay = buildOkwwReplayPlan(p.chart);
  assert.deepEqual(replay.events.slice(0, 7), [
    { atMs: 518, type: 'keydown', code: 'KeyR' },
    { atMs: 558, type: 'keyup', code: 'KeyR' },
    { atMs: 617, type: 'keydown', code: 'Digit2' },
    { atMs: 665, type: 'keyup', code: 'Digit2' },
    { atMs: 727, type: 'keydown', code: 'KeyE' },
    { atMs: 750, type: 'keydown', code: 'ShiftLeft' },
    { atMs: 767, type: 'keyup', code: 'KeyE' }
  ]);
  assert.equal(replay.loopStartMs, 1000);
  assert.equal(buildOkwwReplayPlan(p.chart, 100, 80).events.find((event) => event.type === 'keyup' && event.code === 'Digit2').atMs, 697);
  const bindings = [{ moveId: 'switch_2', inputs: [{ code: 'Digit2', label: '2' }] }];
  const settings = { startDelayMs: 0, globalDelayMs: 0, mouseOffsetPx: 0, keyFrequencyMs: 100, holdDurationMs: 0 };
  const original = buildSimulatedInputEvents(p.chart, bindings, settings, () => 0.5);
  const exportEvents = buildSimulatedInputEvents(p.chart, bindings, settings, () => 0.5, { minSwitchHoldMs: 0 });
  assert.equal(original.events.find((event) => event.type === 'keyup' && event.code === 'Digit2').atMs, 2617);
  assert.equal(exportEvents.events.find((event) => event.type === 'keyup' && event.code === 'Digit2').atMs, 665);
});

test('creates a four-file ZIP with absolute deadlines and key release', () => {
  const output = generateOkwwPackage(project());
  const archive = unzipSync(output.bytes);
  assert.deepEqual(Object.keys(archive).sort(), ['Augusta.py', 'Iuno.py', 'ShoreKeeper.py', 'team.json']);
  assert.equal(JSON.parse(strFromU8(archive['team.json'])).team, 'Augusta, Iuno, Shorekeeper');
  assert.equal(JSON.parse(strFromU8(archive['team.json'])).version, '5');
  assert.ok(output.replay.events.length > 0);
  for (const name of ['Augusta.py', 'Iuno.py', 'ShoreKeeper.py']) {
    const code = strFromU8(archive[name]);
    assert.ok(code.includes('time.perf_counter()'));
    assert.ok(code.includes('wwcombo replay timed-v5-branches'));
    assert.ok(code.includes('self._wwcombo_emit(kind, code, held)'));
    assert.ok(code.includes('finally:'));
    assert.ok(!code.includes('self.click_liberation('));
    const result = spawnSync('python', ['-X', 'utf8', '-c', 'import ast,sys; ast.parse(sys.stdin.read())'], { input: code, encoding: 'utf8' });
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  }
  const sources = Object.fromEntries(Object.entries(output.files).filter(([name]) => name.endsWith('.py')));
  const runtime = spawnSync('python', ['-X', 'utf8', 'tools/okww-timed-runtime-smoke.py'], { input: JSON.stringify(sources), encoding: 'utf8' });
  assert.equal(runtime.status, 0, runtime.stderr);
  assert.match(runtime.stdout, /timed replay runtime smoke passed/);
});

test('releases held mouse input when a later key injection fails', () => {
  const p = project();
  p.chart.steps.unshift(step('held-heavy', 'heavy_attack', 1, 100, 500));
  const output = generateOkwwPackage(p);
  const sources = Object.fromEntries(Object.entries(output.files).filter(([name]) => name.endsWith('.py')));
  const runtime = spawnSync('python', ['-X', 'utf8', 'tools/okww-timed-runtime-smoke.py'], { input: JSON.stringify({ files: sources, mode: 'release' }), encoding: 'utf8' });
  assert.equal(runtime.status, 0, runtime.stderr);
  assert.match(runtime.stdout, /held input release passed/);
});

test('applies start delay only to the first pass, not every loop', () => {
  const p = project();
  p.replaySettings.startDelayMs = 200;
  const sources = Object.fromEntries(Object.entries(generateOkwwPackage(p).files).filter(([name]) => name.endsWith('.py')));
  const runtime = spawnSync('python', ['-X', 'utf8', 'tools/okww-timed-runtime-smoke.py'], { input: JSON.stringify({ files: sources, mode: 'delay' }), encoding: 'utf8' });
  assert.equal(runtime.status, 0, runtime.stderr);
});

test('rejects fourth slot and compiles manual waits into a paused timebase', () => {
  const p = project();
  p.chart.steps.push(step('switch-four', 'switch_4', 4, 2500));
  assert.throws(() => generateOkwwPackage(p), /只支持三人/);
  p.chart.steps.pop();
  p.rules.push({ id: 'manual', stepId: 'iuno-skill', probe: 'resonance_ready', origin: 'manual', behavior: 'wait', timeoutMs: 1000, onTimeout: 'continue', whileWaiting: 'none' });
  assert.equal(analyzeOkwwProject(p).issues.some((issue) => issue.level === 'error'), false);
  const output = generateOkwwPackage(p);
  const code = output.files['Iuno.py'];
  assert.ok(code.includes('_wwcombo_checkpoint'));
  assert.ok(code.includes('actor.resonance_available()'));
  const sources = Object.fromEntries(Object.entries(output.files).filter(([name]) => name.endsWith('.py')));
  const runtime = spawnSync('python', ['-X', 'utf8', 'tools/okww-timed-runtime-smoke.py'], { input: JSON.stringify({ files: sources, mode: 'manual' }), encoding: 'utf8' });
  assert.equal(runtime.status, 0, runtime.stderr);
});

test('skipping to the next run releases inputs held during an outcome check', () => {
  const p = project();
  p.postChecks = [{ id: 'check-target', stepId: 'iuno-skill', probe: 'target_locked', timeoutMs: 1000, onFailure: 'next_run' }];
  const output = generateOkwwPackage(p);
  const sources = Object.fromEntries(Object.entries(output.files).filter(([name]) => name.endsWith('.py')));
  const runtime = spawnSync('python', ['-X', 'utf8', 'tools/okww-timed-runtime-smoke.py'], { input: JSON.stringify({ files: sources, mode: 'post' }), encoding: 'utf8' });
  assert.equal(runtime.status, 0, runtime.stderr);
});

test('skipping one action does not skip a new action at its exact end boundary', () => {
  const c = chart();
  c.steps = [step('first-skill', 'skill', 1, 100, 50), step('next-hold', 'skill_hold', 1, 150, 50)];
  const p = createOkwwProject(c, { 1: '奥古斯塔', 2: '尤诺', 3: '守岸人' });
  p.rules.push({ id: 'skip-first', stepId: 'first-skill', probe: 'resonance_ready', origin: 'manual', behavior: 'skip', timeoutMs: 100, onTimeout: 'skip', whileWaiting: 'none' });
  const output = generateOkwwPackage(p);
  const sources = Object.fromEntries(Object.entries(output.files).filter(([name]) => name.endsWith('.py')));
  const runtime = spawnSync('python', ['-X', 'utf8', 'tools/okww-timed-runtime-smoke.py'], { input: JSON.stringify({ files: sources, mode: 'boundary' }), encoding: 'utf8' });
  assert.equal(runtime.status, 0, runtime.stderr);
});

test('switch visual failure aborts before the next action or retries with shifted deadlines', () => {
  const p = project();
  const sources = () => Object.fromEntries(Object.entries(generateOkwwPackage(p).files).filter(([name]) => name.endsWith('.py')));
  for (const mode of ['switch_abort', 'switch_delayed']) {
    const runtime = spawnSync('python', ['-X', 'utf8', 'tools/okww-timed-runtime-smoke.py'], { input: JSON.stringify({ files: sources(), mode }), encoding: 'utf8' });
    assert.equal(runtime.status, 0, `${mode}: ${runtime.stderr}`);
  }
  p.replaySettings.switchVerifyTimeoutMs = 350;
  p.replaySettings.switchFailure = 'retry';
  p.replaySettings.switchMaxRetries = 1;
  const runtime = spawnSync('python', ['-X', 'utf8', 'tools/okww-timed-runtime-smoke.py'], { input: JSON.stringify({ files: sources(), mode: 'switch_retry' }), encoding: 'utf8' });
  assert.equal(runtime.status, 0, `switch_retry: ${runtime.stderr}`);
  p.replaySettings.switchMaxRetries = 2;
  const exhausted = spawnSync('python', ['-X', 'utf8', 'tools/okww-timed-runtime-smoke.py'], { input: JSON.stringify({ files: sources(), mode: 'switch_exhaust' }), encoding: 'utf8' });
  assert.equal(exhausted.status, 0, `switch_exhaust: ${exhausted.stderr}`);
});

test('a blocked input shifts the whole replay instead of bursting overdue keys', () => {
  const sources = Object.fromEntries(Object.entries(generateOkwwPackage(project()).files).filter(([name]) => name.endsWith('.py')));
  const runtime = spawnSync('python', ['-X', 'utf8', 'tools/okww-timed-runtime-smoke.py'], { input: JSON.stringify({ files: sources, mode: 'slow_input' }), encoding: 'utf8' });
  assert.equal(runtime.status, 0, runtime.stderr);
});

test('a failed before/after check can jump to a later fallback route', () => {
  const p = project();
  p.rules.push({ id: 'branch-before', stepId: 'iuno-skill', probe: 'resonance_ready', origin: 'manual', behavior: 'skip', timeoutMs: 100, onTimeout: 'branch', whileWaiting: 'none', failureTargetStepId: 'iuno-dodge' });
  assert.equal(analyzeOkwwProject(p).issues.some((issue) => issue.level === 'error'), false);
  let sources = Object.fromEntries(Object.entries(generateOkwwPackage(p).files).filter(([name]) => name.endsWith('.py')));
  const before = spawnSync('python', ['-X', 'utf8', 'tools/okww-timed-runtime-smoke.py'], { input: JSON.stringify({ files: sources, mode: 'branch' }), encoding: 'utf8' });
  assert.equal(before.status, 0, `branch: ${before.stderr}`);

  const post = project();
  post.postChecks = [{ id: 'branch-after', stepId: 'iuno-skill', probe: 'target_locked', timeoutMs: 100, onFailure: 'branch', failureTargetStepId: 'iuno-switch' }];
  assert.equal(analyzeOkwwProject(post).issues.some((issue) => issue.level === 'error'), false);
  sources = Object.fromEntries(Object.entries(generateOkwwPackage(post).files).filter(([name]) => name.endsWith('.py')));
  const after = spawnSync('python', ['-X', 'utf8', 'tools/okww-timed-runtime-smoke.py'], { input: JSON.stringify({ files: sources, mode: 'branch_post' }), encoding: 'utf8' });
  assert.equal(after.status, 0, `branch_post: ${after.stderr}`);
});

test('mismatched team order or starting character does not run the recorded inputs', () => {
  const sources = Object.fromEntries(Object.entries(generateOkwwPackage(project()).files).filter(([name]) => name.endsWith('.py')));
  for (const mode of ['wrong_start', 'wrong_roster']) {
    const runtime = spawnSync('python', ['-X', 'utf8', 'tools/okww-timed-runtime-smoke.py'], { input: JSON.stringify({ files: sources, mode }), encoding: 'utf8' });
    assert.equal(runtime.status, 0, `${mode}: ${runtime.stderr}`);
  }
});

test('returns to the combat loop every five seconds while preserving absolute event deadlines', () => {
  const c = chart();
  c.periods = [
    { id: 'start', kind: 'startup_axis', label: 'Start', startMs: 0, endMs: 16000 },
    { id: 'loop', kind: 'loop_axis', label: 'Loop', startMs: 16000, endMs: 20000 }
  ];
  c.steps = [step('early', 'skill', 1, 100, 50), step('late', 'skill', 1, 10100, 50),
    step('switch', 'switch_2', 2, 15100, 50), step('echo', 'echo', 2, 16100, 50)];
  const p = createOkwwProject(c, { 1: '奥古斯塔', 2: '尤诺', 3: '守岸人' });
  const output = generateOkwwPackage(p);
  const sources = Object.fromEntries(Object.entries(output.files).filter(([name]) => name.endsWith('.py')));
  for (const mode of ['chunk', 'chunk_gap']) {
    const runtime = spawnSync('python', ['-X', 'utf8', 'tools/okww-timed-runtime-smoke.py'], { input: JSON.stringify({ files: sources, mode }), encoding: 'utf8' });
    assert.equal(runtime.status, 0, `${mode}: ${runtime.stderr}`);
  }
});
