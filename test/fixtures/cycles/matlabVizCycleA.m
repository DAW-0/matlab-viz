function value = matlabVizCycleA(count)
%MATLABVIZCYCLEA Static-analysis fixture: one half of a mutual call cycle.
% The native editor test reads the source; it never evaluates this function.
% A terminating base case also makes accidental interactive use harmless.
if count <= 0
    value = 0;
    return
end
value = matlabVizCycleB(count - 1);
end
