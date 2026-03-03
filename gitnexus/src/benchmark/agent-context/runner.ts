import path from 'node:path';
import { evaluateScenarioChecks } from './evaluators.js';
import { createAgentContextToolRunner } from './tool-runner.js';
import type { AgentContextCheckResult, AgentContextDataset, AgentContextToolStep } from './types.js';

export interface AgentContextToolRunner {
  query: (params: any) => Promise<any>;
  context: (params: any) => Promise<any>;
  impact: (params: any) => Promise<any>;
  cypher: (params: any) => Promise<any>;
  close: () => Promise<void>;
}

export interface AgentContextScenarioRun {
  scenarioId: string;
  targetUid: string;
  toolCalls: number;
  coverage: number;
  checks: AgentContextCheckResult[];
  gatePass: boolean;
  stepOutputs: Array<{ tool: string; input: Record<string, unknown>; output: any }>;
}

export interface AgentContextBenchmarkResult {
  pass: boolean;
  failures: string[];
  reportDir: string;
  metrics: {
    avgCoverage: number;
    avgToolCalls: number;
    mandatoryTargetPassRate: number;
  };
  scenarios: AgentContextScenarioRun[];
}

export interface RunAgentContextBenchmarkOptions {
  repo?: string;
  reportDir?: string;
  profile?: { maxScenarios: number };
  runner?: AgentContextToolRunner;
}

function callTool(runner: AgentContextToolRunner, step: AgentContextToolStep, repo?: string) {
  const params = repo ? { ...step.input, repo } : { ...step.input };

  if (step.tool === 'query') {
    return runner.query(params);
  }
  if (step.tool === 'context') {
    return runner.context(params);
  }
  if (step.tool === 'impact') {
    return runner.impact(params);
  }
  return runner.cypher(params);
}

export async function executeToolPlan(
  plan: AgentContextToolStep[],
  runner: AgentContextToolRunner,
  repo?: string,
): Promise<Array<{ tool: string; input: Record<string, unknown>; output: any }>> {
  const outputs: Array<{ tool: string; input: Record<string, unknown>; output: any }> = [];

  for (const step of plan) {
    const input = repo ? { ...step.input, repo } : { ...step.input };
    const output = await callTool(runner, step, repo);
    outputs.push({ tool: step.tool, input, output });
  }

  return outputs;
}

function computeCoverage(checks: AgentContextCheckResult[]): number {
  if (checks.length === 0) {
    return 0;
  }
  const passed = checks.filter((check) => check.pass).length;
  return passed / checks.length;
}

export async function runAgentContextBenchmark(
  dataset: AgentContextDataset,
  options: RunAgentContextBenchmarkOptions,
): Promise<AgentContextBenchmarkResult> {
  const reportDir = path.resolve(options.reportDir || '.gitnexus/benchmark-agent-context');
  const scenariosToRun =
    options.profile?.maxScenarios && Number.isFinite(options.profile.maxScenarios)
      ? dataset.scenarios.slice(0, options.profile.maxScenarios)
      : dataset.scenarios;

  const runner = options.runner || (await createAgentContextToolRunner());
  const ownsRunner = !options.runner;

  const scenarioRuns: AgentContextScenarioRun[] = [];
  const failures: string[] = [];

  try {
    for (const scenario of scenariosToRun) {
      const stepOutputs = await executeToolPlan(scenario.tool_plan, runner, options.repo);
      const checkResults = evaluateScenarioChecks(
        stepOutputs.map((entry) => entry.output),
        scenario.checks,
        {
          targetUid: scenario.target_uid,
          toolCalls: stepOutputs.length,
        },
      );
      const coverage = computeCoverage(checkResults);
      const targetCheck = checkResults.find((check) => check.id === 'T');
      const gatePass = Boolean(targetCheck?.pass) && coverage >= dataset.thresholds.coverage.minPerScenario;

      scenarioRuns.push({
        scenarioId: scenario.scenario_id,
        targetUid: scenario.target_uid,
        toolCalls: stepOutputs.length,
        coverage,
        checks: checkResults,
        gatePass,
        stepOutputs,
      });
    }
  } finally {
    if (ownsRunner) {
      await runner.close();
    }
  }

  const avgCoverage =
    scenarioRuns.length === 0 ? 0 : scenarioRuns.reduce((acc, scenario) => acc + scenario.coverage, 0) / scenarioRuns.length;
  const avgToolCalls =
    scenarioRuns.length === 0 ? 0 : scenarioRuns.reduce((acc, scenario) => acc + scenario.toolCalls, 0) / scenarioRuns.length;
  const targetPassCount = scenarioRuns.filter((scenario) => scenario.checks.some((check) => check.id === 'T' && check.pass)).length;
  const mandatoryTargetPassRate = scenarioRuns.length === 0 ? 0 : targetPassCount / scenarioRuns.length;

  for (const scenario of scenarioRuns) {
    if (!scenario.checks.some((check) => check.id === 'T' && check.pass)) {
      failures.push(`scenario.${scenario.scenarioId}.target`);
    }
    if (scenario.coverage < dataset.thresholds.coverage.minPerScenario) {
      failures.push(`scenario.${scenario.scenarioId}.coverage`);
    }
  }
  if (avgCoverage < dataset.thresholds.coverage.suiteAvgMin) {
    failures.push('suite.coverage');
  }
  if (avgToolCalls > dataset.thresholds.efficiency.suiteAvgMax) {
    failures.push('suite.efficiency');
  }

  return {
    pass: failures.length === 0,
    failures,
    reportDir,
    metrics: {
      avgCoverage,
      avgToolCalls,
      mandatoryTargetPassRate,
    },
    scenarios: scenarioRuns,
  };
}
