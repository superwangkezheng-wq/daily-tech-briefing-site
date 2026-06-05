#!/bin/zsh
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd -P)"
support_dir="${DAILY_TECH_SUPPORT_DIR:-$HOME/Library/Application Support/daily-tech-site}"
runtime_dir="${DAILY_TECH_RUNTIME_DIR:-$support_dir/runtime}"

if [[ "$script_dir" == "$support_dir" && -d "$runtime_dir" ]]; then
  project_dir="$runtime_dir"
else
  project_dir="$(cd "$script_dir/.." && pwd -P)"
fi

export PATH="/opt/homebrew/bin:$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"

if [[ -f "$project_dir/.env" ]]; then
  set -a
  source "$project_dir/.env"
  set +a
fi
if [[ -f "$support_dir/site.env" ]]; then
  set -a
  source "$support_dir/site.env"
  set +a
fi

QMD_BIN="${QMD_BIN:-qmd}"
KB_ALIAS_DIR="${KB_ALIAS_DIR:-$HOME/.daily-tech-site-wiki}"
COLLECTION_NAME="${QMD_COLLECTION_NAME:-daily-tech-site-wiki}"
WIKI_DIR="${WIKI_DIR:-$KB_ALIAS_DIR/wiki}"
QMD_TMP_DIR="${QMD_TMP_DIR:-$HOME/Library/Caches/qmd-tmp}"
QMD_EMBED_MODEL_URI="hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf"
QMD_RERANK_MODEL_URI="hf:ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF/qwen3-reranker-0.6b-q8_0.gguf"
QMD_GENERATE_MODEL_URI="hf:tobil/qmd-query-expansion-1.7B-gguf/qmd-query-expansion-1.7B-q4_k_m.gguf"
QMD_CONTEXT_TEXT="${QMD_CONTEXT_TEXT:-该集合是每日科技信息站的本地知识库，内容包括原始日报、反馈、维护记录和业务复盘。回答问题时优先综合近期日报，再回到 source 溯源。}"

if ! command -v "$QMD_BIN" >/dev/null 2>&1; then
  echo "qmd binary not found: $QMD_BIN" >&2
  exit 1
fi
if [[ "$QMD_BIN" != */* ]]; then
  QMD_BIN="$(command -v "$QMD_BIN")"
fi

if [[ -n "${WIKI_SOURCE_DIR:-}" && ! -e "$KB_ALIAS_DIR" ]]; then
  ln -sfn "$WIKI_SOURCE_DIR" "$KB_ALIAS_DIR"
fi

if [[ ! -d "$KB_ALIAS_DIR" ]]; then
  echo "knowledge base alias not found: $KB_ALIAS_DIR" >&2
  exit 1
fi

if [[ ! -d "$WIKI_DIR" ]]; then
  echo "knowledge base wiki dir not found: $WIKI_DIR" >&2
  exit 1
fi

mkdir -p "$QMD_TMP_DIR"

export TMPDIR="$QMD_TMP_DIR/"
export QMD_COLLECTION_NAME="$COLLECTION_NAME"
export QMD_EMBED_MODEL="$QMD_EMBED_MODEL_URI"
export QMD_RERANK_MODEL="$QMD_RERANK_MODEL_URI"
export QMD_GENERATE_MODEL="$QMD_GENERATE_MODEL_URI"

cd "$project_dir"

collections="$("$QMD_BIN" collection list 2>/dev/null || true)"

if [[ "$collections" != *"$COLLECTION_NAME (qmd://$COLLECTION_NAME/)"* ]]; then
  "$QMD_BIN" collection add "$WIKI_DIR" --name "$COLLECTION_NAME" --mask "**/*.md"
fi

contexts="$("$QMD_BIN" context list 2>/dev/null || true)"
if [[ "$contexts" != *"$QMD_CONTEXT_TEXT"* ]]; then
  "$QMD_BIN" context rm "qmd://$COLLECTION_NAME/" >/dev/null 2>&1 || true
  "$QMD_BIN" context add "qmd://$COLLECTION_NAME/" "$QMD_CONTEXT_TEXT"
fi

"$QMD_BIN" update
status_output="$("$QMD_BIN" status)"
printf '%s\n' "$status_output"

if [[ "$status_output" != *"Qwen/Qwen3-Embedding-0.6B-GGUF"* ]]; then
  echo "qmd runtime drift: expected embed model $QMD_EMBED_MODEL_URI" >&2
  exit 1
fi
