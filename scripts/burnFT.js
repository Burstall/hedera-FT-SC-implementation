const {
	Client,
	AccountId,
	PrivateKey,
	ContractId,
	ContractFunctionParameters,
	ContractExecuteTransaction,
	// eslint-disable-next-line no-unused-vars
	TransactionReceipt,
	TokenId,
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
const tokenDecimal = Number(process.env.TOKEN_DECIMALS);


const contractId = ContractId.fromString(process.env.CONTRACT_ID);
const readlineSync = require('readline-sync');

const env = process.env.ENVIRONMENT ?? null;
let client;

// check-out the deployed script - test read-only method
const main = async () => {
	const args = process.argv.slice(2);
	if (getArgFlag('h') || args.length != 1) {
		console.log('Usage: node burnFT.js XXX');
		console.log('       XXX			amount to burn');
		process.exit(0);
	}
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


	console.log('Using contract: ',
		contractId.toString());

	// confirm action
	const proceed = readlineSync.keyInYNStrict('Do you want to burn ' + Number(args[0]) / (10 ** tokenDecimal) + ' of FT ' + tokenId.toString());

	if (proceed) {
		const result = await burnLazy(Number(args[0]));
		console.log('Operation:', result);
	}
	else {
		console.log('User aborted');
		return;
	}

};

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

async function burnLazy(amt) {
	const gasLim = 400000;
	const params = new ContractFunctionParameters()
		.addAddress(tokenId.toSolidityAddress())
		.addUint32(amt);
	const [callHbarRx, , ] = await contractExecuteFcn(contractId, gasLim, 'burn', params);
	return callHbarRx.status.toString();
}

/**
 * Helper function for calling the contract methods
 * @param {ContractId} cId the contract to call
 * @param {number | Long.Long} gasLim the max gas
 * @param {string} fcnName name of the function to call
 * @param {ContractFunctionParameters} params the function arguments
 * @param {string | number | Hbar | Long.Long | BigNumber} amountHbar the amount of hbar to send in the methos call
 * @returns {[TransactionReceipt, any, TransactionRecord]} the transaction receipt and any decoded results
 */
async function contractExecuteFcn(cId, gasLim, fcnName, params, amountHbar) {
	const contractExecuteTx = await new ContractExecuteTransaction()
		.setContractId(cId)
		.setGas(gasLim)
		.setFunction(fcnName, params)
		.setPayableAmount(amountHbar)
		.freezeWith(client);

	const signedTx = await contractExecuteTx.sign(operatorKey);

	const exectuedTx = await signedTx.execute(client);

	// get the results of the function call;
	const record = await exectuedTx.getRecord(client);
	const contractResults = decodeFunctionResult(fcnName, record.contractFunctionResult.bytes);
	const contractExecuteRx = await exectuedTx.getReceipt(client);
	return [contractExecuteRx, contractResults, record];
}

function getArgFlag(arg) {
	const customIndex = process.argv.indexOf(`-${arg}`);

	if (customIndex > -1) {
		return true;
	}

	return false;
}


main()
	.then(() => {
		process.exit(0);
	})
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
