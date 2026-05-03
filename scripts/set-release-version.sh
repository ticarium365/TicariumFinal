#!/bin/bash
# Set RELEASE_VERSION environment variable from git commit SHA
# Usage: source scripts/set-release-version.sh

export RELEASE_VERSION=$(git rev-parse --short HEAD)
echo "RELEASE_VERSION set to: $RELEASE_VERSION"
