function fixture = createMatlabVizSimulinkFixtures(destination)
%CREATEMATLABVIZSIMULINKFIXTURES Build small, owned dependency-analysis models.
%   No simulation, diagram-update, code-generation, or WEST-model commands are
%   requested. Creating/saving trusted fixture blocks can evaluate parameters;
%   the observable marker baseline is established after fixture construction.
%   Refuse to overwrite an existing directory; generated binary models belong
%   only to this fixture. Tests run this helper in a separate MATLAB process.
arguments
    destination (1, 1) string
end
if isfolder(destination) || isfile(destination)
    error("MatlabViz:FixtureExists", "Refusing to overwrite fixture: %s", destination);
end
try
    active = currentProject;
catch
    active = [];
end
if ~isempty(active)
    error("MatlabViz:FixtureRequiresFreshProcess", "Create fixtures in a separate MATLAB process with no project open.");
end
mkdir(destination);
originalPath = path; originalFolder = pwd;
cleanup = onCleanup(@() restoreEnvironment(originalPath, originalFolder));
root = fullfile(destination, "project");
models = fullfile(root, "models"); support = fullfile(root, "support");
mkdir(models); mkdir(support); cd(root); addpath(models, support);
top = "matlabVizSimTop"; child = "matlabVizSimChild";
library = "matlabVizSimLibrary"; legacy = "matlabVizSimLegacy";
ownedModels = [top, child, library, legacy];
for name = ownedModels
    if bdIsLoaded(name)
        error("MatlabViz:FixtureModelCollision", "A fixture-named model is already loaded: %s", name);
    end
end
modelCleanup = onCleanup(@() closeOwnedModels(ownedModels));

% Keep callback/parameter functions harmless but observable: marker files tell
% us whether analysis executed them instead of merely finding static references.
for name = ["matlabVizSimParameter", "matlabVizSimCallback"]
    if name == "matlabVizSimParameter", declaration = "function value = " + name; else, declaration = "function " + name; end
    writelines([declaration, ...
        "marker = fullfile(fileparts(mfilename('fullpath')), '" + name + "-executed.flag');", ...
        "file = fopen(marker, 'a'); if file >= 0, fprintf(file, 'executed\n'); fclose(file); end", ...
        "value = 7;", "end"], fullfile(support, name + ".m"));
end
writelines(["function value = matlabVizSimIsolated", "value = 99;", "end"], fullfile(support, "matlabVizSimIsolated.m"));

dictionaryPath = fullfile(support, "matlabVizSimData.sldd");
dictionary = Simulink.data.dictionary.create(dictionaryPath);
dictionaryCleanup = onCleanup(@() close(dictionary));
section = getSection(dictionary, "Design Data"); addEntry(section, "matlabVizDictionaryGain", 3);
saveChanges(dictionary); clear dictionaryCleanup;

new_system(child, "Model");
add_block("built-in/Constant", child + "/Value", "Value", "1");
add_block("built-in/Outport", child + "/Out"); add_line(child, "Value/1", "Out/1");
save_system(child, fullfile(support, child + ".slx"));

new_system(library, "Library");
add_block("built-in/SubSystem", library + "/SharedSubsystem");
add_block("built-in/Gain", library + "/SharedSubsystem/Gain", "Gain", "2");
save_system(library, fullfile(support, library + ".slx"));

new_system(top, "Model");
% Two block instances deliberately share a target file: native graphs can
% provide multiple reasons for a file-level dependency. Do not lose the second.
add_block("built-in/ModelReference", top + "/ChildA", "ModelName", child);
add_block("built-in/ModelReference", top + "/ChildB", "ModelName", child);
add_block(library + "/SharedSubsystem", top + "/LinkedSubsystem");
assert(string(get_param(top + "/LinkedSubsystem", "ReferenceBlock")) == library + "/SharedSubsystem");
add_block("built-in/Constant", top + "/Parameter", "Value", "matlabVizSimParameter()");
set_param(top, "DataDictionary", "matlabVizSimData.sldd", "InitFcn", "matlabVizSimCallback;");
save_system(top, fullfile(models, top + ".slx"));

new_system(legacy, "Model");
add_block("built-in/ModelReference", legacy + "/Child", "ModelName", child);
save_system(legacy, fullfile(models, legacy + ".mdl"));
closeOwnedModels(ownedModels);

project = matlab.project.createProject(Folder=root);
projectCleanup = onCleanup(@() closeProjectIfOpen(project));
files = [fullfile(models, top + ".slx"), fullfile(models, legacy + ".mdl"), ...
    fullfile(support, child + ".slx"), fullfile(support, library + ".slx"), dictionaryPath, ...
    fullfile(support, "matlabVizSimParameter.m"), fullfile(support, "matlabVizSimCallback.m"), ...
    fullfile(support, "matlabVizSimIsolated.m")];
addFile(project, files); addPath(project, models); addPath(project, support); close(project);
fixture = struct("root", root, "models", models, "support", support, "files", files, ...
    "top", fullfile(models, top + ".slx"), "child", fullfile(support, child + ".slx"), ...
    "library", fullfile(support, library + ".slx"), "legacy", fullfile(models, legacy + ".mdl"), ...
    "dictionary", dictionaryPath, "parameter", fullfile(support, "matlabVizSimParameter.m"), ...
    "callback", fullfile(support, "matlabVizSimCallback.m"));
writelines(jsonencode(fixture), fullfile(destination, "fixture.json"));
end

function closeOwnedModels(names)
for name = names
    if bdIsLoaded(name), close_system(name, 0); end
end
end

function closeProjectIfOpen(project)
try
    active = currentProject;
    if ~isempty(active) && active.RootFolder == project.RootFolder, close(project); end
catch
    % The normal path has already closed this owned project.
end
end

function restoreEnvironment(originalPath, originalFolder)
cd(originalFolder); path(originalPath);
end
