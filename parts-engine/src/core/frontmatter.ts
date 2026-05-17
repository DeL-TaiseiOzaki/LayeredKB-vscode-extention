// コア層: Markdown ファイルの YAML フロントマター分離（仕様 §3）．ドメイン非依存．

import { parse as parseYaml } from "yaml";

export interface ParsedDocument {
  // フロントマターの生オブジェクト（未検証）．無い場合は null．
  frontmatter: Record<string, unknown> | null;
  // フロントマターを除いた本文（パーツの実体）．
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export class FrontmatterError extends Error {
  override readonly name = "FrontmatterError";
}

// `---\n ... \n---\n` で囲まれた YAML を分離して返す．
// 区切りが無い場合は frontmatter:null, body:全文 を返す（パーツ未定義ファイル扱い）．
export function parseFrontmatter(source: string): ParsedDocument {
  const match = FRONTMATTER_RE.exec(source);
  if (!match) {
    return { frontmatter: null, body: source };
  }
  const [, yamlText, body] = match;
  let data: unknown;
  try {
    data = parseYaml(yamlText ?? "");
  } catch (err) {
    throw new FrontmatterError(
      `フロントマターの YAML 解析に失敗: ${(err as Error).message}`,
    );
  }
  if (data === null || data === undefined) {
    return { frontmatter: {}, body: body ?? "" };
  }
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new FrontmatterError(
      "フロントマターはマッピング（キー: 値）である必要があります",
    );
  }
  return {
    frontmatter: data as Record<string, unknown>,
    body: body ?? "",
  };
}
