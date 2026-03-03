export interface AgentContextThresholds {
  coverage: {
    minPerScenario: number;
    suiteAvgMin: number;
  };
  efficiency: {
    maxToolCallsPerScenario: number;
    suiteAvgMax: number;
  };
}

export interface AgentContextToolStep {
  tool: 'query' | 'context' | 'impact' | 'cypher';
  input: Record<string, unknown>;
}

export interface AgentContextCheck {
  id: 'T' | 'U' | 'D' | 'B' | 'I' | 'E' | string;
  required_uid?: string;
  forbidden_uid?: string;
  min_results?: number;
  max_results?: number;
  max_tool_calls?: number;
}

export interface AgentContextScenario {
  scenario_id: string;
  target_uid: string;
  tool_plan: AgentContextToolStep[];
  checks: AgentContextCheck[];
}

export interface AgentContextDataset {
  thresholds: AgentContextThresholds;
  scenarios: AgentContextScenario[];
}
