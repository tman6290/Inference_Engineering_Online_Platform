#!/usr/bin/env sh
# Launch vLLM for one method. Usage: scripts/launch.sh baseline|draft_target|ngram
set -eu
TARGET=Qwen/Qwen2.5-7B-Instruct
COMMON="--dtype bfloat16 --max-model-len 4096 --max-num-seqs 128 --gpu-memory-utilization 0.90 --seed 0"

case "$1" in
  baseline)
    exec vllm serve "$TARGET" $COMMON ;;
  draft_target)
    exec vllm serve "$TARGET" $COMMON \
      --speculative-config '{"model": "Qwen/Qwen2.5-0.5B-Instruct", "num_speculative_tokens": 4}' ;;
  ngram)
    exec vllm serve "$TARGET" $COMMON \
      --speculative-config '{"method": "ngram", "num_speculative_tokens": 5, "prompt_lookup_max": 4, "prompt_lookup_min": 2}' ;;
  *)
    echo "unknown method: $1" >&2; exit 2 ;;
esac
