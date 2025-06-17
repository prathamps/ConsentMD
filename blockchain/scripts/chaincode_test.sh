. envVar.sh
. utils.sh

CC_NAME="medicalconsent"
CHANNEL_NAME="mychannel"

# =================================================================================
# == MedicalConsentContract Test Functions
# =================================================================================

# --- Invoke Functions (Write Transactions) ---

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

    # --- THE DEFINITIVE FIX ---
    # Step 1: Escape all the double quotes inside the incoming query string.
    # This turns {"a":"b"} into {\"a\":\"b\"}
    local escaped_query_string=$(echo "$queryString" | sed 's/"/\\"/g')

    # Step 2: Construct the final JSON string using the escaped query.
    # Note that the escaped string is now placed inside the "Args" array's quotes.
    local ctor_json="{\"function\":\"findAssetsByQuery\",\"Args\":[\"$escaped_query_string\"]}"

    # Step 3: Execute the command. The -c argument is now valid JSON.
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


# # Step 2: Create Patient Record (same as before)
# echo
# echo "Step 2: Creating Patient Record..."
# createPatientRecord 2 "Carol" 

# # Check if the record ID was extracted successfully
# if [ -z "$PATIENT_RECORD_ID" ]; then
#   echo "FATAL: Could not extract patient record ID. Exiting."
#   exit 1
# fi

# echo
# echo "Step 3: Granting Consent..."
# grantConsent 2 "$PATIENT_RECORD_ID" "$DOCTOR_ALICE_ID"

# echo
# echo "Step 4: Testing Access Control..."
# echo "--- Verifying Doctor Alice (Org1) can access the record..."
# getRecordById 1 "$PATIENT_RECORD_ID"

# echo "--- Verifying Patient Carol (Org2) can access the record..."
# getRecordById 2 "$PATIENT_RECORD_ID"

# echo
# echo "Step 5: Finding all doctor profiles..."
# findAssetsByQuery 1 '{"selector":{"docType":"DoctorProfile"}}'


# echo
# echo "===================== Test Scenario Complete ====================="
# echo