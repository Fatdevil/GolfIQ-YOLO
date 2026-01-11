SHELL := /usr/bin/env bash

BUILD_ID ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)
DEVICE_CLASS ?= $(shell if [ -n "${DEVICE_CLASS}" ]; then echo ${DEVICE_CLASS}; else echo unknown-device; fi)

.PHONY: run-ios run-android print-build-info bootstrap fmt lint test bench

print-build-info:
	@echo "build_id=${BUILD_ID}"
	@echo "device_class=${DEVICE_CLASS}"

run-ios: print-build-info
	@bash scripts/run_ios.sh "${BUILD_ID}" "${DEVICE_CLASS}"

run-android: print-build-info
	@bash scripts/run_android.sh "${BUILD_ID}" "${DEVICE_CLASS}"

bootstrap:
	@echo "Bootstrapping development environment (placeholder)."

fmt:
	@black .
	@isort .

lint:
	@flake8 .

test:
	@pytest -q

bench:
	@if [ -z "${DATASET}" ]; then echo "DATASET is required"; exit 1; fi
	@python -m cv_engine.bench.cli compare \
		--dataset "${DATASET}" \
		--model-a "${MODEL_A}" \
		--model-b "${MODEL_B}" \
		--outdir "${OUTDIR:-bench_out}"
