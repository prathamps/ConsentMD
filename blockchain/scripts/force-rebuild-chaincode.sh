#!/bin/bash

# Force complete chaincode rebuild and redeployment
echo "🔄 Force Rebuilding and Redeploying Chaincode"
echo "=============================================="

# Source environment variables
. envVar.sh
. utils.sh

# Configuration
CHANNEL_NAME="mychannel"
CC_RUNTIME_LANGUAGE="node"
VERSION="1"
SEQUENCE=2
CC_SRC_PATH="../artifacts/chaincode/javascript"
CC_NAME="medicalconsent"
CC_POLICY="OR('Org1MSP.peer','Org2MSP.peer')"

echo "🧹 Cleaning up old chaincode packages..."
rm -rf ${CC_NAME}.tar.gz
rm -rf log.txt

echo "📦 Rebuilding npm packages..."
pushd ../artifacts/chaincode/javascript
rm -rf node_modules package-lock.json
npm install
popd

echo "📝 Adding version identifier to force rebuild..."
# Add a timestamp comment to force package hash change
echo "// Rebuilt at $(date)" >> ../artifacts/chaincode/javascript/lib/MedicalConsentContract.js

echo "🏗️  Packaging chaincode with forced rebuild..."
setGlobals 1
peer lifecycle chaincode package ${CC_NAME}.tar.gz \
    --path ${CC_SRC_PATH} --lang ${CC_RUNTIME_LANGUAGE} \
    --label ${CC_NAME}_${VERSION}_$(date +%s)

echo "📥 Installing chaincode on peers..."
setGlobals 1
peer lifecycle chaincode install ${CC_NAME}.tar.gz
echo "✅ Installed on peer0.org1"

setGlobals 2
peer lifecycle chaincode install ${CC_NAME}.tar.gz
echo "✅ Installed on peer0.org2"

echo "🔍 Querying installed chaincode..."
setGlobals 1
peer lifecycle chaincode queryinstalled >&log.txt
cat log.txt
PACKAGE_ID=$(sed -n "/${CC_NAME}_${VERSION}/{s/^Package ID: //; s/, Label:.*$//; p;}" log.txt | head -1)
echo "📋 Package ID: ${PACKAGE_ID}"

if [ -z "$PACKAGE_ID" ]; then
    echo "❌ Failed to get package ID. Check the installation."
    exit 1
fi

echo "✅ Approving chaincode for Org1..."
setGlobals 1
peer lifecycle chaincode approveformyorg -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com --tls \
    --signature-policy ${CC_POLICY} \
    --cafile $ORDERER_CA --channelID $CHANNEL_NAME --name ${CC_NAME} --version ${VERSION} \
    --package-id ${PACKAGE_ID} \
    --sequence ${SEQUENCE}

echo "✅ Approving chaincode for Org2..."
setGlobals 2
peer lifecycle chaincode approveformyorg -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com --tls $CORE_PEER_TLS_ENABLED \
    --signature-policy ${CC_POLICY} \
    --cafile $ORDERER_CA --channelID $CHANNEL_NAME --name ${CC_NAME} \
    --version ${VERSION} --package-id ${PACKAGE_ID} \
    --sequence ${SEQUENCE}

echo "🔄 Committing chaincode definition..."
setGlobals 1
peer lifecycle chaincode commit -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
    --tls $CORE_PEER_TLS_ENABLED --cafile $ORDERER_CA \
    --signature-policy ${CC_POLICY} \
    --channelID $CHANNEL_NAME --name ${CC_NAME} \
    --peerAddresses localhost:7051 --tlsRootCertFiles $PEER0_ORG1_CA \
    --peerAddresses localhost:9051 --tlsRootCertFiles $PEER0_ORG2_CA \
    --version ${VERSION} --sequence ${SEQUENCE}

echo "🔍 Verifying deployment..."
setGlobals 1
peer lifecycle chaincode querycommitted --channelID $CHANNEL_NAME --name ${CC_NAME}

echo ""
echo "🎉 Forced rebuild complete!"
echo "📋 New chaincode containers should be created with different hash"
echo "🧪 Run test-chaincode-version.sh to verify the fix is working"