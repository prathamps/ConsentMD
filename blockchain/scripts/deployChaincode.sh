. envVar.sh
. utils.sh

presetup() {
    echo Installing npm packages ...
    pushd ../artifacts/chaincode/javascript
    npm install
    popd
    echo Finished installing npm dependencies
}
# presetup

CHANNEL_NAME="mychannel"
CC_RUNTIME_LANGUAGE="node"
VERSION="1"
SEQUENCE=1
CC_SRC_PATH="../artifacts/chaincode/javascript"
CC_NAME="medicalconsent"
CC_POLICY="OR('Org1MSP.peer','Org2MSP.peer')"

packageChaincode() {
    rm -rf ${CC_NAME}.tar.gz
    setGlobals 1
    peer lifecycle chaincode package ${CC_NAME}.tar.gz \
        --path ${CC_SRC_PATH} --lang ${CC_RUNTIME_LANGUAGE} \
        --label ${CC_NAME}_${VERSION}
    echo "===================== Chaincode is packaged ===================== "
}
# packageChaincode

installChaincode() {
    setGlobals 1
    peer lifecycle chaincode install ${CC_NAME}.tar.gz
    echo "===================== Chaincode is installed on peer0.org1 ===================== "

    setGlobals 2
    peer lifecycle chaincode install ${CC_NAME}.tar.gz
    echo "===================== Chaincode is installed on peer0.org2 ===================== "
}

# installChaincode

queryInstalled() {
    setGlobals 1
    peer lifecycle chaincode queryinstalled >&log.txt
    cat log.txt
    PACKAGE_ID=$(sed -n "/${CC_NAME}_${VERSION}/{s/^Package ID: //; s/, Label:.*$//; p;}" log.txt)
    echo PackageID is ${PACKAGE_ID}
    echo "===================== Query installed successful on peer0.org1 on channel ===================== "
}

# queryInstalled

# --collections-config ./artifacts/private-data/collections_config.json \
#         --signature-policy "OR('Org1MSP.member','Org2MSP.member')" \

approveForMyOrg1() {
    setGlobals 1
    set -x
    peer lifecycle chaincode approveformyorg -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.example.com --tls \
        --signature-policy ${CC_POLICY} \
        --cafile $ORDERER_CA --channelID $CHANNEL_NAME --name ${CC_NAME} --version ${VERSION} \
        --package-id ${PACKAGE_ID} \
        --sequence ${SEQUENCE}
    set +x

    echo "===================== chaincode approved from org 1 ===================== "

}
# queryInstalled
# approveForMyOrg1

# --signature-policy "OR ('Org1MSP.member')"
# --peerAddresses localhost:7051 --tlsRootCertFiles $PEER0_ORG1_CA --peerAddresses localhost:9051 --tlsRootCertFiles $PEER0_ORG2_CA
# --peerAddresses peer0.org1.example.com:7051 --tlsRootCertFiles $PEER0_ORG1_CA --peerAddresses peer0.org2.example.com:9051 --tlsRootCertFiles $PEER0_ORG2_CA
#--channel-config-policy Channel/Application/Admins
# --signature-policy "OR ('Org1MSP.peer','Org2MSP.peer')"

checkCommitReadyness() {
    setGlobals 1
    peer lifecycle chaincode checkcommitreadiness \
        --channelID $CHANNEL_NAME --name ${CC_NAME} --version ${VERSION} \
        --signature-policy ${CC_POLICY} \
        --sequence ${SEQUENCE} --output json
    echo "===================== checking commit readyness from org 1 ===================== "
}

# checkCommitReadyness

approveForMyOrg2() {
    setGlobals 2

    peer lifecycle chaincode approveformyorg -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.example.com --tls $CORE_PEER_TLS_ENABLED \
        --signature-policy ${CC_POLICY} \
        --cafile $ORDERER_CA --channelID $CHANNEL_NAME --name ${CC_NAME} \
        --version ${VERSION} --package-id ${PACKAGE_ID} \
        --sequence ${SEQUENCE}

    echo "===================== chaincode approved from org 2 ===================== "
}

# queryInstalled
# approveForMyOrg2

checkCommitReadyness() {

    setGlobals 2
    peer lifecycle chaincode checkcommitreadiness --channelID $CHANNEL_NAME \
        --peerAddresses localhost:9051 --tlsRootCertFiles $PEER0_ORG2_CA \
        --signature-policy ${CC_POLICY} \
        --name ${CC_NAME} --version ${VERSION} --sequence ${SEQUENCE} --output json
    echo "===================== checking commit readyness from org 1 ===================== "
}

# checkCommitReadyness


commitChaincodeDefination() {
    setGlobals 1
    peer lifecycle chaincode commit -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
        --tls $CORE_PEER_TLS_ENABLED --cafile $ORDERER_CA \
        --signature-policy ${CC_POLICY} \
        --channelID $CHANNEL_NAME --name ${CC_NAME} \
        --peerAddresses localhost:7051 --tlsRootCertFiles $PEER0_ORG1_CA \
        --peerAddresses localhost:9051 --tlsRootCertFiles $PEER0_ORG2_CA \
        --version ${VERSION} --sequence ${SEQUENCE}
}

# commitChaincodeDefination

queryCommitted() {
    setGlobals 1
    peer lifecycle chaincode querycommitted --channelID $CHANNEL_NAME --name ${CC_NAME}

}

# =================================================================================
# == MedicalConsentContract Test Functions (CORRECTED)
# =================================================================================

# --- Invoke Functions (Write Transactions) ---

function registerDoctor() {
    local org_num=$1
    local name=$2
    local specialization=$3
    setGlobals $org_num

    echo "Invoking registerDoctorProfile (as Org${org_num})..."
    peer chaincode invoke -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_CA \
        -C $CHANNEL_NAME -n ${CC_NAME} \
        --peerAddresses localhost:7051 --tlsRootCertFiles $PEER0_ORG1_CA \
        --peerAddresses localhost:9051 --tlsRootCertFiles $PEER0_ORG2_CA \
        -c '{"function":"registerDoctorProfile","Args":["'"$name"'", "'"$specialization"'"]}'
    res=$?
    { set +x; } 2>/dev/null
    verifyResult $res "Doctor registration failed"
    echo "------------------------------------------------------------"
}

function createPatientRecord() {
    local org_num=$1
    local patient_name=$2
    setGlobals $org_num

    local fileName="report-for-${patient_name}.pdf"
    local s3Key="uploads/${patient_name}-$(date +%s).pdf"
    local details="Initial consultation for ${patient_name}"

    echo "Invoking createPatientRecord (as Patient ${patient_name} from Org${org_num})..."
    
    # --- FIX: Use a robust 4-stage pipeline to extract and clean the JSON payload ---
    local result_payload=$(peer chaincode invoke -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_CA \
        -C $CHANNEL_NAME -n ${CC_NAME} \
        --peerAddresses localhost:7051 --tlsRootCertFiles $PEER0_ORG1_CA \
        --peerAddresses localhost:9051 --tlsRootCertFiles $PEER0_ORG2_CA \
        -c '{"function":"createPatientRecord","Args":["'"$fileName"'", "'"$s3Key"'", "'"$details"'"]}' --waitForEvent 2>&1 \
        | grep "payload:" \
        | sed -e 's/.*payload://' \
        | sed -e 's/^"//' -e 's/"$//' \
        | sed -e 's/\\"/"/g')
    
    res=$?
    { set +x; } 2>/dev/null
    verifyResult $res "Patient record creation failed"
    
    export PATIENT_RECORD_ID=$(echo "$result_payload" | jq -r .recordId)
    echo "------------------------------------------------------------"
    echo ">>> Success! Created Patient Record with ID: ${PATIENT_RECORD_ID}"
    echo "------------------------------------------------------------"
}

function grantConsent() {
    local org_num=$1
    local recordId=$2
    local doctorId=$3
    setGlobals $org_num

    echo "Invoking grantConsent to give Doctor [${doctorId}] access to Record [${recordId}]..."

    # --- FIX: Apply the same robust pipeline here ---
    local result_payload=$(peer chaincode invoke -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_CA \
        -C $CHANNEL_NAME -n ${CC_NAME} \
        --peerAddresses localhost:7051 --tlsRootCertFiles $PEER0_ORG1_CA \
        --peerAddresses localhost:9051 --tlsRootCertFiles $PEER0_ORG2_CA \
        -c '{"function":"grantConsent","Args":["'"$recordId"'", "'"$doctorId"'"]}' --waitForEvent 2>&1 \
        | grep "payload:" \
        | sed -e 's/.*payload://' \
        | sed -e 's/^"//' -e 's/"$//' \
        | sed -e 's/\\"/"/g')

    res=$?
    { set +x; } 2>/dev/null
    verifyResult $res "Granting consent failed"
    
    export CONSENT_ID=$(echo "$result_payload" | jq -r .consentId)
    echo "------------------------------------------------------------"
    echo ">>> Success! Created Consent with ID: ${CONSENT_ID}"
    echo "------------------------------------------------------------"
}

# --- Query Functions (Read-Only) ---

function getRecordById() {
    local org_num=$1
    local recordId=$2
    setGlobals $org_num
    
    echo "Querying for Record ID: ${recordId} (as a user from Org${org_num})..."
    peer chaincode query -C $CHANNEL_NAME -n ${CC_NAME} -c '{"function": "getRecordById","Args":["'"$recordId"'"]}'
    res=$?
    { set +x; } 2>/dev/null
    verifyResult $res "Querying record by ID failed"
    echo "------------------------------------------------------------"
}

function findAssetsByQuery() {
    local org_num=$1
    local queryString=$2
    setGlobals $org_num

    echo "Querying with selector: ${queryString}..."

    # --- FIX: Use printf to safely construct the JSON for the -c flag ---
    # %s will be replaced by the queryString, correctly embedding it as a string
    # inside the "Args" array. This avoids all shell quoting issues.
    local ctor_json=$(printf '{"function":"findAssetsByQuery","Args":["%s"]}' "$queryString")

    peer chaincode query -C $CHANNEL_NAME -n ${CC_NAME} -c "$ctor_json"
    res=$?
    { set +x; } 2>/dev/null
    verifyResult $res "Rich query failed"
    echo "------------------------------------------------------------"
}



# Run this function if you add any new dependency in chaincode
presetup

packageChaincode
installChaincode
queryInstalled
approveForMyOrg1
checkCommitReadyness
approveForMyOrg2
checkCommitReadyness
commitChaincodeDefination
queryCommitted

echo
echo "===================== Starting Test Scenario (FIXED) ====================="
echo

# Step 1: Register Dr. Alice (same as before)
echo "Step 1: Registering Doctor..."
registerDoctor 1 "Dr. Alice" "Cardiology"

# Step 1.5: Get the REAL ID for Dr. Alice
echo "Step 1.5: Retrieving the real X.509 ID for Dr. Alice..." 
setGlobals 1 # Make sure we are acting as Org1 Admin (Dr. Alice)
# Call the new chaincode function and capture the output
export DOCTOR_ALICE_ID=$(peer chaincode query -C $CHANNEL_NAME -n ${CC_NAME} -c '{"function":"getMyId","Args":[]}')
echo ">>> Real Doctor ID captured: ${DOCTOR_ALICE_ID}"


# Step 2: Create Patient Record (same as before)
echo
echo "Step 2: Creating Patient Record..."
createPatientRecord 2 "Carol" 

# Check if the record ID was extracted successfully
if [ -z "$PATIENT_RECORD_ID" ]; then
  echo "FATAL: Could not extract patient record ID. Exiting."
  exit 1
fi

echo
echo "Step 3: Granting Consent..."
grantConsent 2 "$PATIENT_RECORD_ID" "$DOCTOR_ALICE_ID"

echo
echo "Step 4: Testing Access Control..."
echo "--- Verifying Doctor Alice (Org1) can access the record..."
getRecordById 1 "$PATIENT_RECORD_ID"

echo "--- Verifying Patient Carol (Org2) can access the record..."
getRecordById 2 "$PATIENT_RECORD_ID"

echo
echo "Step 5: Finding all doctor profiles..."
findAssetsByQuery 1 '{"selector":{"docType":"DoctorProfile"}}'


echo
echo "===================== Test Scenario Complete ====================="
echo