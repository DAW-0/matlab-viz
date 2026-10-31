function summary = validateMatlabVizAccuracy(artifactsRoot, repositoryRoot)
%VALIDATEMATLABVIZACCURACY Reproduce selected-folder lookup on a real checkout.
arguments
    artifactsRoot (1, 1) string
    repositoryRoot (1, 1) string {mustBeFolder}
end
helperRoot = fileparts(fileparts(fileparts(mfilename("fullpath"))));
if ~isfolder(artifactsRoot)
    mkdir(artifactsRoot);
end
originalPath = path;
cleanup = onCleanup(@() path(originalPath));
restoredefaultpath;
addpath(fullfile(helperRoot, "matlab"));
selected = fullfile(repositoryRoot, "lib", "retina", "observer", "execution", "offline-sim");
baseline = analyzeMatlabFileDependencies(selected, IncludeExternal=true, Render=false, Print=false);
resolved = analyzeMatlabFileDependencies(selected, SearchRoots=repositoryRoot, ...
    IncludeExternal=true, OutputDirectory=fullfile(artifactsRoot, "offline-sim"), Render=false, Print=false);
hidden = analyzeMatlabFileDependencies(selected, SearchRoots=repositoryRoot, ...
    IncludeExternal=false, Render=false, Print=false);
assert(isequal(sort(baseline.nodes.AbsolutePath(~baseline.nodes.External)), ...
    sort(resolved.nodes.AbsolutePath(~resolved.nodes.External))), "Lookup roots expanded the selected sources.");
assert(nnz(resolved.nodes.External) > 0, "Expected resolvable external workspace dependencies.");
assert(height(resolved.edges) >= height(baseline.edges), "Lookup removed existing dependencies.");
assert(~any(hidden.nodes.External), "External filter failed.");
assert(all(ismember(resolved.edges.SourcePath, resolved.nodes.AbsolutePath(~resolved.nodes.External))), ...
    "External files were incorrectly analyzed as additional sources.");
summary = struct("passed", true, ...
    "baselineNodes", height(baseline.nodes), "baselineEdges", height(baseline.edges), ...
    "resolvedNodes", height(resolved.nodes), "resolvedEdges", height(resolved.edges), ...
    "externalNodes", nnz(resolved.nodes.External), ...
    "hiddenNodes", height(hidden.nodes), "hiddenEdges", height(hidden.edges));
fileId = fopen(fullfile(artifactsRoot, "repository-lookup-summary.json"), "w", "n", "UTF-8");
assert(fileId >= 0, "Could not create validation summary.");
fileCleanup = onCleanup(@() fclose(fileId));
fprintf(fileId, "%s", jsonencode(summary));
disp(summary);
end
