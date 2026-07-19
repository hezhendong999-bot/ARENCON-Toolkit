/**
 * ARENCON Toolkit — Dialog Configs (per-tool personality)
 * ═══════════════════════════════════════════════════════════════════════════
 * lib/ui/dialogConfigs.js · v1.0.0 · companion to lib/ui/dialogEngine.js
 *
 * "Engine shared, personality per-tool config." This file is the ENTIRE
 * surface a tool is allowed to vary: which icon sits in the header chip, and
 * which semantic accent a family defaults to. Nothing here may introduce
 * chrome, spacing, colours or button styles — those live in the engine and
 * only in the engine.
 *
 * Accents are semantic and mean the same thing in every tool:
 *   slate = neutral · info = informational · ok = success/confirm-safe
 *   warn  = attention/pending          · fail = destructive/failure
 *
 * NOTE: burgundy is deliberately absent. The dialog layer carries no brand
 * fill; burgundy stays reserved for primary CTAs and active states in page
 * chrome (S488 ruling).
 */

export const DIALOG_CONFIGS_VERSION = '1.0.0';

/** Icons used in the header chip. Kept to plain glyphs — no icon font. */
export const ICONS = {
  info:      'i',
  question:  '?',
  warning:   '\u26A0',
  danger:    '\u2715',
  trash:     '\u1F5D1',
  edit:      '\u270E',
  save:      '\u2691',
  list:      '\u2261',
  download:  '\u2913',
  upload:    '\u2912',
  refresh:   '\u21BB',
  photo:     '\u25A3',
  project:   '\u25A6',
  cloud:     '\u2601',
  check:     '\u2713'
};

/** Per-tool defaults. A tool passes its key; unknown keys fall back to base. */
const BASE = {
  accents: {
    alert:         'info',
    confirm:       'info',
    confirmDanger: 'fail',
    typeToConfirm: 'fail',
    prompt:        'info',
    leave:         'warn',
    progress:      'info',
    form:          'info',
    pickList:      'info'
  },
  icons: {
    alert:         ICONS.info,
    confirm:       ICONS.question,
    confirmDanger: ICONS.danger,
    typeToConfirm: ICONS.warning,
    prompt:        ICONS.edit,
    leave:         ICONS.save,
    progress:      ICONS.refresh,
    form:          ICONS.edit,
    pickList:      ICONS.list
  }
};

export const TOOL_DIALOG_CONFIGS = {
  frt:      { toolName: 'Field Review Tool' },
  diesel:   { toolName: 'Diesel Fire Pump Commissioning' },
  electric: { toolName: 'Electric Fire Pump Acceptance' },
  hub:      { toolName: 'Project Hub' },
  ist:      { toolName: 'Integrated Systems Testing' },
  obc:      { toolName: 'OBC Compliance Report' },
  dd:       { toolName: 'Due Diligence Checklist' }
};

/**
 * Resolve the default icon + accent for a family, for a tool.
 * Call sites still override per dialog where they have a reason to.
 */
export function dialogDefaults(toolKey, family) {
  const tool = TOOL_DIALOG_CONFIGS[toolKey] || {};
  const accents = Object.assign({}, BASE.accents, tool.accents || {});
  const icons = Object.assign({}, BASE.icons, tool.icons || {});
  return {
    accent: accents[family] || 'info',
    icon: icons[family] || ICONS.info,
    toolName: tool.toolName || ''
  };
}

export default { DIALOG_CONFIGS_VERSION, ICONS, TOOL_DIALOG_CONFIGS, dialogDefaults };
