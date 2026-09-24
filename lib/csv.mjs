// CSV download helpers shared by the admin export endpoints.
export function csvCell(value) {
  const text = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvResponse(name, header, rows) {
  const lines = [header.map(csvCell).join(",")].concat(rows.map((r) => r.map(csvCell).join(",")));
  // BOM so Excel opens Chinese / Japanese text correctly.
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
