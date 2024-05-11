require('dotenv').config();
const { ContractId, AccountId } = require('@hashgraph/sdk');
const { ethers } = require('ethers');
const axios = require('axios');
const cron = require('node-cron');
let iface, baseUrl;

const contractName = process.env.CONTRACT_NAME ?? null;
const eventName = process.env.EVENT_NAME ?? null;
const DECIMALS = process.env.DECIMALS ?? 0;

const contractId = ContractId.fromString(process.env.CONTRACT_ID);
const BASEURL_MAIN = 'https://mainnet-public.mirrornode.hedera.com';
const BASEURL_TEST = 'https://testnet.mirrornode.hedera.com';

let lastProcessedBlocknumber = process.env.LAST_PROCESSED_BLOCKNUMBER ? Number(process.env.LAST_PROCESSED_BLOCKNUMBER) : 0;

const env = process.env.ENVIRONMENT ?? null;

cron.schedule('*/5 * * * * *', () => {
	contextAwareFetchLogsFromMirror();
});

cron.schedule('2 */30 * * * *', () => {
	console.log('...');
});

const main = async () => {

	if (contractName === undefined || contractName == null) {
		console.log('Environment required, please specify CONTRACT_NAME for ABI in the .env file');
		return;
	}

	if (env.toUpperCase() == 'TEST') {
		baseUrl = BASEURL_TEST;
		console.log('interacting in *TESTNET*');
	}
	else if (env.toUpperCase() == 'MAIN') {
		baseUrl = BASEURL_MAIN;
		console.log('interacting in *MAINNET*');
	}
	else {
		console.log('ERROR: Must specify either MAIN or TEST as environment in .env file');
		return;
	}

	console.log('\n-Using ENIVRONMENT:', env);
	console.log('\n-Using Contract:', contractId.toString(), 'with name:', contractName, 'and address:', contractId.toSolidityAddress());
	console.log('\n-Using Event:', eventName);

	// import ABI
	const abi = ['event TokenControllerMessage(string msgType, address indexed fromAddress, uint amount, string message)'];
	iface = new ethers.Interface(abi);

	console.log('\n -Starting event monitor...\n');
	// await contextAwareFetchLogsFromMirror();
};

async function contextAwareFetchLogsFromMirror() {
	let url = `${baseUrl}/api/v1/contracts/${contractId.toString()}/results/logs?order=desc&limit=10`;
	let newBlocknumber = lastProcessedBlocknumber;
	while (url) {

		await axios.get(url)
			.then(function(response) {
				const jsonResponse = response.data;
				// console.log(' -Got', jsonResponse, 'events from mirror node');
				const validLogs = jsonResponse.logs.filter(function(log) {
					// console.log(Number(log.block_number), lastProcessedBlocknumber);
					if (Number(log.block_number) > lastProcessedBlocknumber) return true;
					else return false;
				});

				// console.log(' -Got', validLogs.length, 'events from mirror node');

				validLogs.forEach(log => {
					// decode the event data
					if (log.data == '0x') {
						return;
					}
					const event = iface.parseLog({ topics: log.topics, data: log.data });

					console.log('Block: ' + log.block_number
						+ ' : Tx Hash: ' + log.transaction_hash
						+ ' : Event: ' + event.name + ' : '
						+ event.args.msgType + ' : '
						+ AccountId.fromEvmAddress(0, 0, event.args.fromAddress).toString() + ' : '
						+ Number(event.args.amount) * Math.pow(10, -DECIMALS) + ' : '
						+ event.args.message);

					// console.log(Number(log.block_number), newBlocknumber);
					newBlocknumber = Number(log.block_number) > newBlocknumber ? Number(log.block_number) : newBlocknumber;
				});

				if (validLogs.length == jsonResponse.logs.length) {
					url = jsonResponse.links.next ? baseUrl + jsonResponse.links.next : null;
				}
				else {
					url = null;
				}
			})
			.catch(function(err) {
				console.error(new Date().toISOString(), 'Error fetching logs from mirror node', url, err.name, err.message);
				url = null;
				return;
			});
	}
	// console.log('New block number:', newBlocknumber);
	// console.log('Last processed block number:', lastProcessedBlocknumber);
	lastProcessedBlocknumber = newBlocknumber;
}

main();