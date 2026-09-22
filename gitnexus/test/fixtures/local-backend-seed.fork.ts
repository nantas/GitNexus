import type { FTSIndexDef } from '../helpers/test-indexed-db.js';

export const LOCAL_BACKEND_SEED_DATA = [
  // Files
  `CREATE (f:File {id: 'file:auth.ts', name: 'auth.ts', filePath: 'src/auth.ts', content: 'auth module'})`,
  `CREATE (f:File {id: 'file:utils.ts', name: 'utils.ts', filePath: 'src/utils.ts', content: 'utils module'})`,
  // Functions
  `CREATE (fn:Function {id: 'func:login', name: 'login', filePath: 'src/auth.ts', startLine: 1, endLine: 15, isExported: true, content: 'function login() {}', description: 'User login'})`,
  `CREATE (fn:Function {id: 'func:validate', name: 'validate', filePath: 'src/auth.ts', startLine: 17, endLine: 25, isExported: true, content: 'function validate() {}', description: 'Validate input'})`,
  `CREATE (fn:Function {id: 'func:hash', name: 'hash', filePath: 'src/utils.ts', startLine: 1, endLine: 8, isExported: true, content: 'function hash() {}', description: 'Hash utility'})`,
  // Class
  `CREATE (c:Class {id: 'class:AuthService', name: 'AuthService', filePath: 'src/auth.ts', startLine: 30, endLine: 60, isExported: true, content: 'class AuthService {}', description: 'Authentication service'})`,
  `CREATE (c:Class {id: 'class:BaseService', name: 'BaseService', filePath: 'src/base.ts', startLine: 1, endLine: 20, isExported: true, content: 'class BaseService {}', description: 'Base service class'})`,
  `CREATE (c:Class {id: 'class:ReloadBase', name: 'ReloadBase', filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs', startLine: 1, endLine: 80, isExported: true, content: 'class ReloadBase : MonoBehaviour {}', description: 'Reload graph node'})`,
  `CREATE (f:File {id: 'file:reload-orb.prefab', name: '1_weapon_orb_key.prefab', filePath: 'Assets/NEON/Prefabs/Weapons/1_weapon_orb_key.prefab', content: 'prefab'})`,
  `CREATE (c:Class {id: 'class:BattleMode', name: 'BattleMode', filePath: 'Assets/NEON/Code/Game/GameModes/BattleMode/BattleMode.cs', startLine: 1, endLine: 120, isExported: true, content: 'class BattleMode : MonoBehaviour {}', description: 'BattleMode scene lifecycle component'})`,
  `CREATE (c:Class {id: 'class:StringVector2', name: 'StringVector2', filePath: 'Assets/NEON/Code/Game/GameModes/BattleMode/BattleMode.cs', startLine: 130, endLine: 140, isExported: true, content: 'class StringVector2 {}', description: 'Co-located helper class'})`,
  `CREATE (f:File {id: 'file:battlemode-scene', name: 'BattleMode.unity', filePath: 'Assets/NEON/Scene/BattleModeScenes/BattleMode.unity', content: 'PrefabInstance m_SourcePrefab BattleMode'})`,
  `CREATE (f:File {id: 'file:battlemode-prefab', name: 'BattleMode.prefab', filePath: 'Assets/NEON/Prefab/Systems/BattleMode.prefab', content: 'BattleMode prefab script component'})`,
  // Methods
  `CREATE (m:Method {id: 'method:AuthService.authenticate', name: 'authenticate', filePath: 'src/auth.ts', startLine: 35, endLine: 45, isExported: false, content: 'authenticate() {}', description: 'Authenticate user'})`,
  `CREATE (m:Method {id: 'method:BaseService.authenticate', name: 'authenticate', filePath: 'src/base.ts', startLine: 5, endLine: 10, isExported: false, content: 'authenticate() {}', description: 'Base authenticate'})`,
  // Community
  `CREATE (c:Community {id: 'comm:auth', label: 'Auth', heuristicLabel: 'Authentication', keywords: ['auth', 'login'], description: 'Auth module', enrichedBy: 'heuristic', cohesion: 0.8, symbolCount: 3})`,
  // Process
  `CREATE (p:Process {id: 'proc:login-flow', label: 'LoginFlow', heuristicLabel: 'User Login', processType: 'intra_community', processSubtype: 'unity_lifecycle', runtimeChainConfidence: 'medium', sourceReasons: ['unity-runtime-loader-synthetic'], sourceConfidences: [0.68], stepCount: 2, communities: ['auth'], entryPointId: 'func:login', terminalId: 'func:validate'})`,
  `CREATE (p:Process {id: 'proc:auth-method-flow', label: 'AuthMethodFlow', heuristicLabel: 'Auth Method Flow', processType: 'intra_community', processSubtype: 'static_calls', runtimeChainConfidence: 'high', sourceReasons: ['member-call'], sourceConfidences: [1.0], stepCount: 1, communities: ['auth'], entryPointId: 'method:AuthService.authenticate', terminalId: 'method:AuthService.authenticate'})`,
  // Relationships
  `MATCH (a:Function), (b:Function) WHERE a.id = 'func:login' AND b.id = 'func:validate'
   CREATE (a)-[:CodeRelation {type: 'CALLS', confidence: 1.0, reason: 'direct', step: 0}]->(b)`,
  `MATCH (a:Function), (b:Function) WHERE a.id = 'func:login' AND b.id = 'func:hash'
   CREATE (a)-[:CodeRelation {type: 'CALLS', confidence: 0.9, reason: 'import-resolved', step: 0}]->(b)`,
  `MATCH (a:Function), (b:Method) WHERE a.id = 'func:login' AND b.id = 'method:AuthService.authenticate'
   CREATE (a)-[:CodeRelation {type: 'CALLS', confidence: 1.0, reason: 'member-call', step: 0}]->(b)`,
  `MATCH (a:Method), (b:Function) WHERE a.id = 'method:AuthService.authenticate' AND b.id = 'func:validate'
   CREATE (a)-[:CodeRelation {type: 'CALLS', confidence: 1.0, reason: 'delegate', step: 0}]->(b)`,
  `MATCH (a:Function), (c:Community) WHERE a.id = 'func:login' AND c.id = 'comm:auth'
   CREATE (a)-[:CodeRelation {type: 'MEMBER_OF', confidence: 1.0, reason: '', step: 0}]->(c)`,
  `MATCH (a:Function), (p:Process) WHERE a.id = 'func:login' AND p.id = 'proc:login-flow'
   CREATE (a)-[:CodeRelation {type: 'STEP_IN_PROCESS', confidence: 0.68, reason: 'unity-runtime-loader-synthetic', step: 1}]->(p)`,
  `MATCH (a:Function), (p:Process) WHERE a.id = 'func:validate' AND p.id = 'proc:login-flow'
   CREATE (a)-[:CodeRelation {type: 'STEP_IN_PROCESS', confidence: 0.95, reason: 'same-file', step: 2}]->(p)`,
  `MATCH (m:Method), (p:Process) WHERE m.id = 'method:AuthService.authenticate' AND p.id = 'proc:login-flow'
   CREATE (m)-[:CodeRelation {type: 'STEP_IN_PROCESS', confidence: 0.68, reason: 'unity-runtime-loader-synthetic', step: 2}]->(p)`,
  `MATCH (m:Method), (p:Process) WHERE m.id = 'method:AuthService.authenticate' AND p.id = 'proc:auth-method-flow'
   CREATE (m)-[:CodeRelation {type: 'STEP_IN_PROCESS', confidence: 1.0, reason: 'phase2-test', step: 1}]->(p)`,
  // HAS_METHOD: AuthService -> authenticate
  `MATCH (c:Class), (m:Method) WHERE c.id = 'class:AuthService' AND m.id = 'method:AuthService.authenticate'
   CREATE (c)-[:CodeRelation {type: 'HAS_METHOD', confidence: 1.0, reason: 'class-method', step: 0}]->(m)`,
  // OVERRIDES: AuthService.authenticate -> BaseService.authenticate
  `MATCH (a:Method), (b:Method) WHERE a.id = 'method:AuthService.authenticate' AND b.id = 'method:BaseService.authenticate'
   CREATE (a)-[:CodeRelation {type: 'OVERRIDES', confidence: 1.0, reason: 'mro-resolution', step: 0}]->(b)`,
  // HAS_METHOD: BaseService -> authenticate
  `MATCH (c:Class), (m:Method) WHERE c.id = 'class:BaseService' AND m.id = 'method:BaseService.authenticate'
   CREATE (c)-[:CodeRelation {type: 'HAS_METHOD', confidence: 1.0, reason: 'class-method', step: 0}]->(m)`,
  `MATCH (c:Class), (f:File) WHERE c.id = 'class:ReloadBase' AND f.id = 'file:reload-orb.prefab'
   CREATE (c)-[:CodeRelation {type: 'UNITY_RESOURCE_SUMMARY', confidence: 0.61, reason: '{"resourceType":"prefab","bindingKinds":["direct"],"lightweight":true}', step: 0}]->(f)`,
  `MATCH (scene:File), (prefab:File) WHERE scene.id = 'file:battlemode-scene' AND prefab.id = 'file:battlemode-prefab'
   CREATE (scene)-[:CodeRelation {type: 'UNITY_ASSET_GUID_REF', confidence: 1.0, reason: '{"resourcePath":"Assets/NEON/Scene/BattleModeScenes/BattleMode.unity","targetResourcePath":"Assets/NEON/Prefab/Systems/BattleMode.prefab","guid":"e49bc84a92a08425dab0a86fbbd2784b","fileId":"100100000","fieldName":"m_SourcePrefab","sourceLayer":"scene"}', step: 0}]->(prefab)`,
  `MATCH (prefab:File), (cls:Class) WHERE prefab.id = 'file:battlemode-prefab' AND cls.id = 'class:BattleMode'
   CREATE (prefab)-[:CodeRelation {type: 'UNITY_GRAPH_NODE_SCRIPT_REF', confidence: 1.0, reason: '{"resourcePath":"Assets/NEON/Prefab/Systems/BattleMode.prefab","resourceType":"prefab","bindingKind":"prefab-instance","componentObjectId":"114230427048511580"}', step: 0}]->(cls)`,
  `MATCH (prefab:File), (cls:Class) WHERE prefab.id = 'file:battlemode-prefab' AND cls.id = 'class:StringVector2'
   CREATE (prefab)-[:CodeRelation {type: 'UNITY_GRAPH_NODE_SCRIPT_REF', confidence: 1.0, reason: '{"resourcePath":"Assets/NEON/Prefab/Systems/BattleMode.prefab","resourceType":"prefab","bindingKind":"prefab-instance","componentObjectId":"114230427048511580"}', step: 0}]->(cls)`,
];

export const LOCAL_BACKEND_FTS_INDEXES: FTSIndexDef[] = [
  { table: 'Function', indexName: 'function_fts', columns: ['name', 'content', 'description'] },
  { table: 'Class', indexName: 'class_fts', columns: ['name', 'content', 'description'] },
  { table: 'Method', indexName: 'method_fts', columns: ['name', 'content', 'description'] },
  { table: 'File', indexName: 'file_fts', columns: ['name', 'content'] },
];
