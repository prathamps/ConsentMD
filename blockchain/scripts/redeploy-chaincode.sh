#!/bin/bash

# Quick chaincode redeployment script
# This upgrades the chaincode to version 2 with the role bypass modifications

echo "🔄 Redeploying Medical Consent Chaincode with Role Bypass"
echo "========================================================="

# Source environment variables
. envVar.sh
. utils.sh

# Install npm packages
echo "📦 Installing npm packages..."
pushd ../artifacts/chaincode/javascript
npm install
popd

# Configuration
CHANNEL_NAME="mychannel"
CC_RUNTIME_LANGUAGE="node"
VERSION="4"
SEQUENCE=4
CC_SRC_PATH="../artifacts/chaincode/javascript"
CC_NAME="medicalconsent"
CC_POLICY="OR('Org1MSP.peer','Org2MSP.peer')"

echo "🏗️  Packaging chaincode version ${VERSION}..."
rm -rf ${CC_NAME}.tar.gz
setGlobals 1
peer lifecycle chaincode package ${CC_NAME}.tar.gz \
    --path ${CC_SRC_PATH} --lang ${CC_RUNTIME_LANGUAGE} \
    --label ${CC_NAME}_${VERSION}
echo "✅ Chaincode packaged"

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
PACKAGE_ID=$(sed -n "/${CC_NAME}_${VERSION}/{s/^Package ID: //; s/, Label:.*$//; p;}" log.txt)
echo "📋 Package ID: ${PACKAGE_ID}"

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
echo "🎉 Chaincode redeployment complete!"
echo "📋 Version: ${VERSION}"
echo "📋 Sequence: ${SEQUENCE}"
echo "🔧 Role bypass enabled for Admin users"
echo ""
echo "✅ Ready for Caliper benchmarks!"