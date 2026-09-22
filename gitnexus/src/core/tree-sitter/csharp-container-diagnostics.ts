import type Parser from 'tree-sitter';

const CONTAINERS = {
  class: 'class_declaration',
  interface: 'interface_declaration',
  struct: 'struct_declaration',
  record: 'record_declaration',
  delegate: 'delegate_declaration',
  enum: 'enum_declaration',
} as const;
export type ContainerCounts = Record<keyof typeof CONTAINERS, number>;
export interface CSharpContainerRecord {
  filePath: string;
  declaredBases: { className: string; startLine: number; baseNames: string[] }[];
  container_counts: ContainerCounts;
  method_count: number;
  root_has_error: boolean;
  missing_container_with_methods: boolean;
  missing_class_with_methods: boolean;
  is_false_positive_likely: boolean;
}
export interface CSharpParseReport {
  filePath: string;
  changed: boolean;
  expressionErrors: number;
  undefinedSymbols: string[];
  containers?: CSharpContainerRecord;
}

/** Audit the same normalized tree used by ingestion; no second/raw parse. */
export function inspectCSharpContainers(
  root: Parser.SyntaxNode,
  filePath: string,
): CSharpContainerRecord {
  const container_counts = Object.fromEntries(
    Object.entries(CONTAINERS).map(([kind, syntax]) => [
      kind,
      root.descendantsOfType(syntax).length,
    ]),
  ) as ContainerCounts;
  const method_count = root.descendantsOfType('method_declaration').length;
  const missing_class_with_methods = method_count > 0 && container_counts.class === 0;
  const missing_container_with_methods =
    method_count > 0 && Object.values(container_counts).every((n) => n === 0);
  const declaredBases = root.descendantsOfType('class_declaration').map((node) => ({
    className: node.childForFieldName('name')?.text ?? '',
    startLine: node.startPosition.row,
    baseNames: (
      node.namedChildren.find((child) => child.type === 'base_list')?.namedChildren ?? []
    ).map((base) => base.text),
  }));
  return {
    filePath,
    declaredBases,
    container_counts,
    method_count,
    root_has_error: root.hasError,
    missing_container_with_methods,
    missing_class_with_methods,
    is_false_positive_likely: missing_class_with_methods && !missing_container_with_methods,
  };
}

export function summarizeCSharpContainers(records: CSharpContainerRecord[]) {
  const container_counts = Object.fromEntries(
    Object.keys(CONTAINERS).map((kind) => [kind, 0]),
  ) as ContainerCounts;
  for (const record of records)
    for (const key of Object.keys(CONTAINERS) as (keyof ContainerCounts)[]) {
      container_counts[key] += record.container_counts[key];
    }
  return {
    records,
    container_counts,
    root_has_error: records.filter((r) => r.root_has_error).length,
    missing_container_with_methods: records.filter((r) => r.missing_container_with_methods).length,
    missing_class_with_methods: records.filter((r) => r.missing_class_with_methods).length,
    is_false_positive_likely: records.filter((r) => r.is_false_positive_likely).length,
  };
}
export type CSharpContainerDiagnostics = ReturnType<typeof summarizeCSharpContainers>;
