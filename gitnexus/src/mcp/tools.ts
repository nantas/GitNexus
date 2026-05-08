/**
 * MCP Tool Definitions
 *
 * Defines the tools that GitNexus exposes to external AI agents.
 * All tools support an optional `repo` parameter for multi-repo setups.
 */

import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export interface ToolDefinition {
  name: string;
  description: string;
  annotations: ToolAnnotations;
  inputSchema: {
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        default?: unknown;
        items?: { type: string };
        enum?: string[];
        minimum?: number;
        maximum?: number;
        minLength?: number;
      }
    >;
    required: string[];
  };
}

const READ_ONLY_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const QUERY_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const DESTRUCTIVE_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

export const GITNEXUS_TOOLS: ToolDefinition[] = [
  {
    name: 'list_repos',
    description: `List all indexed repositories available to GitNexus.

Returns each repo's name, path, indexed date, last commit, and stats.

WHEN TO USE: First step when multiple repos are indexed, or to discover available repos.
AFTER THIS: READ gitnexus://repo/{name}/context for the repo you want to work with.

When multiple repos are indexed, you MUST specify the "repo" parameter
on other tools (query, context, impact, etc.) to target the correct one.`,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'query',
    description: `Query the code knowledge graph for execution flows related to a concept.
Returns processes (call chains) ranked by relevance, each with its symbols and file locations.

WHEN TO USE: Understanding how code works together. Use this when you need execution flows and relationships, not just file matches. Complements grep/IDE search.
AFTER THIS: Use context() on a specific symbol for 360-degree view (callers, callees, categorized refs).

Returns results grouped by process (execution flow):
- processes: ranked execution flows with relevance priority
- process_symbols: all symbols in those flows with file locations and module (functional area)
- definitions: standalone types/interfaces not in any process
- processes[].evidence_mode: direct_step | method_projected
- processes[].confidence: high | medium | low
- processes[].process_subtype: unity_lifecycle | static_calls (when persisted metadata exists)
- processes[].runtime_chain_confidence: high | medium | low
- processes[].runtime_chain_evidence_level: none | clue | verified_segment | verified_chain
- processes[].verification_hint: { action, target, next_command } (required when confidence=low)
- process_symbols[].process_evidence_mode: direct_step | method_projected
- process_symbols[].process_confidence: high | medium | low
- process_symbols[].process_subtype: unity_lifecycle | static_calls (when persisted metadata exists)
- process_symbols[].runtime_chain_confidence: high | medium | low
- process_symbols[].runtime_chain_evidence_level: none | clue | verified_segment | verified_chain
- process_symbols[].verification_hint: { action, target, next_command }

Default response_profile=slim shape:
- summary, candidates, process_hints, resource_hints, decision, upgrade_hints, runtime_preview
- facts, closure, clues, tier_envelope
- missing_proof_targets, suggested_context_targets
- read order in strict-anchor mode: facts -> closure -> clues
- suggested_context_targets[]: { name, uid?, filePath?, why } for direct context disambiguation
- upgrade_hints may include exact \`context --uid\` follow-ups when same-name symbols are ambiguous
- decision.recommended_follow_up prefers narrowing hints (for example resource_path_prefix/name) before response_profile=full fallback
- response_profile=slim is the default and sufficient for all normal agent workflows
- response_profile=full is for debugging and deep evidence inspection only
- recommended runtime retrieval sequence: discovery -> seed narrowing -> closure verification
- strong graph hops can coexist with failed closure when verifier-core remains failed

Hybrid ranking: BM25 keyword + semantic vector search, ranked by Reciprocal Rank Fusion.
Supports optional scope controls for noisy codebases:
- scope_preset=unity-gameplay to prioritize project gameplay code and suppress plugin-heavy paths.
- scope_preset=unity-all (default behavior) to keep full Unity search scope.

Includes optional Unity retrieval contract:
- Set unity_resources=on|auto to include Unity resource evidence.
- Default unity_hydration_mode=compact (fast path).
- Check response hydrationMeta: when needsParityRetry=true, rerun with unity_hydration_mode=parity for completeness.
- Runtime-chain semantics are two-layered:
  - verifier-core: binary (verified_full | failed)
  - policy-adjusted: query-visible result; under strict policy fallback (hydrationMeta.fallbackToCompact=true) this may downgrade to partial semantics.
- Returns next_hops[] with ranked follow-up actions when Unity evidence is available.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language or keyword search query' },
        task_context: { type: 'string', description: 'What you are working on (e.g., "adding OAuth support"). Helps ranking.' },
        goal: { type: 'string', description: 'What you want to find (e.g., "existing auth validation logic"). Helps ranking.' },
        limit: { type: 'number', description: 'Max processes to return (default: 5)', default: 5 },
        max_symbols: { type: 'number', description: 'Max symbols per process (default: 10)', default: 10 },
        include_content: { type: 'boolean', description: 'Include full symbol source code (default: false)', default: false },
        response_profile: {
          type: 'string',
          enum: ['slim', 'full'],
          description: 'Response payload profile: slim (default, sufficient for normal workflows) or full (debug-only for deep evidence inspection).',
          default: 'slim',
        },
        scope_preset: {
          type: 'string',
          enum: ['unity-gameplay', 'unity-all'],
          description: 'Optional retrieval preset. unity-gameplay reduces plugin/package noise in Unity projects.',
        },
        unity_resources: {
          type: 'string',
          enum: ['off', 'on', 'auto'],
          description: 'Unity resource retrieval mode (default: off)',
          default: 'off',
        },
        unity_hydration_mode: {
          type: 'string',
          enum: ['parity', 'compact'],
          description: 'Execution-mode input for Unity hydration (default: compact). Can be overridden by hydration_policy; inspect hydrationMeta.requestedMode/effectiveMode/reason.',
          default: 'compact',
        },
        unity_evidence_mode: {
          type: 'string',
          enum: ['summary', 'focused', 'full'],
          description: 'Unity evidence payload mode (default: summary)',
          default: 'summary',
        },
        hydration_policy: {
          type: 'string',
          enum: ['fast', 'balanced', 'strict'],
          description: 'Hydration strategy policy (high-priority). strict->parity, fast->compact, balanced->uses unity_hydration_mode and may escalate to parity on missing evidence.',
          default: 'balanced',
        },
        resource_path_prefix: {
          type: 'string',
          description: 'Optional resource-path prefix filter applied to Unity evidence bindings',
        },
        binding_kind: {
          type: 'string',
          description: 'Optional Unity binding kind filter (for example: direct, component, scriptable_object)',
        },
        max_bindings: {
          type: 'number',
          description: 'Optional cap for number of returned evidence bindings',
        },
        max_reference_fields: {
          type: 'number',
          description: 'Optional cap for number of reference fields returned per binding',
        },
        resource_seed_mode: {
          type: 'string',
          enum: ['strict', 'balanced'],
          description: 'Resource-seed policy for Unity retrieval hints. strict prioritizes user-provided asset path and deterministic mapped assets.',
          default: 'balanced',
        },
        runtime_chain_verify: {
          type: 'string',
          enum: ['off', 'on-demand'],
          description: 'Explicit runtime chain verification mode (default: off)',
          default: 'off',
        },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'cypher',
    description: `Execute Cypher query against the code knowledge graph.

WHEN TO USE: Complex structural queries that search/explore can't answer. READ gitnexus://repo/{name}/schema first for the full schema.
AFTER THIS: Use context() on result symbols for deeper context.

SCHEMA:
- Nodes: File, Folder, Function, Class, Interface, Method, CodeElement, Community, Process, Route, Tool
- Multi-language nodes (use backticks): \`Struct\`, \`Enum\`, \`Trait\`, \`Impl\`, etc.
- All edges via single CodeRelation table with 'type' property
- Edge types: CONTAINS, DEFINES, CALLS, IMPORTS, EXTENDS, IMPLEMENTS, HAS_METHOD, HAS_PROPERTY, ACCESSES, METHOD_OVERRIDES, METHOD_IMPLEMENTS, MEMBER_OF, STEP_IN_PROCESS, HANDLES_ROUTE, FETCHES, HANDLES_TOOL, ENTRY_POINT_OF
- Edge properties: type (STRING), confidence (DOUBLE), reason (STRING), step (INT32)

EXAMPLES:
• Find callers of a function:
  MATCH (a)-[:CodeRelation {type: 'CALLS'}]->(b:Function {name: "validateUser"}) RETURN a.name, a.filePath

• Find community members:
  MATCH (f)-[:CodeRelation {type: 'MEMBER_OF'}]->(c:Community) WHERE c.heuristicLabel = "Auth" RETURN f.name

• Trace a process:
  MATCH (s)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process) WHERE p.heuristicLabel = "UserLogin" RETURN s.name, r.step ORDER BY r.step

• Find all methods of a class:
  MATCH (c:Class {name: "UserService"})-[r:CodeRelation {type: 'HAS_METHOD'}]->(m:Method) RETURN m.name, m.parameterCount, m.returnType

• Find all properties of a class:
  MATCH (c:Class {name: "User"})-[r:CodeRelation {type: 'HAS_PROPERTY'}]->(p:Property) RETURN p.name, p.declaredType

• Find all writers of a field:
  MATCH (f:Function)-[r:CodeRelation {type: 'ACCESSES', reason: 'write'}]->(p:Property) WHERE p.name = "address" RETURN f.name, f.filePath

• Find method overrides (MRO resolution):
  MATCH (winner:Method)-[r:CodeRelation {type: 'METHOD_OVERRIDES'}]->(loser:Method) RETURN winner.name, winner.filePath, loser.filePath, r.reason

• Detect diamond inheritance:
  MATCH (d:Class)-[:CodeRelation {type: 'EXTENDS'}]->(b1), (d)-[:CodeRelation {type: 'EXTENDS'}]->(b2), (b1)-[:CodeRelation {type: 'EXTENDS'}]->(a), (b2)-[:CodeRelation {type: 'EXTENDS'}]->(a) WHERE b1 <> b2 RETURN d.name, b1.name, b2.name, a.name

OUTPUT: Returns { markdown, row_count } — results formatted as a Markdown table for easy reading.

TIPS:
- All relationships use single CodeRelation table — filter with {type: 'CALLS'} etc.
- Community = auto-detected functional area (Leiden algorithm). Properties: heuristicLabel, cohesion, symbolCount, keywords, description, enrichedBy
- Process = execution flow trace from entry point to terminal. Properties: heuristicLabel, processType, stepCount, communities, entryPointId, terminalId
- Use heuristicLabel (not label) for human-readable community/process names`,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Cypher query to execute' },
        repo: {
          type: 'string',
          description: 'Repository name or path. Omit if only one repo is indexed.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'context',
description: `360-degree view of a single code symbol.
Shows categorized incoming/outgoing references (calls, imports, extends, implements), process participation, and file location.

WHEN TO USE: After query() to understand a specific symbol in depth. When you need to know all callers, callees, and what execution flows a symbol participates in.
AFTER THIS: Use impact() if planning changes, or READ gitnexus://repo/{name}/process/{processName} for full execution trace.

Handles disambiguation: if multiple symbols share the same name, returns candidates for you to pick from. Use uid param for zero-ambiguity lookup from prior results.

Process participation metadata:
- processes[].evidence_mode: direct_step | method_projected
- processes[].confidence: high | medium | low
- processes[].process_subtype: unity_lifecycle | static_calls (when persisted metadata exists)
- processes[].runtime_chain_confidence: high | medium | low
- processes[].runtime_chain_evidence_level: none | clue | verified_segment | verified_chain
- processes[].verification_hint: { action, target, next_command } (required when confidence=low)

Default response_profile=slim shape:
- summary, symbol, incoming, outgoing, processes, resource_hints, verification_hint, upgrade_hints, runtime_preview
- facts, closure, clues, tier_envelope
- missing_proof_targets, suggested_context_targets
- read order in strict-anchor mode: facts -> closure -> clues
- suggested_context_targets[]: { name, uid?, filePath?, why } for direct context disambiguation
- upgrade_hints may include exact \`context --uid\` follow-ups when same-name symbols are ambiguous
- response_profile=slim is the default and sufficient for all normal agent workflows
- response_profile=full is for debugging and deep evidence inspection only
- recommended runtime retrieval sequence: discovery -> seed narrowing -> closure verification
- strong graph hops can coexist with failed closure when verifier-core remains failed

Unity retrieval contract:
- Set unity_resources=on|auto to include Unity resource evidence.
- Default unity_hydration_mode=compact (fast path).
- Check response hydrationMeta: when needsParityRetry=true, rerun with unity_hydration_mode=parity for completeness.
- Runtime-chain semantics are two-layered:
  - verifier-core: binary (verified_full | failed)
  - policy-adjusted: context-visible result; under strict policy fallback (hydrationMeta.fallbackToCompact=true) this may downgrade to partial semantics.
- Returns next_hops[] with ranked follow-up actions when Unity evidence is available.`,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Symbol name (e.g., "validateUser", "AuthService")' },
        uid: {
          type: 'string',
          description: 'Direct symbol UID from prior tool results (zero-ambiguity lookup)',
        },
        file_path: { type: 'string', description: 'File path to disambiguate common names' },
        include_content: { type: 'boolean', description: 'Include full symbol source code (default: false)', default: false },
        response_profile: {
          type: 'string',
          enum: ['slim', 'full'],
          description: 'Response payload profile: slim (default, sufficient for normal workflows) or full (debug-only for deep evidence inspection).',
          default: 'slim',
        },
        unity_resources: {
          type: 'string',
          enum: ['off', 'on', 'auto'],
          description: 'Unity resource retrieval mode (default: off)',
          default: 'off',
        },
        unity_hydration_mode: {
          type: 'string',
          enum: ['parity', 'compact'],
          description: 'Execution-mode input for Unity hydration (default: compact). Can be overridden by hydration_policy; inspect hydrationMeta.requestedMode/effectiveMode/reason.',
          default: 'compact',
        },
        unity_evidence_mode: {
          type: 'string',
          enum: ['summary', 'focused', 'full'],
          description: 'Unity evidence payload mode (default: summary)',
          default: 'summary',
        },
        hydration_policy: {
          type: 'string',
          enum: ['fast', 'balanced', 'strict'],
          description: 'Hydration strategy policy (high-priority). strict->parity, fast->compact, balanced->uses unity_hydration_mode and may escalate to parity on missing evidence.',
          default: 'balanced',
        },
        resource_path_prefix: {
          type: 'string',
          description: 'Optional resource-path prefix filter applied to Unity evidence bindings',
        },
        binding_kind: {
          type: 'string',
          description: 'Optional Unity binding kind filter (for example: direct, component, scriptable_object)',
        },
        max_bindings: {
          type: 'number',
          description: 'Optional cap for number of returned evidence bindings',
        },
        max_reference_fields: {
          type: 'number',
          description: 'Optional cap for number of reference fields returned per binding',
        },
        resource_seed_mode: {
          type: 'string',
          enum: ['strict', 'balanced'],
          description: 'Resource-seed policy for Unity retrieval hints. strict prioritizes user-provided asset path and deterministic mapped assets.',
          default: 'balanced',
        },
        runtime_chain_verify: {
          type: 'string',
          enum: ['off', 'on-demand'],
          description: 'Explicit runtime chain verification mode (default: off)',
          default: 'off',
        },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: [],
    },
  },
  {
    name: 'detect_changes',
    description: `Analyze uncommitted git changes and find affected execution flows.
Maps git diff hunks to indexed symbols, then traces which processes are impacted.

WHEN TO USE: Before committing — to understand what your changes affect. Pre-commit review, PR preparation.
AFTER THIS: Review affected processes. Use context() on high-risk symbols. READ gitnexus://repo/{name}/process/{name} for full traces.

Returns: changed symbols, affected processes, and a risk summary.`,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'What to analyze: "unstaged" (default), "staged", "all", or "compare"',
          enum: ['unstaged', 'staged', 'all', 'compare'],
          default: 'unstaged',
        },
        base_ref: {
          type: 'string',
          description: 'Branch/commit for "compare" scope (e.g., "main")',
        },
        repo: {
          type: 'string',
          description: 'Repository name or path. Omit if only one repo is indexed.',
        },
      },
      required: [],
    },
  },
  {
    name: 'rename',
    description: `Multi-file coordinated rename using the knowledge graph + text search.
Finds all references via graph (high confidence) and regex text search (lower confidence). Preview by default.

WHEN TO USE: Renaming a function, class, method, or variable across the codebase. Safer than find-and-replace.
AFTER THIS: Run detect_changes() to verify no unexpected side effects.

Each edit is tagged with confidence:
- "graph": found via knowledge graph relationships (high confidence, safe to accept)
- "text_search": found via regex text search (lower confidence, review carefully)`,
    annotations: DESTRUCTIVE_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        symbol_name: { type: 'string', description: 'Current symbol name to rename' },
        symbol_uid: {
          type: 'string',
          description: 'Direct symbol UID from prior tool results (zero-ambiguity)',
        },
        new_name: { type: 'string', description: 'The new name for the symbol' },
        file_path: { type: 'string', description: 'File path to disambiguate common names' },
        dry_run: {
          type: 'boolean',
          description: 'Preview edits without modifying files (default: true)',
          default: true,
        },
        repo: {
          type: 'string',
          description: 'Repository name or path. Omit if only one repo is indexed.',
        },
      },
      required: ['new_name'],
    },
  },
  {
    name: 'unity_ui_trace',
    description: `Resolve Unity UI evidence chains (query-time only, no graph writes).

Supports three goals:
- asset_refs: which prefab/asset points to a target UXML
- template_refs: which UXML templates are referenced by a target UXML
- selector_bindings: static C# selector bindings traced to USS selectors

Selector matching modes for selector_bindings:
- balanced (default): match class tokens inside composite selectors (higher recall)
- strict: only exact \`.className\` selectors (higher precision)

Output enforces unique-result policy and includes path+line evidence hops.`,
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target C# class or UXML path' },
        goal: {
          type: 'string',
          enum: ['asset_refs', 'template_refs', 'selector_bindings'],
          description: 'Trace goal',
        },
        selector_mode: {
          type: 'string',
          enum: ['strict', 'balanced'],
          description: 'Selector matching mode for selector_bindings (default: balanced)',
        },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: ['target', 'goal'],
    },
  },
  {
    name: 'rule_lab_analyze',
    description: `Analyze one Rule Lab slice and emit anchor-backed candidates.jsonl.`,
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Rule Lab run id' },
        slice_id: { type: 'string', description: 'Rule Lab slice id' },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: ['run_id', 'slice_id'],
    },
  },
  {
    name: 'rule_lab_review_pack',
    description: `Pack analyzed candidates into review cards with token budget enforcement.`,
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Rule Lab run id' },
        slice_id: { type: 'string', description: 'Rule Lab slice id' },
        max_tokens: { type: 'number', description: 'Token budget cap (default: 6000)', default: 6000 },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: ['run_id', 'slice_id'],
    },
  },
  {
    name: 'rule_lab_curate',
    description: `Validate human-curated semantic closure input and persist curated artifacts for promotion.`,
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Rule Lab run id' },
        slice_id: { type: 'string', description: 'Rule Lab slice id' },
        input_path: { type: 'string', description: 'Absolute or repo-relative path to curation input JSON' },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: ['run_id', 'slice_id', 'input_path'],
    },
  },
  {
    name: 'rule_lab_promote',
    description: `Promote curated candidates into approved YAML rules and upsert catalog.json entries.`,
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Rule Lab run id' },
        slice_id: { type: 'string', description: 'Rule Lab slice id' },
        version: { type: 'string', description: 'Promoted rule version (default: 1.0.0)', default: '1.0.0' },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: ['run_id', 'slice_id'],
    },
  },
  {
    name: 'rule_lab_regress',
    description: `Evaluate Rule Lab precision/coverage gates and optionally persist a regression report.`,
    inputSchema: {
      type: 'object',
      properties: {
        precision: { type: 'number', description: 'Observed precision metric' },
        coverage: { type: 'number', description: 'Observed coverage metric' },
        probes_path: { type: 'string', description: 'Optional path to a JSON array of regression probes with bucket metadata' },
        run_id: { type: 'string', description: 'Optional run id for report naming' },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: ['precision', 'coverage'],
    },
  },
  {
    name: 'impact',
    description: `Analyze the blast radius of changing a code symbol.
Returns affected symbols grouped by depth, plus risk assessment, affected execution flows, and affected modules.

WHEN TO USE: Before making code changes — especially refactoring, renaming, or modifying shared code. Shows what would break.
AFTER THIS: Review d=1 items (WILL BREAK). Use context() on high-risk symbols.

Output includes:
- risk: LOW / MEDIUM / HIGH / CRITICAL
- summary: direct callers, processes affected, modules affected
- affected_processes: which execution flows break and at which step
- affected_modules: which functional areas are hit (direct vs indirect)
- byDepth: all affected symbols grouped by traversal depth

Depth groups:
- d=1: WILL BREAK (direct callers/importers)
- d=2: LIKELY AFFECTED (indirect)
- d=3: MAY NEED TESTING (transitive)

TIP: Default traversal uses CALLS/IMPORTS/EXTENDS/IMPLEMENTS. For class members, include HAS_METHOD and HAS_PROPERTY in relationTypes. For field access analysis, include ACCESSES in relationTypes.

Handles disambiguation: when multiple symbols share the target name, returns ranked candidates (each with a relevance score) instead of silently picking one. Use target_uid for zero-ambiguity lookup, or narrow with file_path and/or kind hints.

EdgeType: CALLS, IMPORTS, EXTENDS, IMPLEMENTS, HAS_METHOD, HAS_PROPERTY, METHOD_OVERRIDES, METHOD_IMPLEMENTS, ACCESSES
Confidence: 1.0 = certain, <0.8 = fuzzy match

GROUP MODE: set "repo" to "@<groupName>" for cross-repo impact anchored at the default member (lexicographically first key in group.yaml "repos"), or "@<groupName>/<groupRepoPath>" to choose the member (same path keys as in group.yaml). Phase-1 walk runs in that member; cross-boundary fan-out uses the group bridge.

SERVICE: optional monorepo path prefix (case-sensitive path segments). When "repo" starts with "@", scopes the local impact walk and cross-repo symbol paths to files under that prefix; ignored for a normal indexed repo name.`,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Name of function, class, or file to analyze' },
        target_uid: { type: 'string', description: 'Optional exact symbol UID (preferred when target name is ambiguous)' },
        file_path: { type: 'string', description: 'Optional file path filter to disambiguate target name' },
        direction: { type: 'string', description: 'upstream (what depends on this) or downstream (what this depends on)' },
        maxDepth: { type: 'number', description: 'Max relationship depth (default: 3)', default: 3 },
        relationTypes: { type: 'array', items: { type: 'string' }, description: 'Filter: CALLS, IMPORTS, EXTENDS, IMPLEMENTS, HAS_METHOD, OVERRIDES (default: usage-based)' },
        includeTests: { type: 'boolean', description: 'Include test files (default: false)' },
        minConfidence: { type: 'number', description: 'Minimum confidence 0-1 (default: 0.3)' },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: ['target', 'direction'],
    },
  },
  {
    name: 'route_map',
    description: `Show API route mappings: which components/hooks fetch which API endpoints, and which handler files serve them.

WHEN TO USE: Understanding API consumption patterns, finding orphaned routes. For pre-change analysis, prefer \`api_impact\` which combines this data with mismatch detection and risk assessment.
AFTER THIS: Use impact() on specific route handlers to see full blast radius.

Returns: route nodes with their handlers, middleware wrapper chains (e.g., withAuth, withRateLimit), and consumers.`,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          description: 'Filter by route path (e.g., "/api/grants"). Omit for all routes.',
        },
        repo: {
          type: 'string',
          description: 'Repository name or path. Omit if only one repo is indexed.',
        },
      },
      required: [],
    },
  },
  {
    name: 'tool_map',
    description: `Show MCP/RPC tool definitions: which tools are defined, where they're handled, and their descriptions.

WHEN TO USE: Understanding tool APIs, finding tool implementations, impact analysis for tool changes.

Returns: tool nodes with their handler files and descriptions.`,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'Filter by tool name. Omit for all tools.' },
        repo: { type: 'string', description: 'Repository name or path.' },
      },
      required: [],
    },
  },
  {
    name: 'shape_check',
    description: `Check response shapes for API routes against their consumers' property accesses.

WHEN TO USE: Detecting mismatches between what an API route returns and what consumers expect. Finding shape drift. For pre-change analysis, prefer \`api_impact\` which combines this data with mismatch detection and risk assessment.
REQUIRES: Route nodes with responseKeys (extracted from .json({...}) calls during indexing).

Returns routes that have both detected response keys AND consumers. Shows top-level keys each endpoint returns (e.g., data, pagination, error) and what keys each consumer accesses. Reports MISMATCH status when a consumer accesses keys not present in the route's response shape.`,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          description: 'Check a specific route (e.g., "/api/grants"). Omit to check all routes.',
        },
        repo: {
          type: 'string',
          description: 'Repository name or path. Omit if only one repo is indexed.',
        },
      },
      required: [],
    },
  },
  {
    name: 'api_impact',
    description: `Pre-change impact report for an API route handler.

WHEN TO USE: BEFORE modifying any API route handler. Shows what consumers depend on, what response fields they access, what middleware protects the route, and what execution flows it triggers. Requires at least "route" or "file" parameter.

Risk levels: LOW (0-3 consumers), MEDIUM (4-9 or any mismatches), HIGH (10+ consumers or mismatches with 4+ consumers). Mismatches with confidence "low" indicate the consumer file fetches multiple routes — property attribution is approximate.

Returns: single route object when one match, or { routes: [...], total: N } for multiple matches. Combines route_map, shape_check, and impact data.`,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        route: { type: 'string', description: 'Route path (e.g., "/api/grants")' },
        file: { type: 'string', description: 'Handler file path (alternative to route)' },
        repo: { type: 'string', description: 'Repository name or path.' },
      },
      required: [],
    },
  },
  {
    name: 'group_list',
    description: `List all configured repository groups, or return details for one group (repos, manifest links).

WHEN TO USE: Discover groups before group_sync. Optional "name" returns a single group's config.`,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Group name. Omit to list all groups.' },
      },
      required: [],
    },
  },
  {
    name: 'group_sync',
    description: `Rebuild the Contract Registry (contracts.json) for a group: extract HTTP contracts, apply manifest links, exact-match cross-links.

WHEN TO USE: After changing group.yaml or re-indexing member repos.`,
    // Writes contracts.json on every call; conservatively non-idempotent
    // even though output is deterministic for identical input.
    annotations: DESTRUCTIVE_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Group name' },
        skipEmbeddings: {
          type: 'boolean',
          description: 'Exact + BM25 only (Demo PR: same as default exact path)',
        },
        exactOnly: { type: 'boolean', description: 'Exact match only in cascade' },
      },
      required: ['name'],
    },
  },
];
