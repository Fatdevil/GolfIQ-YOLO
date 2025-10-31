# Developer Guide

## Binary assets and pre-commit

Install [`pre-commit`](https://pre-commit.com/) and run `pre-commit install` to avoid accidentally committing binary diffs. The hooks block common media/model formats so that anything large or binary lands on a Git LFS-backed branch instead of the main repo history.

When you need to share videos, weights, fonts, or similar assets, push them to the dedicated Git LFS branch and reference them from your change notes instead of committing them directly.
