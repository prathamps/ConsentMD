#!/bin/bash

# Test endorsement policy directly
echo "🧪 Testing Endorsement Policy"
echo "============================="

# Source environment variables
. envVar.sh
. utils.sh

CHANNEL_NAME="mychannel"
CC_NAME="medicalconsent"

echo "📋 Testing with Org1 Admin..."
setGlobals 1

# Test with explicit peer targeting
peer chaincode invoke -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_CA \
    -C $CHANNEL_NAME -n ${CC_NAME} \
    --peerAddresses localhost:7051 --tlsRootCertFiles $PEER0_ORG1_CA \
    -c '{"function":"createPatientRecord","Args":["test.pdf", "test-key", "hash123", "Test record"]}' \
    --waitForEvent

echo ""
echo "📋 If this works, the endorsement policy is fine and the issue is with Caliper's discovery service."