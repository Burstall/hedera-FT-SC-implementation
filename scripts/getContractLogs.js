const {
	AccountId,
	ContractId,
} = require('@hashgraph/sdk');

require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const Web3 = require('web3');

let abi;
const web3 = new Web3;

// const delay = ms => new Promise(res => setTimeout(res, ms));

async function main() {
	// import ABI
	const json = JSON.parse(fs.readFileSync('./artifacts/contracts/FungibleTokenCreator.sol/FungibleTokenCreator.json', 'utf8'));
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

	const url = `https://testnet.mirrornode.hedera.com/api/v1/contracts/${contractId.toString()}/results/logs?order=asc`;
	console.log(url);
	axios.get(url)
		.then(function(response) {
			const jsonResponse = response.data;
			jsonResponse.logs.forEach(log => {
				// decode the event data
				if (log.data == '0x') return;
				const event = decodeEvent('tokenControllerMessage', log.data, log.topics.slice(1));

				// output the from address and message stored in the event
				console.log(`event(s): '${AccountId.fromSolidityAddress(event.from).toString()}' minted with message: '${event.message}'`);
				// console.log(JSON.stringify(event, 4));
			});
		})
		.catch(function(err) {
			console.error(err);
		});
}

/**
 * Decodes event contents using the ABI definition of the event
 * @param eventName the name of the event
 * @param log log data as a Hex string
 * @param topics an array of event topics
 */
function decodeEvent(eventName, log, topics) {
	const eventAbi = abi.find(event => (event.name === eventName && event.type === 'event'));
	const decodedLog = web3.eth.abi.decodeLog(eventAbi.inputs, log, topics);
	return decodedLog;
}

void main();