import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_SETTINGS,
  TIERS,
  TIER_FACTOR,
  effDays,
  effThreshold,
  normalizeSettings,
  tierFactor,
  tierFromLegacySensitivity,
} from "../src/engine/config";

test("three qualitative tiers exist and each explains itself", () => {
  assert.deepEqual(
    TIERS.map((t) => t.id),
    ["conservative", "balanced", "cautious"],
  );
  for (const t of TIERS) {
    assert.ok(t.hint.length > 0, `${t.name} 档缺说明`);
  }
});

test("no tier hint promises an alert count", () => {
  for (const t of TIERS) {
    assert.doesNotMatch(t.hint, /次|月|预计|大概/, `${t.name} 档出现了次数承诺`);
  }
});

test("tier ordering: conservative is harder to trigger than cautious", () => {
  assert.ok(TIER_FACTOR.conservative < TIER_FACTOR.balanced);
  assert.ok(TIER_FACTOR.balanced < TIER_FACTOR.cautious);
  // 因子越大 → 有效阈值越低 → 越容易越线
  assert.ok(
    effThreshold(684, TIER_FACTOR.conservative) > effThreshold(684, TIER_FACTOR.cautious),
  );
  // 因子越大 → 所需天数越少
  assert.ok(effDays(3, TIER_FACTOR.conservative) > effDays(3, TIER_FACTOR.cautious));
});

test("tierFactor falls back to balanced for missing input", () => {
  assert.equal(tierFactor(undefined), TIER_FACTOR.balanced);
  assert.equal(tierFactor("balanced"), TIER_FACTOR.balanced);
});

test("legacy continuous sensitivity maps onto the three tiers", () => {
  assert.equal(tierFromLegacySensitivity(1.3), "cautious");
  assert.equal(tierFromLegacySensitivity(1.5), "cautious");
  assert.equal(tierFromLegacySensitivity(0.6), "conservative");
  assert.equal(tierFromLegacySensitivity(1.0), "balanced");
  assert.equal(tierFromLegacySensitivity(0.9), "conservative", "0.9 偏保守");
  assert.equal(tierFromLegacySensitivity(1.08), "cautious", "1.08 起为谨慎");
  assert.equal(tierFromLegacySensitivity(1.1), "cautious");
});

test("normalizeSettings migrates legacy sensitivity into a tier", () => {
  const legacy = { sensitivity: 1.3, weights: {}, coreFlags: {} };
  const now = normalizeSettings(legacy);
  assert.equal(now.tier, "cautious");
  assert.equal("sensitivity" in now, false, "迁移后不再保留连续值");
});

test("normalizeSettings is idempotent", () => {
  const once = normalizeSettings({ sensitivity: 0.6 });
  const twice = normalizeSettings(once);
  assert.deepEqual(twice, once);
  assert.equal(twice.tier, "conservative");
});

test("normalizeSettings keeps an explicit tier and fills missing fields", () => {
  const s = normalizeSettings({ tier: "cautious" });
  assert.equal(s.tier, "cautious");
  assert.deepEqual(s.weights, DEFAULT_SETTINGS.weights);
  assert.deepEqual(s.coreFlags, DEFAULT_SETTINGS.coreFlags);
});

test("normalizeSettings survives junk input", () => {
  for (const junk of [null, undefined, {}, 0, "x", []]) {
    const s = normalizeSettings(junk);
    assert.equal(s.tier, "balanced");
  }
});

test("normalizeSettings preserves existing weights and core flags", () => {
  const s = normalizeSettings({
    tier: "balanced",
    weights: { temp: 1, ferritin: 3 },
    coreFlags: { ldh: true },
  });
  assert.equal(s.weights.temp, 1);
  assert.equal(s.weights.ferritin, 3);
  assert.equal(s.weights.ast, DEFAULT_SETTINGS.weights.ast, "未给的补默认值");
  assert.equal(s.coreFlags.ldh, true);
});

test("an unknown tier value does not crash the engine", () => {
  const s = normalizeSettings({ tier: "nonsense" });
  assert.equal(s.tier, "balanced");
});