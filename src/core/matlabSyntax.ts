export interface CallCandidate {
  name: string;
  nameOffset: number;
}

export interface MatlabDeclaration {
  name: string;
  nameOffset: number;
  startOffset: number;
  endOffset: number;
  kind: "function" | "class";
}

const NON_CALL_KEYWORDS = new Set([
  "arguments",
  "break",
  "case",
  "catch",
  "classdef",
  "continue",
  "else",
  "elseif",
  "end",
  "enumeration",
  "events",
  "for",
  "function",
  "global",
  "if",
  "methods",
  "otherwise",
  "parfor",
  "persistent",
  "properties",
  "return",
  "spmd",
  "switch",
  "try",
  "while"
]);

/** Mark source offsets that represent executable MATLAB code rather than strings or comments. */
export function matlabCodeMask(source: string): Uint8Array {
  const mask = new Uint8Array(source.length);
  let state: "code" | "single" | "double" | "comment" | "blockComment" = "code";
  let arrayDepth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    const next = source[index + 1] ?? "";
    if (state === "comment") {
      if (character === "\n") {
        state = "code";
        mask[index] = 1;
      }
      continue;
    }
    if (state === "blockComment") {
      const linePrefix = source.slice(Math.max(0, source.lastIndexOf("\n", index) + 1), index);
      if (character === "%" && next === "}" && linePrefix.trim() === "") {
        state = "code";
        index += 1;
      }
      continue;
    }
    if (state === "single") {
      if (character === "\n") { state = "code"; mask[index] = 1; }
      else if (character === "'" && next === "'") {
        index += 1;
      } else if (character === "'") {
        state = "code";
      }
      continue;
    }
    if (state === "double") {
      if (character === "\n") { state = "code"; mask[index] = 1; }
      else if (character === '"' && next === '"') {
        index += 1;
      } else if (character === '"') {
        state = "code";
      }
      continue;
    }

    mask[index] = 1;
    if (character === "\n") {
      continue;
    }
    if (character === "%") {
      if (next === "{" && source.slice(Math.max(0, source.lastIndexOf("\n", index) + 1), index).trim() === "") {
        state = "blockComment";
      } else {
        state = "comment";
      }
      mask[index] = 0;
      continue;
    }
    if (character === '"') {
      state = "double";
      mask[index] = 0;
      continue;
    }
    if (character === "[") arrayDepth++;
    if (character === "]") arrayDepth = Math.max(0, arrayDepth - 1);
    if (character === "'") {
      const linePrefix = source.slice(source.lastIndexOf("\n", index) + 1, index);
      const prefix = linePrefix.match(/\S(?=\s*$)/)?.[0];
      const commandString = /^\s*[A-Za-z]\w*(?:\.[A-Za-z]\w*)*[ \t]+[^[\]{}=()+*/\\^:<>~&|;'"\r\n]*$/.test(linePrefix);
      const arrayString = arrayDepth > 0 && /\s/.test(source[index - 1] ?? "");
      const looksLikeTranspose = !commandString && !arrayString && prefix !== undefined && /[\w\])}.]/.test(prefix);
      if (!looksLikeTranspose) {
        state = "single";
        mask[index] = 0;
      }
    }
  }
  return mask;
}

export function findMatlabCallCandidates(source: string, startOffset = 0, endOffset = source.length): CallCandidate[] {
  const mask = matlabCodeMask(source);
  const candidates: CallCandidate[] = [];
  const seen = new Set<number>();
  const expression = /@((?:[A-Za-z]\w*\.)*[A-Za-z]\w*)|((?:[A-Za-z]\w*\.)*([A-Za-z]\w*))\s*\(/g;
  expression.lastIndex = Math.max(0, startOffset);
  for (let match = expression.exec(source); match && match.index < endOffset; match = expression.exec(source)) {
    const fullName = match[1] ?? match[2];
    if (!fullName) continue;
    const localIndex = match[0].indexOf(fullName);
    const fullNameOffset = match.index + localIndex;
    const finalName = fullName.includes(".") ? fullName.slice(fullName.lastIndexOf(".") + 1) : fullName;
    const nameOffset = fullNameOffset + fullName.lastIndexOf(finalName);
    if (nameOffset < startOffset || nameOffset >= endOffset || mask[nameOffset] !== 1) continue;
    if (NON_CALL_KEYWORDS.has(finalName.toLowerCase()) || seen.has(nameOffset)) continue;
    seen.add(nameOffset);
    candidates.push({ name: fullName, nameOffset });
  }
  return candidates;
}

export function findMatlabDeclarations(source: string): MatlabDeclaration[] {
  const mask = matlabCodeMask(source);
  const matches: Array<Omit<MatlabDeclaration, "endOffset">> = [];
  const functionExpression = /^\s*function\b(?:\s+(?:\[[^\]\r\n]*\]|[A-Za-z]\w*)\s*=\s*)?\s*([A-Za-z]\w*)/gm;
  const classExpression = /^\s*classdef(?:\s*\([^\r\n)]*\))?\s+([A-Za-z]\w*)/gm;
  for (const [expression, kind] of [
    [functionExpression, "function"],
    [classExpression, "class"]
  ] as const) {
    for (let match = expression.exec(source); match; match = expression.exec(source)) {
      const name = match[1];
      if (!name) continue;
      const nameOffset = match.index + match[0].lastIndexOf(name);
      if (mask[nameOffset] !== 1) continue;
      matches.push({ name, nameOffset, startOffset: match.index, kind });
    }
  }
  matches.sort((first, second) => first.startOffset - second.startOffset);
  return matches.map((match, index) => ({
    ...match,
    endOffset: matches[index + 1]?.startOffset ?? source.length
  }));
}
