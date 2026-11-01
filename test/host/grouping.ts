import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { validateGraph } from "../../src/model";
import { DebugWebview, snapshotBody } from "./debugWebview";

/** Real Chromium grouping, exports and multi-launch restoration. Cache-only
 * visual checks never analyze or write WEST sources or normal editor settings. */
export async function run(): Promise<void> {
  const artifacts = process.env.MATLAB_VIZ_TEST_ARTIFACTS!, profile = process.env.MATLAB_VIZ_HOST_PROFILE!;
  const stage = process.env.MATLAB_VIZ_RESTORE_STAGE!;
  const observations: string[] = [], debug = new DebugWebview(process.env.MATLAB_VIZ_DEBUG_ENDPOINT!);
  const log = (message: string) => { observations.push(message); console.log(message); };
  const pause = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitFor(check: () => Promise<boolean>) {
    const until = Date.now() + 20_000;
    while (Date.now() < until) { if (await check()) return; await pause(); }
    throw new Error("Grouping editor condition timed out");
  }
  const capture = `${snapshotBody.replace("return {", "return {grouping:document.getElementById('grouping').value,summary:document.getElementById('summary').textContent,")}`;
  try {
    const extension = vscode.extensions.getExtension("daw-0.matlab-viz")!;
    if (stage === "grouping") {
      const fixturePath = process.env.MATLAB_VIZ_TEST_GRAPH ?? path.join(extension.extensionPath, ".tools/validation/0.3.5/west-control-fresh.json");
      const original = validateGraph(JSON.parse(await fs.readFile(fixturePath, "utf8")));
      const storage = path.join(profile, "User", "workspaceStorage"), folders = await fs.readdir(storage, { withFileTypes: true });
      const workspace = folders.find((entry) => entry.isDirectory() && /^[a-f\d]{32}$/i.test(entry.name));
      assert.ok(workspace);
      const cacheFolder = path.join(storage, workspace.name, "daw-0.matlab-viz");
      await fs.mkdir(cacheFolder, { recursive: true });
      await fs.writeFile(path.join(cacheFolder, "last-graph.json"), JSON.stringify(original));
      await vscode.workspace.getConfiguration("files").update("simpleDialog.enable", true, vscode.ConfigurationTarget.Global);
      await vscode.commands.executeCommand("workbench.action.closeSidebar");
      await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
      await vscode.commands.executeCommand("matlabViz.showGraph");
      const view = await debug.graph(), workbench = await debug.workbench();
      const change = (id: string, value: string) => view.evaluate(`const control=document.getElementById(${JSON.stringify(id)});control.value=${JSON.stringify(value)};control.dispatchEvent(new Event('change'));return true;`);
      const count = () => view.evaluate("return document.querySelectorAll('g.node').length;");
      assert.equal(await count(), original.nodes.length);
      for (const mode of ["folder", "package"]) {
        const started = Date.now(); await change("grouping", mode);
        const groups = await count(); assert.ok(groups > 1 && groups < original.nodes.length);
        const summary = await view.evaluate("return document.getElementById('summary').textContent;");
        const cross = await view.evaluate("return [...document.querySelectorAll('.edge')].reduce((sum,edge)=>sum+Number(edge.dataset.linkCount),0);");
        const internal = Number(summary.match(/(\d+) internal/)![1]);
        assert.equal(cross + internal, original.edges.length);
        log(`${mode}: ${original.nodes.length} files -> ${groups} groups, ${cross} cross-group + ${internal} internal links = ${original.edges.length}; render ${Date.now() - started} ms`);
        for (const layout of ["grid", "circle", "hierarchical", "force"]) {
          await change("layout", layout);
          const checked = await view.evaluate(`const svg=document.getElementById('graph'),frame=svg.getBoundingClientRect(),nodes=[...svg.querySelectorAll('g.node')];
            const boxes=nodes.map(node=>{const rect=node.querySelector('rect'),m=node.transform.baseVal.consolidate().matrix;return {x:m.e+rect.x.baseVal.value,y:m.f+rect.y.baseVal.value,w:rect.width.baseVal.value,h:rect.height.baseVal.value};});
            let overlaps=0,clipped=0;for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];if(a.x<b.x+b.w-.01&&a.x+a.w>b.x+.01&&a.y<b.y+b.h-.01&&a.y+a.h>b.y+.01)overlaps++;}
            for(const node of nodes){const r=node.querySelector('rect').getBoundingClientRect();if(r.left<frame.left-1||r.right>frame.right+1||r.top<frame.top-1||r.bottom>frame.bottom+1)clipped++;}return {overlaps,clipped};`);
          assert.deepEqual(checked, { overlaps: 0, clipped: 0 });
        }
        await view.evaluate("document.getElementById('expand-groups').click();return true;"); assert.equal(await count(), original.nodes.length);
        assert.equal(await view.evaluate("return document.querySelectorAll('.edge').length;"), original.edges.length);
        await view.evaluate("document.getElementById('collapse-groups').click();return true;"); assert.equal(await count(), groups);
      }
      log("Both grouping modes: all four layouts have no overlaps/Fit clipping; Expand all restores every original file and edge");
      await change("grouping", "folder"); await change("layout", "grid");
      const firstId = await view.evaluate("return document.querySelector('g.node').dataset.nodeId;");
      await view.evaluate("document.querySelector('g.node').dispatchEvent(new MouseEvent('click',{bubbles:true}));return true;");
      assert.match(await view.evaluate("return document.getElementById('details').textContent;"), /Tracing this group.*original links/);
      // Keyboard activates a collapsed group, and the Groups pane lets an
      // expanded group's row collapse it again without losing its identity.
      await view.evaluate("document.querySelector('g.node').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));return true;");
      assert.equal(await view.evaluate(`return [...document.querySelectorAll('g.node')].some(node=>node.dataset.nodeId===${JSON.stringify(firstId)});`), false);
      await view.evaluate("document.getElementById('groups').click();const row=[...document.querySelectorAll('#details button')].find(button=>button.textContent.startsWith('Collapse:'));if(!row)throw new Error('Expanded group row absent');row.click();return true;");
      await view.evaluate("document.querySelector('[data-link-count]').dispatchEvent(new MouseEvent('click',{bubbles:true}));return true;");
      assert.match(await view.evaluate("return document.getElementById('details').textContent;"), /Grouped dependencies.*Counts are original graph links/);
      const expectedNodes = await count(), expectedEdges = await view.evaluate("return document.querySelectorAll('.edge').length;");
      const input = async (value: string) => {
        await waitFor(async () => {
          await workbench.evaluate(`const input=[...document.querySelectorAll('.quick-input-widget input')].find(input=>input.getBoundingClientRect().width>0);if(!input)return false;input.focus();input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
          await pause(200);
          return workbench.evaluate(`return [...document.querySelectorAll('.quick-input-widget input')].some(input=>input.getBoundingClientRect().width>0&&input.value===${JSON.stringify(value)});`);
        });
        await workbench.request("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        await workbench.request("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); await pause(250);
      };
      for (const format of ["svg", "png", "json", "dot", "csv"]) {
        const destination = path.join(artifacts, `grouped-${format}.${format}`);
        void vscode.commands.executeCommand("matlabViz.exportGraph");
        await input(format === "dot" ? "Graphviz DOT" : format.toUpperCase());
        if (["svg", "png"].includes(format)) { await input("Filtered graph"); if (format === "png") await input("2"); }
        await input(destination);
        await waitFor(async () => { try { return (await fs.stat(destination)).size > 0; } catch { return false; } });
        if (format === "svg") {
          const source = await fs.readFile(destination, "utf8");
          const parsed = await view.evaluate(`const doc=new DOMParser().parseFromString(${JSON.stringify(source)},'image/svg+xml');return {error:!!doc.querySelector('parsererror'),nodes:doc.querySelectorAll('[data-node-id]').length,edges:doc.querySelectorAll('[data-edge-id]').length,counts:doc.querySelectorAll('.link-count').length,images:doc.querySelectorAll('image').length};`);
          assert.deepEqual(parsed, { error: false, nodes: expectedNodes, edges: expectedEdges, counts: expectedEdges, images: 0 });
          assert.match(source, /links are internal to collapsed groups/);
        } else if (format === "png") {
          const data = await fs.readFile(destination); assert.equal(data.subarray(1, 4).toString(), "PNG");
          assert.ok(data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0);
        } else if (format === "json") {
          const data = validateGraph(JSON.parse(await fs.readFile(destination, "utf8")));
          assert.deepEqual(data, original);
        } else {
          const source = await fs.readFile(destination, "utf8");
          assert.ok(!source.includes("matlab-viz-group:"));
          if (format === "dot") assert.equal((source.match(/ -> /g) || []).length, original.edges.length);
          else assert.equal(source.trim().split(/\r?\n/).length - 1, original.edges.length);
        }
      }
      log("Actual export menu/save dialogs: SVG/PNG keep collapsed groups/counts; JSON/DOT/CSV retain the complete original graph without synthetic IDs");
      // Package classification is additionally exercised with controlled in-memory
      // nodes (no files/models are created). Existing schema remains unchanged.
      const packages = JSON.parse(JSON.stringify(original));
      packages.nodes = packages.nodes.slice(0, 4); packages.edges = [];
      for (const [i, relative] of ["src/+one/+two/a.m", "src/+one/+two/private/b.m", "src/+one/c.m", "plain/d.m"].entries()) {
        packages.nodes[i].path = `${packages.metadata.root.replace(/\\/g, "/")}/${relative}`; packages.nodes[i].relativePath = relative;
      }
      packages.metadata.generatedAt = "grouping-package-fixture";
      await view.evaluate(`window.postMessage({type:'setGraph',graph:${JSON.stringify(packages)},defaultLayout:'grid'},'*');return true;`); await pause();
      await change("grouping", "package"); assert.equal(await count(), 3);
      assert.match(await view.evaluate("return document.getElementById('graph').textContent;"), /one.two \(2 files\)/);
      log("Controlled native package view: nested qualified packages, private ownership and non-package folder fallback agree");
      // Reproduce both reported issues with truly disconnected groups. Keep
      // references to actual Chromium nodes: repeated bulk clicks must not even
      // rebuild them, and single expansion must leave unrelated world positions
      // alone while bringing the complete member block into the visible canvas.
      const disconnected = JSON.parse(JSON.stringify(original));
      disconnected.metadata.generatedAt = "isolated-group-reproduction";
      disconnected.edges = []; disconnected.products = []; disconnected.problems = [];
      disconnected.nodes = Array.from({ length: 12 }, (_, i) => ({ ...original.nodes[0], id: `isolated-${i}`,
        label: `file${i}.m`, relativePath: `isolated${Math.floor(i / 3)}/file${i}.m`,
        path: `${original.metadata.root.replace(/\\/g, "/")}/isolated${Math.floor(i / 3)}/file${i}.m`, external: false, missing: false }));
      await view.evaluate(`window.postMessage({type:'setGraph',graph:${JSON.stringify(disconnected)},defaultLayout:'grid'},'*');return true;`); await pause();
      await change("grouping", "folder");
      for (const layout of ["force", "grid", "hierarchical", "circle"]) {
        await change("layout", layout);
        const stable = await view.evaluate(`const capture=()=>JSON.stringify({nodes:[...document.querySelectorAll('g.node')].map(node=>[node.dataset.nodeId,node.getAttribute('transform')]),view:document.querySelector('#graph > g').getAttribute('transform')});
          window.__isolatedCapture=capture;const before=capture(),nodes=[...document.querySelectorAll('g.node')];
          for(let i=0;i<20;i++)document.getElementById('collapse-groups').click();return before===capture()&&nodes.every(node=>node.isConnected);`);
        assert.equal(stable, true, `${layout}: repeated Collapse all drifts/rebuilds`);
        const before = await view.evaluate("return [...document.querySelectorAll('g.node')].map(node=>({id:node.dataset.nodeId,position:node.getAttribute('transform')}));");
        await view.evaluate("document.querySelector('g.node').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));return true;");
        const expanded = await view.evaluate(`const frame=document.getElementById('graph').getBoundingClientRect(),members=[...document.querySelectorAll('g.node')].filter(node=>/^isolated-[012]$/.test(node.dataset.nodeId));
          return {members:members.length,visible:members.every(node=>{const r=node.querySelector('rect').getBoundingClientRect();return r.left>=frame.left-1&&r.right<=frame.right+1&&r.top>=frame.top-1&&r.bottom<=frame.bottom+1;}),
          positions:[...document.querySelectorAll('g.node')].map(node=>({id:node.dataset.nodeId,position:node.getAttribute('transform')}))};`);
        assert.equal(expanded.members, 3); assert.equal(expanded.visible, true, `${layout}: isolated members are not visible`);
        for (const other of before.slice(1)) assert.deepEqual(expanded.positions.find((node: any) => node.id === other.id), other, `${layout}: unrelated group moved`);
        await view.evaluate("document.getElementById('collapse-groups').click();return true;");
        assert.deepEqual(await view.evaluate("return [...document.querySelectorAll('g.node')].map(node=>({id:node.dataset.nodeId,position:node.getAttribute('transform')}));"), before);
        await view.evaluate("document.getElementById('expand-groups').click();return true;");
        assert.equal(await view.evaluate("const before=window.__isolatedCapture(),nodes=[...document.querySelectorAll('g.node')];for(let i=0;i<20;i++)document.getElementById('expand-groups').click();return before===window.__isolatedCapture()&&nodes.every(node=>node.isConnected);"), true);
        await view.evaluate("document.getElementById('collapse-groups').click();return true;");
      }
      log("Disconnected groups in all four layouts: 20 repeated Collapse/Expand All clicks preserve exact positions/viewport/DOM; individual expansion keeps all members visible, unrelated groups fixed, and collapse restores original summary anchors");
      // Return to the cached original, then save a mixed grouped view for the
      // next application launch. The cache itself was never replaced by projection.
      await view.evaluate(`window.postMessage({type:'setGraph',graph:${JSON.stringify(original)},defaultLayout:'grid'},'*');return true;`); await pause();
      await change("grouping", "folder");
      await view.evaluate("document.querySelector('g.node').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));document.querySelector('[data-link-count]').dispatchEvent(new MouseEvent('click',{bubbles:true}));document.getElementById('graph').dispatchEvent(new WheelEvent('wheel',{deltaY:-180,clientX:300,clientY:300,cancelable:true}));return true;");
      await pause(); await fs.writeFile(path.join(artifacts, "grouping-snapshot.json"), JSON.stringify(await view.evaluate(capture), null, 2));
      const screenshot = await workbench.request("Page.captureScreenshot", { format: "png" });
      await fs.writeFile(path.join(artifacts, "grouped-editor.png"), Buffer.from(screenshot.data, "base64"));
      log("Saved mixed expansion, aggregate edge details and custom viewport for a full editor restart");
    } else if (stage === "group-refresh") {
      const root = path.join(process.env.MATLAB_VIZ_HOST_FIXTURES!, "project");
      const config = vscode.workspace.getConfiguration("matlabViz");
      for (const [name, value] of Object.entries({ watchFiles: false, analysisMode: "folder", maximumFiles: 5000,
        includeExternal: false, matlabExecutable: process.env.MATLAB_VIZ_TEST_EXECUTABLE! })) {
        assert.notEqual(value, undefined); await config.update(name, value, vscode.ConfigurationTarget.Global);
      }
      await vscode.commands.executeCommand("matlabViz.analyzeSelection", vscode.Uri.file(root));
      await vscode.commands.executeCommand("matlabViz.showGraph"); const view = await debug.graph();
      await view.evaluate("window.__groupRefreshCount=0;window.addEventListener('message',event=>{if(event.data.type==='setGraph')window.__groupRefreshCount++;});return true;");
      await view.evaluate("const control=document.getElementById('grouping');control.value='folder';control.dispatchEvent(new Event('change'));return true;");
      assert.equal(await view.evaluate("return document.querySelectorAll('g.node').length;"), 1);
      await vscode.commands.executeCommand("matlabViz.refresh");
      await waitFor(async () => view.evaluate("return window.__groupRefreshCount>=1&&document.getElementById('grouping').value==='folder'&&document.querySelectorAll('g.node').length===1;"));
      await view.evaluate("document.getElementById('expand-groups').click();return true;");
      assert.equal(await view.evaluate("return document.querySelectorAll('g.node').length;"), 4);
      await vscode.commands.executeCommand("matlabViz.refresh");
      await waitFor(async () => view.evaluate("return window.__groupRefreshCount>=2&&document.getElementById('grouping').value==='folder'&&document.querySelectorAll('g.node').length===4;"));
      await config.update("maximumFiles", 1, vscode.ConfigurationTarget.Global);
      // A fitted view intentionally refits when the error banner changes canvas
      // height. Exact transform preservation applies to user-customized views.
      await view.evaluate("document.getElementById('graph').dispatchEvent(new WheelEvent('wheel',{deltaY:-120,clientX:200,clientY:200,cancelable:true}));return true;");
      const before = await view.evaluate(capture);
      await vscode.commands.executeCommand("matlabViz.refresh");
      await waitFor(async () => view.evaluate("return !document.getElementById('analysis-status').hidden;"));
      const failed = await view.evaluate(capture); assert.deepEqual({ ...failed, analysisBanner: before.analysisBanner }, before);
      log("Real folder Refresh keeps collapsed/expanded grouping; a file-limit failure leaves grouping, nodes, links, positions and viewport intact");
      await config.update("maximumFiles", 5000, vscode.ConfigurationTarget.Global);
    } else {
      await vscode.commands.executeCommand("matlabViz.showGraph"); const view = await debug.graph();
      const expected = JSON.parse(await fs.readFile(path.join(artifacts, "grouping-snapshot.json"), "utf8"));
      assert.deepEqual(await view.evaluate(capture), expected);
      log("Full editor restart restores grouping, mixed expansion, aggregate details, every node position, search, selection and custom viewport");
    }
    await fs.writeFile(path.join(artifacts, `${stage}-result.json`), JSON.stringify({ passed: true, observations }, null, 2));
  } catch (error) {
    log(error instanceof Error ? error.stack ?? error.message : String(error));
    await fs.writeFile(path.join(artifacts, `${stage}-result.json`), JSON.stringify({ passed: false, observations }, null, 2)); throw error;
  } finally { debug.close(); await fs.writeFile(path.join(artifacts, `${stage}.log`), observations.join("\n")); }
}
