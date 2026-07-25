// lib/ui/hubHelpCards.js
// ─────────────────────────────────────────────────────────────────────────────
// ARENCON Project Hub — Help card registry (S500, Mark).
// The Hub's OWN cards, handed to the shared Help engine (lib/ui/helpEngine.js).
// Ported VERBATIM from the approved demo DEMO_help_unified_S499.html — card ids,
// dates, wording, search terms, chips, compact flags and SVG illustrations are
// unchanged. FRT / Diesel / future tools register their own cards in their own
// lanes; this file owns Hub cards only. Pooled search across all registrations
// is the engine's job, not this file's.
//
// No framework, no build step. Classic ES module, imported by the Hub alongside
// its other /lib/ modules (dialogEngine, headerEngine2, helpEngine).
// ─────────────────────────────────────────────────────────────────────────────
import { registerHelp } from '/lib/ui/helpEngine.js';

/* ── illustrations (drawn, not screenshotted) ─────────────────────────────── */
var ART = {};
ART.rcn = '<svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="190" fill="#fff"/>'
+'<rect x="10" y="12" width="280" height="34" rx="6" fill="#F8FAFC" stroke="#E2E8F0"/>'
+'<rect x="20" y="22" width="34" height="14" rx="4" fill="#fff" stroke="#E2E8F0"/>'
+'<text x="26" y="32.5" font-family="Consolas,monospace" font-size="9" font-weight="700" fill="#1E293B">6360</text>'
+'<text x="62" y="32.5" font-family="Calibri" font-size="9" fill="#5A6473">3 spellings across 4 projects</text>'
+'<rect x="228" y="22" width="54" height="14" rx="7" fill="#FEFCBF" stroke="#B7791F" stroke-opacity=".35"/>'
+'<text x="234" y="32" font-family="Calibri" font-size="8" font-weight="700" fill="#B7791F">Needs review</text>'
+'<text x="20" y="62" font-family="Calibri" font-size="10" font-weight="700" fill="#1E293B">K+N</text>'
+'<rect x="238" y="53" width="44" height="12" rx="6" fill="#D4EDDA"/><text x="244" y="61.5" font-family="Calibri" font-size="7.5" font-weight="700" fill="#1A7A4A">most used</text>'
+'<line x1="10" y1="70" x2="290" y2="70" stroke="#F1F5F9"/>'
+'<text x="26" y="82" font-family="Consolas,monospace" font-size="9" font-weight="700" fill="#1E293B">6360.08</text>'
+'<text x="78" y="82" font-family="Calibri" font-size="9" fill="#5A6473">Rack and Sprinkler Upgrade</text>'
+'<text x="256" y="82" font-family="Calibri" font-size="8" fill="#94A3B8">Ian Li</text>'
+'<line x1="10" y1="90" x2="290" y2="90" stroke="#F1F5F9"/>'
+'<text x="26" y="102" font-family="Consolas,monospace" font-size="9" font-weight="700" fill="#1E293B">6360.61</text>'
+'<text x="78" y="102" font-family="Calibri" font-size="9" fill="#5A6473">Loading Dock Alterations</text>'
+'<text x="250" y="102" font-family="Calibri" font-size="8" fill="#94A3B8">Nasim A.</text>'
+'<line x1="10" y1="110" x2="290" y2="110" stroke="#E2E8F0"/>'
+'<text x="20" y="124" font-family="Calibri" font-size="10" font-weight="700" fill="#1E293B">K &amp; N</text>'
+'<line x1="10" y1="132" x2="290" y2="132" stroke="#F1F5F9"/>'
+'<text x="26" y="144" font-family="Consolas,monospace" font-size="9" font-weight="700" fill="#1E293B">6360.24</text>'
+'<text x="78" y="144" font-family="Calibri" font-size="9" fill="#5A6473">Warehouse Retrofit</text>'
+'<text x="264" y="144" font-family="Calibri" font-size="8" font-weight="700" fill="#1A7A4A">You</text>'
+'<rect x="10" y="154" width="280" height="26" rx="6" fill="#F8FAFC" stroke="#E2E8F0"/>'
+'<rect x="212" y="159" width="70" height="16" rx="5" fill="#9C2742"/>'
+'<text x="222" y="170" font-family="Calibri" font-size="8.5" font-weight="700" fill="#fff">Fix this series</text></svg>';
ART.crn = '<svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="190" fill="#F1F5F9"/>'
+'<rect x="24" y="30" width="252" height="130" rx="10" fill="#fff" stroke="#E2E8F0"/>'
+'<circle cx="42" cy="50" r="4" fill="#B7791F"/><text x="53" y="53.5" font-family="Calibri" font-size="10" font-weight="700" fill="#1E293B">Client name correction</text>'
+'<text x="42" y="74" font-family="Calibri" font-size="9" fill="#94A3B8">Mark He · 1 of your projects</text>'
+'<text x="42" y="97" font-family="Calibri" font-size="11" fill="#94A3B8">Iron Mountain Canada Corp.</text>'
+'<line x1="42" y1="93.5" x2="176" y2="93.5" stroke="#94A3B8" stroke-width="1.2"/>'
+'<text x="186" y="97" font-family="Calibri" font-size="11" fill="#94A3B8">→</text>'
+'<text x="42" y="117" font-family="Calibri" font-size="11" font-weight="700" fill="#1A7A4A">Iron Mountain Canada Corp</text>'
+'<rect x="42" y="130" width="52" height="20" rx="6" fill="#1A7A4A"/><text x="57" y="143.5" font-family="Calibri" font-size="9" font-weight="700" fill="#fff">Accept</text>'
+'<rect x="100" y="130" width="52" height="20" rx="6" fill="#fff" stroke="#E2E8F0"/><text x="115" y="143.5" font-family="Calibri" font-size="9" font-weight="600" fill="#5A6473">Review</text>'
+'<rect x="158" y="130" width="52" height="20" rx="6" fill="#fff" stroke="#E2E8F0"/><text x="172" y="143.5" font-family="Calibri" font-size="9" font-weight="600" fill="#5A6473">Decline</text></svg>';
ART.insights = '<svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="190" fill="#fff"/>'
+'<text x="18" y="24" font-family="Calibri" font-size="8.5" font-weight="700" letter-spacing="1" fill="#94A3B8">BACKUP COVERAGE</text>'
+'<circle cx="62" cy="70" r="30" fill="none" stroke="#C0392B" stroke-width="14"/>'
+'<path d="M62 40 A30 30 0 0 1 87 85" fill="none" stroke="#1A7A4A" stroke-width="14"/>'
+'<rect x="106" y="54" width="9" height="9" rx="2" fill="#1A7A4A"/><text x="121" y="62" font-family="Calibri" font-size="9" fill="#5A6473">Backed up</text><text x="205" y="62" font-family="Calibri" font-size="9" font-weight="700" fill="#1E293B">5</text>'
+'<rect x="106" y="74" width="9" height="9" rx="2" fill="#C0392B"/><text x="121" y="82" font-family="Calibri" font-size="9" fill="#5A6473">Never backed up</text><text x="205" y="82" font-family="Calibri" font-size="9" font-weight="700" fill="#1E293B">20</text>'
+'<text x="18" y="124" font-family="Calibri" font-size="8.5" font-weight="700" letter-spacing="1" fill="#94A3B8">ACTIVE PROJECTS PER PERSON</text>'
+'<text x="18" y="142" font-family="Calibri" font-size="9" fill="#5A6473">Ian Li</text><rect x="86" y="135" width="150" height="8" rx="4" fill="#F1F5F9"/><rect x="86" y="135" width="120" height="8" rx="4" fill="#C97B94"/><text x="244" y="142" font-family="Calibri" font-size="9" font-weight="700" fill="#1E293B">9</text>'
+'<text x="18" y="160" font-family="Calibri" font-size="9" fill="#5A6473">Nasim B.</text><rect x="86" y="153" width="150" height="8" rx="4" fill="#F1F5F9"/><rect x="86" y="153" width="67" height="8" rx="4" fill="#C97B94"/><text x="244" y="160" font-family="Calibri" font-size="9" font-weight="700" fill="#1E293B">5</text>'
+'<text x="18" y="178" font-family="Calibri" font-size="9" fill="#5A6473">Franz P.</text><rect x="86" y="171" width="150" height="8" rx="4" fill="#F1F5F9"/><rect x="86" y="171" width="27" height="8" rx="4" fill="#C97B94"/><text x="244" y="178" font-family="Calibri" font-size="9" font-weight="700" fill="#1E293B">2</text></svg>';
ART.trash = '<svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="190" fill="#fff"/>'
+'<text x="18" y="26" font-family="Calibri" font-size="11" font-weight="700" fill="#1E293B">🗑 Deleted Reports</text>'
+'<text x="128" y="26" font-family="Calibri" font-size="9" fill="#94A3B8">1 report</text>'
+'<rect x="16" y="40" width="268" height="52" rx="8" fill="#F8FAFC" stroke="#E2E8F0"/>'
+'<rect x="16" y="40" width="3.5" height="52" rx="2" fill="#C0392B"/>'
+'<text x="30" y="58" font-family="Calibri" font-size="9.5" font-weight="700" fill="#1E293B">6360.08 KN Rack and Sprkl FRT #1</text>'
+'<text x="30" y="74" font-family="Calibri" font-size="8.5" fill="#94A3B8">Deleted 2026-07-14 by Ian Li · 25 noted</text>'
+'<rect x="196" y="62" width="76" height="20" rx="6" fill="#D4EDDA" stroke="#1A7A4A" stroke-opacity=".4"/>'
+'<text x="206" y="75.5" font-family="Calibri" font-size="9" font-weight="700" fill="#1A7A4A">↩ Restore</text>'
+'<rect x="16" y="104" width="268" height="44" rx="8" fill="#fff" stroke="#E2E8F0" stroke-dasharray="3 3"/>'
+'<text x="30" y="122" font-family="Calibri" font-size="9" fill="#94A3B8">Restored reports return to their tool group</text>'
+'<text x="30" y="137" font-family="Calibri" font-size="9" fill="#94A3B8">with every photo and deficiency intact.</text></svg>';
ART.backup = '<svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="190" fill="#fff"/>'
+'<line x1="14" y1="34" x2="286" y2="34" stroke="#F1F5F9"/>'
+'<text x="18" y="26" font-family="Consolas,monospace" font-size="9" font-weight="700" fill="#9C2742">4380.24</text><text x="76" y="26" font-family="Calibri" font-size="9" font-weight="600" fill="#1E293B">Mezzanine Review</text>'
+'<text x="196" y="26" font-family="Calibri" font-size="8.5" fill="#1A7A4A">📥 2026-07-19</text>'
+'<line x1="14" y1="64" x2="286" y2="64" stroke="#F1F5F9"/>'
+'<text x="18" y="56" font-family="Consolas,monospace" font-size="9" font-weight="700" fill="#9C2742">5501.01</text><text x="76" y="56" font-family="Calibri" font-size="9" font-weight="600" fill="#1E293B">Distribution Centre</text>'
+'<text x="196" y="56" font-family="Calibri" font-size="8.5" fill="#B7791F">📥 2026-06-04</text>'
+'<line x1="14" y1="94" x2="286" y2="94" stroke="#F1F5F9"/>'
+'<text x="18" y="86" font-family="Consolas,monospace" font-size="9" font-weight="700" fill="#9C2742">7318.02</text><text x="76" y="86" font-family="Calibri" font-size="9" font-weight="600" fill="#1E293B">Bakery Line</text>'
+'<text x="196" y="86" font-family="Calibri" font-size="8.5" fill="#C0392B">📥 2026-03-11</text>'
+'<line x1="14" y1="124" x2="286" y2="124" stroke="#F1F5F9"/>'
+'<text x="18" y="116" font-family="Consolas,monospace" font-size="9" font-weight="700" fill="#9C2742">7371.06</text><text x="76" y="116" font-family="Calibri" font-size="9" font-weight="600" fill="#1E293B">MSH Maglock</text>'
+'<text x="196" y="116" font-family="Calibri" font-size="8.5" font-weight="700" fill="#C0392B">⚠ Not backed up</text>'
+'<rect x="14" y="140" width="272" height="36" rx="7" fill="#F8FAFC" stroke="#E2E8F0"/>'
+'<circle cx="30" cy="152" r="3" fill="#1A7A4A"/><text x="40" y="155" font-family="Calibri" font-size="8" fill="#5A6473">fresh</text>'
+'<circle cx="82" cy="152" r="3" fill="#B7791F"/><text x="92" y="155" font-family="Calibri" font-size="8" fill="#5A6473">30d+</text>'
+'<circle cx="136" cy="152" r="3" fill="#C0392B"/><text x="146" y="155" font-family="Calibri" font-size="8" fill="#5A6473">90d+ / never</text>'
+'<text x="30" y="170" font-family="Calibri" font-size="8" fill="#94A3B8">Text tint only — the board never becomes a wall of colour.</text></svg>';
ART.export = '<svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="190" fill="#fff"/>'
+'<rect x="34" y="24" width="60" height="60" rx="10" fill="#F8FAFC" stroke="#E2E8F0"/>'
+'<text x="52" y="62" font-size="26">📦</text>'
+'<path d="M100 54 L138 54" stroke="#94A3B8" stroke-width="1.5" stroke-dasharray="4 3"/><path d="M134 50 L139 54 L134 58" fill="none" stroke="#94A3B8" stroke-width="1.5"/>'
+'<rect x="146" y="18" width="122" height="20" rx="5" fill="#F8FAFC" stroke="#E2E8F0"/><text x="154" y="32" font-family="Calibri" font-size="9" fill="#5A6473">📄 FRT #1 report.pdf</text>'
+'<rect x="146" y="42" width="122" height="20" rx="5" fill="#F8FAFC" stroke="#E2E8F0"/><text x="154" y="56" font-family="Calibri" font-size="9" fill="#5A6473">📄 Diesel report.pdf</text>'
+'<rect x="146" y="66" width="122" height="20" rx="5" fill="#F8FAFC" stroke="#E2E8F0"/><text x="154" y="80" font-family="Calibri" font-size="9" fill="#5A6473">🖼 photos (48)</text>'
+'<rect x="146" y="90" width="122" height="20" rx="5" fill="#F8FAFC" stroke="#E2E8F0"/><text x="154" y="104" font-family="Calibri" font-size="9" fill="#5A6473">📐 drawings (6)</text>'
+'<rect x="146" y="114" width="122" height="20" rx="5" fill="#F8FAFC" stroke="#E2E8F0"/><text x="154" y="128" font-family="Calibri" font-size="9" fill="#5A6473">📋 README.txt</text>'
+'<text x="34" y="106" font-family="Calibri" font-size="9" font-weight="700" fill="#1E293B">One ZIP</text>'
+'<text x="34" y="152" font-family="Calibri" font-size="8.5" fill="#94A3B8">Exporting is also what marks the</text>'
+'<text x="34" y="166" font-family="Calibri" font-size="8.5" fill="#94A3B8">project as backed up.</text></svg>';
ART.dup = '<svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="190" fill="#fff"/>'
+'<line x1="14" y1="46" x2="286" y2="46" stroke="#F1F5F9"/>'
+'<text x="20" y="34" font-family="Consolas,monospace" font-size="10" font-weight="700" fill="#9C2742">7310.83</text>'
+'<text x="96" y="34" font-family="Calibri" font-size="9.5" font-weight="600" fill="#1E293B">FSP Development</text>'
+'<line x1="14" y1="84" x2="286" y2="84" stroke="#F1F5F9"/>'
+'<text x="20" y="72" font-family="Consolas,monospace" font-size="10" font-weight="700" fill="#9C2742">7318.02</text>'
+'<text x="96" y="72" font-family="Calibri" font-size="9.5" font-weight="600" fill="#1E293B">Fire Pump Upgrade</text>'
+'<line x1="14" y1="134" x2="286" y2="134" stroke="#F1F5F9"/>'
+'<text x="20" y="110" font-family="Consolas,monospace" font-size="10" font-weight="700" fill="#9C2742">7318.02</text>'
+'<rect x="18" y="116" width="50" height="13" rx="6" fill="#FEFCBF" stroke="#B7791F" stroke-opacity=".35"/>'
+'<text x="24" y="125.5" font-family="Calibri" font-size="7.5" font-weight="700" fill="#B7791F">Duplicate</text>'
+'<text x="96" y="110" font-family="Calibri" font-size="9.5" font-weight="600" fill="#1E293B">NDA</text>'
+'<text x="20" y="160" font-family="Consolas,monospace" font-size="10" font-weight="700" fill="#9C2742">7371.06</text>'
+'<text x="96" y="160" font-family="Calibri" font-size="9.5" font-weight="600" fill="#1E293B">MSH Maglock Oncology</text>'
+'<text x="20" y="182" font-family="Calibri" font-size="8" fill="#94A3B8">The first-created project of a number is the original.</text></svg>';
ART.toolsrep = '<svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="190" fill="#fff"/>'
+'<rect x="14" y="14" width="272" height="30" rx="7" fill="#F8FAFC" stroke="#E2E8F0"/>'
+'<text x="24" y="33" font-family="Calibri" font-size="8" font-weight="700" letter-spacing=".5" fill="#94A3B8">TOOL ACTIVATION</text>'
+'<rect x="118" y="21" width="34" height="15" rx="7.5" fill="#9C2742"/><circle cx="145" cy="28.5" r="5.5" fill="#fff"/><text x="123" y="32" font-family="Calibri" font-size="7.5" font-weight="700" fill="#fff">FRT</text>'
+'<rect x="158" y="21" width="34" height="15" rx="7.5" fill="#E2E8F0"/><circle cx="165" cy="28.5" r="5.5" fill="#fff"/><text x="172" y="32" font-family="Calibri" font-size="7.5" font-weight="700" fill="#94A3B8">DFP</text>'
+'<rect x="198" y="21" width="34" height="15" rx="7.5" fill="#E2E8F0"/><circle cx="205" cy="28.5" r="5.5" fill="#fff"/><text x="212" y="32" font-family="Calibri" font-size="7.5" font-weight="700" fill="#94A3B8">EFP</text>'
+'<text x="20" y="66" font-family="Calibri" font-size="10.5" font-weight="700" fill="#1E293B">📋 Field Review Report</text>'
+'<text x="150" y="66" font-family="Calibri" font-size="8.5" fill="#94A3B8">2 reports</text>'
+'<rect x="206" y="54" width="76" height="18" rx="6" fill="#fff" stroke="#9C2742"/>'
+'<text x="216" y="66.5" font-family="Calibri" font-size="8.5" font-weight="700" fill="#9C2742">＋ New Report</text>'
+'<rect x="16" y="80" width="268" height="34" rx="7" fill="#F8FAFC" stroke="#E2E8F0"/>'
+'<rect x="16" y="80" width="3.5" height="34" rx="2" fill="#9C2742"/>'
+'<text x="30" y="95" font-family="Calibri" font-size="9" font-weight="700" fill="#1E293B">6360.08 KN Rack and Sprkl FRT #1</text>'
+'<text x="30" y="108" font-family="Calibri" font-size="8" fill="#94A3B8">Ian Li · DRAFT · 25 noted · 0 closed</text>'
+'<rect x="16" y="120" width="268" height="34" rx="7" fill="#F8FAFC" stroke="#E2E8F0"/>'
+'<rect x="16" y="120" width="3.5" height="34" rx="2" fill="#9C2742"/>'
+'<text x="30" y="135" font-family="Calibri" font-size="9" font-weight="700" fill="#1E293B">6360.08 KN Rack and Sprkl FRT #2</text>'
+'<text x="30" y="148" font-family="Calibri" font-size="8" fill="#94A3B8">Mark He · ISSUED · 12 noted · 12 closed</text>'
+'<text x="20" y="176" font-family="Calibri" font-size="8" fill="#94A3B8">One project holds several reports — no duplicate projects needed.</text></svg>';
ART.tabs = '<svg viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg"><rect width="66" height="66" rx="12" fill="#F8FAFC" stroke="#E2E8F0"/><rect x="12" y="18" width="42" height="30" rx="4" fill="#fff" stroke="#9C2742" stroke-width="1.5"/><rect x="16" y="14" width="20" height="8" rx="3" fill="#9C2742"/><rect x="38" y="14" width="20" height="8" rx="3" fill="#E2E8F0"/><line x1="42" y1="34" x2="52" y2="44" stroke="#C0392B" stroke-width="2"/><line x1="52" y1="34" x2="42" y2="44" stroke="#C0392B" stroke-width="2"/></svg>';
ART.star = '<svg viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg"><rect width="66" height="66" rx="12" fill="#F8FAFC" stroke="#E2E8F0"/><text x="14" y="44" font-size="26">⭐</text><rect x="40" y="24" width="16" height="18" rx="3" fill="#fff" stroke="#94A3B8" stroke-width="1.5"/><line x1="43" y1="30" x2="53" y2="30" stroke="#94A3B8"/><line x1="43" y1="35" x2="53" y2="35" stroke="#94A3B8"/></svg>';
ART.select = '<svg viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg"><rect width="66" height="66" rx="12" fill="#F8FAFC" stroke="#E2E8F0"/><rect x="14" y="14" width="13" height="13" rx="3" fill="#9C2742"/><path d="M17 20.5 L20 23.5 L24.5 17.5" stroke="#fff" stroke-width="2" fill="none"/><rect x="32" y="17" width="20" height="7" rx="3" fill="#E2E8F0"/><rect x="14" y="33" width="13" height="13" rx="3" fill="#9C2742"/><path d="M17 39.5 L20 42.5 L24.5 36.5" stroke="#fff" stroke-width="2" fill="none"/><rect x="32" y="36" width="20" height="7" rx="3" fill="#E2E8F0"/><rect x="14" y="50" width="13" height="13" rx="3" fill="#fff" stroke="#94A3B8" stroke-width="1.5"/><rect x="32" y="53" width="20" height="7" rx="3" fill="#E2E8F0"/></svg>';
ART.newproj = '<svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="190" fill="#fff"/>'
+'<text x="18" y="24" font-family="Calibri" font-size="8" font-weight="700" letter-spacing=".5" fill="#94A3B8">PROJECT NUMBER</text>'
+'<rect x="16" y="30" width="120" height="24" rx="6" fill="#fff" stroke="#9C2742"/><text x="26" y="46" font-family="Consolas,monospace" font-size="10" font-weight="700" fill="#1E293B">6360.</text>'
+'<text x="18" y="76" font-family="Calibri" font-size="8" font-weight="700" letter-spacing=".5" fill="#94A3B8">CLIENT</text>'
+'<rect x="16" y="82" width="268" height="24" rx="6" fill="#fff" stroke="#9C2742"/><text x="26" y="98" font-family="Calibri" font-size="10" fill="#1E293B">K</text>'
+'<rect x="16" y="108" width="268" height="60" rx="7" fill="#fff" stroke="#E2E8F0"/>'
+'<rect x="16" y="108" width="268" height="20" fill="#F8FAFC"/><text x="26" y="122" font-family="Calibri" font-size="8.5" font-weight="700" fill="#5A6473">Used in series 6360</text>'
+'<text x="26" y="142" font-family="Calibri" font-size="9.5" font-weight="600" fill="#1E293B">K+N</text><text x="70" y="142" font-family="Calibri" font-size="8.5" fill="#94A3B8">2 projects</text>'
+'<text x="26" y="160" font-family="Calibri" font-size="9.5" fill="#5A6473">K &amp; N</text><text x="70" y="160" font-family="Calibri" font-size="8.5" fill="#94A3B8">1 project</text></svg>';
ART.theme = '<svg viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg"><rect width="66" height="66" rx="12" fill="#F8FAFC" stroke="#E2E8F0"/><path d="M33 8 A25 25 0 0 0 33 58 Z" fill="#1E293B"/><path d="M33 8 A25 25 0 0 1 33 58 Z" fill="#fff" stroke="#E2E8F0"/><circle cx="21" cy="33" r="5" fill="#FEFCBF"/><path d="M45 27 A7 7 0 1 0 45 39 A9 9 0 0 1 45 27 Z" fill="#F8FAFC"/></svg>';
ART.portal = '<svg viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg"><rect width="66" height="66" rx="12" fill="#F8FAFC" stroke="#E2E8F0"/><rect x="13" y="13" width="17" height="17" rx="4" fill="#9C2742"/><rect x="36" y="13" width="17" height="17" rx="4" fill="#C97B94"/><rect x="13" y="36" width="17" height="17" rx="4" fill="#C97B94"/><rect x="36" y="36" width="17" height="17" rx="4" fill="#E2E8F0"/></svg>';
ART.r2 = '<svg viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg"><rect width="66" height="66" rx="12" fill="#F8FAFC" stroke="#E2E8F0"/><ellipse cx="33" cy="20" rx="17" ry="6" fill="#fff" stroke="#94A3B8" stroke-width="1.5"/><path d="M16 20 L16 44 A17 6 0 0 0 50 44 L50 20" fill="#fff" stroke="#94A3B8" stroke-width="1.5"/><ellipse cx="33" cy="44" rx="17" ry="6" fill="none" stroke="#94A3B8" stroke-width="1.5"/><path d="M25 30 L41 30 L39 40 L27 40 Z" fill="#FADBD8" stroke="#C0392B" stroke-width="1.2"/><line x1="23" y1="28" x2="43" y2="28" stroke="#C0392B" stroke-width="1.5"/></svg>';
ART.pin = '<svg viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg"><rect width="66" height="66" rx="12" fill="#F8FAFC" stroke="#E2E8F0"/><rect x="19" y="30" width="28" height="22" rx="4" fill="#9C2742"/><path d="M25 30 L25 23 A8 8 0 0 1 41 23 L41 30" fill="none" stroke="#9C2742" stroke-width="3"/><circle cx="33" cy="40" r="3" fill="#fff"/></svg>';

/* ── the 16 Hub cards ─────────────────────────────────────────────────────── */
var CARDS = [
{
  id:'review-client-names', area:'Admin', date:'2026-07-24', isNew:true,
  title:'Review Client Names',
  pts:['Spots when one client is spelled <b>two or three different ways</b> inside the same project number series.',
       'Shows you the actual projects before anything changes.',
       'Your projects update instantly; other PMs get asked.'],
  chips:[['New','c-new'],['Admin panel','c-where']],
  terms:'client name wrong spelling misspelled typo spelt inconsistent same client different name fix clean up clients variations series conflict mismatch',
  art:ART.rcn
},
{
  id:'client-corrections', area:'Projects board', date:'2026-07-23', isNew:true,
  title:'Client name corrections',
  pts:['Rename a client on your project and <b>everyone else keeps theirs</b> until they agree.',
       'A card appears in the corner — Accept, Review or Decline.',
       'Review lets you accept it on some projects and not others.'],
  chips:[['New','c-new'],['Everyone','c-where']],
  terms:'rename client change client name correction request someone changed my client approve accept decline notification suggest permission ask',
  art:ART.crn
},
{
  id:'insights', area:'Getting around', date:'2026-07-21', isNew:true,
  title:'Insights',
  pts:['See at a glance <b>how many projects have never been backed up</b>.',
       'Backup age split into fresh, 30, 60 and 90+ days.',
       'Active project count per person.'],
  chips:[['New','c-new'],['Dashboard','c-where']],
  terms:'statistics stats numbers dashboard how many coverage who has workload chart graph metrics overview summary report card team load busy',
  art:ART.insights
},
{
  id:'deleted-reports', area:'Reports', date:'2026-07-15',
  title:'Deleted Reports',
  pts:['Deleting a report is <b>reversible</b> — it moves to Deleted Reports.',
       'Anyone can restore it. Only admins can delete forever.',
       'Sits at the bottom of the project page.'],
  chips:[['Everyone','c-where']],
  terms:'deleted disappeared gone missing lost recover restore undo undelete trash recycle bin accidentally removed vanished cant find my report where did it go oops mistake',
  art:ART.trash
},
{
  id:'backups', area:'Backups & export', date:'2026-07-10',
  title:'Backup age warnings',
  pts:['The date under each project <b>tints amber as a backup ages</b>, red past 90 days.',
       '“Not backed up” means it has never been exported.',
       'Select mode can pick every un-backed project at once.'],
  chips:[['Everyone','c-where']],
  terms:'backup back up save export protect copy download safe lost data old stale age never exported red amber warning colour risk losing',
  art:ART.backup
},
{
  id:'export-docs', area:'Backups & export', date:'2026-07-08',
  title:'Export Project Docs',
  pts:['Every report, photo, drawing and the data as <b>one ZIP</b>.',
       'The 📦 button on any project card.',
       'This is also what counts as backing the project up.'],
  chips:[['Everyone','c-where']],
  terms:'export zip download bundle package send to client give to client all photos drawings archive copy off take with me offline share email deliver',
  art:ART.export
},
{
  id:'duplicate-chip', area:'Projects board', date:'2026-07-05',
  title:'Duplicate project numbers',
  pts:['Two projects sharing a number now carry an <b>amber Duplicate chip</b>.',
       'The first-created one is treated as the original.',
       'Use New Report inside the original instead of a second project.'],
  chips:[['Everyone','c-where']],
  terms:'duplicate same number twice two projects repeated number copy double entered again clash conflict number already exists',
  art:ART.dup
},
{
  id:'one-tab', area:'Reports', date:'2026-07-02',
  title:'One tab per report',
  pts:['Opening a report that is already open <b>focuses the existing tab</b>.',
       'Two tabs on one report silently overwrite each other.',
       'Ctrl+click if you deliberately want a second window.'],
  chips:[['Everyone','c-where']],
  terms:'two tabs opened twice overwrite lost work my changes vanished someone overwrote conflict same report open twice duplicate window lost edits disappeared typing',
  art:ART.tabs, compact:true
},
{
  id:'tools-reports', area:'Reports', date:'2026-06-28',
  title:'Tools & Reports',
  pts:['Reports are the main event; tool activation is tucked into one row.',
       'One project can hold <b>several reports per tool</b>.',
       '＋ New Report inside a tool’s group.'],
  chips:[['Everyone','c-where']],
  terms:'new report create report add report start report tool activation turn on tool enable FRT diesel where do i make a report second report another report',
  art:ART.toolsrep
},
{
  id:'star-archive', area:'Projects board', date:'2026-06-20',
  title:'Star and Archive',
  pts:['Star keeps a project at the top of <b>your</b> board only — nobody else sees it.',
       'Archive is filing, not deleting; nothing is lost.',
       'The Active / Archived / Deleted switch changes what the board shows.'],
  chips:[['Everyone','c-where']],
  terms:'star favourite favorite pin top bookmark important archive hide old finished complete done file away put away tidy clean board too many projects',
  art:ART.star, compact:true
},
{
  id:'select-mode', area:'Projects board', date:'2026-06-18',
  title:'Select mode',
  pts:['Tick several projects and act on them <b>together</b>.',
       'Quick-select picks every project never backed up.',
       'One Export then backs them all up at once.'],
  chips:[['Everyone','c-where']],
  terms:'select multiple bulk batch many at once mass tick check several all of them everything together group action',
  art:ART.select, compact:true
},
{
  id:'new-project', area:'Projects board', date:'2026-06-15',
  title:'Creating a project',
  pts:['Typing a number suggests the <b>clients already used</b> under that series.',
       'The client field matches every client on record as you type.',
       'Duplicate numbers are blocked at creation.'],
  chips:[['Everyone','c-where']],
  terms:'new project create project add project start make project set up client suggestion autocomplete number series project manager who owns',
  art:ART.newproj
},
{
  id:'theme', area:'Getting around', date:'2026-06-10',
  title:'Light and dark',
  pts:['The ☀ / ☾ button switches the whole Hub.',
       'It sticks per device — your tablet and desktop can differ.',
       'Field tools open light by default for daylight readability.'],
  chips:[['Everyone','c-where']],
  terms:'dark light night mode theme bright screen too bright dim eyes hurt sun glare outside cant see daylight black white switch appearance',
  art:ART.theme, compact:true
},
{
  id:'tools-portal', area:'Getting around', date:'2026-06-05',
  title:'Tools portal',
  pts:['The Tools button lists <b>every ARENCON tool</b> by category.',
       'Reach FRT, Diesel, Electric, IST, OBC and the rest from one place.'],
  chips:[['Everyone','c-where']],
  terms:'tools apps other tools list of tools where is FRT diesel electric IST OBC checklist find tool open tool launcher portal menu everything',
  art:ART.portal, compact:true
},
{
  id:'r2-reclaim', area:'Admin', date:'2026-07-18',
  title:'Storage Reclamation',
  pts:['Shows the nightly report of <b>photo files no longer referenced</b> by any report.',
       'An admin can permanently reclaim exactly that list.',
       'Nothing outside the listed files is ever touched.'],
  chips:[['Admin only','c-admin']],
  terms:'storage space full disk usage photos cost cleanup purge reclaim orphan unused files R2 cloud size expensive bill',
  art:ART.r2, compact:true
},
{
  id:'pin-lock', area:'Getting around', date:'2026-06-01',
  title:'PIN lock',
  pts:['Lock the Hub without signing out when you step away.',
       'Your session stays alive; the screen just closes.'],
  chips:[['Everyone','c-where']],
  terms:'lock pin security leave desk privacy step away screen lock protect shoulder someone looking away from computer',
  art:ART.pin, compact:true
}
];

registerHelp({
  tool: 'Hub',
  areas: ['Projects board','Reports','Backups & export','Admin','Getting around'],
  cards: CARDS
});
