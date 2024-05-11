const {
	Client,
	AccountId,
	PrivateKey,
	TokenId,
	ContractId,
	ContractInfoQuery,
	ContractCallQuery,
	ReceiptStatusError,
	Hbar,
} = require('@hashgraph/sdk');
require('dotenv').config();
const fs = require('fs');
const Web3 = require('web3');
const web3 = new Web3();
let abi;

// Get operator from .env file
const operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = process.env.CONTRACT_NAME ?? null;

const tokenId = TokenId.fromString(process.env.TOKEN_ID);
const contractId = ContractId.fromString(process.env.CONTRACT_ID);
const tokenDecimal = Number(process.env.TOKEN_DECIMALS);

const env = process.env.ENVIRONMENT ?? null;
let client;

// check-out the deployed script - test read-only method
const main = async () => {
	if (contractName === undefined || contractName == null) {
		console.log('Environment required, please specify CONTRACT_NAME for ABI in the .env file');
		return;
	}


	console.log('\n-Using ENIVRONMENT:', env);
	console.log('\n-Using Operator:', operatorId.toString());

	if (env.toUpperCase() == 'TEST') {
		client = Client.forTestnet();
		console.log('interacting in *TESTNET*');
	}
	else if (env.toUpperCase() == 'MAIN') {
		client = Client.forMainnet();
		console.log('interacting in *MAINNET*');
	}
	else {
		console.log('ERROR: Must specify either MAIN or TEST as environment in .env file');
		return;
	}

	client.setOperator(operatorId, operatorKey);

	// import ABI
	const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`, 'utf8'));
	abi = json.abi;
	console.log('\n -Loading ABI...\n');

	const [contractTokenBal, contractHbarBal] = await getContractBalance(contractId);

	console.log('Using contract: ',
		contractId.toString(),
		' / ', contractId.toSolidityAddress(),
		'balance:',
		contractTokenBal,
		' -> ',
		contractHbarBal.toString());

	// check the allowance WL
	await getAllowanceWL();

};

async function getAllowanceWL() {
	try {
		console.log('\n-getAllowanceWhitelist Query');
		// generate function call with function name and parameters
		const functionCallAsUint8Array = encodeFunctionCall('getAllowanceWhitelist', []);

		// query the contract
		const contractCall = await new ContractCallQuery()
			.setContractId(contractId)
			.setFunctionParameters(functionCallAsUint8Array)
			.setMaxQueryPayment(new Hbar(2))
			.setGas(100000)
			.execute(client);

		const results = decodeFunctionResult('getAllowanceWhitelist', contractCall.bytes);
		const wlAccountsEVM = results.wl;
		if (wlAccountsEVM.length == 0) {
			console.log('No accounts in the WL!');
		}
		else {
			for (let a = 0; a < wlAccountsEVM.length; a++) {
				const acctAsEVM = wlAccountsEVM[a];
				console.log('\tFound account:', acctAsEVM, ' / ', AccountId.fromSolidityAddress(acctAsEVM).toString());
			}
		}
	}
	catch (err) {
		if (err instanceof ReceiptStatusError) {
			console.log(JSON.stringify(err, null, 2));
		}
		else {
			console.log(JSON.stringify(err, null, 2), err);
		}
	}
}

async function getContractBalance(ctrctId) {

	const query = new ContractInfoQuery()
		.setContractId(ctrctId);

	const info = await query.execute(client);

	let balance;

	const tokenMap = info.tokenRelationships;
	const tokenBal = tokenMap.get(tokenId.toString());
	if (tokenBal) {
		balance = tokenBal.balance * (10 ** -tokenDecimal);
	}
	else {
		balance = -1;
	}

	return [balance, info.balance];
}

/**
 * Decodes the result of a contract's function execution
 * @param functionName the name of the function within the ABI
 * @param resultAsBytes a byte array containing the execution result
 */
function decodeFunctionResult(functionName, resultAsBytes) {
	const functionAbi = abi.find(func => func.name === functionName);
	const functionParameters = functionAbi.outputs;
	console.log(
		'\n -Decoding:',
		functionName,
		'\n -outputs expected:',
		JSON.stringify(functionParameters, null, 3));
	const resultHex = '0x'.concat(Buffer.from(resultAsBytes).toString('hex'));
	const result = web3.eth.abi.decodeParameters(functionParameters, resultHex);
	return result;
}

function encodeFunctionCall(functionName, parameters) {
	const functionAbi = abi.find((func) => func.name === functionName && func.type === 'function');
	const encodedParametersHex = web3.eth.abi.encodeFunctionCall(functionAbi, parameters).slice(2);
	return Buffer.from(encodedParametersHex, 'hex');
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
