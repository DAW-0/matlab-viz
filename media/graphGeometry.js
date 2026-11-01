/* Shared, deterministic geometry for the webview and export regressions. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MatlabVizGeometry = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  function labelBox(label, measure = (value) => Array.from(value).length * 7.2) {
    const lines = [];
    let line = "";
    for (const character of Array.from(label)) {
      if (line && measure(line + character) > 328) { lines.push(line); line = ""; }
      line += character;
    }
    lines.push(line);
    return { lines, width: Math.max(120, ...lines.map((value) => measure(value) + 32)), height: Math.max(42, lines.length * 16 + 22) };
  }

  function grid(nodes, positions, sizes) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
    const widths = Array(columns).fill(0), heights = [];
    nodes.forEach((node, index) => {
      widths[index % columns] = Math.max(widths[index % columns], sizes.get(node.id).width);
      const row = Math.floor(index / columns);
      heights[row] = Math.max(heights[row] || 0, sizes.get(node.id).height);
    });
    const offsets = (values) => { let offset = 0; return values.map((size) => { const center = offset + size / 2; offset += size + 48; return center; }); };
    const xs = offsets(widths), ys = offsets(heights);
    nodes.forEach((node, index) => positions.set(node.id, { x: xs[index % columns], y: ys[Math.floor(index / columns)] }));
  }

  function circle(nodes, positions, sizes) {
    const diameter = Math.max(1, ...nodes.map((node) => Math.hypot(sizes.get(node.id).width, sizes.get(node.id).height)));
    const radius = nodes.length < 2 ? 0 : Math.max(180, (diameter + 48) / (2 * Math.sin(Math.PI / nodes.length)));
    nodes.forEach((node, index) => {
      const angle = index * 2 * Math.PI / nodes.length;
      positions.set(node.id, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
    });
  }

  // Iterative strongly connected components avoid recursion limits on large
  // repositories. A cycle occupies one rank; the condensed graph is acyclic.
  function hierarchical(data, positions, sizes) {
    const outgoing = new Map(data.nodes.map((node) => [node.id, []]));
    const incoming = new Map(data.nodes.map((node) => [node.id, []]));
    for (const edge of data.edges) { outgoing.get(edge.source)?.push(edge.target); incoming.get(edge.target)?.push(edge.source); }
    const seen = new Set(), order = [];
    for (const node of data.nodes) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      const stack = [{ id: node.id, index: 0 }];
      while (stack.length) {
        const item = stack[stack.length - 1], next = outgoing.get(item.id) || [];
        if (item.index < next.length) {
          const id = next[item.index++];
          if (!seen.has(id)) { seen.add(id); stack.push({ id, index: 0 }); }
        } else { order.push(item.id); stack.pop(); }
      }
    }
    const components = new Map(); let count = 0;
    for (const id of order.reverse()) {
      if (components.has(id)) continue;
      const stack = [id]; components.set(id, count);
      while (stack.length) {
        for (const next of incoming.get(stack.pop()) || []) {
          if (!components.has(next)) { components.set(next, count); stack.push(next); }
        }
      }
      count++;
    }
    const links = Array.from({ length: count }, () => new Set()), indegree = Array(count).fill(0), rank = Array(count).fill(0);
    for (const edge of data.edges) {
      const a = components.get(edge.source), b = components.get(edge.target);
      if (a !== undefined && b !== undefined && a !== b && !links[a].has(b)) { links[a].add(b); indegree[b]++; }
    }
    const queue = indegree.flatMap((value, index) => value === 0 ? [index] : []);
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head];
      for (const next of links[id]) { rank[next] = Math.max(rank[next], rank[id] + 1); if (--indegree[next] === 0) queue.push(next); }
    }
    const columns = [];
    for (const node of data.nodes) { const level = rank[components.get(node.id)] || 0; (columns[level] ||= []).push(node); }
    let x = 0;
    for (const nodes of columns) {
      if (!nodes) continue;
      const width = Math.max(...nodes.map((node) => sizes.get(node.id).width));
      const height = nodes.reduce((sum, node) => sum + sizes.get(node.id).height + 40, -40);
      let y = -height / 2;
      for (const node of nodes) { const size = sizes.get(node.id); positions.set(node.id, { x: x + width / 2, y: y + size.height / 2 }); y += size.height + 40; }
      x += width + 100;
    }
  }

  // Deterministic rectangle packing after the force simulation. Occupied
  // vertical intervals are sorted, so one pass finds a non-overlapping slot.
  function separate(nodes, positions, sizes) {
    const placed = [];
    for (const node of nodes) {
      const point = positions.get(node.id), size = sizes.get(node.id);
      const intervals = placed.filter((other) => Math.abs(other.point.x - point.x) < (other.size.width + size.width) / 2 + 24)
        .map((other) => [other.point.y - (other.size.height + size.height) / 2 - 24, other.point.y + (other.size.height + size.height) / 2 + 24])
        .sort((a, b) => a[0] - b[0]);
      for (const [low, high] of intervals) { if (point.y > low && point.y < high) point.y = high; }
      placed.push({ point, size });
    }
  }

  // Expand a group as one compact block near its previous summary, without
  // rerunning Force or moving any unrelated nodes. Search a bounded number of
  // nearby x slots; merged forbidden y intervals give a free slot at each x.
  // Unlike iterative repulsion this terminates deterministically, including
  // disconnected members, mixed label sizes, and a crowded neighborhood.
  function placeCluster(nodes, anchor, fixed, positions, sizes) {
    if (!nodes.length) return;
    const local = new Map(); grid(nodes, local, sizes);
    const box = bounds({ nodes, edges: [] }, local, sizes, 0);
    const obstacles = fixed.map((node) => ({ point: positions.get(node.id), size: sizes.get(node.id) }))
      .filter((item) => item.point && item.size);
    const xs = [anchor.x];
    for (const { point, size } of obstacles) xs.push(point.x - (size.width + box.width) / 2 - 24, point.x + (size.width + box.width) / 2 + 24);
    const candidates = [...new Set(xs)].sort((a, b) => Math.abs(a - anchor.x) - Math.abs(b - anchor.x)).slice(0, 17);
    let best;
    for (const x of candidates) {
      const intervals = obstacles.filter(({ point, size }) => Math.abs(point.x - x) < (size.width + box.width) / 2 + 23.99)
        .map(({ point, size }) => [point.y - (size.height + box.height) / 2 - 24, point.y + (size.height + box.height) / 2 + 24])
        .sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const interval of intervals) {
        const last = merged[merged.length - 1];
        if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
        else merged.push([...interval]);
      }
      let y = anchor.y;
      for (const [low, high] of merged) if (y > low && y < high) { y = anchor.y - low <= high - anchor.y ? low : high; break; }
      const distance = (x - anchor.x) ** 2 + (y - anchor.y) ** 2;
      if (!best || distance < best.distance) best = { x, y, distance };
      if (distance === 0) break;
    }
    const center = { x: box.minX + box.width / 2, y: box.minY + box.height / 2 };
    if (nodes.length === 1) { positions.set(nodes[0].id, { x: best.x, y: best.y }); return; }
    for (const node of nodes) {
      const point = local.get(node.id);
      positions.set(node.id, { x: point.x + best.x - center.x, y: point.y + best.y - center.y });
    }
  }

  function boundary(point, size, toward, gap = 0) {
    const dx = toward.x - point.x, dy = toward.y - point.y;
    if (!dx && !dy) return { ...point };
    const t = Math.min(dx ? size.width / (2 * Math.abs(dx)) : Infinity, dy ? size.height / (2 * Math.abs(dy)) : Infinity);
    const extra = gap / Math.hypot(dx, dy);
    return { x: point.x + dx * (t + extra), y: point.y + dy * (t + extra) };
  }

  function edgeGeometry(edge, positions, sizes) {
    const a = positions.get(edge.source), b = positions.get(edge.target);
    const source = sizes.get(edge.source), target = sizes.get(edge.target);
    if (!a || !b || !source || !target) return undefined;
    if (edge.source === edge.target || (a.x === b.x && a.y === b.y)) {
      const right = a.x + source.width / 2, top = a.y - source.height / 2;
      return { d: `M ${right} ${a.y} C ${right + 60} ${a.y} ${right + 60} ${top - 48} ${a.x} ${top - 7}`, bounds: { minX: a.x, maxX: right + 60, minY: top - 48, maxY: a.y } };
    }
    if (edge.curve) {
      const { control } = linkCountPoint(edge, positions);
      const start = boundary(a, source, control, 2), end = boundary(b, target, control, 7);
      return { d: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
        bounds: { minX: Math.min(start.x, end.x, control.x), maxX: Math.max(start.x, end.x, control.x), minY: Math.min(start.y, end.y, control.y), maxY: Math.max(start.y, end.y, control.y) } };
    }
    const start = boundary(a, source, b, 2), end = boundary(b, target, a, 7);
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  }

  function linkCountPoint(edge, positions, sizes) {
    const a = positions.get(edge.source), b = positions.get(edge.target);
    const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const normal = { x: -(b.y - a.y) / distance, y: (b.x - a.x) / distance };
    const control = { x: (a.x + b.x) / 2 + normal.x * (edge.curve || 0), y: (a.y + b.y) / 2 + normal.y * (edge.curve || 0) };
    const start = sizes && edge.curve ? boundary(a, sizes.get(edge.source), control, 2) : a;
    const end = sizes && edge.curve ? boundary(b, sizes.get(edge.target), control, 7) : b;
    return { x: (start.x + 2 * control.x + end.x) / 4 + normal.x * 12,
      y: (start.y + 2 * control.y + end.y) / 4 + normal.y * 12 + 4, control };
  }

  function bounds(data, positions, sizes, padding = 32) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of data.nodes) {
      const point = positions.get(node.id), size = sizes.get(node.id);
      if (!point || !size) continue;
      minX = Math.min(minX, point.x - size.width / 2); maxX = Math.max(maxX, point.x + size.width / 2);
      minY = Math.min(minY, point.y - size.height / 2); maxY = Math.max(maxY, point.y + size.height / 2);
    }
    for (const edge of data.edges) {
      const value = edgeGeometry(edge, positions, sizes)?.bounds;
      if (value) { minX = Math.min(minX, value.minX); maxX = Math.max(maxX, value.maxX); minY = Math.min(minY, value.minY); maxY = Math.max(maxY, value.maxY); }
    }
    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: 640, height: 360 };
    return { minX: minX - padding, minY: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
  }

  function fit(box, width, height) {
    const k = Math.min(2, Math.max(1, width) / box.width, Math.max(1, height) / box.height);
    return { k, x: width / 2 - (box.minX + box.width / 2) * k, y: height / 2 - (box.minY + box.height / 2) * k };
  }

  const xml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
  function svgDocument(data, positions, sizes, options) {
    const box = options.scope === "viewport" ? { minX: 0, minY: 0, width: options.width, height: options.height } : bounds(data, positions, sizes);
    const color = { background: "#ffffff", text: "#222222", node: "#1976d2", edge: "#6b7280", selected: "#c05a00", external: "#a17700", missing: "#d32f2f", ...options.colors };
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="${box.width}" height="${box.height}" viewBox="${box.minX} ${box.minY} ${box.width} ${box.height}" role="img">`,
      `<title>MATLAB Viz dependency graph</title><desc>${data.nodes.length} nodes, ${data.edges.length} edges; ${xml(options.scope || "graph")} export. Search highlights do not exclude nodes.${data.original ? ` Grouped view of ${data.original.nodes.length} original nodes and ${data.original.edges.length} original links; ${data.internalEdges} links are internal to collapsed groups. Counts are graph links, not source occurrences. JSON/DOT/CSV retain the complete ungrouped graph.` : ""}</desc>`,
      `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${xml(color.edge)}"/></marker><marker id="arrow-selected" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${xml(color.selected)}"/></marker></defs>`,
      `<rect x="${box.minX}" y="${box.minY}" width="${box.width}" height="${box.height}" fill="${xml(color.background)}"/>`];
    const view = options.transform;
    parts.push(options.scope === "viewport" ? `<g transform="translate(${view.x},${view.y}) scale(${view.k})">` : "<g>");
    for (const edge of data.edges) {
      const value = edgeGeometry(edge, positions, sizes); if (!value) continue;
      const highlight = edge.source === options.selectedId || edge.target === options.selectedId || options.selectedIds?.has(edge.source) || options.selectedIds?.has(edge.target);
      const shape = value.d ? `<path d="${value.d}"` : `<line x1="${value.x1}" y1="${value.y1}" x2="${value.x2}" y2="${value.y2}"`;
      parts.push(`${shape} data-edge-id="${xml(edge.id)}" class="edge" fill="none" stroke="${xml(highlight ? color.selected : color.edge)}" stroke-width="${highlight ? 2.4 : 1.2}" marker-end="url(#${highlight ? "arrow-selected" : "arrow"})"/>`);
      if (edge.count) {
        const point = linkCountPoint(edge, positions, sizes);
        parts.push(`<text class="link-count" x="${point.x}" y="${point.y}" text-anchor="middle" fill="${xml(color.text)}" font-family="${xml(options.fontFamily || "Arial, sans-serif")}" font-size="12" font-weight="bold" paint-order="stroke" stroke="${xml(color.background)}" stroke-width="4" stroke-linejoin="round">${edge.count}</text>`);
      }
    }
    const query = (options.search || "").trim().toLowerCase();
    for (const node of data.nodes) {
      const point = positions.get(node.id), size = sizes.get(node.id);
      const selected = node.id === options.selectedId || options.selectedIds?.has(node.id);
      const matches = !query || `${node.label} ${node.relativePath} ${node.path} ${node.searchText || ""}`.toLowerCase().includes(query);
      const stroke = selected ? color.selected : node.missing ? color.missing : node.external ? color.external : color.node;
      parts.push(`<g class="node" data-node-id="${xml(node.id)}" transform="translate(${point.x},${point.y})"${matches ? "" : ' opacity="0.15"'}><title>${xml(node.relativePath || node.label)}</title><rect x="${-size.width / 2}" y="${-size.height / 2}" width="${size.width}" height="${size.height}" rx="5" fill="${xml(color.background)}" stroke="${xml(stroke)}" stroke-width="${selected || node.missing ? 2.5 : 1.5}"${node.external ? ' stroke-dasharray="5 3"' : ""}/><text text-anchor="middle" fill="${xml(color.text)}" font-family="${xml(options.fontFamily || "Arial, sans-serif")}" font-size="12">`);
      size.lines.forEach((line, index) => parts.push(`<tspan x="0" y="${(index - (size.lines.length - 1) / 2) * 16 + 4}">${xml(line)}</tspan>`));
      parts.push("</text></g>");
    }
    parts.push("</g></svg>");
    return { source: parts.join(""), width: box.width, height: box.height };
  }

  function rasterSize(width, height, scale) {
    const w = Math.ceil(width * scale), h = Math.ceil(height * scale);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w > 16384 || h > 16384 || w * h > 32_000_000) {
      throw new Error(`PNG would require ${w} × ${h} pixels. The limit is 16,384 pixels per side and 32 megapixels. Choose SVG for a large, zoomable graph, a lower PNG scale, or a smaller filtered graph.`);
    }
    return { width: w, height: h };
  }

  return { labelBox, grid, circle, hierarchical, separate, placeCluster, boundary, edgeGeometry, linkCountPoint, bounds, fit, svgDocument, rasterSize };
});
