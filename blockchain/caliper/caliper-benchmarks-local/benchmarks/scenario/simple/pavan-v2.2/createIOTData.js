'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

const {nanoid} = require('nanoid')
let data = require('./data.json')

let iotData = []

/**
 * Workload module for the benchmark round.
 */
class CreateCarWorkload extends WorkloadModuleBase {
    /**
     * Initializes the workload module instance.
     */
    constructor() {
        super();
        this.txIndex = 1;
        iotData = data

    }

    /**
     * Assemble TXs for the round.
     * @return {Promise<TxStatus[]>}
     */
    async submitTransaction() {
        this.txIndex++;
        if(this.txIndex > 97505){
            this.txIndex = 0
        }

        let sensorData = iotData[this.txIndex]

        let dataObject = {
            id: 'c'+ nanoid(),
            dataId: sensorData.id,
            recordDate:sensorData.notedDate,
            roomId: sensorData.roomId,
            temp: sensorData.temp.toString(),
            inOut: sensorData.inOut
        }

        let args = {
            contractId: 'fabcar',
            contractVersion: 'v1',
            contractFunction: 'CreateSensorData',
            contractArguments: [JSON.stringify(dataObject)],
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
    return new CreateCarWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;