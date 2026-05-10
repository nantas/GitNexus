/**
 * GDScript (Godot 4.x) Language Provider
 *
 * GDScript traits:
 *   - importSemantics: 'wildcard' (preload/load bring everything into scope)
 *   - exportChecker: public if no leading underscore (same as Python/Dart)
 */

import { SupportedLanguages } from 'gitnexus-shared';
import { defineLanguage } from '../language-provider.js';
import { gdscriptExportChecker } from '../export-detection.js';
import { GDSCRIPT_QUERIES } from '../tree-sitter-queries.js';

export const gdscriptProvider = defineLanguage({
  id: SupportedLanguages.GDScript,
  extensions: ['.gd'],
  treeSitterQueries: GDSCRIPT_QUERIES,
  typeConfig: {
    declarationNodeTypes: new Set(['function_definition', 'class_definition']),
    extractDeclaration: () => null,
    extractParameter: () => null,
  },
  exportChecker: gdscriptExportChecker,
  importResolver: () => null,
  importSemantics: 'wildcard-leaf',
  builtInNames: new Set([
    'print', 'push_error', 'push_warning', 'range', 'len', 'str', 'int', 'float', 'bool',
    'abs', 'absf', 'absi', 'sign', 'signf', 'signi',
    'min', 'max', 'minf', 'maxi', 'mini',
    'clamp', 'clampf', 'clampi',
    'lerp', 'lerpf', 'inverse_lerp',
    'smoothstep', 'remap', 'is_equal_approx', 'is_zero_approx',
    'floor', 'floorf', 'floori', 'ceil', 'ceilf', 'ceili', 'round', 'roundf', 'roundi',
    'snapped', 'snappedf', 'snappedi',
    'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'asin', 'acos', 'atan', 'atan2',
    'sqrt', 'pow', 'exp', 'log',
    'deg_to_rad', 'rad_to_deg', 'linear_to_db', 'db_to_linear',
    'randi', 'randf', 'randfn', 'randi_range', 'randf_range', 'randomize', 'seed',
    'hash', 'instance_from_id', 'is_instance_id_valid', 'is_instance_valid',
    'type_exists', 'type_string', 'typeof', 'str_to_var', 'var_to_str',
    'bytes_to_var', 'var_to_bytes',
    'load', 'preload', 'ResourceLoader', 'ResourceSaver',
    'get_node', 'get_node_or_null', 'get_parent', 'get_tree', 'get_viewport',
    'call_deferred', 'set_deferred',
    'emit_signal', 'connect', 'disconnect', 'is_connected',
    'queue_free', 'free',
    'Input', 'InputMap', 'ProjectSettings', 'Engine', 'Time', 'OS',
    'PhysicsServer2D', 'PhysicsServer3D', 'RenderingServer', 'AudioServer',
    'NavigationServer2D', 'NavigationServer3D',
  ]),
});
