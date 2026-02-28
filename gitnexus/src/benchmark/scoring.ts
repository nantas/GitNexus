import type { Thresholds } from './types.js';

export function computePR(truePositive: number, predicted: number, gold: number) {
  const precision = predicted === 0 ? 0 : truePositive / predicted;
  const recall = gold === 0 ? 0 : truePositive / gold;
  return { precision, recall };
}

export function computeF1(precision: number, recall: number) {
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

export function evaluateGates(
  metrics: {
    queryPrecision: number;
    queryRecall: number;
    contextImpactF1: number;
    smokePassRate: number;
    perfRegressionPct: number;
  },
  thresholds: Thresholds,
) {
  const failures: string[] = [];

  if (metrics.queryPrecision < thresholds.query.precisionMin) {
    failures.push('query.precision');
  }
  if (metrics.queryRecall < thresholds.query.recallMin) {
    failures.push('query.recall');
  }
  if (metrics.contextImpactF1 < thresholds.contextImpact.f1Min) {
    failures.push('contextImpact.f1');
  }
  if (metrics.smokePassRate < thresholds.smoke.passRateMin) {
    failures.push('smoke.passRate');
  }
  if (metrics.perfRegressionPct > thresholds.performance.analyzeTimeRegressionMaxPct) {
    failures.push('performance.analyzeTimeRegression');
  }

  return { pass: failures.length === 0, failures };
}
