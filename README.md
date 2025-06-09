# Telemedicine Platform with Blockchain-Powered Consent Management

This repository contains the source code for a telemedicine application built on Hyperledger Fabric. The platform features a dynamic, patient-centric consent management system inspired by the "Consentio" framework, designed to give patients granular control over their medical data.

## 📖 Table of Contents

- [Project Description](#project-description)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)

## 📝 Project Description

This project aims to enhance privacy and trust in remote healthcare by leveraging a permissioned blockchain to manage patient consent for accessing electronic health records (EHRs). Patients can grant, revoke, and modify access permissions for healthcare providers in real-time. All consent actions are recorded as immutable transactions on the Hyperledger Fabric blockchain, ensuring a secure and auditable trail.

Smart contracts (chaincode) automatically enforce these patient-defined consent policies, preventing unauthorized access to sensitive medical information.

## ✨ Key Features

- **Dynamic Consent Management:** Empowers patients to control access to their medical records with granular permissions.
- **Blockchain-Based Audit Trail:** Creates a transparent and immutable record of all consent and data access events.
- **Automated Policy Enforcement:** Utilizes Hyperledger Fabric chaincode to programmatically enforce consent rules.
- **Secure Data Exchange:** Facilitates the secure sharing of EHRs between authenticated and authorized participants.
- **Patient-Centric Approach:** Places the patient at the center of their healthcare data journey, fostering trust and engagement.

## 💻 Technology Stack

- **Blockchain:** Hyperledger Fabric
- **Smart Contracts (Chaincode):** Node.js
- **Frontend:** React
- **Backend:** Node.js with Express.js
- **Database:** CouchDB (for rich query support with Fabric)
- **Containerization:** Docker, Docker Compose

## ✅ Prerequisites

Before you begin, ensure you have the following installed on your system.

- **Docker and Docker Compose:** The foundation for running Hyperledger Fabric.
- **Go:** Version 1.18 or higher (for the chaincode).
- **Node.js:** Version 16.x or higher (for the application backend).
- **Git:** For cloning the repository.
