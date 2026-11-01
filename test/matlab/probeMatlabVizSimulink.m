function probeMatlabVizSimulink(artifacts)
%PROBEMATLABVIZSIMULINK Retain native/bridge observations before defining tests.
arguments
    artifacts (1, 1) string
end
if ~isfolder(artifacts), mkdir(artifacts); end
fixture = createMatlabVizSimulinkFixtures(fullfile(artifacts, "fixture"));
originalPath = path; cleanup = onCleanup(@() path(originalPath));
disp("Fixture construction markers"); disp(dir(fullfile(fixture.support, "*-executed.flag")));
for enabled = [false, true]
    project = openProject(fixture.root, Prompt=false);
    updateDependencies(project, ReanalyzeAll=true, AnalyzeModelParameters=enabled, AnalyzeAddOns=false);
    nativeGraph = project.Dependencies;
    disp("Native parameter analysis: " + enabled); disp(nativeGraph.Nodes); disp(nativeGraph.Edges);
    save(fullfile(artifacts, "native-parameters-" + enabled + ".mat"), "nativeGraph"); close(project);
    options = struct("mode", "project", "includeExternal", false, "includeIsolated", true, ...
        "maximumFiles", 5000, "reanalyzeAll", true, "analyzeReferences", false, ...
        "analyzeAddOns", false, "analyzeModelParameters", enabled);
    optionsPath = fullfile(artifacts, "options.json"); writelines(jsonencode(options), optionsPath);
    MatlabVizAnalyze(fixture.root, fullfile(artifacts, "project-parameters-" + enabled + ".json"), optionsPath);
    disp("Stage markers after parameter policy " + enabled); disp(dir(fullfile(fixture.support, "*-executed.flag")));
end
report = analyzeMatlabFileDependencies(fixture.root, Render=false, Print=false, ...
    OutputDirectory=fullfile(artifacts, "folder"));
disp("Folder nodes"); disp(report.nodes); disp("Folder edges"); disp(report.edges);
disp("Callback/parameter execution markers"); disp(dir(fullfile(fixture.support, "*-executed.flag")));
end
