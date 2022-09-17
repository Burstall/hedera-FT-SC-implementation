const {
	AccountId,
	ContractId,
} = require('@hashgraph/sdk');

require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const Web3 = require('web3');

const baseUrlForMainnet = 'https://mainnet-public.mirrornode.hedera.com';
const baseUrlForTestnet = 'http://testnet.mirrornode.hedera.com';
const env = process.env.ENVIRONMENT ?? null;
const contractName = process.env.CONTRACT_NAME ?? null;
const eventName = process.env.EVENT_NAME ?? null;

let abi;
const web3 = new Web3;

async function main() {
	console.log('Using ENIVRONMENT:', env);

	if (env === undefined || env == null) {
		console.log('Environment required, please specify TEST or MAIN in the .env file');
		return;
	}

	if (contractName === undefined || contractName == null) {
		console.log('Environment required, please specify CONTRACT_NAME for ABI in the .env file');
		return;
	}

	if (eventName === undefined || eventName == null) {
		console.log('Environment required, please specify EVENT_NAME to decode in the .env file');
		return;
	}

	// import ABI
	const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`, 'utf8'));
	abi = json.abi;

	const contractId = ContractId.fromString(process.env.CONTRACT_ID);

	// get contract events from a mirror node
	await getEventsFromMirror(contractId);
}

/**
 * Gets all the events for a given ContractId from a mirror node
 * @param contractId
 */

async function getEventsFromMirror(contractId) {
	console.log('\n -Getting event(s) from mirror nodes');

	const baseUrl = env.toUpperCase() == 'MAIN' ? baseUrlForMainnet : baseUrlForTestnet;

	const url = `${baseUrl}/api/v1/contracts/${contractId.toString()}/results/logs?order=asc`;
	console.log(url);
	axios.get(url)
		.then(function(response) {
			const jsonResponse = response.data;
			jsonResponse.logs.forEach(log => {
				// decode the event data
				if (log.data == '0x') return;
				const event = decodeEvent(log.data, log.topics.slice(1));

				// console.log('EVENT:\n', JSON.stringify(event, null, 3));

				let outputStr = '';
				for (let f = 0; f < event.__length__; f++) {
					const field = event[f];
					let output = field.startsWith('0x') ? AccountId.fromSolidityAddress(field).toString() : field;
					output = f == 0 ? output : ' : ' + output;
					outputStr += output;
				}

				console.log(outputStr);
			});
		})
		.catch(function(err) {
			console.error(err);
		});
}

/**
 * Decodes event contents using the ABI definition of the event
 * @param log log data as a Hex string
 * @param topics an array of event topics
 */
function decodeEvent(log, topics) {
	const eventAbi = abi.find(event => (event.name === eventName && event.type === 'event'));
	const decodedLog = web3.eth.abi.decodeLog(eventAbi.inputs, log, topics);
	return decodedLog;
}

void main();