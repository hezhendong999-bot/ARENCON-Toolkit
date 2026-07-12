/**
 * Supabase wrapper mock.
 *
 * CRITICAL DESIGN DECISION:
 *   The real `_sb.from(table).execute()` returns rows as a FLAT ARRAY,
 *   NOT as { data: [...] }. This is verified in ARENCON_Project_Hub.html
 *   line 2024 where the pattern works, and was the source of S127 PUSH E
 *   when one call site assumed { data: ... } and got empty exports.
 *
 *   ALL mocks in this file must match the flat-array shape so tests
 *   accurately reflect production behavior. The contract test in
 *   frt/tests/contracts/supabase.contract.test.js verifies that real
 *   Supabase continues to return this shape.
 */

export function createMockSupabase(initialData = {}) {
  // initialData: { tool_data: [{id, ...}, ...] }
  const tables = { ...initialData };

  function from(tableName) {
    if (!tables[tableName]) tables[tableName] = [];

    let pendingFilters = [];
    let pendingSelect = '*';
    let pendingOrder = null;
    let pendingLimit = null;

    const builder = {
      select(cols = '*') { pendingSelect = cols; return builder; },
      eq(col, val) { pendingFilters.push(r => r[col] === val); return builder; },
      neq(col, val) { pendingFilters.push(r => r[col] !== val); return builder; },
      order(col, opts = {}) { pendingOrder = { col, asc: !opts.ascending === false ? opts.ascending : false }; return builder; },
      limit(n) { pendingLimit = n; return builder; },

      // The critical method: execute() returns a flat array, NOT { data: [...] }
      async execute() {
        let rows = tables[tableName].filter(r => pendingFilters.every(f => f(r)));
        if (pendingOrder) {
          rows = [...rows].sort((a, b) => {
            const av = a[pendingOrder.col];
            const bv = b[pendingOrder.col];
            if (av < bv) return pendingOrder.asc ? -1 : 1;
            if (av > bv) return pendingOrder.asc ? 1 : -1;
            return 0;
          });
        }
        if (pendingLimit != null) rows = rows.slice(0, pendingLimit);
        return rows;  // ← FLAT ARRAY. NOT { data: rows }.
      },

      async insert(row) {
        const rowWithId = { id: row.id || `mock_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, ...row };
        tables[tableName].push(rowWithId);
        return [rowWithId];
      },

      async update(patch) {
        const matched = tables[tableName].filter(r => pendingFilters.every(f => f(r)));
        matched.forEach(r => Object.assign(r, patch));
        return matched;
      },

      async delete() {
        const before = tables[tableName].length;
        tables[tableName] = tables[tableName].filter(r => !pendingFilters.every(f => f(r)));
        return { count: before - tables[tableName].length };
      }
    };

    return builder;
  }

  return {
    from,
    // Internal state inspection (for test assertions only)
    _getTable: name => tables[name] || [],
    _resetAll: () => Object.keys(tables).forEach(k => delete tables[k])
  };
}
