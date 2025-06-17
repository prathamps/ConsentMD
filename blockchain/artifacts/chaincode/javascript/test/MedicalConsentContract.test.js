// File: test/MedicalConsentContract.test.js

'use strict';
const sinon = require('sinon');
const chai = require('chai');
const sinonChai = require('sinon-chai');
const chaiAsPromised = require('chai-as-promised'); 
const expect = chai.expect;

// We need to be able to stub the dependencies of the contract
const { Context } = require('fabric-contract-api');
const { ChaincodeStub, ClientIdentity } = require('fabric-shim');

// The contract we are testing
const MedicalConsentContract = require('../lib/MedicalConsentContract'); // Adjust path if needed

chai.use(sinonChai);
chai.use(chaiAsPromised); 
describe('MedicalConsentContract Tests', () => {
    let sandbox;
    let contract;
    let ctx;
    let mockStub;
    let mockClientIdentity;

    // IDs for our test users
    const patientCarolId = 'x509::/CN=carol::/O=Org1';
    const doctorAliceId = 'x509::/CN=alice::/O=Org1';
    const doctorBobId = 'x509::/CN=bob::/O=Org2';

    // Asset IDs for testing
    const recordId = 'record_abc123';
    const consentId = 'consent_xyz789';

    // Sample assets
    const patientRecord = {
        recordId: recordId,
        docType: 'MedicalRecord',
        patientId: patientCarolId,
        details: 'Annual checkup.',
        s3ObjectKey: 'key_123',
    };

    const activeConsent = {
        consentId: consentId,
        docType: 'Consent',
        recordId: recordId,
        patientId: patientCarolId,
        doctorId: doctorAliceId,
        status: 'granted',
    };


     beforeEach('Setup mock environment', () => {
        // Use a sinon sandbox to easily restore all stubs after each test
        sandbox = sinon.createSandbox();

        contract = new MedicalConsentContract();

        // ====> THIS IS THE CORRECTED SECTION <====

        // Manually construct the context object
        ctx = {
            stub: {},
            clientIdentity: {}
        };

        // Mock the ChaincodeStub and ClientIdentity
        mockStub = sinon.createStubInstance(ChaincodeStub);
        mockClientIdentity = sinon.createStubInstance(ClientIdentity);
        
        // Assign the mocked components to our manually created context
        ctx.stub = mockStub;
        ctx.clientIdentity = mockClientIdentity;

        // ====> END OF CORRECTION <====


         // Configure the default behaviors for our mocks
        mockStub.putState.resolves(Buffer.from(''));
        mockStub.getTxID.returns('mock-tx-id-123');
        const mockTimestamp = {
            seconds: {
                low: Math.floor(Date.now() / 1000) // Use current time for simplicity
            },
            nanos: 0
        };
        mockStub.getTxTimestamp.returns(mockTimestamp);
        // ==========================================================
        // ====> ADD THIS LINE TO FIX THE 'mspid' TypeError <====
        mockStub.getCreator.returns({ mspid: 'Org1MSP' });
        // ==========================================================
    });

    // The 'afterEach' block is correct, no changes needed there.
    afterEach('Teardown mock environment', () => {
        sandbox.restore();
    });

    describe('grantConsent', () => {
        it('should succeed when the record owner (patient) grants consent', async () => {
            // Setup: The record exists and the caller is the patient owner
            mockStub.getState.withArgs(recordId).resolves(Buffer.from(JSON.stringify(patientRecord)));
            mockClientIdentity.getID.returns(patientCarolId);

            await contract.grantConsent(ctx, recordId, doctorAliceId);

            // Verify: A new consent object was written to the state
            expect(mockStub.putState).to.have.been.calledOnce;
            const consentArg = JSON.parse(mockStub.putState.firstCall.args[1].toString());
            expect(consentArg.docType).to.equal('Consent');
            expect(consentArg.status).to.equal('granted');
            expect(consentArg.doctorId).to.equal(doctorAliceId);
        });

        it('should FAIL if a non-owner (e.g., another doctor) tries to grant consent', async () => {
            // Setup: The record exists, but the caller is not the owner
            mockStub.getState.withArgs(recordId).resolves(Buffer.from(JSON.stringify(patientRecord)));
            mockClientIdentity.getID.returns(doctorBobId); // Dr. Bob is calling

            // Execute and Verify: The function should throw the correct error
            await expect(contract.grantConsent(ctx, recordId, doctorAliceId))
                .to.be.rejectedWith(`Only the patient ${patientCarolId} can perform this operation.`);
        });
    });


    describe('getRecordById', () => {
        it('should succeed when the patient owner requests their own record', async () => {
            // Setup: The record exists
            mockStub.getState.withArgs(recordId).resolves(Buffer.from(JSON.stringify(patientRecord)));
            // The caller is the patient
            mockClientIdentity.getID.returns(patientCarolId);

            const result = await contract.getRecordById(ctx, recordId);

            // Verify: The correct record is returned
            expect(JSON.parse(result)).to.deep.equal(patientRecord);
        });

        it('should succeed when a doctor with active consent requests the record', async () => {
            // Setup: The record exists
            mockStub.getState.withArgs(recordId).resolves(Buffer.from(JSON.stringify(patientRecord)));
            
            // The caller is Dr. Alice
            mockClientIdentity.getID.returns(doctorAliceId);
            // Dr. Alice has the 'doctor' role
            mockClientIdentity.assertAttributeValue.withArgs('role', 'doctor').returns(true);

            // Simulate finding an active consent in the database for the _verifyAccess query
            const mockIterator = {
                next: sinon.stub()
                    .onFirstCall().resolves({ value: { key: consentId, value: Buffer.from(JSON.stringify(activeConsent)) }, done: false })
                    .onSecondCall().resolves({ done: true }),
                close: () => {}
            };
            mockStub.getQueryResult.resolves(mockIterator);

            const result = await contract.getRecordById(ctx, recordId);
            
            // Verify: The correct record is returned
            expect(JSON.parse(result)).to.deep.equal(patientRecord);
        });

        it('should FAIL when a doctor WITHOUT consent requests the record', async () => {
            // Setup: The record exists
            mockStub.getState.withArgs(recordId).resolves(Buffer.from(JSON.stringify(patientRecord)));
            
            // The caller is Dr. Bob
            mockClientIdentity.getID.returns(doctorBobId);
            mockClientIdentity.assertAttributeValue.withArgs('role', 'doctor').returns(true);

            // Simulate finding NO active consent
            const mockIterator = {
                next: async () => ({ done: true }),
                close: () => {}
            };
            mockStub.getQueryResult.resolves(mockIterator);

            // Execute and Verify: The function should throw an authorization error
            await expect(contract.getRecordById(ctx, recordId))
                .to.be.rejectedWith(`User ${doctorBobId} is not authorized to access record ${recordId}`);
        });

        it('should FAIL when a non-doctor, non-owner requests the record', async () => {
            // Setup: The record exists
            mockStub.getState.withArgs(recordId).resolves(Buffer.from(JSON.stringify(patientRecord)));
            
            // The caller is some other random user
            const randomUserId = 'x509::/CN=dave::/O=Org3';
            mockClientIdentity.getID.returns(randomUserId);
            // This user does NOT have the 'doctor' role, so assertAttributeValue will throw
            mockClientIdentity.assertAttributeValue.withArgs('role', 'doctor').returns(false);


            // Execute and Verify: The function should throw an authorization error
            await expect(contract.getRecordById(ctx, recordId))
                .to.be.rejectedWith(`User ${randomUserId} is not authorized to access record ${recordId}`);
        });
    });
});