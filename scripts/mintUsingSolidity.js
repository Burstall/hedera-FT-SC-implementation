const {
	Client,
	AccountId,
	PrivateKey,
	ContractId,
	ContractExecuteTransaction,
	ContractFunctionParameters,
	TokenId,
} = require('@hashgraph/sdk');
require('dotenv').config();
const readlineSync = require('readline-sync');
const fs = require('fs');
const Web3 = require('web3');
const web3 = new Web3();
let abi;

// Get operator from .env file
const operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = process.env.CONTRACT_NAME ?? null;

const contractId = ContractId.fromString(process.env.CONTRACT_ID);
const tokenId = TokenId.fromString(process.env.FT_TOKEN_ID);
const supplyKey = PrivateKey.fromString(process.env.FT_SUPPLY_KEY);

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

	console.log('\n-Using CONTRACT:', contractId.toString());
	console.log('\n-Using TOKEN:', tokenId.toString(), ' / ', tokenId.toSolidityAddress());

	const proceed = readlineSync.keyInYNStrict('Do you wish to mint new supply (1)?');
	if (proceed) {
		const [contractExecuteRx, contractResults] = await mintFungible(tokenId, 1);
		console.log(contractExecuteRx.status.toString());
		console.log('\n\nResults:\n', JSON.stringify(contractResults, null, 4));
	}
	else {
		console.log('User aborted.');
	}
};

/**
 * Helper function to encpapsualte minting an FT
 * @param {TokenId} token
 * @param {Number} amount
 * @returns {[TransactionReceipt, any, TransactionRecord]} the transaction receipt and any decoded results
 */
async function mintFungible(token, amount) {
	const gasLim = 800000;
	// call associate method
	const params = new ContractFunctionParameters()
		.addAddress(token.toSolidityAddress())
		.addUint64(amount);

	return await contractExecuteFcn(contractId, gasLim, 'mintAdditionalSupply', params);

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

	const signTx = await contractExecuteTx.sign(supplyKey);

	const txResp = await signTx.execute(client);

	// get the results of the function call;
	const record = await txResp.getRecord(client);
	const contractResults = decodeFunctionResult(fcnName, record.contractFunctionResult.bytes);
	const contractExecuteRx = await txResp.getReceipt(client);
	return [contractExecuteRx, contractResults, record];
}

/**
 * Decodes the result of a contract's function execution
 * @param functionName the name of the function within the ABI
 * @param resultAsBytes a byte array containing the execution result
 */
function decodeFunctionResult(functionName, resultAsBytes) {
	const functionAbi = abi.find(func => func.name === functionName);
	const functionParameters = functionAbi.outputs;
	const resultHex = '0x'.concat(Buffer.from(resultAsBytes).toString('hex'));
	const result = web3.eth.abi.decodeParameters(functionParameters, resultHex);
	return result;
}

main()
	.then(() => {
		// eslint-disable-next-line no-useless-escape
		process.exit(0);
	})
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
