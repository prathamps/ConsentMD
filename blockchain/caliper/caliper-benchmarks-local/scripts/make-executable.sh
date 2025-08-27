#!/bin/bash

# Make all shell scripts executable
# Run this once after cloning the repository on Linux

echo "Making all shell scripts executable..."

# Find and make executable all .sh files
find . -name "*.sh" -type f -exec chmod +x {} \;

echo "✓ All shell scripts are now executable"
echo
echo "Available scripts:"
echo "- scripts/azure-quickstart.sh (Quick start for Azure VMs)"
echo "- scripts/execution/run-benchmark.sh (Full benchmark runner)"
echo "- scripts/validation/azure-vm-validator.sh (Environment validator)"
echo
echo "Usage examples:"
echo "  ./scripts/azure-quickstart.sh"
echo "  ./scripts/execution/run-benchmark.sh -c config-azure-optimized.yaml"