const {
	Client,
	AccountId,
	PrivateKey,
	ContractCreateFlow,
} = require('@hashgraph/sdk');
const fs = require('fs');
// const { hethers } = require('@hashgraph/hethers');
require('dotenv').config();

// Get operator from .env file
const operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

async function contractDeployFcn(bytecode, gasLim) {
	const contractCreateTx = new ContractCreateFlow().setBytecode(bytecode).setGas(gasLim);
	const contractCreateSubmit = await contractCreateTx.execute(client);
	const contractCreateRx = await contractCreateSubmit.getReceipt(client);
	const contractId = contractCreateRx.contractId;
	const contractAddress = contractId.toSolidityAddress();
	return [contractId, contractAddress];
}

const main = async () => {

	const json = JSON.parse(fs.readFileSync('./artifacts/contracts/FungibleTokenCreator.sol/FungibleTokenCreator.json'));

	const contractBytecode = json.bytecode;

	console.log('\n- Deploying contract...');
	const gasLimit = 800000;

	const [contractId, contractAddress] = await contractDeployFcn(contractBytecode, gasLimit);

	console.log(`Contract created with ID: ${contractId} / ${contractAddress}`);

};

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
