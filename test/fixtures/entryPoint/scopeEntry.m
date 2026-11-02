function value = scopeEntry(input, deviceName)
%SCOPEENTRY Dependency fixture only; test runners analyze, never execute it.
% A constructed target illustrates why static reachability is not completeness.
value = scopeLeaf(input);
callback = str2func("scope" + deviceName);
value = callback(value);
end
