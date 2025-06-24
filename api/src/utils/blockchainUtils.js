const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const FabricCAServices = require('fabric-ca-client');
const fs = require('fs');

const ApiError = require('./ApiError');
const httpStatus = require('http-status');

const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const { connect, Contract, Identity, Signer, signers } = require('@hyperledger/fabric-gateway');
const utf8Decoder = new TextDecoder();

const config = require('../config/config');
const catchAsync = require('./catchAsync');
const logger = require('../config/logger');

const getCCP = async (orgName) => {
  const ccpPath = path.resolve(__dirname, '..', '..', 'connection-profiles', `connection-${orgName}.json`);
  const ccpJSON = fs.readFileSync(ccpPath, 'utf8');
  const ccp = JSON.parse(ccpJSON);
  const ccpDir = path.dirname(ccpPath);

  // Read and embed the PEM files
  const peerCertPath = path.resolve(ccpDir, ccp.peers[`peer0.${orgName}.example.com`].tlsCACerts.path);
  ccp.peers[`peer0.${orgName}.example.com`].tlsCACerts.pem = fs.readFileSync(peerCertPath, 'utf8');

  // Find the CA key dynamically
  const orgKey = `Org${orgName.replace('org', '')}`;
  const caInfo = ccp.certificateAuthorities[ccp.organizations[orgKey].certificateAuthorities[0]];
  const caCertPath = path.resolve(ccpDir, caInfo.tlsCACerts.path);
  caInfo.tlsCACerts.pem = fs.readFileSync(caCertPath, 'utf8');

  return ccp;
};

const getCaUrl = async (orgName, ccp) => {
  let caURL = ccp.certificateAuthorities[`ca.${orgName}.example.com`].url;
  if (!caURL) {
    throw new ApiError(httpStatus.NOT_EXTENDED, 'Invalid Certificate authority URL');
  }
  return caURL;
};

const getCaInfo = async (orgName, ccp) => {
  let caInfo = ccp.certificateAuthorities[`ca.${orgName}.example.com`];
  if (!caInfo) {
    throw new ApiError(httpStatus.NOT_EXTENDED, 'Invalid Certificate authority info');
  }
  return caInfo;
};

const getAffiliation = async (org) => {
  // Default in ca config file we have only two affiliations, if you want to use org3 ca, you have to update config file with third affiliation
  //  Here already two Affiliation are there
  return org == 'org1' ? 'org1.department1' : 'org2.department1';
};

const getWalletPath = async (orgName) => {
  let walletPath = path.resolve(__dirname, '../..', `wallets/${orgName}`); //path.join(process.cwd(), `${orgName}-wallet`);
  if (!walletPath) {
    throw new ApiError(httpStatus.NOT_EXTENDED, 'Invalid Wallet Path');
  }
  return walletPath;
};

const enrollAdmin = async (_ca, wallet, orgName, ccp) => {
  const caInfo = await getCaInfo(orgName, ccp);
  const caTLSCACerts = caInfo.tlsCACerts.pem;
  const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);
  const enrollment = await ca.enroll({ enrollmentID: config.caAdminId, enrollmentSecret: config.caAdminSecret });

  let x509Identity = {
    credentials: {
      certificate: enrollment.certificate,
      privateKey: enrollment.key.toBytes(),
    },
    mspId: `${orgName}MSP`,
    type: 'X.509',
  };
  await wallet.put(config.caAdminId, x509Identity);
  return true;
};

const registerUser = async (orgName, userName, userRole) => {
  const ccp = await getCCP(orgName);
  const caURL = await getCaUrl(orgName, ccp);
  const ca = new FabricCAServices(caURL);
  const walletPath = await getWalletPath(orgName);

  const wallet = await Wallets.newFileSystemWallet(walletPath);
  const userIdentity = await wallet.get(userName);
  if (userIdentity) {
    let message = `An identity for the user ${userName} already exists in the wallet`;
    throw new ApiError(httpStatus.FORBIDDEN, message);
  }

  let adminIdentity = await wallet.get(config.caAdminId);
  if (!adminIdentity) {
    console.log('An identity for the admin user "admin" does not exist in the wallet');
    await enrollAdmin(ca, wallet, orgName, ccp);
    adminIdentity = await wallet.get(config.caAdminId);
    console.log('Admin Enrolled Successfully', adminIdentity);
  }

  const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
  const adminUser = await provider.getUserContext(adminIdentity, 'admin');

  // Register the user, enroll the user, and import the new identity into the wallet.
  const secret = await ca.register(
    {
      affiliation: await getAffiliation(orgName),
      enrollmentID: userName,
      role: 'client', // 'client' role is standard for end-users
      attrs: [{ name: 'organization', value: userRole, ecert: true }], // Correctly use the user's role for the 'organization' attribute
    },
    adminUser
  );

  console.log(`Secret for the user with userName: ${userName} -------> ${secret}`);

  const enrollment = await ca.enroll({
    enrollmentID: userName,
    enrollmentSecret: secret,
    attr_reqs: [{ name: 'organization', optional: false }],
  });

  let x509Identity = {
    credentials: {
      certificate: enrollment.certificate,
      privateKey: enrollment.key.toBytes(),
    },
    mspId: orgName.charAt(0).toUpperCase() + orgName.slice(1) + 'MSP',
    type: 'X.509',
  };
  await wallet.put(userName, x509Identity);
  console.log(`Successfully registered and enrolled user ${userName} and imported it into the wallet`);

  console.log(`Before returning the secrets`, secret);

  return secret;
};

/**
 * Connects to the Fabric gateway using a specific user identity.
 * This function consolidates the logic for connecting to the network.
 *
 * @param {string} orgName - The organization name (e.g., 'org1' or 'org2').
 * @param {string} identityLabel - The label of the user identity in the wallet (e.g., 'patient@email.com').
 * @returns {object} An object containing the connected gateway and contract instances.
 * @throws {ApiError} If the connection profile or identity is not found.
 */
const connectToGateway = async (orgName, identityLabel) => {
  const ccp = await getCCP(orgName);
  const walletPath = await getWalletPath(orgName);
  const wallet = await Wallets.newFileSystemWallet(walletPath);

  const identity = await wallet.get(identityLabel);
  if (!identity) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      `Identity for user "${identityLabel}" not found in the ${orgName} wallet. Please register first.`
    );
  }

  const gateway = new Gateway();
  try {
    await gateway.connect(ccp, {
      wallet,
      identity: identityLabel,
      discovery: { enabled: true },
    });

    const network = await gateway.getNetwork(config.blockchain.channelName);
    const contract = network.getContract(config.blockchain.chaincodeName);

    return { gateway, contract };
  } catch (error) {
    // Disconnect gateway if connection fails partway through
    gateway.disconnect();
    logger.error(`Failed to connect to gateway: ${error}`);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to connect to the blockchain network.');
  }
};

/**
 * Submits a transaction to the ledger.
 *
 * @param {string} orgName - The organization of the user.
 * @param {string} identityLabel - The user's identity label.
 * @param {string} functionName - The chaincode function to invoke.
 * @param  {...string} args - Arguments to pass to the chaincode function.
 * @returns {Buffer} The raw result from the chaincode.
 */
const submitTransaction = async (orgName, identityLabel, functionName, ...args) => {
  let connection;
  try {
    connection = await connectToGateway(orgName, identityLabel);
    const { contract } = connection;

    logger.info(`Submitting transaction: ${functionName} with args: ${args.join(', ')} by ${identityLabel} of ${orgName}`);
    const result = await contract.submitTransaction(functionName, ...args);
    logger.info(`Transaction ${functionName} committed successfully.`);
    return result;
  } catch (error) {
    logger.error(`Failed to submit transaction "${functionName}": ${error.message}`);
    // Re-throw the original error to be handled by the controller's catchAsync
    throw error;
  } finally {
    if (connection && connection.gateway) {
      connection.gateway.disconnect();
    }
  }
};

/**
 * Evaluates a query on the ledger (read-only).
 *
 * @param {string} orgName - The organization of the user.
 * @param {string} identityLabel - The user's identity label.
 * @param {string} functionName - The chaincode function to query.
 * @param  {...string} args - Arguments to pass to the chaincode function.
 * @returns {Buffer} The raw result from the chaincode.
 */
const evaluateTransaction = async (orgName, identityLabel, functionName, ...args) => {
  let connection;
  try {
    connection = await connectToGateway(orgName, identityLabel);
    const { contract } = connection;

    logger.info(`Evaluating query: ${functionName} with args: ${args.join(', ')} by ${identityLabel} of ${orgName}`);
    const result = await contract.evaluateTransaction(functionName, ...args);
    logger.info(`Query ${functionName} successful. Result (raw): ${result.toString()}`);
    return result;
  } catch (error) {
    logger.error(`Failed to evaluate transaction "${functionName}": ${error.message}`);
    // Re-throw the original error to be handled by the controller's catchAsync
    throw error;
  } finally {
    if (connection && connection.gateway) {
      connection.gateway.disconnect();
    }
  }
};

module.exports = {
  getCCP,
  getCaUrl,
  getWalletPath,
  registerUser,
  submitTransaction,
  evaluateTransaction,
};
