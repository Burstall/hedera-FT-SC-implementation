const {
	Client,
	AccountId,
	PrivateKey,
	ContractId,
	ContractInfoQuery,
} = require('@hashgraph/sdk');
require('dotenv').config();

// Get operator from .env file
const operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = process.env.CONTRACT_NAME ?? null;

const contractId = ContractId.fromString(process.env.CONTRACT_ID);

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


	console.log('Using contract:', contractId.toString());

	const contractInfo = new ContractInfoQuery().setContractId(contractId);
	const txResp = await contractInfo.execute(client);
	// console.log(JSON.stringify(txResp, null, 4));
	console.log('Storage:', txResp.storage.toString());
	console.log('Balance:', txResp.balance.toString());
	console.log('AutoRenew Account:', txResp.autoRenewAccountId ? txResp.autoRenewAccountId.toString() : txResp.autoRenewAccountId);
	console.log('Expires:', txResp.expirationTime.toDate().toISOString());
};

main()
	.then(() => {
		// eslint-disable-next-line no-useless-escape
		process.exit(0);
	})
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
