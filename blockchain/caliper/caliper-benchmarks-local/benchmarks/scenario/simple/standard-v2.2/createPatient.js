'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

const { nanoid } = require('nanoid')
let IdArray = [];

const departments = ['department1', 'department2', 'department3', 'department4', 'department5', 'department6', 'department7', 'department8', 'department9', 'department10'];
const amounts = [23, 45, 65, 76, 34, 564, 456, 567, 578, 5768, 678, 58, 78, 58, 35, 234, 23, 25, 99];
const patients = ['patient1', 'patient2', 'patient3', 'patient4', 'patient5', 'patient6', 'patient7', 'patient8', 'patient9', 'patient10'];
const appraisedValues = [345, 3456, 4356, 345, 476, 578, 234, 578, 678, 25, 567, 58, 578, 9, 99, 77];

/**
 * Workload module for the benchmark round.
 */
class CreatePatientWorkload extends WorkloadModuleBase {
  /**
   * Initializes the workload module instance.
   */
  constructor() {
    super();
    // this.txIndex = 7000;
  }

  /**
   * Assemble TXs for the round.
   * @return {Promise<TxStatus[]>}
   */
  async submitTransaction() {
    // this.txIndex++;
    let id = 'c' + nanoid();
    let department = departments[Math.floor(Math.random() * departments.length)]
    let amount =  amounts[Math.floor(Math.random() * amounts.length)]
    let patient = patients[Math.floor(Math.random() * patients.length)]
    let appraisedValue = appraisedValues[Math.floor(Math.random() * appraisedValues.length)]

    IdArray.push(id)
    let args = {
      contractId: 'fabcar',
      contractVersion: 'v1',
      contractFunction: 'CreateAsset',
      contractArguments: [id, department, amount, patient, appraisedValue],
      timeout: 30
    };

    await this.sutAdapter.sendRequests(args);
  }
}

/**
 * Create a new instance of the workload module.
 * @return {WorkloadModuleInterface}
 */
function createWorkloadModule() {
  return new CreatePatientWorkload();
}

module.exports ={
  createWorkloadModule,
  IdArray
}