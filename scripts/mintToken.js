const {
	Client,
	AccountId,
	PrivateKey,
	ContractFunctionParameters,
	ContractExecuteTransaction,
	AccountInfoQuery,
	ContractInfoQuery,
	TokenId,
	ContractId,
	TransactionId,
} = require('@hashgraph/sdk');

const { requestMultiSig } = require('./reqMultiSig.js');
const multiSig = process.env.npm_config_multisig || false;

const baseUrlForMainnet = 'https://mainnet-public.mirrornode.hedera.com';
const baseUrlForTestnet = 'https://testnet.mirrornode.hedera.com';

require('dotenv').config();
const Web3 = require('web3');
const fs = require('fs');

let abi;
const web3 = new Web3;

// Get operator from .env file
const operatorKey = PrivateKey.fromStringED25519(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = process.env.CONTRACT_NAME ?? null;

const tokenName = process.env.TOKEN_NAME;
const tokenSymbol = process.env.TOKEN_SYMBOL;
const tokenDecimal = Number(process.env.TOKEN_DECIMALS);
const tokenInitalSupply = Number(process.env.TOKEN_INITALSUPPLY);
const tokenMaxSupply = Number(process.env.TOKEN_MAXSUPPLY) || 0;
// memo capped at 100 characters
const tokenMemo = (process.env.TOKEN_MEMO).slice(0, Math.min(process.env.TOKEN_MEMO.length, 100));

const env = process.env.ENVIRONMENT ?? null;

let client;


const main = async () => {
	if (contractName === undefined || contractName == null) {
		console.log('Environment required, please specify CONTRACT_NAME for ABI in the .env file');
		return;
	}


	console.log('\n-Using ENIVRONMENT:', env);
	console.log('\n-Using Operator:', operatorId.toString());

	if (env.toUpperCase() == 'TEST') {
		client = Client.forTestnet();
		console.log('minting in *TESTNET*');
	}
	else if (env.toUpperCase() == 'MAIN') {
		client = Client.forMainnet();
		console.log('minting in *MAINNET*');
	}
	else {
		console.log('ERROR: Must specify either MAIN or TEST as environment in .env file');
		return;
	}

	if (multiSig) console.log('\n-Using multisig');

	client.setOperator(operatorId, operatorKey);

	// import ABI
	const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`, 'utf8'));
	abi = json.abi;

	const contractId = ContractId.fromString(process.env.CONTRACT_ID);
	const contractAddress = contractId.toSolidityAddress();

	console.log(`Using Contract: ${contractId} / ${contractAddress}`);

	// Create FT using precompile function
	try {
		const fcnName = 'createTokenWithNoKeys';
		let createToken = new ContractExecuteTransaction()
			.setContractId(contractId)
			.setGas(800000)
			.setPayableAmount(30)
			.setFunction(fcnName,
			/*
			*	ed25519Key as bytes
			*	FT NAME
			*	FT SYMBOL
			*	FT Initial Supply
			*	FT Decimals
			*	FT auto renew periood
			*	FT max supply = 0 => infinite
			*
			*/
				new ContractFunctionParameters()
					// .addBytes(operatorKey.publicKey.toBytes())
					.addString(tokenName)
					.addString(tokenSymbol)
					.addString(tokenMemo)
					.addInt64(tokenInitalSupply)
					.addInt32(tokenDecimal)
					.addInt64(tokenMaxSupply));

		if (multiSig) {
			const multiSigAccount = AccountId.fromString(process.env.MULTI_SIG_WALLET);
			console.log('Using multisig account:', multiSigAccount.toString());
			const nodeId = [];
			nodeId.push(new AccountId(3));

			createToken
				.setNodeAccountIds(nodeId)
				.setTransactionId(TransactionId.generate(multiSigAccount))
				.freezeWith(client);

			createToken = await requestMultiSig(createToken);
		}

		const createTokenTx = await createToken.execute(client);

		const createTokenRecord = await createTokenTx.getRecord(client);

		createTokenRecord.contractFunctionResult.logs.forEach(log => {
			// convert the log.data (uint8Array) to a string
			const logStringHex = '0x'.concat(Buffer.from(log.data).toString('hex'));

			// get topics from log
			const logTopics = [];
			log.topics.forEach(topic => {
				logTopics.push('0x'.concat(Buffer.from(topic).toString('hex')));
			});

			// decode the event data
			const event = decodeEvent('TokenControllerMessage', logStringHex, logTopics.slice(1));

			// output the from address stored in the event
			console.log(`Record event: from '${AccountId.fromEvmAddress(0, 0, event.fromAddress).toString()}' update to '${event.message}'`);
		});

		// console.log('\n -executed tx:', JSON.stringify(createToken, 4));
		const tokenIdSolidityAddr = createTokenRecord.contractFunctionResult.getAddress(0);
		console.log('\n -solidity address:', tokenIdSolidityAddr);
		if (!tokenIdSolidityAddr) {
			// something went wrong
			console.log('\n -token record:', JSON.stringify(createTokenRecord, 4));
		}
		const tokenId = TokenId.fromSolidityAddress(tokenIdSolidityAddr);

		console.log(`Token (with no keys!) created with ID: ${tokenId} / ${tokenIdSolidityAddr}\n`);

		const tokenUrl = env == 'MAIN' ? baseUrlForMainnet + '/api/v1/tokens/' + tokenId : baseUrlForTestnet + '/api/v1/tokens/' + tokenId;
		const hashScanUrl = env == 'MAIN' ? 'https://hashscan.io/#/mainnet/token/' + tokenId : 'https://hashscan.io/#/testnet/token/' + tokenId;

		console.log('Mirror node: ', tokenUrl);
		console.log('HashScan: ', hashScanUrl);
		console.log('Using contract: ', contractId.toString());
		console.log('Using operator: ', operatorId.toString());

		const [acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId, tokenId);
		const [contractTokenBal, contractHbarBal] = await getContractBalance(contractId, tokenId);

		console.log('operatorId',
			operatorId.toString(),
			'balance:',
			acctTokenBal,
			' -> ',
			accountHbarBal.toString());
		console.log('contract: ',
			contractId.toString(),
			'balance:',
			contractTokenBal,
			' -> ',
			contractHbarBal.toString());
	}
	catch (err) {
		console.log('\n -ERROR:\n', JSON.stringify(err, 4));
		throw err;
	}
};

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

async function getAccountBalance(acctId, tokenId) {

	const query = new AccountInfoQuery()
		.setAccountId(acctId);

	const info = await query.execute(client);

	let balance;
	const tokenMap = info.tokenRelationships;
	try {
		if (tokenMap) {
			balance = tokenMap.get(tokenId.toString()).balance * (10 ** -tokenDecimal);
		}
		else {
			balance = -1;
		}
	}
	catch {
		balance = -1;
	}

	return [balance, info.balance];
}

async function getContractBalance(ctrctId, tokenId) {

	const query = new ContractInfoQuery()
		.setContractId(ctrctId);

	const info = await query.execute(client);
	let balance;
	const tokenMap = info.tokenRelationships;
	if (tokenMap) {
		balance = tokenMap.get(tokenId.toString()).balance * (10 ** -tokenDecimal);
	}
	else {
		balance = -1;
	}

	return [balance, info.balance];
}

main()
	.then(() => {
		// eslint-disable-next-line no-useless-escape
		console.log('\r\n                                                                     \r\n                                 ___________________                      \r\n                                \/..................\/                         \r\n                               \/..................\/                          \r\n                              \/..................\/                           \r\n                             \/..................\/                            \r\n                            \/..................\/                                   \r\n                           \/..................\/                                 \r\n                          \/..................\/                                  \r\n                         \/..................\/_______________             \r\n                        \/..................................\/                  \r\n                       \/..................................\/                    \r\n                      \/..................................\/                      \r\n                     \/.....$LAZY..TOKEN..IS..LIVE.......\/                        \r\n                    \/..................................\/                       \r\n                   !_________________................_\/                         \r\n                                     \/.............\/                            \r\n                                    \/...........\/                             \r\n                                   \/..........\/                             \r\n                                  \/.........\/                               \r\n                                 \/........\/                                   \r\n                                \/.......\/                                     \r\n                               \/......\/                                       \r\n                              \/.....\/                                         \r\n                             \/....\/                                            \r\n                            \/...\/\r\n                           \/..\/\r\n\r\n\r\n \r\n                                             \r\n                                                                                \r\n                                                                                \r\n');
		process.exit(0);
	})
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
