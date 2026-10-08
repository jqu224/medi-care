import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedDatabase } from '../src/workspace/model';
import { careTodos } from '../src/workspace/careTodos';

test('daily shared metrics appear once, today clears them, paused modules contribute nothing', () => {
  const db = seedDatabase();
  const p = db.patients[0];
  p.plans = [];
  p.observations = [];
  const tasks = careTodos(p, db.metrics, '2026-10-08');
  assert.equal(tasks.filter(t => t.metricId === 'temp').length, 1);
  p.observations.push({id:'test',group:'test',metric:'temp',value:37,at:'2026-10-08T09:00',created:'2026-10-08',source:'家属自录',author:'测试'});
  assert.equal(careTodos(p, db.metrics, '2026-10-08').some(t => t.metricId === 'temp'), false);
  p.monitors.forEach(m => m.active = false);
  assert.deepEqual(careTodos(p, db.metrics, '2026-10-08'), []);
});

test('weekly gap uses seven calendar days and does not request another test', () => {
  const db = seedDatabase();
  const p = db.patients[0];
  p.plans = [];
  const lab = p.observations.find(o => o.metric === 'ferritin')!;
  p.observations = [{...lab, at:'2026-10-01T23:59'}];
  assert.equal(careTodos(p, db.metrics, '2026-10-07').some(t => t.metricId === 'ferritin'), false);
  const task = careTodos(p, db.metrics, '2026-10-08').find(t => t.metricId === 'ferritin');
  assert.match(task!.reason, /7 天未更新/);
  assert.match(task!.reason, /核对是否有新记录/);
});

test('due plans precede missing records, completion removes only corresponding task', () => {
  const db = seedDatabase();
  const p = db.patients[0];
  p.events = [];
  p.plans[0].date = '2026-10-08';
  const plan = p.plans[0];
  assert.equal(careTodos(p, db.metrics, '2026-10-08')[0].id, plan.id);
  p.events.push({id:'done',type:'服药',at:'2026-10-08T08:00',created:'2026-10-08',author:'测试',planId:plan.id,hospital:'未注明'});
  assert.equal(careTodos(p, db.metrics, '2026-10-08').some(t => t.id === plan.id), false);
});
