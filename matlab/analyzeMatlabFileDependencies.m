function report = analyzeMatlabFileDependencies(sourceRoot, options)
%ANALYZEMATLABFILEDEPENDENCIES Build a direct MATLAB file-dependency graph.
%   REPORT = ANALYZEMATLABFILEDEPENDENCIES(SOURCEROOT) analyzes MATLAB and
%   Simulink source files below SOURCEROOT. For each file, it calls
%   matlab.codetools.requiredFilesAndProducts with the "toponly" option and
%   combines the direct requirements into a directed graph. An edge A -> B
%   means that file A directly requires file B.
%
%   REPORT = ANALYZEMATLABFILEDEPENDENCIES(SOURCEROOT,
%   OutputDirectory=OUTPUTDIRECTORY) also writes these artifacts:
%     matlab-dependency-nodes.csv     node metadata and graph degrees
%     matlab-dependency-edges.csv     direct file dependencies
%     matlab-dependency-products.csv  required MathWorks products by source
%     matlab-dependency-problems.csv  files that could not be analyzed
%     matlab-dependency-errors.csv    compatibility copy of problems
%     matlab-dependencies.dot         Graphviz DOT graph
%     matlab-dependencies.svg         MATLAB vector rendering
%     matlab-dependencies.png         MATLAB raster rendering
%     matlab-dependencies.mat         complete REPORT structure
%
%   Name-value options:
%     IncludeExternal - include dependencies outside SOURCEROOT (false)
%     IncludeIsolated - include files with no retained edges (true)
%     Extensions      - analyzed source extensions
%     MaximumFiles    - reject larger analyses before scanning (5000)
%     SearchRoots     - additional recursive lookup roots, not source roots ([])
%     Render          - write SVG and PNG with other artifacts (true)
%     Print           - print a concise analysis summary (true)
%
%   The returned REPORT contains the MATLAB digraph plus portable node,
%   edge, product, and problem tables. The analyzer is static. Dynamic
%   function names, eval, runtime path changes, and data-dependent loading
%   might not be resolved.

arguments
    sourceRoot (1, 1) string {mustBeFolder}
    options.OutputDirectory (1, 1) string = ""
    options.IncludeExternal (1, 1) logical = false
    options.IncludeIsolated (1, 1) logical = true
    options.Extensions (1, :) string = [".m", ".mlx", ".p", ".slx", ".mdl", ".mlapp"]
    options.MaximumFiles (1, 1) double {mustBeInteger, mustBePositive} = 5000
    options.SearchRoots (1, :) string = strings(1, 0)
    options.Render (1, 1) logical = true
    options.Print (1, 1) logical = true
end

started = tic;
sourceRoot = canonicalExistingPath(sourceRoot);
extensions = normalizeExtensions(options.Extensions);
sourceFiles = discoverSourceFiles(sourceRoot, extensions);
if isempty(sourceFiles)
    error("MatlabViz:NoSourceFiles", ...
        "No supported source files were found below %s.", sourceRoot);
end
if numel(sourceFiles) > options.MaximumFiles
    error("MatlabViz:MaximumFilesExceeded", ...
        "The selected root contains %d analyzable files, exceeding MaximumFiles=%d.", ...
        numel(sourceFiles), options.MaximumFiles);
end

originalPath = path;
pathCleanup = onCleanup(@() path(originalPath));
searchRoots = strings(1, 0);
for requestedRoot = options.SearchRoots
    if ~isfolder(requestedRoot)
        error("MatlabViz:SearchRootNotFound", ...
            "The additional MATLAB lookup root does not exist: %s", requestedRoot);
    end
    lookupRoot = canonicalExistingPath(requestedRoot);
    if ~any(samePath(searchRoots, lookupRoot)) && ~samePath(sourceRoot, lookupRoot)
        searchRoots(end + 1) = lookupRoot; %#ok<AGROW>
    end
end
% Earlier lookup roots take precedence; the selected source tree always wins.
for index = numel(searchRoots):-1:1
    addpath(genpath(searchRoots(index)));
end
addpath(genpath(sourceRoot));

[edgePaths, products, problems] = analyzeFiles( ...
    sourceFiles, sourceRoot, options.IncludeExternal);
[dependencyGraph, nodes, edges] = buildGraph( ...
    sourceFiles, edgePaths, sourceRoot, options.IncludeIsolated);
problems = [problems; missingNodeProblems(nodes, sourceRoot)];

report = struct();
report.schemaVersion = uint16(2);
report.createdOn = string(datetime("now", "TimeZone", "UTC", ...
    "Format", "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"));
report.sourceRoot = sourceRoot;
report.includeExternal = options.IncludeExternal;
report.includeIsolated = options.IncludeIsolated;
report.searchRoots = searchRoots;
report.extensions = extensions;
report.durationSeconds = toc(started);
report.graph = dependencyGraph;
report.nodes = nodes;
report.edges = edges;
report.products = products;
report.problems = problems;
report.errors = problems(:, ["Source", "Identifier", "Message"]);
report.artifacts = emptyArtifacts();

if strlength(options.OutputDirectory) > 0
    outputDirectory = absoluteOutputPath(options.OutputDirectory);
    if ~isfolder(outputDirectory)
        mkdir(outputDirectory);
    end
    report.artifacts = writeArtifacts(report, outputDirectory, options.Render);
    save(report.artifacts.mat, "report");
end

if options.Print
    printSummary(report);
end
end

function extensions = normalizeExtensions(extensions)
extensions = lower(strip(extensions));
extensions(extensions == "") = [];
extensions(~startsWith(extensions, ".")) = ...
    "." + extensions(~startsWith(extensions, "."));
extensions = unique(extensions, "stable");
if isempty(extensions)
    error("MatlabViz:NoExtensions", "At least one source extension is required.");
end
end

function files = discoverSourceFiles(sourceRoot, extensions)
files = strings(0, 1);
for extension = extensions
    entries = dir(fullfile(sourceRoot, "**", "*" + extension));
    entries = entries(~[entries.isdir]);
    if isempty(entries)
        continue
    end
    paths = string(fullfile({entries.folder}, {entries.name})).';
    files = [files; paths]; %#ok<AGROW>
end
files = sort(unique(files));
end

function [edges, products, problems] = analyzeFiles(sourceFiles, sourceRoot, includeExternal)
edgeSources = strings(0, 1);
edgeTargets = strings(0, 1);
productSources = strings(0, 1);
productNames = strings(0, 1);
productVersions = strings(0, 1);
productNumbers = strings(0, 1);
productCertain = false(0, 1);
problemSources = strings(0, 1);
problemIdentifiers = strings(0, 1);
problemMessages = strings(0, 1);

for fileIndex = 1:numel(sourceFiles)
    sourceFile = sourceFiles(fileIndex);
    try
        [requiredFiles, requiredProducts] = ...
            matlab.codetools.requiredFilesAndProducts(sourceFile, "toponly");
        dependencyPaths = string(requiredFiles(:));
        dependencyPaths(samePath(dependencyPaths, sourceFile)) = [];
        if ~includeExternal
            dependencyPaths = dependencyPaths(isWithinRoot(dependencyPaths, sourceRoot));
        end
        if ~isempty(dependencyPaths)
            edgeSources = [edgeSources; repmat(sourceFile, numel(dependencyPaths), 1)]; %#ok<AGROW>
            edgeTargets = [edgeTargets; dependencyPaths]; %#ok<AGROW>
        end

        for productIndex = 1:numel(requiredProducts)
            productSources(end + 1, 1) = sourceFile; %#ok<AGROW>
            productNames(end + 1, 1) = string(requiredProducts(productIndex).Name); %#ok<AGROW>
            productVersions(end + 1, 1) = string(requiredProducts(productIndex).Version); %#ok<AGROW>
            productNumbers(end + 1, 1) = string(requiredProducts(productIndex).ProductNumber); %#ok<AGROW>
            productCertain(end + 1, 1) = logical(requiredProducts(productIndex).Certain); %#ok<AGROW>
        end
    catch exception
        problemSources(end + 1, 1) = sourceFile; %#ok<AGROW>
        problemIdentifiers(end + 1, 1) = string(exception.identifier); %#ok<AGROW>
        problemMessages(end + 1, 1) = string(exception.message); %#ok<AGROW>
    end
end

if isempty(edgeSources)
    edges = strings(0, 2);
else
    edges = unique([edgeSources, edgeTargets], "rows", "stable");
end

products = table( ...
    relativePaths(productSources, sourceRoot), productSources, productNames, ...
    productVersions, productNumbers, productCertain, ...
    VariableNames=["Source", "AbsoluteSource", "Product", "Version", ...
    "ProductNumber", "Certain"]);
if ~isempty(products)
    products = unique(products, "rows", "stable");
end

problems = table( ...
    relativePaths(problemSources, sourceRoot), problemSources, ...
    problemIdentifiers, problemMessages, repmat("warning", numel(problemSources), 1), ...
    VariableNames=["Source", "AbsoluteSource", "Identifier", "Message", "Severity"]);
end

function [dependencyGraph, nodes, edges] = buildGraph(sourceFiles, edgePaths, sourceRoot, includeIsolated)
if isempty(edgePaths)
    nodePaths = sourceFiles;
else
    nodePaths = unique([sourceFiles; edgePaths(:)], "stable");
end
nodeNames = graphNodeNames(nodePaths, sourceRoot);

if isempty(edgePaths)
    dependencyGraph = digraph();
else
    [sourceFound, sourceIndices] = ismember(edgePaths(:, 1), nodePaths);
    [targetFound, targetIndices] = ismember(edgePaths(:, 2), nodePaths);
    if ~all(sourceFound & targetFound)
        error("MatlabViz:GraphMappingFailed", ...
            "At least one dependency path could not be mapped to a graph node.");
    end
    dependencyGraph = digraph( ...
        cellstr(nodeNames(sourceIndices)), cellstr(nodeNames(targetIndices)));
end

if includeIsolated
    if numnodes(dependencyGraph) == 0
        % An unnamed empty digraph has no Nodes.Name table variable yet.
        missingNodes = nodeNames;
    else
        missingNodes = setdiff(nodeNames, string(dependencyGraph.Nodes.Name), "stable");
    end
    if ~isempty(missingNodes)
        dependencyGraph = addnode(dependencyGraph, cellstr(missingNodes));
    end
end

if numnodes(dependencyGraph) == 0
    graphNames = strings(0, 1);
else
    graphNames = string(dependencyGraph.Nodes.Name);
end
[nodeFound, nodeIndices] = ismember(graphNames, nodeNames);
if ~all(nodeFound)
    error("MatlabViz:NodeMetadataMappingFailed", ...
        "At least one graph node could not be mapped to its source path.");
end
orderedPaths = nodePaths(nodeIndices);
[~, baseNames, fileExtensions] = cellfun(@fileparts, cellstr(orderedPaths), ...
    "UniformOutput", false);
labels = string(baseNames) + string(fileExtensions);
external = ~isWithinRoot(orderedPaths, sourceRoot);
missing = ~isfile(orderedPaths);

nodes = table( ...
    graphNames, orderedPaths, relativePaths(orderedPaths, sourceRoot), labels, ...
    string(fileExtensions), kindsForExtensions(string(fileExtensions)), ...
    external, missing, indegree(dependencyGraph), outdegree(dependencyGraph), ...
    VariableNames=["Node", "AbsolutePath", "RelativePath", "Label", ...
    "Extension", "Kind", "External", "Missing", "InDegree", "OutDegree"]);

dependencyGraph.Nodes.AbsolutePath = cellstr(nodes.AbsolutePath);
dependencyGraph.Nodes.Extension = cellstr(nodes.Extension);
dependencyGraph.Nodes.External = nodes.External;
dependencyGraph.Nodes.Missing = nodes.Missing;

if isempty(edgePaths)
    edges = table(strings(0, 1), strings(0, 1), strings(0, 1), strings(0, 1), ...
        strings(0, 1), strings(0, 1), ...
        VariableNames=["Source", "Target", "SourcePath", "TargetPath", "Kind", "Details"]);
else
    retained = ismember(edgePaths(:, 1), orderedPaths) & ...
        ismember(edgePaths(:, 2), orderedPaths);
    edgePaths = edgePaths(retained, :);
    edges = table( ...
        relativePaths(edgePaths(:, 1), sourceRoot), ...
        relativePaths(edgePaths(:, 2), sourceRoot), ...
        edgePaths(:, 1), edgePaths(:, 2), ...
        repmat("function or file dependency", size(edgePaths, 1), 1), ...
        repmat("requiredFilesAndProducts (direct)", size(edgePaths, 1), 1), ...
        VariableNames=["Source", "Target", "SourcePath", "TargetPath", "Kind", "Details"]);
    edges = sortrows(edges, ["Source", "Target"]);
end
end

function names = graphNodeNames(paths, sourceRoot)
inside = isWithinRoot(paths, sourceRoot);
names = normalizePath(paths);
names(inside) = relativePaths(paths(inside), sourceRoot);
names(~inside) = "[external]/" + names(~inside);
if numel(unique(lower(names))) ~= numel(names)
    error("MatlabViz:DuplicateNodeName", ...
        "Dependency paths do not map to unique graph node names.");
end
end

function paths = relativePaths(paths, sourceRoot)
paths = string(paths);
if isempty(paths)
    paths = strings(0, 1);
    return
end
inside = isWithinRoot(paths, sourceRoot);
rootPrefix = normalizePath(sourceRoot) + "/";
normalized = normalizePath(paths);
normalized(inside) = extractAfter(normalized(inside), strlength(rootPrefix));
paths = normalized;
end

function inside = isWithinRoot(paths, sourceRoot)
normalized = normalizePath(paths);
root = normalizePath(sourceRoot);
if ispc
    normalized = lower(normalized);
    root = lower(root);
end
inside = normalized == root | startsWith(normalized, root + "/");
end

function result = samePath(paths, reference)
paths = normalizePath(paths);
reference = normalizePath(reference);
if ispc
    result = strcmpi(paths, reference);
else
    result = paths == reference;
end
end

function normalized = normalizePath(paths)
normalized = replace(string(paths), "\", "/");
while any(contains(normalized, "//"))
    normalized = replace(normalized, "//", "/");
end
normalized = strip(normalized, "right", "/");
end

function kinds = kindsForExtensions(extensions)
kinds = repmat("file", size(extensions));
kinds(ismember(lower(extensions), [".slx", ".mdl"])) = "Simulink model";
kinds(lower(extensions) == ".mlx") = "live script";
kinds(lower(extensions) == ".mlapp") = "MATLAB app";
kinds(lower(extensions) == ".p") = "protected MATLAB code";
kinds(lower(extensions) == ".m") = "MATLAB code";
end

function problems = missingNodeProblems(nodes, sourceRoot)
missingNodes = nodes(nodes.Missing, :);
problems = table( ...
    relativePaths(missingNodes.AbsolutePath, sourceRoot), missingNodes.AbsolutePath, ...
    repmat("MatlabViz:MissingDependency", height(missingNodes), 1), ...
    repmat("Referenced file does not exist.", height(missingNodes), 1), ...
    repmat("warning", height(missingNodes), 1), ...
    VariableNames=["Source", "AbsoluteSource", "Identifier", "Message", "Severity"]);
end

function artifacts = writeArtifacts(report, outputDirectory, renderGraph)
artifacts = struct();
artifacts.nodesCsv = fullfile(outputDirectory, "matlab-dependency-nodes.csv");
artifacts.edgesCsv = fullfile(outputDirectory, "matlab-dependency-edges.csv");
artifacts.productsCsv = fullfile(outputDirectory, "matlab-dependency-products.csv");
artifacts.problemsCsv = fullfile(outputDirectory, "matlab-dependency-problems.csv");
artifacts.errorsCsv = fullfile(outputDirectory, "matlab-dependency-errors.csv");
artifacts.dot = fullfile(outputDirectory, "matlab-dependencies.dot");
artifacts.svg = "";
artifacts.png = "";
artifacts.mat = fullfile(outputDirectory, "matlab-dependencies.mat");

writetable(report.nodes, artifacts.nodesCsv);
writetable(report.edges, artifacts.edgesCsv);
writetable(report.products, artifacts.productsCsv);
writetable(report.problems, artifacts.problemsCsv);
writetable(report.errors, artifacts.errorsCsv);
writeDot(report, artifacts.dot);

if renderGraph
    artifacts.svg = fullfile(outputDirectory, "matlab-dependencies.svg");
    artifacts.png = fullfile(outputDirectory, "matlab-dependencies.png");
    renderDependencyGraph(report, artifacts.svg, artifacts.png);
end
end

function writeDot(report, outputPath)
fileId = fopen(outputPath, "w", "n", "UTF-8");
if fileId < 0
    error("MatlabViz:DotOpenFailed", "Unable to open DOT output %s.", outputPath);
end
fileCleanup = onCleanup(@() fclose(fileId));

fprintf(fileId, "digraph matlab_dependencies {\n");
fprintf(fileId, "  rankdir=LR;\n");
fprintf(fileId, "  graph [overlap=false, splines=true];\n");
fprintf(fileId, '  node [shape=box, style="rounded,filled", fillcolor="#dceeff", fontname="Arial"];\n');
for nodeIndex = 1:height(report.nodes)
    node = dotEscape(report.nodes.Node(nodeIndex));
    label = dotEscape(report.nodes.Label(nodeIndex));
    fprintf(fileId, '  "%s" [label="%s"];\n', node, label);
end
for edgeIndex = 1:height(report.edges)
    source = dotEscape(report.edges.Source(edgeIndex));
    target = dotEscape(report.edges.Target(edgeIndex));
    fprintf(fileId, '  "%s" -> "%s";\n', source, target);
end
fprintf(fileId, "}\n");
end

function value = dotEscape(value)
value = char(value);
value = strrep(value, "\", "\\");
value = strrep(value, '"', '\"');
value = strrep(value, newline, '\n');
end

function renderDependencyGraph(report, svgPath, pngPath)
figureHandle = figure( ...
    "Visible", "off", "Color", "white", "Position", [100, 100, 1800, 1100]);
figureCleanup = onCleanup(@() close(figureHandle));
layout = tiledlayout(figureHandle, 1, 1, "TileSpacing", "compact", "Padding", "compact");
axesHandle = nexttile(layout);
title(layout, sprintf("MATLAB file dependencies: %s", report.sourceRoot), ...
    "Interpreter", "none", "Color", [0.08, 0.08, 0.08]);

if numnodes(report.graph) > 0
    labels = displayLabels(report.nodes);
    graphPlot = plot(axesHandle, report.graph, "Layout", "force", "NodeLabel", cellstr(labels));
    graphPlot.NodeColor = [0.13, 0.45, 0.70];
    graphPlot.EdgeColor = [0.38, 0.38, 0.38];
    graphPlot.NodeLabelColor = [0.08, 0.08, 0.08];
    graphPlot.NodeFontSize = 9;
    graphPlot.NodeFontName = "Arial";
    graphPlot.Interpreter = "none";
    graphPlot.LineWidth = 1.0;
    graphPlot.MarkerSize = 7;
    graphPlot.ArrowSize = 9;
    externalNodes = find(report.nodes.External);
    if ~isempty(externalNodes)
        highlight(graphPlot, externalNodes, "NodeColor", [0.60, 0.60, 0.60]);
    end
else
    text(axesHandle, 0.5, 0.5, "No direct dependencies detected.", ...
        "HorizontalAlignment", "center", "Color", [0.08, 0.08, 0.08]);
end
title(axesHandle, sprintf("Direct dependencies (%d edges)", height(report.edges)), ...
    "Color", [0.08, 0.08, 0.08]);
axesHandle.Color = "white";
axis(axesHandle, "padded");
axis(axesHandle, "off");

exportgraphics(figureHandle, svgPath, "ContentType", "vector");
exportgraphics(figureHandle, pngPath, "Resolution", 180);
end

function labels = displayLabels(nodes)
labels = nodes.Label;
[~, ~, groups] = unique(lower(labels));
counts = accumarray(groups, 1);
for groupIndex = reshape(find(counts > 1), 1, [])
    labels(groups == groupIndex) = nodes.Node(groups == groupIndex);
end
end

function pathValue = canonicalExistingPath(pathValue)
originalFolder = string(pwd);
folderCleanup = onCleanup(@() cd(originalFolder));
try
    cd(pathValue);
    pathValue = string(pwd);
catch exception
    cause = MException("MatlabViz:PathResolutionFailed", ...
        "Unable to resolve path %s.", pathValue);
    cause = addCause(cause, exception);
    throw(cause);
end
end

function pathValue = absoluteOutputPath(pathValue)
if isAbsolutePath(pathValue)
    return
end
pathValue = fullfile(string(pwd), pathValue);
end

function result = isAbsolutePath(pathValue)
value = char(pathValue);
result = ~isempty(regexp(value, "^[A-Za-z]:[\\/]", "once")) || ...
    startsWith(value, "\\") || startsWith(value, "/");
end

function artifacts = emptyArtifacts()
artifacts = struct( ...
    "nodesCsv", "", "edgesCsv", "", "productsCsv", "", ...
    "problemsCsv", "", "errorsCsv", "", "dot", "", ...
    "svg", "", "png", "", "mat", "");
end

function printSummary(report)
fprintf("MATLAB dependency analysis\n");
fprintf("  Root:     %s\n", report.sourceRoot);
fprintf("  Files:    %d\n", height(report.nodes));
fprintf("  Edges:    %d\n", height(report.edges));
fprintf("  Products: %d\n", height(report.products));
fprintf("  Problems: %d\n", height(report.problems));
fprintf("  Duration: %.2f seconds\n", report.durationSeconds);
if strlength(report.artifacts.mat) > 0
    fprintf("  Output:   %s\n", fileparts(report.artifacts.mat));
end
end
