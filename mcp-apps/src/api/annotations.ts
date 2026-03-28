// Shared tool annotation presets for MCP best practices.
// All Yahoo/Fantasy/MLB tools hit external APIs -> openWorldHint: true.

export var READ_ANNO = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;
export var WRITE_ANNO = { readOnlyHint: false, openWorldHint: true } as const;
export var WRITE_IDEMPOTENT_ANNO = { readOnlyHint: false, openWorldHint: true, idempotentHint: true } as const;
export var WRITE_DESTRUCTIVE_ANNO = { readOnlyHint: false, openWorldHint: true, destructiveHint: true } as const;
