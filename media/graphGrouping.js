/* View-only graph projection. Never mutate analyzer nodes/edges or infer calls.
 * Kept DOM-free so grouping, aggregation and trace seeds can be tested exactly. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MatlabVizGrouping = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  const normalize = (value) => String(value || "").replace(/\\/g, "/").replace(/\/$/, "");
  const parent = (value) => value.includes("/") ? value.slice(0, value.lastIndexOf("/")) : "";

  function index(graph, mode) {
    const groups = new Map(), membership = new Map();
    if (!["folder", "package"].includes(mode)) return { groups, membership };
    const root = normalize(graph.metadata.root);
    // Windows paths are case-insensitive; POSIX fixtures may legitimately have
    // Foo and foo folders. Do not lowercase all platforms indiscriminately.
    const windows = /^[a-z]:\//i.test(root) || root.startsWith("//");
    const keyFor = (value) => windows ? value.toLowerCase() : value;
    const used = new Set(graph.nodes.map((node) => node.id));
    for (const node of graph.nodes) {
      const full = normalize(node.path);
      const inside = keyFor(full).startsWith(keyFor(root) + "/");
      const directory = parent(inside ? full.slice(root.length + 1) : full || normalize(node.relativePath));
      // Use the physical parent path for package ownership: selecting +pkg or
      // its private/@Class folder as the analysis root must not erase +pkg.
      const parts = parent(full || normalize(node.relativePath)).split("/");
      const lastPackage = parts.reduce((last, part, position) => part.startsWith("+") && part.length > 1 ? position : last, -1);
      const packagePath = mode === "package" && lastPackage >= 0;
      // Each file/symbol has one leaf-folder or innermost-package group. Classes
      // and private folders stay within their owning package. Non-package code
      // falls back to its folder; outside-root identities include full paths.
      const packageLocation = parts.slice(0, lastPackage + 1).join("/");
      const location = packagePath ? (keyFor(packageLocation) === keyFor(root) ? "."
        : keyFor(packageLocation).startsWith(keyFor(root) + "/") ? packageLocation.slice(root.length + 1) : packageLocation) : directory;
      const type = packagePath ? "package" : "folder";
      const key = JSON.stringify([type, inside ? "root" : "outside", keyFor(packagePath ? packageLocation : location)]);
      let group = groups.get(key);
      if (!group) {
        let id = `matlab-viz-group:${key}`;
        while (used.has(id)) id += ":";
        used.add(id);
        let packageStart = lastPackage;
        while (packageStart > 0 && parts[packageStart - 1].startsWith("+") && parts[packageStart - 1].length > 1) packageStart--;
        const name = packagePath ? parts.slice(packageStart, lastPackage + 1).map((part) => part.slice(1)).join(".") : location || "(root)";
        group = { id, key, label: `${inside ? "" : "External: "}${name}`, location: location || ".", type, members: [] };
        groups.set(key, group);
      }
      group.members.push(node);
      membership.set(node.id, group.id);
    }
    // Equal package names in different source trees remain separate, and their
    // displayed labels must distinguish them as well as their stable IDs do.
    const labels = new Map();
    for (const group of groups.values()) labels.set(group.label, (labels.get(group.label) || 0) + 1);
    for (const group of groups.values()) if (labels.get(group.label) > 1) group.label += ` [${group.location}]`;
    return { groups: new Map([...groups.values()].map((group) => [group.id, group])), membership,
      edgeIds: graph.edges.map((edge) => edge.id) };
  }

  function project(data, grouping, expanded, itemLabel = "files") {
    if (!grouping.groups.size) return { ...data, original: data, internalEdges: 0 };
    const nodes = [], edges = [], representatives = new Map(), collapsed = new Map();
    for (const node of data.nodes) {
      const id = grouping.membership.get(node.id), group = grouping.groups.get(id);
      if (!group || expanded.has(id)) { nodes.push(node); representatives.set(node.id, node.id); continue; }
      if (!collapsed.has(id)) {
        const value = { id, label: group.label, path: group.location, kind: `${group.type} group`, group,
          members: [], internalEdges: [], external: true, missing: false };
        collapsed.set(id, value); nodes.push(value);
      }
      const value = collapsed.get(id);
      value.members.push(node); value.external &&= node.external; value.missing ||= node.missing;
      representatives.set(node.id, id);
    }
    const aggregates = new Map(), used = new Set(grouping.edgeIds);
    let internalEdges = 0;
    for (const edge of data.edges) {
      const source = representatives.get(edge.source), target = representatives.get(edge.target);
      if (source === undefined || target === undefined) continue;
      if (source === target && collapsed.has(source)) {
        collapsed.get(source).internalEdges.push(edge); internalEdges++; continue;
      }
      if (!collapsed.has(source) && !collapsed.has(target)) { edges.push(edge); continue; }
      const key = JSON.stringify([source, target]);
      if (!aggregates.has(key)) {
        let id = `matlab-viz-link:${key}`;
        while (used.has(id)) id += ":";
        used.add(id);
        const value = { id, source, target, kind: "grouped relationships", originalEdges: [], count: 0 };
        aggregates.set(key, value); edges.push(value);
      }
      const value = aggregates.get(key); value.originalEdges.push(edge); value.count++;
    }
    // Opposite aggregate directions need separate hit targets and count labels,
    // not two coincident lines hiding one another. Geometry bends each directed
    // link to its own left side; original (expanded) edges remain unchanged.
    for (const edge of aggregates.values()) if (aggregates.has(JSON.stringify([edge.target, edge.source]))) edge.curve = 48;
    for (const node of collapsed.values()) {
      const count = node.members.length === node.group.members.length ? node.members.length : `${node.members.length}/${node.group.members.length}`;
      node.relativePath = `${node.label} (${count} ${itemLabel})`;
      // Search matches hidden members too, without affecting visibility/counts.
      node.searchText = node.members.map((member) => `${member.label} ${member.relativePath} ${member.path}`).join(" ");
    }
    return { nodes, edges, original: data, internalEdges };
  }
  return { index, project };
});
