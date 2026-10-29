(() => {
  const vscode = acquireVsCodeApi();
  const svg = document.getElementById("graph");
  const summary = document.getElementById("summary");
  const details = document.getElementById("details");
  const search = document.getElementById("search");
  const layout = document.getElementById("layout");
  const direction = document.getElementById("direction");
  const depth = document.getElementById("depth");
  const external = document.getElementById("external");
  const isolated = document.getElementById("isolated");
  const tooltip = document.getElementById("tooltip");
  const NS = "http://www.w3.org/2000/svg";

  let graph;
  let selectedId;
  let positions = new Map();
  let transform = { x: 0, y: 0, k: 1 };
  let world;
  let panning;
  let dragging;

  function element(name, attributes = {}) {
    const value = document.createElementNS(NS, name);
    for (const [key, item] of Object.entries(attributes)) value.setAttribute(key, String(item));
    return value;
  }

  function nodeSize(node) {
    const label = node.relativePath || node.label;
    return { width: Math.min(330, Math.max(120, label.length * 7.1 + 24)), height: 38 };
  }

  function currentGraph() {
    if (!graph) return { nodes: [], edges: [] };
    const degree = new Map(graph.nodes.map((node) => [node.id, 0]));
    for (const edge of graph.edges) {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    }
    let allowed = new Set(graph.nodes
      .filter((node) => external.checked || !node.external)
      .filter((node) => isolated.checked || (degree.get(node.id) || 0) > 0)
      .map((node) => node.id));
    if (selectedId && direction.value !== "all") {
      const traced = trace(selectedId, direction.value, Number(depth.value) || 3);
      allowed = new Set([...allowed].filter((id) => traced.has(id)));
    }
    return {
      nodes: graph.nodes.filter((node) => allowed.has(node.id)),
      edges: graph.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target))
    };
  }

  function trace(start, mode, maximumDepth) {
    const adjacency = new Map();
    for (const edge of graph.edges) {
      const from = mode === "dependencies" ? edge.source : edge.target;
      const to = mode === "dependencies" ? edge.target : edge.source;
      if (!adjacency.has(from)) adjacency.set(from, []);
      adjacency.get(from).push(to);
    }
    const found = new Set([start]);
    const queue = [{ id: start, depth: 0 }];
    while (queue.length) {
      const item = queue.shift();
      if (item.depth >= maximumDepth) continue;
      for (const next of adjacency.get(item.id) || []) {
        if (!found.has(next)) {
          found.add(next);
          queue.push({ id: next, depth: item.depth + 1 });
        }
      }
    }
    return found;
  }

  function calculateLayout(kind) {
    const data = currentGraph();
    if (!data.nodes.length) return;
    if (kind === "circle") circleLayout(data.nodes);
    else if (kind === "grid") gridLayout(data.nodes);
    else if (kind === "hierarchical") hierarchicalLayout(data);
    else forceLayout(data);
  }

  function gridLayout(nodes) {
    const columns = Math.ceil(Math.sqrt(nodes.length));
    nodes.forEach((node, index) => positions.set(node.id, { x: (index % columns) * 240, y: Math.floor(index / columns) * 100 }));
  }

  function circleLayout(nodes) {
    const radius = Math.max(180, nodes.length * 22);
    nodes.forEach((node, index) => {
      const angle = (index / nodes.length) * Math.PI * 2;
      positions.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
  }

  function hierarchicalLayout(data) {
    const indegree = new Map(data.nodes.map((node) => [node.id, 0]));
    const outgoing = new Map(data.nodes.map((node) => [node.id, []]));
    for (const edge of data.edges) {
      indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
      outgoing.get(edge.source)?.push(edge.target);
    }
    const levels = new Map();
    const queue = [...indegree].filter(([, value]) => value === 0).map(([id]) => id);
    if (!queue.length && data.nodes[0]) queue.push(data.nodes[0].id);
    queue.forEach((id) => levels.set(id, 0));
    while (queue.length) {
      const id = queue.shift();
      const nextLevel = (levels.get(id) || 0) + 1;
      for (const next of outgoing.get(id) || []) {
        if (!levels.has(next) || levels.get(next) < nextLevel) levels.set(next, nextLevel);
        indegree.set(next, (indegree.get(next) || 1) - 1);
        if (indegree.get(next) === 0) queue.push(next);
      }
    }
    let fallback = Math.max(0, ...levels.values()) + 1;
    for (const node of data.nodes) if (!levels.has(node.id)) levels.set(node.id, fallback++);
    const rows = new Map();
    for (const node of data.nodes) {
      const level = levels.get(node.id);
      if (!rows.has(level)) rows.set(level, []);
      rows.get(level).push(node);
    }
    for (const [level, nodes] of rows) nodes.forEach((node, index) => positions.set(node.id, { x: level * 300, y: index * 90 }));
  }

  function forceLayout(data) {
    if (data.nodes.length > 350) {
      hierarchicalLayout(data);
      return;
    }
    const count = data.nodes.length;
    data.nodes.forEach((node, index) => {
      if (!positions.has(node.id)) {
        const angle = (index / count) * Math.PI * 2;
        positions.set(node.id, { x: Math.cos(angle) * count * 8, y: Math.sin(angle) * count * 8 });
      }
    });
    for (let iteration = 0; iteration < 100; iteration++) {
      const forces = new Map(data.nodes.map((node) => [node.id, { x: 0, y: 0 }]));
      for (let first = 0; first < count; first++) {
        for (let second = first + 1; second < count; second++) {
          const a = positions.get(data.nodes[first].id), b = positions.get(data.nodes[second].id);
          let dx = a.x - b.x, dy = a.y - b.y;
          const distance2 = Math.max(100, dx * dx + dy * dy);
          const magnitude = 7000 / distance2;
          const distance = Math.sqrt(distance2);
          dx /= distance; dy /= distance;
          forces.get(data.nodes[first].id).x += dx * magnitude;
          forces.get(data.nodes[first].id).y += dy * magnitude;
          forces.get(data.nodes[second].id).x -= dx * magnitude;
          forces.get(data.nodes[second].id).y -= dy * magnitude;
        }
      }
      for (const edge of data.edges) {
        const a = positions.get(edge.source), b = positions.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const magnitude = (distance - 230) * .018;
        forces.get(edge.source).x += (dx / distance) * magnitude;
        forces.get(edge.source).y += (dy / distance) * magnitude;
        forces.get(edge.target).x -= (dx / distance) * magnitude;
        forces.get(edge.target).y -= (dy / distance) * magnitude;
      }
      const cooling = 1 - iteration / 110;
      for (const node of data.nodes) {
        const point = positions.get(node.id), force = forces.get(node.id);
        point.x += Math.max(-15, Math.min(15, force.x)) * cooling;
        point.y += Math.max(-15, Math.min(15, force.y)) * cooling;
      }
    }
  }

  function render(reposition = false) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const data = currentGraph();
    if (reposition || data.nodes.some((node) => !positions.has(node.id))) calculateLayout(layout.value);
    const defs = element("defs");
    const marker = element("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    marker.appendChild(element("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "context-stroke" }));
    defs.appendChild(marker);
    const filter = element("filter", { id: "shadow", x: "-20%", y: "-20%", width: "140%", height: "140%" });
    const shadow = element("feDropShadow", { dx: 0, dy: 1, stdDeviation: 1.2, "flood-opacity": .2 });
    filter.appendChild(shadow); defs.appendChild(filter); svg.appendChild(defs);
    world = element("g", { transform: transformValue() }); svg.appendChild(world);
    if (!data.nodes.length) {
      const text = element("text", { x: 30, y: 50, class: "empty" }); text.textContent = "No nodes match the current filters."; world.appendChild(text);
    }
    const query = search.value.trim().toLowerCase();
    for (const edge of data.edges) drawEdge(edge);
    for (const node of data.nodes) drawNode(node, query);
    const itemLabel = graph.metadata.graphType === "files" || !graph.metadata.graphType ? "files" : "symbols";
    const edgeLabel = graph.metadata.graphType === "references" ? "references" : graph.metadata.graphType === "call-hierarchy" ? "calls" : "dependencies";
    summary.textContent = `${data.nodes.length}/${graph.nodes.length} ${itemLabel} · ${data.edges.length}/${graph.edges.length} ${edgeLabel} · ${graph.products.length} product references · ${graph.problems.length} problems · ${graph.metadata.mode} · ${graph.metadata.durationSeconds.toFixed(1)} s`;
  }

  function drawEdge(edge) {
    const source = positions.get(edge.source), target = positions.get(edge.target);
    if (!source || !target) return;
    const sourceNode = graph.nodes.find((node) => node.id === edge.source);
    const targetNode = graph.nodes.find((node) => node.id === edge.target);
    const a = nodeSize(sourceNode), b = nodeSize(targetNode);
    const dx = target.x - source.x, dy = target.y - source.y;
    const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const x1 = source.x + (dx / distance) * (a.width / 2);
    const y1 = source.y + (dy / distance) * (a.height / 2);
    const x2 = target.x - (dx / distance) * (b.width / 2 + 7);
    const y2 = target.y - (dy / distance) * (b.height / 2 + 7);
    const line = element("line", { x1, y1, x2, y2, class: `edge${selectedId && (edge.source === selectedId || edge.target === selectedId) ? " highlight" : ""}` });
    line.addEventListener("click", (event) => { event.stopPropagation(); showEdge(edge); });
    line.addEventListener("mouseenter", (event) => showTooltip(event, edge.kind));
    line.addEventListener("mouseleave", hideTooltip);
    world.appendChild(line);
  }

  function drawNode(node, query) {
    const point = positions.get(node.id), size = nodeSize(node);
    const matches = !query || `${node.label} ${node.relativePath} ${node.path}`.toLowerCase().includes(query);
    const group = element("g", { transform: `translate(${point.x},${point.y})`, class: `node${node.external ? " external" : ""}${node.missing ? " missing" : ""}${node.id === selectedId ? " selected" : ""}${matches ? "" : " dim"}` });
    group.appendChild(element("rect", { x: -size.width / 2, y: -size.height / 2, width: size.width, height: size.height }));
    const text = element("text", { x: 0, y: 4, "text-anchor": "middle" });
    const label = node.relativePath || node.label;
    text.textContent = label.length > 44 ? `…${label.slice(-43)}` : label;
    group.appendChild(text);
    group.addEventListener("click", (event) => { event.stopPropagation(); selectedId = node.id; showNode(node); render(); });
    group.addEventListener("dblclick", (event) => { event.stopPropagation(); vscode.postMessage({ type: "openFile", path: node.path, line: node.line, character: node.character }); });
    group.addEventListener("pointerdown", (event) => { event.stopPropagation(); dragging = { id: node.id, start: screenToWorld(event.clientX, event.clientY) }; group.setPointerCapture(event.pointerId); });
    group.addEventListener("pointermove", (event) => {
      if (!dragging || dragging.id !== node.id) return;
      const current = screenToWorld(event.clientX, event.clientY), value = positions.get(node.id);
      value.x += current.x - dragging.start.x; value.y += current.y - dragging.start.y; dragging.start = current; render();
    });
    group.addEventListener("pointerup", () => { dragging = undefined; });
    group.addEventListener("mouseenter", (event) => showTooltip(event, `${node.kind}\n${node.path}`));
    group.addEventListener("mouseleave", hideTooltip);
    world.appendChild(group);
  }

  function showNode(node) {
    details.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = node.label; details.appendChild(heading);
    const list = document.createElement("dl");
    const fields = [["Path", node.path], ["Type", node.kind]];
    if (node.line !== undefined) fields.push(["Line", String(node.line + 1)]);
    if (node.containerName) fields.push(["Container", node.containerName]);
    fields.push(["External", node.external ? "Yes" : "No"], ["Missing", node.missing ? "Yes" : "No"]);
    for (const [name, value] of fields) {
      const term = document.createElement("dt"); term.textContent = name;
      const description = document.createElement("dd"); description.textContent = value;
      list.append(term, description);
    }
    details.appendChild(list);
    const counts = document.createElement("p");
    counts.textContent = `${graph.edges.filter((edge) => edge.source === node.id).length} dependencies · ${graph.edges.filter((edge) => edge.target === node.id).length} impacted files`;
    details.appendChild(counts);
    const button = document.createElement("button"); button.textContent = node.line === undefined ? "Open file" : "Open symbol"; button.addEventListener("click", () => vscode.postMessage({ type: "openFile", path: node.path, line: node.line, character: node.character })); details.appendChild(button);
  }

  function showEdge(edge) {
    const source = graph.nodes.find((node) => node.id === edge.source), target = graph.nodes.find((node) => node.id === edge.target);
    details.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = "Dependency"; details.appendChild(heading);
    const paragraph = document.createElement("p"); paragraph.textContent = `${source?.relativePath || edge.source} → ${target?.relativePath || edge.target}`; details.appendChild(paragraph);
    const kind = document.createElement("p"); kind.textContent = edge.kind; details.appendChild(kind);
    if (edge.details) { const value = document.createElement("p"); value.textContent = edge.details; details.appendChild(value); }
  }

  function showTooltip(event, text) { tooltip.textContent = text; tooltip.hidden = false; tooltip.style.left = `${event.clientX + 12}px`; tooltip.style.top = `${event.clientY + 12}px`; }
  function hideTooltip() { tooltip.hidden = true; }
  function transformValue() { return `translate(${transform.x},${transform.y}) scale(${transform.k})`; }
  function updateTransform() { if (world) world.setAttribute("transform", transformValue()); }
  function screenToWorld(x, y) { const rect = svg.getBoundingClientRect(); return { x: (x - rect.left - transform.x) / transform.k, y: (y - rect.top - transform.y) / transform.k }; }

  function fit() {
    const data = currentGraph();
    if (!data.nodes.length) return;
    const xs = data.nodes.map((node) => positions.get(node.id)?.x || 0), ys = data.nodes.map((node) => positions.get(node.id)?.y || 0);
    const minX = Math.min(...xs) - 190, maxX = Math.max(...xs) + 190, minY = Math.min(...ys) - 70, maxY = Math.max(...ys) + 70;
    const rect = svg.getBoundingClientRect();
    transform.k = Math.max(.08, Math.min(2, Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY))));
    transform.x = (rect.width - (minX + maxX) * transform.k) / 2;
    transform.y = (rect.height - (minY + maxY) * transform.k) / 2;
    updateTransform();
  }

  function exportVisual(format) {
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", NS);
    clone.setAttribute("width", String(svg.clientWidth)); clone.setAttribute("height", String(svg.clientHeight));
    const style = document.createElementNS(NS, "style");
    style.textContent = `.edge{stroke:#7f8c8d;stroke-width:1.2;fill:none}.node rect{fill:#fff;stroke:#1976d2;stroke-width:1.5}.node.external rect{stroke:#d6a500;stroke-dasharray:5 3}.node.missing rect{stroke:#d32f2f}.node text{fill:#222;font:12px Arial}`;
    clone.insertBefore(style, clone.firstChild);
    const source = new XMLSerializer().serializeToString(clone);
    if (format === "svg") {
      vscode.postMessage({ type: "saveVisual", format: "svg", data: source, encoding: "utf8" });
      return;
    }
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas"); canvas.width = svg.clientWidth * 2; canvas.height = svg.clientHeight * 2;
      const context = canvas.getContext("2d"); context.scale(2, 2); context.fillStyle = "white"; context.fillRect(0, 0, svg.clientWidth, svg.clientHeight); context.drawImage(image, 0, 0);
      vscode.postMessage({ type: "saveVisual", format: "png", data: canvas.toDataURL("image/png"), encoding: "base64" });
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  }

  svg.addEventListener("pointerdown", (event) => { if (event.target === svg || event.target === world) panning = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y }; });
  svg.addEventListener("pointermove", (event) => { if (panning) { transform.x = panning.tx + event.clientX - panning.x; transform.y = panning.ty + event.clientY - panning.y; updateTransform(); } });
  svg.addEventListener("pointerup", () => { panning = undefined; });
  svg.addEventListener("click", (event) => { if (event.target === svg) { selectedId = undefined; direction.value = "all"; render(); } });
  svg.addEventListener("wheel", (event) => { event.preventDefault(); const rect = svg.getBoundingClientRect(); const x = event.clientX - rect.left, y = event.clientY - rect.top; const next = Math.max(.05, Math.min(8, transform.k * Math.exp(-event.deltaY * .001))); transform.x = x - ((x - transform.x) / transform.k) * next; transform.y = y - ((y - transform.y) / transform.k) * next; transform.k = next; updateTransform(); }, { passive: false });
  search.addEventListener("input", () => render());
  layout.addEventListener("change", () => { calculateLayout(layout.value); render(); fit(); });
  for (const control of [direction, depth, external, isolated]) control.addEventListener("change", () => { render(); fit(); });
  document.getElementById("fit").addEventListener("click", fit);
  document.getElementById("refresh").addEventListener("click", () => vscode.postMessage({ type: "refresh", depth: Number(depth.value) || 3 }));
  document.getElementById("export").addEventListener("click", () => vscode.postMessage({ type: "export" }));
  window.addEventListener("resize", fit);
  window.addEventListener("message", (event) => {
    if (event.data.type === "setGraph") {
      graph = event.data.graph; positions = new Map(); selectedId = undefined;
      const functionGraph = graph.metadata.graphType === "call-hierarchy";
      if (functionGraph && graph.metadata.analysisDepth) depth.value = String(graph.metadata.analysisDepth);
      direction.options[1].textContent = functionGraph ? "Callees" : "Dependencies";
      direction.options[2].textContent = functionGraph ? "Callers" : "Impact";
      search.placeholder = graph.metadata.graphType === "files" || !graph.metadata.graphType ? "Search files…" : "Search symbols…";
      layout.value = functionGraph ? "hierarchical" : event.data.defaultLayout || "force";
      render(true); requestAnimationFrame(fit);
    } else if (event.data.type === "requestExport") exportVisual(event.data.format);
  });
  vscode.postMessage({ type: "ready" });
})();
