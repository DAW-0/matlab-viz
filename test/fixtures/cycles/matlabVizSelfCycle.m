function value = matlabVizSelfCycle(count)
%MATLABVIZSELFCYCLE Static-analysis fixture containing one direct self-call.
% The editor must retain a self-edge, not count the declaration as a call.
% Native tests inspect this file without executing the function.
if count <= 0
    value = 0;
    return
end
value = matlabVizSelfCycle(count - 1);
end
