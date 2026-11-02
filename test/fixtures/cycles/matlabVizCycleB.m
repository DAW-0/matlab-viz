function value = matlabVizCycleB(count)
%MATLABVIZCYCLEB Static-analysis fixture: returns to the first call-cycle node.
% This file and its partner are owned test inputs, never WEST application code.
if count <= 0
    value = 0;
    return
end
value = matlabVizCycleA(count - 1);
end
