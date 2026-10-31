function tests = testAnalyzeMatlabFileDependencies
%TESTANALYZEMATLABFILEDEPENDENCIES Tests for the public standalone API.
tests = functiontests(localfunctions);
end

function setupOnce(testCase)
repositoryRoot = fileparts(fileparts(fileparts(mfilename("fullpath"))));
addpath(fullfile(repositoryRoot, "matlab"));
testCase.TestData.repositoryRoot = repositoryRoot;
end

function testDirectGraphAndArtifacts(testCase)
fixture = string(tempname);
output = fullfile(fixture, "output");
mkdir(fixture);
cleanup = onCleanup(@() removeFixture(fixture));

writelines([ ...
    "function value = main", ...
    "value = helper();", ...
    "end"], fullfile(fixture, "main.m"));
writelines([ ...
    "function value = helper", ...
    "value = 42;", ...
    "end"], fullfile(fixture, "helper.m"));
writelines("value = 1;", fullfile(fixture, "isolated.m"));

report = analyzeMatlabFileDependencies(fixture, ...
    OutputDirectory=output, Render=false, Print=false);

verifyEqual(testCase, height(report.nodes), 3);
verifyEqual(testCase, height(report.edges), 1);
verifyEqual(testCase, numnodes(report.graph), 3);
verifyEqual(testCase, numedges(report.graph), 1);
verifyEqual(testCase, report.edges.Source, "main.m");
verifyEqual(testCase, report.edges.Target, "helper.m");
verifyTrue(testCase, isfile(report.artifacts.nodesCsv));
verifyTrue(testCase, isfile(report.artifacts.edgesCsv));
verifyTrue(testCase, isfile(report.artifacts.productsCsv));
verifyTrue(testCase, isfile(report.artifacts.problemsCsv));
verifyTrue(testCase, isfile(report.artifacts.errorsCsv));
verifyTrue(testCase, isfile(report.artifacts.dot));
verifyTrue(testCase, isfile(report.artifacts.mat));
verifyEqual(testCase, report.artifacts.svg, "");
verifyEqual(testCase, report.artifacts.png, "");

saved = load(report.artifacts.mat, "report");
verifyEqual(testCase, height(saved.report.nodes), 3);
verifyEqual(testCase, height(saved.report.edges), 1);
end

function testScopeAndIsolatedOptions(testCase)
fixture = string(tempname);
mkdir(fixture);
cleanup = onCleanup(@() removeFixture(fixture));
writelines("value = 1;", fullfile(fixture, "isolated.m"));

report = analyzeMatlabFileDependencies(fixture, ...
    IncludeIsolated=false, Render=false, Print=false);

verifyEqual(testCase, height(report.nodes), 0);
verifyEqual(testCase, height(report.edges), 0);
verifyEqual(testCase, numnodes(report.graph), 0);
end

function testAdditionalSearchRootsRespectScopeAndRestorePath(testCase)
fixture = string(tempname);
selected = fullfile(fixture, "selected");
shared = fullfile(fixture, "shared");
mkdir(selected); mkdir(shared);
cleanup = onCleanup(@() removeFixture(fixture));
writelines(["function value = matlabVizPathMain", ...
    "value = matlabVizSiblingHelper();", "end"], fullfile(selected, "matlabVizPathMain.m"));
writelines(["function value = matlabVizSiblingHelper", "value = 42;", "end"], ...
    fullfile(shared, "matlabVizSiblingHelper.m"));
originalPath = path;
report = analyzeMatlabFileDependencies(selected, SearchRoots=fixture, ...
    IncludeExternal=true, MaximumFiles=1, Render=false, Print=false);
verifyEqual(testCase, height(report.nodes), 2);
verifyEqual(testCase, height(report.edges), 1);
verifyEqual(testCase, nnz(report.nodes.External), 1);
verifyEqual(testCase, string(path), string(originalPath));
verifyEqual(testCase, numel(report.searchRoots), 1);
hidden = analyzeMatlabFileDependencies(selected, SearchRoots=fixture, ...
    IncludeExternal=false, Render=false, Print=false);
verifyEqual(testCase, height(hidden.nodes), 1);
verifyEqual(testCase, height(hidden.edges), 0);
verifyEqual(testCase, string(path), string(originalPath));
end

function testSelectedRootPrecedesLookupRoots(testCase)
fixture = string(tempname);
selected = fullfile(fixture, "selected");
shared = fullfile(fixture, "shared");
mkdir(selected); mkdir(shared);
cleanup = onCleanup(@() removeFixture(fixture));
writelines(["function value = matlabVizPathMain", ...
    "value = matlabVizSiblingHelper();", "end"], fullfile(selected, "matlabVizPathMain.m"));
for folder = [shared, selected]
    writelines(["function value = matlabVizSiblingHelper", "value = 42;", "end"], ...
        fullfile(folder, "matlabVizSiblingHelper.m"));
end
report = analyzeMatlabFileDependencies(selected, SearchRoots=shared, ...
    IncludeExternal=true, Render=false, Print=false);
verifyEqual(testCase, height(report.nodes), 2);
verifyEqual(testCase, height(report.edges), 1);
verifyEqual(testCase, nnz(report.nodes.External), 0);
end

function testMissingLookupRootDoesNotChangePath(testCase)
fixture = string(tempname); mkdir(fixture);
cleanup = onCleanup(@() removeFixture(fixture));
writelines("answer = 42;", fullfile(fixture, "isolated.m"));
originalPath = path;
verifyError(testCase, @() analyzeMatlabFileDependencies(fixture, ...
    SearchRoots=fullfile(fixture, "missing"), Print=false), "MatlabViz:SearchRootNotFound");
verifyEqual(testCase, string(path), string(originalPath));
end

function removeFixture(fixture)
if startsWith(fixture, string(tempdir), IgnoreCase=ispc) && ...
        strlength(fixture) > strlength(string(tempdir)) && isfolder(fixture)
    rmdir(fixture, "s");
end
end
