(() => {
  const vscode = acquireVsCodeApi();
  const svg = document.getElementById("graph");
  const summary = document.getElementById("summary");
  const details = document.getElementById("details");
  const main = document.getElementById("graph-main");
  const detailsResizer = document.getElementById("details-resizer");
  const search = document.getElementById("search");
  const layout = document.getElementById("layout");
  const grouping = document.getElementById("grouping");
  const groupingApi = globalThis.MatlabVizGrouping;
  let groupIndex = { groups: new Map(), membership: new Map() };
  let expandedGroups = new Set();
  let positionSets = new Map();
  let renderedData = { nodes: [], edges: [] };
  const direction = document.getElementById("direction");
  const depth = document.getElementById("depth");
  const depthLabel = document.getElementById("depth-label");
  const depthText = document.getElementById("depth-text");
  const external = document.getElementById("external");
  const isolated = document.getElementById("isolated");
  const problemsButton = document.getElementById("problems");
  const tooltip = document.getElementById("tooltip");
  const analysisBanner = document.getElementById("analysis-status");
  const analysisBannerText = document.getElementById("analysis-status-text");
  const NS = "http://www.w3.org/2000/svg";
  const geometry = globalThis.MatlabVizGeometry;
  const sizes = new Map();
  const nodeElements = new Map();
  const edgeElements = new Map();
  const labelCanvas = document.createElement("canvas");
  const labelContext = labelCanvas.getContext?.("2d");
  const fontFamily = typeof getComputedStyle === "function" ? getComputedStyle(document.body).fontFamily : "Arial, sans-serif";
  if (labelContext) labelContext.font = `12px ${fontFamily}`;

  let graph;
  let selectedId;
  let positions = new Map();
  let transform = { x: 0, y: 0, k: 1 };
  let world;
  let panning;
  let dragging;
  let graphKey;
  let detailSelection;
  let viewportCustomized = false;
  let stateFrame;
  let suppressClick = false;
  let dragFrame;
  let pointerNodeId;
  let analysisStatus;
  const initialState = vscode.getState();

  // Width is a view preference, not graph data: retain it across Refresh/new
  // results, even when the graph key changes. A narrow window only clamps the
  // displayed width; it must not overwrite a user's wider-window preference.
  const DEFAULT_DETAILS_WIDTH = 280, MIN_DETAILS_WIDTH = 220, MAX_DETAILS_WIDTH = 960;
  const MIN_CANVAS_WIDTH = 240, SEPARATOR_WIDTH = 6, COMPACT_WIDTH = 800;
  let detailsWidth = DEFAULT_DETAILS_WIDTH;
  let resizingDetails;
  let swallowDetailsClick = false;
  let canvasResizeFrame;

  function restoreDetailsWidth(value) {
    if (value?.version === 1 && Number.isFinite(value.detailsWidth)) {
      detailsWidth = Math.round(Math.max(MIN_DETAILS_WIDTH, Math.min(MAX_DETAILS_WIDTH, value.detailsWidth)));
    }
  }

  function detailsWidthLimit() {
    return Math.max(MIN_DETAILS_WIDTH, Math.min(MAX_DETAILS_WIDTH, main.clientWidth - MIN_CANVAS_WIDTH - SEPARATOR_WIDTH));
  }

  function applyDetailsWidth() {
    const maximum = detailsWidthLimit(), displayed = Math.min(detailsWidth, maximum);
    main.style.setProperty("--details-width", `${displayed}px`);
    // Pixel values expose the same bounded range to assistive technology that
    // pointer and keyboard users see. CSS removes the separator in compact mode.
    detailsResizer.setAttribute("aria-valuemin", String(MIN_DETAILS_WIDTH));
    detailsResizer.setAttribute("aria-valuemax", String(maximum));
    detailsResizer.setAttribute("aria-valuenow", String(displayed));
    detailsResizer.setAttribute("aria-valuetext", `${displayed} pixels`);
  }

  function resizeCanvasSoon() {
    // A divider move changes the canvas without a window resize. Coalesce work
    // to one animation frame and keep custom pan/zoom unchanged. Fitted views
    // are refitted, but resizing never rebuilds nodes or changes trace selection.
    if (canvasResizeFrame !== undefined) return;
    canvasResizeFrame = requestAnimationFrame(() => {
      canvasResizeFrame = undefined;
      if (viewportCustomized) updateTransform(); else fit();
    });
  }

  function setDetailsWidth(value) {
    detailsWidth = Math.round(Math.max(MIN_DETAILS_WIDTH, Math.min(detailsWidthLimit(), value)));
    applyDetailsWidth(); resizeCanvasSoon(); saveStateSoon();
  }

  function finishDetailsResize(event) {
    // Ignore secondary pointers and capture-loss callbacks after release.
    if (!resizingDetails || resizingDetails.pointerId !== event.pointerId) return;
    event.stopPropagation?.();
    resizingDetails = undefined;
    swallowDetailsClick = event.type !== "pointercancel";
    main.setAttribute("data-resizing", "false");
    if (detailsResizer.hasPointerCapture(event.pointerId)) detailsResizer.releasePointerCapture(event.pointerId);
    saveStateSoon();
  }

  detailsResizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.isPrimary === false || main.clientWidth <= COMPACT_WIDTH) return;
    event.stopPropagation();
    detailsResizer.focus();
    // Start from the displayed size, not an offscreen preferred width. This
    // prevents a jump when dragging after a large window has become narrower.
    resizingDetails = { pointerId: event.pointerId, x: event.clientX, width: Math.min(detailsWidth, detailsWidthLimit()) };
    main.setAttribute("data-resizing", "true");
    detailsResizer.setPointerCapture(event.pointerId);
  });
  function moveDetailsResize(event) {
    if (!resizingDetails || resizingDetails.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (event.buttons === 0) { finishDetailsResize(event); return; }
    // Moving the divider left makes this right-hand panel wider.
    setDetailsWidth(resizingDetails.width + resizingDetails.x - event.clientX);
  }
  detailsResizer.addEventListener("pointermove", moveDetailsResize);
  detailsResizer.addEventListener("pointerup", finishDetailsResize);
  detailsResizer.addEventListener("pointercancel", finishDetailsResize);
  // Native editor tests caught a renderer path where requested handle capture
  // was not retained, with no lostpointercapture event. Capture-phase document
  // listeners keep moves/releases working over the canvas in that case and
  // prevent the same gesture from reaching graph pan/selection handlers.
  document.addEventListener("pointermove", moveDetailsResize, true);
  document.addEventListener("pointerup", finishDetailsResize, true);
  document.addEventListener("pointercancel", finishDetailsResize, true);
  document.addEventListener("pointerdown", () => { swallowDetailsClick = false; }, true);
  document.addEventListener("click", (event) => {
    if (swallowDetailsClick) { swallowDetailsClick = false; event.stopPropagation(); event.preventDefault(); }
  }, true);
  window.addEventListener("blur", () => { if (resizingDetails) finishDetailsResize(resizingDetails); });
  detailsResizer.addEventListener("lostpointercapture", (event) => {
    if (resizingDetails?.pointerId === event.pointerId && (event.buttons & 1)) {
      try { detailsResizer.setPointerCapture(event.pointerId); return; } catch { /* Pointer is no longer active. */ }
    }
    finishDetailsResize(event);
  });
  detailsResizer.addEventListener("keydown", (event) => {
    if (main.clientWidth <= COMPACT_WIDTH) return;
    const displayed = Math.min(detailsWidth, detailsWidthLimit()), step = event.shiftKey ? 50 : 10;
    let next;
    if (event.key === "ArrowLeft") next = displayed + step;
    else if (event.key === "ArrowRight") next = displayed - step;
    else if (event.key === "Home") next = MIN_DETAILS_WIDTH;
    else if (event.key === "End") next = detailsWidthLimit();
    else if (event.key === "Enter") next = DEFAULT_DETAILS_WIDTH;
    else return;
    event.preventDefault(); event.stopPropagation(); setDetailsWidth(next);
  });
  detailsResizer.addEventListener("dblclick", () => setDetailsWidth(DEFAULT_DETAILS_WIDTH));
  restoreDetailsWidth(initialState); applyDetailsWidth();
  // Sidebar toggles, toolbar wrapping, and detached-window moves can resize the
  // canvas without a window event. Observe only the canvas to avoid feedback
  // from graph drawing; no DOM sizes are changed by the observer callback.
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(resizeCanvasSoon).observe(document.getElementById("canvas-wrap"));

  function saveState() {
    if (!graph) return;
    vscode.setState({
      version: 1, geometryVersion: 1, graphKey,
      controls: { search: search.value, layout: layout.value, grouping: grouping.value || "none", direction: direction.value,
        depth: Number(depth.value), external: external.checked, isolated: isolated.checked },
      selectedId, detailSelection, positions: [...positions], expandedGroups: [...expandedGroups],
      groupPositions: [...positionSets].map(([mode, points]) => [mode, [...points]]),
      transform: { ...transform }, viewportCustomized, detailsWidth, analysisStatus
    });
  }

  function saveStateSoon() {
    if (stateFrame !== undefined) return;
    stateFrame = requestAnimationFrame(() => { stateFrame = undefined; saveState(); });
  }

  function resetDetails() {
    detailSelection = undefined;
    details.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = "Selection";
    const paragraph = document.createElement("p"); paragraph.textContent = "Select a node or edge.";
    details.append(heading, paragraph);
  }

  function restoreState(value) {
    if (!value || value.version !== 1 || value.graphKey !== graphKey) return false;
    analysisStatus = validAnalysisStatus(value.analysisStatus);
    const controls = value.controls || {};
    if (typeof controls.search === "string") search.value = controls.search;
    if (["force", "hierarchical", "circle", "grid"].includes(controls.layout)) layout.value = controls.layout;
    grouping.value = ["folder", "package"].includes(controls.grouping) ? controls.grouping : "none";
    rebuildGroups();
    expandedGroups = new Set(Array.isArray(value.expandedGroups) ? value.expandedGroups.filter((id) => groupIndex.groups.has(id)) : []);
    if (["all", "dependencies", "impact"].includes(controls.direction)) direction.value = controls.direction;
    if (Number.isInteger(controls.depth) && controls.depth >= 1 && controls.depth <= 20) depth.value = String(controls.depth);
    if (typeof controls.external === "boolean") external.checked = controls.external;
    if (typeof controls.isolated === "boolean") isolated.checked = controls.isolated;
    const ids = new Set([...graph.nodes.map((node) => node.id), ...groupIndex.groups.keys()]);
    selectedId = ids.has(value.selectedId) ? value.selectedId : undefined;
    if (!selectedId) direction.value = "all";
    if (value.geometryVersion === 1 && Array.isArray(value.positions)) {
      for (const entry of value.positions) {
        if (Array.isArray(entry) && ids.has(entry[0]) && entry[1]
          && Number.isFinite(entry[1].x) && Number.isFinite(entry[1].y)) {
          positions.set(entry[0], { x: entry[1].x, y: entry[1].y });
        }
      }
    }
    // Each grouping mode owns positions, so toggling grouping does not discard
    // the manually arranged ungrouped graph. Validate stored coordinates/IDs.
    if (value.geometryVersion === 1 && Array.isArray(value.groupPositions)) {
      for (const entry of value.groupPositions) {
        if (!Array.isArray(entry) || !["none", "folder", "package"].includes(entry[0]) || !Array.isArray(entry[1])) continue;
        const valid = new Set([...graph.nodes.map((node) => node.id), ...groupingApi.index(graph, entry[0]).groups.keys()]);
        positionSets.set(entry[0], new Map(entry[1].filter((point) => Array.isArray(point) && valid.has(point[0])
          && point[1] && Number.isFinite(point[1].x) && Number.isFinite(point[1].y))));
      }
    }
    positionSets.set(grouping.value, positions);
    const view = value.transform;
    if (value.geometryVersion === 1 && view && Number.isFinite(view.x) && Number.isFinite(view.y) && Number.isFinite(view.k) && view.k > 0 && view.k <= 1e6) {
      transform = { x: view.x, y: view.y, k: view.k };
      viewportCustomized = value.viewportCustomized === true;
    }
    const selection = value.detailSelection;
    if (selection && ((selection.kind === "node" && ids.has(selection.id))
      || (selection.kind === "edge" && currentGraph().edges.some((edge) => edge.id === selection.id))
      || (selection.kind === "group" && groupIndex.groups.has(selection.id))
      || selection.kind === "groups" || selection.kind === "problems")) detailSelection = selection;
    return true;
  }

  function validAnalysisStatus(value) {
    return value && ["failed", "cancelled"].includes(value.kind) && typeof value.message === "string"
      && typeof value.occurredAt === "string" ? { kind: value.kind, message: value.message, occurredAt: value.occurredAt } : undefined;
  }

  function showAnalysisStatus(value) {
    analysisStatus = validAnalysisStatus(value);
    analysisBanner.hidden = !analysisStatus;
    // textContent keeps MATLAB errors and source paths as plain text, even if
    // their contents resemble markup. A failed attempt never changes graphKey.
    analysisBannerText.textContent = analysisStatus
      ? `Latest analysis ${analysisStatus.kind}. Showing the previous graph (generated ${graph.metadata.generatedAt || "time not recorded"}). ${analysisStatus.message}` : "";
    saveStateSoon();
  }

  function graphTerms() {
    if (graph.metadata.graphType === "call-hierarchy") return { items: "symbols", edges: "calls", heading: "Function call", outgoing: ["callee", "callees"], incoming: ["caller", "callers"], forward: "Callees", backward: "Callers" };
    if (graph.metadata.graphType === "references") return { items: "symbols", edges: "reference links", heading: "Symbol reference", outgoing: ["referenced symbol", "referenced symbols"], incoming: ["referencing container", "referencing containers"], forward: "Referenced symbols", backward: "Referencing containers" };
    return { items: "files", edges: "dependencies", heading: "File dependency", outgoing: ["dependency", "dependencies"], incoming: ["impacted file", "impacted files"], forward: "Dependencies", backward: "Impact" };
  }

  function updateExternalPolicy() {
    const policy = graph.metadata.analysisIncludeExternal;
    const label = document.getElementById("external-policy");
    label.textContent = `Analysis externals: ${policy === true ? "enabled" : policy === false ? "disabled" : "not recorded (Refresh to record)"}`;
    const boundary = graphTerms().items === "files" ? "the selected root" : "the open workspace folders";
    label.title = `External means outside ${boundary}. This is the policy used for the displayed result, not the current setting. Change External analysis settings, then Refresh. Enabled does not guarantee that every external dependency can be resolved.`;
  }

  function restoreDetails() {
    if (detailSelection?.kind === "node") showNode(graph.nodes.find((node) => node.id === detailSelection.id));
    else if (detailSelection?.kind === "edge") {
      const edge = renderedData.edges.find((edge) => edge.id === detailSelection.id) || graph.edges.find((edge) => edge.id === detailSelection.id);
      if (edge) showEdge(edge); else resetDetails();
    }
    else if (detailSelection?.kind === "problems") showProblems();
    else if (detailSelection?.kind === "group") showGroup(groupIndex.groups.get(detailSelection.id));
    else if (detailSelection?.kind === "groups") showGroups();
  }

  function element(name, attributes = {}) {
    const value = document.createElementNS(NS, name);
    for (const [key, item] of Object.entries(attributes)) value.setAttribute(key, String(item));
    return value;
  }

  function nodeSize(node) {
    const label = node.relativePath || node.label;
    if (!sizes.has(node.id) || sizes.get(node.id).label !== label) sizes.set(node.id, { ...geometry.labelBox(label,
      labelContext ? (value) => labelContext.measureText(value).width : undefined), label });
    return sizes.get(node.id);
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
    const data = {
      nodes: graph.nodes.filter((node) => allowed.has(node.id)),
      edges: graph.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target))
    };
    return groupingApi.project(data, groupIndex, expandedGroups, graphTerms().items);
  }

  function rebuildGroups() {
    groupIndex = groupingApi.index(graph, grouping.value);
    for (const id of ["groups", "collapse-groups", "expand-groups"]) document.getElementById(id).disabled = !groupIndex.groups.size;
  }

  function isSelected(id) {
    if (!selectedId) return false;
    if (id === selectedId) return true;
    const owner = groupIndex.membership.get(selectedId);
    if (owner === id && !expandedGroups.has(id)) return true;
    return groupIndex.membership.get(id) === selectedId;
  }

  function findNode(id) {
    return renderedData.nodes.find((node) => node.id === id) || graph.nodes.find((node) => node.id === id)
      || groupIndex.groups.get(id);
  }

  function openNode(node) {
    if (groupIndex.groups.has(node.id)) toggleGroup(node.id);
    else vscode.postMessage({ type: "openFile", path: node.path, line: node.line, character: node.character });
  }

  function toggleGroup(id) {
    if (!groupIndex.groups.has(id)) return;
    if (expandedGroups.has(id)) expandedGroups.delete(id); else expandedGroups.add(id);
    pointerNodeId = undefined; hideTooltip(); render(true); fit(); restoreDetails();
  }

  function showGroups() {
    detailSelection = { kind: "groups" }; details.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = `Groups (${groupIndex.groups.size})`; details.appendChild(heading);
    const explanation = document.createElement("p"); explanation.textContent = "One group per leaf folder or innermost MATLAB package. Non-package code uses folders. Expanding reveals the original nodes; grouping does not change the analysis."; details.appendChild(explanation);
    for (const group of [...groupIndex.groups.values()].sort((a, b) => a.label.localeCompare(b.label))) {
      const button = document.createElement("button"); button.textContent = `${expandedGroups.has(group.id) ? "Collapse" : "Expand"}: ${group.label} (${group.members.length} ${graphTerms().items})`;
      button.setAttribute("aria-expanded", String(expandedGroups.has(group.id)));
      button.addEventListener("click", () => toggleGroup(group.id)); details.appendChild(button);
    }
    saveStateSoon();
  }

  function showGroup(group) {
    if (!group) return;
    detailSelection = { kind: "group", id: group.id }; details.replaceChildren();
    const data = currentGraph(), visible = new Set((data.original || data).nodes.map((node) => node.id));
    const members = group.members.filter((node) => visible.has(node.id)), ids = new Set(members.map((node) => node.id));
    const internal = (data.original || data).edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).length;
    const heading = document.createElement("h2"); heading.textContent = group.label; details.appendChild(heading);
    const text = document.createElement("p"); text.textContent = `${group.type} group: ${members.length}/${group.members.length} ${graphTerms().items} currently included; ${internal} internal ${graphTerms().edges}. Tracing this group starts at every member and follows original links. Search only highlights; data exports remain ungrouped.`; details.appendChild(text);
    const flags = document.createElement("p"); flags.textContent = `${members.filter((node) => node.external).length} external; ${members.filter((node) => node.missing).length} missing. Location: ${group.location}`; details.appendChild(flags);
    const button = document.createElement("button"); button.textContent = expandedGroups.has(group.id) ? "Collapse group" : "Expand group";
    button.setAttribute("aria-expanded", String(expandedGroups.has(group.id)));
    button.addEventListener("click", () => toggleGroup(group.id)); details.appendChild(button);
    for (const node of members) {
      const inspect = document.createElement("button"); inspect.textContent = `Inspect: ${node.relativePath || node.label}`;
      inspect.addEventListener("click", () => {
        expandedGroups.add(group.id); selectedId = node.id; pointerNodeId = undefined;
        render(true); fit(); showNode(node);
      }); details.appendChild(inspect);
    }
    saveStateSoon();
  }

  function placeCount(label, edge) {
    const a = positions.get(edge.source), b = positions.get(edge.target);
    if (a && b) { const point = geometry.linkCountPoint(edge, positions, sizes); label.setAttribute("x", point.x); label.setAttribute("y", point.y); }
  }

  function trace(start, mode, maximumDepth) {
    const adjacency = new Map();
    for (const edge of graph.edges) {
      const from = mode === "dependencies" ? edge.source : edge.target;
      const to = mode === "dependencies" ? edge.target : edge.source;
      if (!adjacency.has(from)) adjacency.set(from, []);
      adjacency.get(from).push(to);
    }
    // Trace the original relationships, not aggregate links: crossing a
    // collapsed cluster must not shortcut multiple file-level dependency hops.
    const seeds = groupIndex.groups.get(start)?.members.map((node) => node.id) || [start];
    const found = new Set(seeds);
    const queue = seeds.map((id) => ({ id, depth: 0 }));
    for (let head = 0; head < queue.length; head++) {
      const item = queue[head];
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

  function isFunctionGraph() {
    return graph?.metadata.graphType === "call-hierarchy";
  }

  function updateDepthControl() {
    const functionGraph = isFunctionGraph();
    depthText.textContent = functionGraph ? "Analysis depth" : "Trace depth";
    depth.disabled = !functionGraph && direction.value === "all";
    depthLabel.title = functionGraph
      ? "Maximum caller/callee analysis depth. Refresh rebuilds the hierarchy to this depth."
      : direction.value === "all"
        ? "Select Dependencies or Impact to filter the displayed graph by trace depth."
        : "Maximum dependency or impact depth shown from the selected node. This does not rerun or expand repository analysis.";
  }

  function problemSummary() {
    if (!graph?.problems.length) return "0 notices";
    const counts = new Map();
    for (const problem of graph.problems) counts.set(problem.severity, (counts.get(problem.severity) || 0) + 1);
    return [
      ["error", "error"],
      ["warning", "warning"],
      ["information", "information notice"]
    ]
      .filter(([severity]) => counts.get(severity))
      .map(([severity, label]) => `${counts.get(severity)} ${label}${counts.get(severity) === 1 ? "" : "s"}`)
      .join(", ");
  }

  function problemFileLabel(file) {
    if (!file) return "General analysis notice";
    const normalized = file.replace(/\\/g, "/");
    const root = graph.metadata.root.replace(/\\/g, "/").replace(/\/$/, "");
    return normalized.toLowerCase().startsWith(`${root.toLowerCase()}/`)
      ? normalized.slice(root.length + 1)
      : normalized;
  }

  function showProblems() {
    detailSelection = { kind: "problems" };
    saveStateSoon();
    details.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = `Analysis notices (${graph?.problems.length || 0})`;
    details.appendChild(heading);
    if (!graph?.problems.length) {
      const empty = document.createElement("p"); empty.textContent = "No analysis notices were reported."; details.appendChild(empty);
      return;
    }
    for (const problem of graph.problems) {
      const article = document.createElement("article"); article.className = "problem";
      const title = document.createElement("h3"); title.textContent = problemFileLabel(problem.file); article.appendChild(title);
      const severity = document.createElement("p"); severity.className = `problem-severity ${problem.severity}`; severity.textContent = problem.severity; article.appendChild(severity);
      const message = document.createElement("p"); message.className = "problem-message"; message.textContent = problem.message; article.appendChild(message);
      if (problem.file) {
        const lineMatch = problem.message.match(/\bLine\s+(\d+)/i);
        const line = lineMatch ? Math.max(0, Number(lineMatch[1]) - 1) : undefined;
        const open = document.createElement("button"); open.textContent = "Open file";
        open.addEventListener("click", () => vscode.postMessage({ type: "openFile", path: problem.file, line }));
        article.appendChild(open);
      }
      details.appendChild(article);
    }
  }

  function calculateLayout(kind) {
    const data = currentGraph();
    if (!data.nodes.length) return;
    data.nodes.forEach(nodeSize);
    if (kind === "circle") geometry.circle(data.nodes, positions, sizes);
    else if (kind === "grid") geometry.grid(data.nodes, positions, sizes);
    else if (kind === "hierarchical") geometry.hierarchical(data, positions, sizes);
    else { forceLayout(data); geometry.separate(data.nodes, positions, sizes); }
  }

  function forceLayout(data) {
    if (data.nodes.length > 350) {
      geometry.hierarchical(data, positions, sizes);
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
    if (!graph) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    nodeElements.clear(); edgeElements.clear();
    const data = currentGraph();
    renderedData = data;
    data.nodes.forEach(nodeSize);
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
    saveStateSoon();
    const itemLabel = graphTerms().items, edgeLabel = graphTerms().edges;
    const original = data.original || data;
    const groupSummary = groupIndex.groups.size ? ` · ${data.nodes.filter((node) => node.group).length} collapsed groups · ${data.edges.length} displayed links · ${data.internalEdges} internal ${edgeLabel}` : "";
    summary.textContent = `${original.nodes.length}/${graph.nodes.length} ${itemLabel} · ${original.edges.length}/${graph.edges.length} ${edgeLabel}${groupSummary} · ${graph.products.length} product references · ${problemSummary()} · ${graph.metadata.mode} · ${graph.metadata.durationSeconds.toFixed(1)} s`;
    summary.title = summary.textContent;
    if (detailSelection?.kind === "group") showGroup(groupIndex.groups.get(detailSelection.id));
  }

  function drawEdge(edge) {
    const value = geometry.edgeGeometry(edge, positions, sizes);
    if (!value) return;
    const line = element(value.d ? "path" : "line", { class: `edge${isSelected(edge.source) || isSelected(edge.target) ? " highlight" : ""}`, "data-edge-id": edge.id, ...(edge.count ? { "data-link-count": edge.count } : {}) });
    for (const [name, item] of Object.entries(value)) if (name !== "bounds") line.setAttribute(name, item);
    edgeElements.set(edge.id, line);
    line.addEventListener("click", (event) => { event.stopPropagation(); showEdge(edge); });
    line.addEventListener("mouseenter", (event) => showTooltip(event, edge.count ? `${edge.count} original ${graphTerms().edges}` : edge.kind));
    line.addEventListener("mouseleave", hideTooltip);
    world.appendChild(line);
    if (edge.count) {
      const label = element("text", { class: "link-count", "data-count-for": edge.id, "text-anchor": "middle" });
      label.textContent = String(edge.count); placeCount(label, edge); world.appendChild(label);
    }
  }

  function drawNode(node, query) {
    const point = positions.get(node.id), size = nodeSize(node);
    const matches = !query || `${node.label} ${node.relativePath} ${node.path} ${node.searchText || ""}`.toLowerCase().includes(query);
    const group = element("g", { transform: `translate(${point.x},${point.y})`, "data-node-id": node.id, ...(node.group ? { "data-group-id": node.id, tabindex: 0, role: "button", "aria-label": `${node.relativePath}; Enter to expand` } : {}), class: `node${node.group ? " cluster" : ""}${node.external ? " external" : ""}${node.missing ? " missing" : ""}${isSelected(node.id) ? " selected" : ""}${matches ? "" : " dim"}` });
    nodeElements.set(node.id, group);
    group.appendChild(element("rect", { x: -size.width / 2, y: -size.height / 2, width: size.width, height: size.height }));
    const text = element("text", { "text-anchor": "middle", "xml:space": "preserve" });
    size.lines.forEach((line, index) => {
      const span = element("tspan", { x: 0, y: (index - (size.lines.length - 1) / 2) * 16 + 4 });
      span.textContent = line; text.appendChild(span);
    });
    group.appendChild(text);
    group.addEventListener("click", (event) => { event.stopPropagation(); if (suppressClick) { suppressClick = false; return; } selectedId = node.id; showNode(node); render(direction.value !== "all"); });
    group.addEventListener("dblclick", (event) => { event.stopPropagation(); openNode(node); });
    if (node.group) group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); toggleGroup(node.id); }
    });
    group.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.stopPropagation(); suppressClick = false;
      pointerNodeId = node.id;
      dragging = { id: node.id, start: screenToWorld(event.clientX, event.clientY), x: event.clientX, y: event.clientY };
      svg.setPointerCapture(event.pointerId);
    });
    group.addEventListener("mouseenter", (event) => showTooltip(event, node.group ? `${node.relativePath}\n${node.internalEdges.length} internal ${graphTerms().edges}; double-click or Enter to expand` : `${node.kind}\n${node.path}`));
    group.addEventListener("mouseleave", hideTooltip);
    world.appendChild(group);
  }

  function showNode(node) {
    if (!node) return;
    if (node.group || groupIndex.groups.has(node.id)) { showGroup(node.group || groupIndex.groups.get(node.id)); return; }
    detailSelection = { kind: "node", id: node.id };
    saveStateSoon();
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
    // Count connected symbols/containers, not source occurrences: one reference
    // edge may group many lines, and duplicate edges must not inflate neighbors.
    const outgoing = new Set(graph.edges.filter((edge) => edge.source === node.id).map((edge) => edge.target)).size;
    const incoming = new Set(graph.edges.filter((edge) => edge.target === node.id).map((edge) => edge.source)).size;
    const terms = graphTerms();
    counts.textContent = `${outgoing} ${terms.outgoing[outgoing === 1 ? 0 : 1]} · ${incoming} ${terms.incoming[incoming === 1 ? 0 : 1]}`;
    details.appendChild(counts);
    const button = document.createElement("button"); button.textContent = node.line === undefined ? "Open file" : "Open symbol"; button.addEventListener("click", () => vscode.postMessage({ type: "openFile", path: node.path, line: node.line, character: node.character })); details.appendChild(button);
  }

  function showEdge(edge) {
    if (!edge) return;
    detailSelection = { kind: "edge", id: edge.id };
    saveStateSoon();
    const source = renderedData.nodes.find((node) => node.id === edge.source), target = renderedData.nodes.find((node) => node.id === edge.target);
    details.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = graphTerms().heading; details.appendChild(heading);
    if (edge.originalEdges) {
      heading.textContent = `Grouped ${graphTerms().edges} (${edge.count})`;
      const explanation = document.createElement("p"); explanation.textContent = `${source?.label} → ${target?.label}. Counts are original graph links, not source occurrences. Internal links are summarized inside collapsed groups.`; details.appendChild(explanation);
      // Explicit originals make mixed relationship types and direction auditable.
      for (const original of edge.originalEdges) {
        const from = graph.nodes.find((node) => node.id === original.source), to = graph.nodes.find((node) => node.id === original.target);
        const row = document.createElement("p"); row.textContent = `${from?.relativePath || original.source} → ${to?.relativePath || original.target}: ${original.kind}${original.details ? ` (${original.details})` : ""}`; details.appendChild(row);
      }
      return;
    }
    const paragraph = document.createElement("p"); paragraph.textContent = `${source?.relativePath || edge.source} → ${target?.relativePath || edge.target}`; details.appendChild(paragraph);
    const kind = document.createElement("p"); kind.textContent = graph.metadata.graphType === "references"
      ? "The source container contains references to the target symbol; one link can group multiple source occurrences."
      : graph.metadata.graphType === "call-hierarchy" ? "The source function calls the target function." : "The source file depends on the target file."; details.appendChild(kind);
    const relationship = document.createElement("p"); relationship.textContent = `Relationship type: ${edge.kind}`; details.appendChild(relationship);
    if (edge.details) { const value = document.createElement("p"); value.textContent = edge.details; details.appendChild(value); }
  }

  function showTooltip(event, text) { tooltip.textContent = text; tooltip.hidden = false; tooltip.style.left = `${event.clientX + 12}px`; tooltip.style.top = `${event.clientY + 12}px`; }
  function hideTooltip() { tooltip.hidden = true; }
  function transformValue() { return `translate(${transform.x},${transform.y}) scale(${transform.k})`; }
  function updateTransform() { if (world) world.setAttribute("transform", transformValue()); saveStateSoon(); }
  function screenToWorld(x, y) { const rect = svg.getBoundingClientRect(); return { x: (x - rect.left - transform.x) / transform.k, y: (y - rect.top - transform.y) / transform.k }; }

  function fit() {
    const data = currentGraph();
    if (!data.nodes.length) return;
    viewportCustomized = false;
    const rect = svg.getBoundingClientRect();
    transform = geometry.fit(geometry.bounds(data, positions, sizes), rect.width, rect.height);
    updateTransform();
  }

  async function exportVisual(format, scope = "graph", scale = 2) {
    try {
      const data = currentGraph();
      const theme = getComputedStyle(document.documentElement);
      const css = (name, fallback) => theme.getPropertyValue(name).trim() || fallback;
      const result = geometry.svgDocument(data, positions, sizes, {
        scope, transform, width: svg.clientWidth, height: svg.clientHeight, selectedId,
        selectedIds: new Set(data.nodes.filter((node) => isSelected(node.id)).map((node) => node.id)), search: search.value, fontFamily,
        colors: { background: css("--vscode-editor-background", "#fff"), text: css("--vscode-editor-foreground", "#222"),
          node: css("--vscode-charts-blue", "#1976d2"), edge: css("--vscode-descriptionForeground", "#888"),
          selected: css("--vscode-focusBorder", "#c05a00"), external: css("--vscode-charts-yellow", "#a17700"), missing: css("--vscode-errorForeground", "#d32f2f") }
      });
      const metadata = { scope, nodes: data.nodes.length, edges: data.edges.length };
      if (format === "svg") {
        vscode.postMessage({ type: "saveVisual", format, data: result.source, encoding: "utf8", ...metadata });
        return;
      }
      const dimensions = geometry.rasterSize(result.width, result.height, scale);
      const image = new Image();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("PNG rendering timed out. Export SVG instead.")), 15_000);
        image.onload = () => { clearTimeout(timer); resolve(); };
        image.onerror = () => { clearTimeout(timer); reject(new Error("Could not render SVG as PNG. Export SVG instead.")); };
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.source)}`;
      });
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width; canvas.height = dimensions.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("PNG canvas is unavailable. Export SVG instead.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const output = canvas.toDataURL("image/png");
      if (!output.startsWith("data:image/png;base64,")) throw new Error("PNG canvas exceeded the renderer's limits. Export SVG instead.");
      vscode.postMessage({ type: "saveVisual", format: "png", data: output, encoding: "base64", ...metadata, ...dimensions });
    } catch (error) {
      vscode.postMessage({ type: "exportError", message: error instanceof Error ? error.message : String(error) });
    }
  }

  function drawDraggedNode() {
    dragFrame = undefined;
    if (!dragging) return;
    const point = positions.get(dragging.id);
    nodeElements.get(dragging.id)?.setAttribute("transform", `translate(${point.x},${point.y})`);
    for (const edge of renderedData.edges) {
      if (edge.source !== dragging.id && edge.target !== dragging.id) continue;
      const line = edgeElements.get(edge.id), value = geometry.edgeGeometry(edge, positions, sizes);
      if (line && value) for (const [name, item] of Object.entries(value)) if (name !== "bounds") line.setAttribute(name, item);
      if (edge.count) {
        const label = [...world.children].find((child) => child.getAttribute("data-count-for") === edge.id);
        if (label) placeCount(label, edge);
      }
    }
    saveStateSoon();
  }
  svg.addEventListener("pointerdown", (event) => {
    if (event.button === 0 && (event.target === svg || event.target === world)) {
      suppressClick = false; panning = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y };
      pointerNodeId = undefined;
      svg.setPointerCapture(event.pointerId);
    }
  });
  svg.addEventListener("pointermove", (event) => {
    if (dragging) {
      const current = screenToWorld(event.clientX, event.clientY), value = positions.get(dragging.id);
      if (Math.hypot(event.clientX - dragging.x, event.clientY - dragging.y) > 4) suppressClick = true;
      value.x += current.x - dragging.start.x; value.y += current.y - dragging.start.y; dragging.start = current;
      if (dragFrame === undefined) dragFrame = requestAnimationFrame(drawDraggedNode);
    } else if (panning) {
      if (Math.hypot(event.clientX - panning.x, event.clientY - panning.y) > 4) suppressClick = true;
      viewportCustomized = true; transform.x = panning.tx + event.clientX - panning.x; transform.y = panning.ty + event.clientY - panning.y; updateTransform();
    }
  });
  function finishPointer(event) {
    if (dragging) drawDraggedNode();
    dragging = undefined; panning = undefined;
    if (svg.hasPointerCapture?.(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    saveState();
  }
  svg.addEventListener("pointerup", finishPointer);
  svg.addEventListener("pointercancel", finishPointer);
  svg.addEventListener("lostpointercapture", (event) => {
    // Renderer/frame transitions can drop capture while the button is still
    // held. Keep the gesture alive and reacquire on the stable SVG owner.
    if ((event.buttons & 1) && (dragging || panning)) {
      try { svg.setPointerCapture(event.pointerId); return; } catch { /* Pointer is no longer active. */ }
    }
    finishPointer(event);
  });
  svg.addEventListener("click", (event) => {
    if (suppressClick) { suppressClick = false; return; }
    if (pointerNodeId) { const node = findNode(pointerNodeId); selectedId = pointerNodeId; showNode(node); render(direction.value !== "all"); return; }
    if (event.target === svg || event.target === world) { const traced = direction.value !== "all"; selectedId = undefined; direction.value = "all"; resetDetails(); updateDepthControl(); render(traced); }
  });
  svg.addEventListener("dblclick", (event) => {
    const node = graph && findNode(pointerNodeId);
    if (node && !suppressClick) { event.stopPropagation(); openNode(node); }
  });
  svg.addEventListener("wheel", (event) => { event.preventDefault(); viewportCustomized = true; const rect = svg.getBoundingClientRect(); const x = event.clientX - rect.left, y = event.clientY - rect.top; const next = Math.max(1e-12, Math.min(8, transform.k * Math.exp(Math.max(-20, Math.min(20, -event.deltaY * .001))))); transform.x = x - ((x - transform.x) / transform.k) * next; transform.y = y - ((y - transform.y) / transform.k) * next; transform.k = next; updateTransform(); }, { passive: false });
  search.addEventListener("input", () => render());
  layout.addEventListener("change", () => { calculateLayout(layout.value); render(); fit(); });
  grouping.addEventListener("change", () => {
    // The old map is already retained in positionSets. Mode changes start
    // collapsed; repeated modes reuse positions without touching source data.
    positions = positionSets.get(grouping.value) || new Map(); positionSets.set(grouping.value, positions);
    expandedGroups = new Set(); rebuildGroups();
    if (selectedId && !graph.nodes.some((node) => node.id === selectedId)) { selectedId = undefined; direction.value = "all"; }
    resetDetails(); pointerNodeId = undefined; updateDepthControl(); render(); fit();
  });
  document.getElementById("groups").addEventListener("click", showGroups);
  for (const action of ["collapse", "expand"]) document.getElementById(`${action}-groups`).addEventListener("click", () => {
    expandedGroups = action === "expand" ? new Set(groupIndex.groups.keys()) : new Set();
    pointerNodeId = undefined; render(true); fit(); restoreDetails();
  });
  direction.addEventListener("change", () => { updateDepthControl(); render(true); fit(); });
  for (const control of [depth, external, isolated]) control.addEventListener("change", () => { render(true); fit(); restoreDetails(); });
  document.getElementById("fit").addEventListener("click", fit);
  document.getElementById("refresh").addEventListener("click", () => {
    const message = { type: "refresh" };
    if (isFunctionGraph()) message.depth = Number(depth.value) || 3;
    vscode.postMessage(message);
  });
  problemsButton.addEventListener("click", showProblems);
  document.getElementById("export").addEventListener("click", () => vscode.postMessage({ type: "export" }));
  document.getElementById("external-settings").addEventListener("click", () => vscode.postMessage({ type: "externalSettings" }));
  document.getElementById("status-logs").addEventListener("click", () => vscode.postMessage({ type: "openLogs" }));
  document.getElementById("status-refresh").addEventListener("click", () => document.getElementById("refresh").click());
  window.addEventListener("resize", () => {
    if (main.clientWidth <= COMPACT_WIDTH && resizingDetails) finishDetailsResize(resizingDetails);
    applyDetailsWidth(); resizeCanvasSoon();
  });
  window.addEventListener("pagehide", saveState);
  window.addEventListener("message", (event) => {
    if (event.data.type === "setGraph") {
      // Serializer-supplied view state can arrive after the script starts.
      // Apply its width before layout/Fit; subsequent results keep this width.
      if (!graph && event.data.viewState) { restoreDetailsWidth(event.data.viewState); applyDetailsWidth(); }
      const incomingKey = JSON.stringify(event.data.graph.metadata);
      const sameGraph = graph && incomingKey === graphKey;
      const previousLayout = layout.value;
      const keepGrouping = graph && graph.metadata.root === event.data.graph.metadata.root
        && graph.metadata.graphType === event.data.graph.metadata.graphType;
      graph = event.data.graph;
      graphKey = incomingKey;
      if (sameGraph) { if (event.data.analysisStatus !== undefined) showAnalysisStatus(event.data.analysisStatus); render(); return; }
      if (!keepGrouping) { grouping.value = "none"; expandedGroups = new Set(); positionSets = new Map(); }
      rebuildGroups(); expandedGroups = new Set([...expandedGroups].filter((id) => groupIndex.groups.has(id)));
      // A Refresh may remove many nodes. Prune all mode maps before saving state.
      for (const [mode, points] of positionSets) {
        const valid = new Set([...graph.nodes.map((node) => node.id), ...groupingApi.index(graph, mode).groups.keys()]);
        for (const id of points.keys()) if (!valid.has(id)) points.delete(id);
      }
      positions = positionSets.get(grouping.value) || new Map(); positionSets.set(grouping.value, positions);
      sizes.clear(); selectedId = undefined;
      dragging = undefined; panning = undefined; pointerNodeId = undefined;
      viewportCustomized = false; transform = { x: 0, y: 0, k: 1 }; analysisStatus = undefined;
      resetDetails(); search.value = ""; direction.value = "all";
      external.checked = true; isolated.checked = true;
      const functionGraph = graph.metadata.graphType === "call-hierarchy";
      if (functionGraph && graph.metadata.analysisDepth) depth.value = String(graph.metadata.analysisDepth);
      const onlyWarnings = graph.problems.length > 0 && graph.problems.every((problem) => problem.severity === "warning");
      problemsButton.hidden = graph.problems.length === 0;
      problemsButton.textContent = `${onlyWarnings ? "Warnings" : "Notices"} (${graph.problems.length})`;
      direction.options[1].textContent = graphTerms().forward;
      direction.options[2].textContent = graphTerms().backward;
      updateExternalPolicy();
      search.placeholder = graph.metadata.graphType === "files" || !graph.metadata.graphType ? "Search files…" : "Search symbols…";
      layout.value = keepGrouping ? previousLayout : functionGraph ? "hierarchical" : event.data.defaultLayout || "force";
      const restored = restoreState(event.data.viewState ?? initialState);
      showAnalysisStatus(event.data.analysisStatus !== undefined ? event.data.analysisStatus : analysisStatus);
      updateDepthControl();
      render(!restored && !keepGrouping); restoreDetails();
      if (!restored || !viewportCustomized) requestAnimationFrame(() => { if (!viewportCustomized) fit(); });
    } else if (event.data.type === "analysisStatus" && graph) showAnalysisStatus(event.data.status);
    else if (event.data.type === "requestExport") void exportVisual(event.data.format, event.data.scope, event.data.scale);
    else if (event.data.type === "showProblems") showProblems();
    else if (event.data.type === "restoreError") { summary.textContent = event.data.message; resetDetails(); }
  });
  vscode.postMessage({ type: "ready" });
})();
