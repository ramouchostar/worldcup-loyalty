import React from "react";

// Mini-rendu Markdown -> JSX stylé (sous-ensemble utilisé par les pages légales :
// titres, paragraphes, listes, gras, citation, filet, tableaux à pipes).
// Volontairement minimal et sans dépendance.

function inline(text: string, kp: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={kp + i} className="font-semibold text-gray-900">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={kp + i}>{p}</React.Fragment>;
  });
}

export function renderMarkdown(md: string): React.ReactNode {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  const nk = () => `md${k++}`;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

    if (line.startsWith("### ")) {
      out.push(<h3 key={nk()} className="text-base font-bold text-gray-900 mt-5 mb-1">{inline(line.slice(4), nk())}</h3>);
      i++; continue;
    }
    if (line.startsWith("## ")) {
      out.push(<h2 key={nk()} className="text-lg font-bold text-brand-dark mt-7 mb-2">{inline(line.slice(3), nk())}</h2>);
      i++; continue;
    }
    if (line.startsWith("# ")) {
      out.push(<h1 key={nk()} className="text-2xl font-black text-brand-dark mb-2">{inline(line.slice(2), nk())}</h1>);
      i++; continue;
    }
    if (line.trim() === "---") { out.push(<hr key={nk()} className="my-6 border-gray-200" />); i++; continue; }

    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) { buf.push(lines[i].slice(2)); i++; }
      out.push(
        <blockquote key={nk()} className="border-l-4 border-brand-gold bg-amber-50 text-amber-900 text-sm rounded-r-lg px-4 py-3 my-4">
          {inline(buf.join(" "), nk())}
        </blockquote>
      );
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) { items.push(lines[i].slice(2)); i++; }
      out.push(
        <ul key={nk()} className="list-disc pl-6 space-y-1 my-2 text-sm text-gray-700 leading-relaxed">
          {items.map((it) => <li key={nk()}>{inline(it, nk())}</li>)}
        </ul>
      );
      continue;
    }

    if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) { rows.push(lines[i]); i++; }
      const parse = (r: string) => r.split("|").slice(1, -1).map((c) => c.trim());
      const header = parse(rows[0]);
      const body = rows.slice(2).map(parse); // rows[1] = séparateur |---|
      out.push(
        <div key={nk()} className="overflow-x-auto my-3">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>{header.map((h) => <th key={nk()} className="text-left font-semibold text-gray-700 px-3 py-2 border-b border-gray-200">{inline(h, nk())}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r) => <tr key={nk()} className="border-b border-gray-100 last:border-0">{r.map((c) => <td key={nk()} className="px-3 py-2 align-top text-gray-700">{inline(c, nk())}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    out.push(<p key={nk()} className="text-sm text-gray-700 leading-relaxed my-2">{inline(line, nk())}</p>);
    i++;
  }

  return <>{out}</>;
}
