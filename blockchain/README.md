# Blockchain Network for ConsentMD

This document provides instructions for setting up and managing the Hyperledger Fabric network for the ConsentMD application.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Network Setup](#network-setup)
- [Chaincode](#chaincode)
- [Scripts](#scripts)

## Overview

This blockchain network is built on Hyperledger Fabric and serves as the decentralized backend for ConsentMD. It is responsible for storing and managing medical consents in a secure and immutable way. The network consists of two peer organizations (Org1 and Org2) and an orderer organization.

## Prerequisites

Before you begin, ensure you have the following installed:

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- [Node.js](https://nodejs.org/) (v14 or higher) and npm
- [Go](https://golang.org/doc/install) (v1.15 or higher)
- [Git](https://git-scm.com/downloads)

## Network Setup

The scripts to manage the network are located in the `scripts` directory.

1.  **Start the Network:**

    This command will start the Fabric network, including peers, orderers, and CAs.

    ```bash
    cd V3/blockchain/scripts
    ./start.sh
    ```

2.  **Create a Channel:**

    This command creates a channel named `mychannel`.

    ```bash
    ./createChannel.sh
    ```

3.  **Deploy the Chaincode:**

    This command deploys the `MedicalConsentContract` chaincode.

    ```bash
    ./deployChaincode.sh
    ```

4.  **Stop the Network:**

    This command will stop and tear down the network.

    ```bash
    ./stop.sh
    ```

## Chaincode

The primary chaincode for this network is the `MedicalConsentContract`.

- **Name:** `medicalconsent`
- **Language:** JavaScript
- **Location:** `blockchain/artifacts/chaincode/javascript/`
- **Contract:** `lib/MedicalConsentContract.js`

### Transaction Functions

The following transaction functions are available in the `MedicalConsentContract`:

- **`registerDoctorProfile(name, specialization)`**: Allows a doctor to register their profile.
- **`createPatientRecord(fileName, s3ObjectKey, fileHash, details)`**: Creates a new medical record initiated by a patient.
- **`createMedicalRecord(patientId, recordDetails, fileName, s3ObjectKey, fileHash)`**: Creates a new medical record initiated by a doctor.
- **`grantConsent(recordId, doctorId)`**: Grants a doctor access to a specific medical record.
- **`revokeConsent(consentId)`**: Revokes a doctor's access to a medical record.
- **`archiveMedicalRecord(recordId)`**: Archives a medical record (soft delete).
- **`removeFileFromRecord(recordId)`**: Removes the file reference from a medical record.
- **`addPrivateNoteToRecord(collection, recordId)`**: Adds a sensitive note to a medical record using a Private Data Collection.
- **`updateRecordDetails(recordId, newDetails)`**: Updates the details of a medical record.
- **`getRecordById(recordId)`**: Retrieves a medical record by its ID.
- **`findAssetsByQuery(queryString)`**: Finds assets based on a CouchDB query string.
- **`getAssetHistory(id)`**: Retrieves the transaction history for a specific asset.

## Scripts

The `blockchain/scripts` directory contains several utility scripts for managing the network and chaincode:

- **`start.sh`**: Starts the Hyperledger Fabric network.
- **`stop.sh`**: Stops the network and removes containers.
- **`createChannel.sh`**: Creates the application channel.
- **`deployChaincode.sh`**: Deploys the chaincode to the channel.
- **`upgradeChaincodePolicy.sh`**: Upgrades the chaincode or its endorsement policy.
- **`chaincode_test.sh`**: A script for testing chaincode functions.
- **`envVar.sh`**: Sets environment variables for interacting with the network as a specific peer.
- **`utils.sh`**: Contains utility functions used by other scripts.
