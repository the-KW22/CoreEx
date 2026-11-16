import { stemmer } from "stemmer";

const aliases: Record<string, string> = { js: "javascript", javascript: "javascript", ts: "typescript", typescript: "typescript", postgres: "postgresql", postgresql: "postgresql", "node.js": "nodejs", nodejs: "nodejs" };
const stop = new Set("a an and are as at be by for from in is it of on or our the their this to we with you your will have has must can that work working experience years year role team skills ability knowledge using use including required preferred strong excellent job opportunity company responsible responsibilities about who what all other more than such across based successful candidate looking seeking support provide develop development".split(" "));

function words(text: string) {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+(?:[.+#][\p{L}\p{N}+#]+|[+#]+)*/gu) ?? [])
    .filter((word) => word.length > 1 && !stop.has(word) && !/^\d+$/.test(word));
}

const key = (word: string) => stemmer(aliases[word] ?? word);

export function jobMatch(posting: string, resume: string, excluded: string[]) {
  const covered = new Set(words(resume).map(key));
  const seen = new Set<string>();
  return words(posting).flatMap((word) => {
    const id = key(word);
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, word, covered: covered.has(id), excluded: excluded.includes(id) }];
  });
}
