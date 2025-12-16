#!/bin/bash

# Test if the chaincode is using the updated version with role bypass
echo "🧪 Testing Chaincode Role Bypass"
echo "================================"

# Source environment variables
. envVar.sh
. utils.sh

CHANNEL_NAME="mychannel"
CC_NAME="medicalconsent"

echo "📋 Testing createPatientRecord with Admin user..."
setGlobals 1

# Try to create a patient record as Admin user
peer chaincode invoke -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_CA \
    -C $CHANNEL_NAME -n ${CC_NAME} \
    --peerAddresses localhost:7051 --tlsRootCertFiles $PEER0_ORG1_CA \
    --peerAddresses localhost:9051 --tlsRootCertFiles $PEER0_ORG2_CA \
    -c '{"function":"createPatientRecord","Args":["test.pdf", "test-key", "hash123", "Test record"]}' \
    --waitForEvent

echo ""
echo "📋 If you see 'Benchmark mode: Allowing Admin user as patient' in the logs, the fix is working!"
echo "📋 If you see role error, the old chaincode is still running."