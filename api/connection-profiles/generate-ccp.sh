#!/bin/bash

function one_line_pem {
    echo "`awk 'NF {sub(/\\n/, ""); printf "%s\\\\\\\n",$0;}' $1`"
}

function json_ccp {
    local PP=$(one_line_pem $4)
    local CP=$(one_line_pem $5)
    sed -e "s/\${ORG}/$1/" \
        -e "s/\${P0PORT}/$2/" \
        -e "s/\${CAPORT}/$3/" \
        -e "s#\${PEERPEM}#$PP#" \
        -e "s#\${CAPEM}#$CP#" \
        ./ccp-template.json
}

ORG=1
P0PORT=7051
CAPORT=7054
PEERPEM=../../blockchain/artifacts/channel/crypto-config/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem
CAPEM=../../blockchain/artifacts/channel/crypto-config/peerOrganizations/org1.example.com/ca/ca.org1.example.com-cert.pem

echo "$(json_ccp $ORG $P0PORT $CAPORT $PEERPEM $CAPEM )" > connection-org1.json

ORG=2
P0PORT=9051
CAPORT=8054
PEERPEM=../../blockchain/artifacts/channel/crypto-config/peerOrganizations/org2.example.com/tlsca/tlsca.org2.example.com-cert.pem
CAPEM=../../blockchain/artifacts/channel/crypto-config/peerOrganizations/org2.example.com/ca/ca.org2.example.com-cert.pem

echo "$(json_ccp $ORG $P0PORT $CAPORT $PEERPEM $CAPEM)" > connection-org2.json